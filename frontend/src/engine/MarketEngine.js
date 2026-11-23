// MIG-F1: external store implementation so market updates do not require React state in the engine.
const DEFAULT_FEEDS = {
  fullPrice: null,
  trendPrimary: null,
  trend: null,
  vppr: null,
  rsi: null,
  schrodinger: null,
}

const ARRAY_KEYS = [
  'movements',
  'result',
  'prices',
  'data',
  'power_surges',
  'energy_kinetic',
  'potential_energy',
  'ema_volume',
  'collapsed',
  'evolution_series',
]
const TIME_KEYS = ['Tempo', 'time', 'closeTime', 'openTime', 'open_time']
const DEFAULT_SNAPSHOT_WINDOW = 400
const MIN_TIMER_SPEED = 150 // MIG-F1: keep the requested 150 ms simulation speed available.

const createEmptySources = () => ({ ...DEFAULT_FEEDS })

const normalizeCollection = (payload) => {
  if (!payload) return []
  const collection = payload.status && Array.isArray(payload.data)
    ? payload.data
    : payload
  return Array.isArray(collection) ? collection : [collection]
}

const getItemSeriesKey = (item) => (
  ARRAY_KEYS.find(key => Array.isArray(item?.[key])) ?? null
)

const getItemSeriesKeys = (item) => (
  ARRAY_KEYS.filter(key => Array.isArray(item?.[key]))
)

const getTimeValue = (point) => {
  if (!point) return null
  const value = TIME_KEYS.map(key => point[key]).find(Boolean)

  if (!value) return null

  if (typeof value === 'number') {
    return value > 9999999999 ? value : value * 1000
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value.replace(' ', 'T'))
    return Number.isNaN(parsed) ? null : parsed
  }

  return null
}

const getPriceSeries = (item) => {
  const seriesKey = getItemSeriesKey(item)
  return seriesKey ? item[seriesKey] : []
}

const getSeriesPointKey = (point, index) => {
  const timeValue = getTimeValue(point)
  return timeValue != null ? `time:${timeValue}` : `index:${index}`
}

const mergeSeries = (currentSeries = [], nextSeries = [], replaceMode = false) => {
  if (replaceMode && nextSeries.length > 0) {
    return nextSeries
  }

  const mergedMap = new Map()
  currentSeries.forEach((point, index) => {
    mergedMap.set(getSeriesPointKey(point, index), point)
  })
  nextSeries.forEach((point, index) => {
    mergedMap.set(getSeriesPointKey(point, index), point)
  })

  return Array.from(mergedMap.values()).sort((a, b) => {
    const timeA = getTimeValue(a)
    const timeB = getTimeValue(b)
    if (timeA == null || timeB == null) return 0
    return timeA - timeB
  })
}

const getItemKey = (item, index) => item?.symbol || `index:${index}`

const mergeFeed = (currentPayload, nextPayload, useReplaceMode = false) => {
  if (!nextPayload) return currentPayload ?? null

  const currentCollection = normalizeCollection(currentPayload)
  const nextCollection = normalizeCollection(nextPayload)
  const mergedMap = new Map()

  currentCollection.forEach((item, index) => {
    mergedMap.set(getItemKey(item, index), item)
  })

  nextCollection.forEach((nextItem, index) => {
    const itemKey = getItemKey(nextItem, index)
    const currentItem = mergedMap.get(itemKey)

    if (!currentItem) {
      mergedMap.set(itemKey, nextItem)
      return
    }

    const seriesKeys = new Set([
      ...getItemSeriesKeys(currentItem),
      ...getItemSeriesKeys(nextItem),
    ])

    if (seriesKeys.size === 0) {
      mergedMap.set(itemKey, { ...currentItem, ...nextItem })
      return
    }

    const mergedItem = { ...currentItem, ...nextItem }
    seriesKeys.forEach((seriesKey) => {
      mergedItem[seriesKey] = mergeSeries(
        currentItem[seriesKey],
        nextItem[seriesKey],
        useReplaceMode,
      )
    })
    mergedMap.set(itemKey, mergedItem)
  })

  return Array.from(mergedMap.values())
}

const mergeSources = (currentSources, nextSources, useReplaceMode = false) => (
  Object.keys(DEFAULT_FEEDS).reduce((merged, feedName) => {
    merged[feedName] = mergeFeed(
      currentSources[feedName],
      nextSources?.[feedName],
      useReplaceMode,
    )
    return merged
  }, {})
)

const getSymbolClockMap = (fullPrice, cursor) => (
  normalizeCollection(fullPrice).reduce((clockMap, item) => {
    const seriesKey = getItemSeriesKey(item)
    const series = seriesKey ? item[seriesKey] : []
    const currentPoint = series[Math.max(0, cursor - 1)]
    const currentTime = getTimeValue(currentPoint)

    if (item?.symbol && currentTime != null) {
      clockMap[item.symbol] = currentTime
    }

    return clockMap
  }, {})
)

const limitWindow = (series, maxSnapshotPoints) => {
  if (!Array.isArray(series) || series.length <= maxSnapshotPoints) {
    return series
  }
  return series.slice(series.length - maxSnapshotPoints)
}

const sliceSeriesByTime = (series, currentTime, maxSnapshotPoints) => {
  if (currentTime == null) return []

  let end = 0
  while (end < series.length) {
    const pointTime = getTimeValue(series[end])
    if (pointTime == null || pointTime > currentTime) break
    end += 1
  }

  return limitWindow(series.slice(0, end), maxSnapshotPoints)
}

const sliceFeed = (
  payload,
  cursor,
  clockMap,
  maxSnapshotPoints,
  isFullPrice = false,
  feedName = '',
  sliceCache = null,
) => {
  if (!payload) return null

  return normalizeCollection(payload).map((item, itemIndex) => {
    const seriesKeys = getItemSeriesKeys(item)
    if (seriesKeys.length === 0) return item

    if (isFullPrice) {
      const primarySeriesKey = getItemSeriesKey(item)
      return seriesKeys.reduce((snapshotItem, seriesKey) => ({
        ...snapshotItem,
        [seriesKey]: seriesKey === primarySeriesKey
          ? limitWindow(item[seriesKey].slice(0, cursor), maxSnapshotPoints)
          : item[seriesKey],
      }), { ...item })
    }

    const currentTime = clockMap[item?.symbol]
    return seriesKeys.reduce((snapshotItem, seriesKey) => {
      const cacheKey = `${feedName}:${item?.symbol ?? itemIndex}:${currentTime}:${seriesKey}:${maxSnapshotPoints}`
      let series
      if (sliceCache?.has(cacheKey)) {
        series = sliceCache.get(cacheKey)
        sliceCache.delete(cacheKey)
        sliceCache.set(cacheKey, series)
      } else {
        series = sliceSeriesByTime(item[seriesKey], currentTime, maxSnapshotPoints)
        if (sliceCache) {
          sliceCache.set(cacheKey, series)
          if (sliceCache.size > 200) {
            const oldestKey = sliceCache.keys().next().value
            if (oldestKey !== undefined) sliceCache.delete(oldestKey)
          }
        }
      }

      return { ...snapshotItem, [seriesKey]: series }
    }, { ...item })
  })
}

const buildSnapshot = (sources, cursor, maxSnapshotPoints, sliceCache = null) => {
  const clockMap = getSymbolClockMap(sources.fullPrice, cursor)

  return Object.keys(DEFAULT_FEEDS).reduce((snapshot, feedName) => {
    snapshot[feedName] = sliceFeed(
      sources[feedName],
      cursor,
      clockMap,
      maxSnapshotPoints,
      feedName === 'fullPrice',
      feedName,
      sliceCache,
    )
    return snapshot
  }, {})
}

const getMaxCursor = (sources) => (
  normalizeCollection(sources.fullPrice).reduce((max, item) => (
    Math.max(max, getPriceSeries(item).length)
  ), 0)
)

const reuseFeedReference = (previousFeed, nextFeed) => {
  if (previousFeed === nextFeed) return previousFeed
  if (!Array.isArray(previousFeed) || !Array.isArray(nextFeed)) {
    return previousFeed === nextFeed ? previousFeed : nextFeed
  }
  if (previousFeed.length !== nextFeed.length) return nextFeed

  const itemsMatch = previousFeed.every((previousItem, index) => {
    const nextItem = nextFeed[index]
    if (previousItem === nextItem) return true
    if (!previousItem || !nextItem || typeof previousItem !== 'object' || typeof nextItem !== 'object') {
      return false
    }

    const previousKeys = Object.keys(previousItem)
    const nextKeys = Object.keys(nextItem)
    const valuesMatch = (previousValue, nextValue) => {
      if (Object.is(previousValue, nextValue)) return true
      if (!Array.isArray(previousValue) || !Array.isArray(nextValue)) return false
      return previousValue.length === nextValue.length
        && previousValue.every((value, valueIndex) => Object.is(value, nextValue[valueIndex]))
    }

    return previousKeys.length === nextKeys.length
      && previousKeys.every(key => valuesMatch(previousItem[key], nextItem[key]))
  })

  return itemsMatch ? previousFeed : nextFeed
}

const scheduleFrame = (callback) => {
  if (typeof requestAnimationFrame === 'function') {
    return { type: 'animation', id: requestAnimationFrame(callback) }
  }
  return { type: 'timeout', id: setTimeout(callback, 16) }
}

const cancelFrame = (frame) => {
  if (!frame) return
  if (frame.type === 'animation') cancelAnimationFrame(frame.id)
  else clearTimeout(frame.id)
}

// MIG-F1: state is kept outside React; one animation-frame flush publishes snapshots and batches subscribers.
export const createMarketEngine = ({
  initialSpeed = 150,
  maxSnapshotPoints = DEFAULT_SNAPSHOT_WINDOW,
} = {}) => {
  let sources = createEmptySources()
  let cursor = 0
  let maxCursor = 0
  let speed = initialSpeed
  let step = 1
  let status = 'idle'
  let destroyed = false
  let timer = null
  let pendingFrame = null
  let snapshotPending = true
  let version = 0
  let sliceCache = new Map()
  let snapshot = buildSnapshot(sources, cursor, maxSnapshotPoints)
  const listeners = new Set()
  const feedCache = { ...snapshot }

  const publish = () => {
    if (destroyed || pendingFrame) return
    pendingFrame = scheduleFrame(() => {
      pendingFrame = null
      if (destroyed) return

      if (snapshotPending) {
        const nextSnapshot = buildSnapshot(sources, cursor, maxSnapshotPoints, sliceCache)
        let snapshotChanged = false
        Object.keys(DEFAULT_FEEDS).forEach((feedName) => {
          nextSnapshot[feedName] = reuseFeedReference(
            feedCache[feedName],
            nextSnapshot[feedName],
          )
          if (feedCache[feedName] !== nextSnapshot[feedName]) snapshotChanged = true
          feedCache[feedName] = nextSnapshot[feedName]
        })
        if (snapshotChanged) {
          snapshot = nextSnapshot
          version += 1
        }
        snapshotPending = false
      }

      listeners.forEach(listener => listener())
    })
  }

  const markSnapshotPending = () => {
    snapshotPending = true
    publish()
  }

  const stopTimer = () => {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  const setStatus = (nextStatus) => {
    if (status === nextStatus) return
    status = nextStatus
    publish()
  }

  const tick = () => {
    cursor = Math.min(cursor + step, maxCursor)
    markSnapshotPending()
    if (cursor >= maxCursor) {
      stopTimer()
      setStatus('completed')
    }
  }

  const play = () => {
    if (destroyed) return
    stopTimer()

    if (maxCursor <= 0) {
      setStatus('idle')
      return
    }

    if (cursor >= maxCursor) {
      cursor = 0
      markSnapshotPending()
    }

    setStatus('running')
    timer = setInterval(tick, speed)
  }

  const pause = () => {
    if (destroyed) return
    stopTimer()
    if (status !== 'completed') setStatus('paused')
  }

  const reset = () => {
    if (destroyed) return
    stopTimer()
    sliceCache.clear()
    cursor = 0
    status = 'idle'
    markSnapshotPending()
    publish()
  }

  const loadSources = (nextSources, options = {}) => {
    if (destroyed) return
    stopTimer()
    sliceCache.clear()
    sources = { ...DEFAULT_FEEDS, ...nextSources }
    maxCursor = getMaxCursor(sources)
    cursor = 0
    status = maxCursor > 0 ? 'ready' : 'idle'
    markSnapshotPending()

    if (options.autoStart && maxCursor > 0) {
      queueMicrotask(() => {
        if (!destroyed) play()
      })
    }
  }

  const updateSources = (nextSources, options = {}) => {
    if (destroyed) return
    const previousMaxCursor = maxCursor
    const previousCursor = cursor
    const wasFollowingLatest = previousMaxCursor > 0 && previousCursor >= previousMaxCursor
    const wasRunning = timer !== null || status === 'running'
    const wasCompleted = status === 'completed'
    const useReplaceMode = options.replaceMode !== false

    sources = mergeSources(sources, nextSources, useReplaceMode)
    sliceCache.clear()
    maxCursor = getMaxCursor(sources)
    cursor = options.followLatest && wasFollowingLatest
      ? maxCursor
      : Math.min(cursor, maxCursor)
    markSnapshotPending()

    if (maxCursor <= 0) {
      stopTimer()
      setStatus('idle')
      return
    }
    if (wasCompleted && cursor < maxCursor) setStatus('ready')

    if (options.autoContinue && (wasRunning || wasCompleted)) {
      setStatus('running')
      if (timer === null) timer = setInterval(tick, speed)
    }
  }

  const setSpeed = (nextSpeed) => {
    if (destroyed) return
    const parsedSpeed = Number(nextSpeed)
    const normalizedSpeed = Number.isFinite(parsedSpeed)
      ? Math.max(MIN_TIMER_SPEED, parsedSpeed)
      : initialSpeed
    if (speed === normalizedSpeed) return

    speed = normalizedSpeed
    publish()
    if (timer !== null) {
      stopTimer()
      timer = setInterval(tick, speed)
    }
  }

  const setStep = (nextStep) => {
    if (destroyed) return
    const parsedStep = Number(nextStep)
    const normalizedStep = Number.isFinite(parsedStep) && parsedStep > 0
      ? Math.max(1, Math.round(parsedStep))
      : 1
    if (step === normalizedStep) return
    step = normalizedStep
    publish()
  }

  return {
    // MIG-F1: stable snapshots and per-feed identities let useSyncExternalStore skip unrelated renders.
    subscribe: (listener) => {
      if (destroyed) return () => {}
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    getFeed: (name) => feedCache[name] ?? null,
    getCursor: () => cursor,
    getStatus: () => status,
    getSpeed: () => speed,
    getStep: () => step,
    getMaxCursor: () => maxCursor,
    play,
    pause,
    reset,
    setSpeed,
    setStep,
    loadSources,
    updateSources,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      stopTimer()
      cancelFrame(pendingFrame)
      pendingFrame = null
      listeners.clear()
      sliceCache.clear()
    },
    getSnapshotVersion: () => version,
  }
}
