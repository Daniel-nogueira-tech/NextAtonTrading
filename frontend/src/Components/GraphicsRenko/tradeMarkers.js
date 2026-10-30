const ENTRY_ACTIONS = new Set(['BUY', 'SELL'])
const EXIT_ACTIONS = new Set(['EXIT_BUY', 'EXIT_SELL', 'STOP_BUY', 'STOP_SELL'])

const normalizeAction = (signal) => String(signal?.action || signal?.type || '').trim().toUpperCase()

const normalizePrice = (...values) => {
  for (const value of values) {
    const price = Number(value)
    if (Number.isFinite(price) && price > 0) return price
  }
  return null
}

const normalizeTime = (value) => {
  if (value == null) return null
  if (typeof value === 'number') {
    return value > 9999999999 ? Math.floor(value / 1000) : value
  }

  const timestamp = Number(value)
  if (!Number.isNaN(timestamp) && String(value).trim() !== '') {
    return timestamp > 9999999999 ? Math.floor(timestamp / 1000) : timestamp
  }

  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return null
  return Math.floor((date.getTime() - 3 * 60 * 60 * 1000) / 1000)
}

const getSignalTime = (signal) => normalizeTime(signal.time ?? signal.Time ?? signal.Tempo)

export const getCandleTimeForSignal = (signal, candles, timeCache) => {
  const cachedTime = signal && timeCache?.get(signal)
  if (cachedTime != null) return cachedTime

  const signalTime = getSignalTime(signal)
  if (!Number.isFinite(signalTime) || !candles.length) return signalTime

  const candleTime = candles.reduce((closestTime, candle) => {
    if (!Number.isFinite(candle.time)) return closestTime
    if (closestTime == null) return candle.time

    const closestDistance = Math.abs(closestTime - signalTime)
    const candleDistance = Math.abs(candle.time - signalTime)
    return candleDistance < closestDistance ? candle.time : closestTime
  }, null)
  if (signal && candleTime != null) timeCache?.set(signal, candleTime)
  return candleTime
}

const createTradeMarker = (signal, candles, timeCache, isExit = false) => {
  const action = normalizeAction(signal)
  const isBuy = action === 'BUY' || action === 'EXIT_BUY' || action === 'STOP_BUY'
  const price = normalizePrice(
    isExit
      ? signal.exitPrice ?? signal.avgExitPrice ?? signal.price
      : signal.avgEntryPrice ?? signal.entryPrice ?? signal.expectedPriceBuy ?? signal.expectedPriceSell
  )

  return {
    time: getCandleTimeForSignal(signal, candles, timeCache),
    position: isBuy ? (isExit ? 'aboveBar' : 'belowBar') : (isExit ? 'belowBar' : 'aboveBar'),
    color: isBuy ? (isExit ? '#ff4f4f' : '#22c55e') : (isExit ? '#22ab94' : '#ef4444'),
    shape: isBuy !== isExit ? 'arrowUp' : 'arrowDown',
    text: `${isExit ? 'Exit' : 'Entry'} ${isBuy ? 'buy' : 'sell'}${price ? ` ${price}` : ''}`,
  }
}

export const buildCompletedTradeMarkers = (signals = [], candles = [], timeCache) => {
  const markers = []
  let openTrade = null

  signals.forEach((signal) => {
    const action = normalizeAction(signal)

    if (ENTRY_ACTIONS.has(action)) {
      openTrade = { signal, action }
      return
    }

    if (!EXIT_ACTIONS.has(action) || !openTrade) return

    const matchesSide =
      (openTrade.action === 'BUY' && ['EXIT_BUY', 'STOP_BUY'].includes(action)) ||
      (openTrade.action === 'SELL' && ['EXIT_SELL', 'STOP_SELL'].includes(action))

    if (!matchesSide) return

    markers.push(
      createTradeMarker(openTrade.signal, candles, timeCache),
      createTradeMarker(signal, candles, timeCache, true),
    )
    openTrade = null
  })

  return markers
    .filter(marker => Number.isFinite(marker.time))
    .sort((first, second) => first.time - second.time)
}
