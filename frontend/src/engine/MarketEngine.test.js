import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createMarketEngine } from './MarketEngine.js'

const engines = new Set()
const createEngine = (options) => {
  const engine = createMarketEngine(options)
  engines.add(engine)
  return engine
}

const waitForPublish = () => new Promise(resolve => setTimeout(resolve, 30))
const pauseAtCursor = (engine, targetCursor) => new Promise((resolve) => {
  const unsubscribe = engine.subscribe(() => {
    if (engine.getCursor() >= targetCursor) {
      engine.pause()
      unsubscribe()
      resolve()
    }
  })
})
const waitForStatus = (engine, targetStatus) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    unsubscribe()
    reject(new Error(`Timed out waiting for engine status "${targetStatus}".`))
  }, 1000)
  const unsubscribe = engine.subscribe(() => {
    if (engine.getStatus() === targetStatus) {
      clearTimeout(timeout)
      unsubscribe()
      resolve()
    }
  })
})
const sampleSources = (count = 3) => ({
  fullPrice: [{
    symbol: 'BTCUSDT',
    prices: Array.from({ length: count }, (_, index) => ({
      time: 1700000000 + index,
      close: index + 10,
    })),
  }],
  rsi: [{
    symbol: 'BTCUSDT',
    result: Array.from({ length: count }, (_, index) => ({
      time: 1700000000 + index,
      value: index + 40,
    })),
  }],
})

afterEach(() => {
  engines.forEach(engine => engine.destroy())
  engines.clear()
})

// MIG-F1: focused node:test coverage exercises store identity, simulation controls, and source updates.
test('keeps snapshot and feed references stable until a published snapshot changes', async () => {
  const engine = createEngine()
  const initialSnapshot = engine.getSnapshot()

  assert.equal(engine.getSnapshot(), initialSnapshot)
  assert.equal(engine.getFeed('rsi'), engine.getFeed('rsi'))

  engine.loadSources(sampleSources())
  assert.equal(engine.getSnapshot(), initialSnapshot)
  await waitForPublish()

  assert.notEqual(engine.getSnapshot(), initialSnapshot)
  assert.equal(engine.getFeed('rsi'), engine.getSnapshot().rsi)
  assert.equal(engine.getFeed('rsi'), engine.getFeed('rsi'))
})

test('loads sources and publishes cursor bounds and ready status', async () => {
  const engine = createEngine()

  engine.loadSources(sampleSources(4))
  assert.equal(engine.getMaxCursor(), 4)
  assert.equal(engine.getCursor(), 0)
  assert.equal(engine.getStatus(), 'ready')
  await waitForPublish()
  assert.equal(engine.getFeed('fullPrice')[0].prices.length, 0)
})

test('play advances by the configured step and completes at the end', async () => {
  const engine = createEngine({ initialSpeed: 10 })
  engine.loadSources(sampleSources(3))
  engine.setStep(2)
  const completed = waitForStatus(engine, 'completed')
  engine.play()
  await completed
  assert.equal(engine.getCursor(), 3)
  assert.equal(engine.getStatus(), 'completed')
})

test('pause stops playback without advancing further', async () => {
  const engine = createEngine({ initialSpeed: 10 })
  engine.loadSources(sampleSources(5))
  engine.play()
  engine.pause()

  const pausedCursor = engine.getCursor()
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(engine.getCursor(), pausedCursor)
  assert.equal(engine.getStatus(), 'paused')
})

test('allows the requested 150 ms playback speed', () => {
  const engine = createEngine()
  engine.setSpeed(150)
  assert.equal(engine.getSpeed(), 150)
})

test('reset returns playback to the beginning without discarding loaded sources', async () => {
  const engine = createEngine({ initialSpeed: 10 })
  engine.loadSources(sampleSources(5))
  engine.play()
  await new Promise(resolve => setTimeout(resolve, 15))

  engine.reset()
  assert.equal(engine.getCursor(), 0)
  assert.equal(engine.getStatus(), 'idle')
  assert.equal(engine.getMaxCursor(), 5)
  await waitForPublish()
  assert.equal(engine.getFeed('fullPrice')[0].prices.length, 0)
})

test('reset clears persisted signal and operation state', () => {
  const engine = createEngine()
  const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storedKeys = new Set(['signalsBySymbolState', 'resultOperations', 'flagsBySymbol'])
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { removeItem: key => storedKeys.delete(key) },
  })

  try {
    engine.reset()
    assert.equal(storedKeys.size, 0)
  } finally {
    if (previousLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', previousLocalStorage)
    } else {
      delete globalThis.localStorage
    }
  }
})

// MIG-F2-4: verify incremental time slicing keeps the bounded window correct when the cursor rewinds.
test('preserves bounded feed slices as the cursor advances and rewinds', async () => {
  const engine = createEngine({ initialSpeed: 10, maxSnapshotPoints: 2 })
  const fullPrice = [{
    symbol: 'BTCUSDT',
    prices: Array.from({ length: 6 }, (_, index) => ({
      time: 1700000000 + index,
      close: index + 10,
    })),
  }]
  const rsi = [{
    symbol: 'BTCUSDT',
    result: Array.from({ length: 6 }, (_, index) => ({
      time: 1700000000 + index,
      value: index + 40,
    })),
  }]
  engine.loadSources({ fullPrice, rsi })
  engine.setStep(4)

  const completed = waitForStatus(engine, 'completed')
  engine.play()
  await completed
  assert.deepEqual(engine.getFeed('fullPrice')[0].prices.map(point => point.close), [14, 15])
  assert.deepEqual(engine.getFeed('rsi')[0].result.map(point => point.value), [44, 45])

  engine.setStep(1)
  const firstTickAfterRewind = pauseAtCursor(engine, 1)
  engine.play()
  await firstTickAfterRewind
  await waitForPublish()
  assert.deepEqual(engine.getFeed('fullPrice')[0].prices.map(point => point.close), [10])
  assert.deepEqual(engine.getFeed('rsi')[0].result.map(point => point.value), [40])
})

// MIG-F2-5: sparse peak events must not mask progress in dense Schrödinger indicator series.
test('publishes Schrödinger progress while the last power surge remains unchanged', async () => {
  const engine = createEngine({ initialSpeed: 150 })
  const fullPrice = [{
    symbol: 'BTCUSDT',
    prices: Array.from({ length: 4 }, (_, index) => ({
      time: 1700000000 + index,
      close: index + 10,
    })),
  }]
  const denseSeries = key => Array.from({ length: 4 }, (_, index) => ({
    time: 1700000000 + index,
    [key]: index,
  }))
  engine.loadSources({
    fullPrice,
    schrodinger: [{
      symbol: 'BTCUSDT',
      power_surges: [{ time: 1700000000, power_surges_price: 10, energia: 1 }],
      energy_kinetic: denseSeries('value'),
      potential_energy: denseSeries('value'),
      evolution_series: denseSeries('psi_buy'),
    }],
  })

  const firstTick = pauseAtCursor(engine, 1)
  engine.play()
  await firstTick
  await waitForPublish()
  const firstFeed = engine.getFeed('schrodinger')
  assert.equal(firstFeed[0].energy_kinetic.length, 1)

  const secondTick = pauseAtCursor(engine, 2)
  engine.play()
  await secondTick
  await waitForPublish()
  const secondFeed = engine.getFeed('schrodinger')

  assert.notEqual(secondFeed, firstFeed)
  assert.equal(secondFeed[0].power_surges.length, 1)
  assert.equal(secondFeed[0].energy_kinetic.length, 2)
  assert.equal(secondFeed[0].potential_energy.length, 2)
  assert.equal(secondFeed[0].evolution_series.length, 2)
})

test('updateSources merges timestamped series when replaceMode is false', async () => {
  const engine = createEngine({ initialSpeed: 10 })
  engine.loadSources(sampleSources(2))
  engine.updateSources({
    fullPrice: [{
      symbol: 'BTCUSDT',
      prices: [
        { time: 1700000001, close: 99 },
        { time: 1700000002, close: 12 },
      ],
    }],
  }, { replaceMode: false })

  assert.equal(engine.getMaxCursor(), 3)
  engine.setStep(3)
  engine.play()
  await new Promise(resolve => setTimeout(resolve, 40))
  await waitForPublish()
  assert.deepEqual(
    engine.getSnapshot().fullPrice[0].prices.map(point => point.close),
    [10, 99, 12],
  )
})

test('keeps an unchanged feed reference when another cursor step adds no feed data', async () => {
  const engine = createEngine({ initialSpeed: 150 })
  engine.loadSources({
    fullPrice: sampleSources(3).fullPrice,
    rsi: [{
      symbol: 'BTCUSDT',
      result: [{ time: 1700000000, value: 45 }],
    }],
  })
  const pauseAfterFirstTick = pauseAtCursor(engine, 1)
  engine.play()
  await pauseAfterFirstTick
  await waitForPublish()
  const rsiFeed = engine.getFeed('rsi')

  const pauseAfterSecondTick = pauseAtCursor(engine, 2)
  engine.play()
  await pauseAfterSecondTick
  await waitForPublish()
  assert.equal(engine.getFeed('rsi'), rsiFeed)
})
