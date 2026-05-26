import React from 'react'

const DEFAULT_FEEDS = {
  fullPrice: null,
  trendPrimary: null,
  trend: null,
  vppr: null,
  rsi: null,
}

const ARRAY_KEYS = ['movements', 'result', 'prices', 'data']
const TIME_KEYS = ['Tempo', 'time', 'closeTime', 'openTime', 'open_time']
const DEFAULT_SNAPSHOT_WINDOW = 1200
const MIN_TIMER_SPEED = 100

const normalizeCollection = (payload) => {
  if (!payload) return []

  const collection = payload.status && Array.isArray(payload.data)
    ? payload.data
    : payload

  return Array.isArray(collection) ? collection : [collection]
}

const getItemSeriesKey = (item) => {
  return ARRAY_KEYS.find(key => Array.isArray(item?.[key])) ?? null
}

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

const getSymbolClockMap = (fullPrice, cursor) => {
  return normalizeCollection(fullPrice).reduce((clockMap, item) => {
    const seriesKey = getItemSeriesKey(item)
    const series = seriesKey ? item[seriesKey] : []
    const currentPoint = series[Math.max(0, cursor - 1)]
    const currentTime = getTimeValue(currentPoint)

    if (item?.symbol && currentTime != null) {
      clockMap[item.symbol] = currentTime
    }

    return clockMap
  }, {})
}

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

    if (pointTime == null || pointTime > currentTime) {
      break
    }

    end += 1
  }

  return limitWindow(series.slice(0, end), maxSnapshotPoints)
}

const sliceFeed = (payload, cursor, clockMap, maxSnapshotPoints, isFullPrice = false) => {
  if (!payload) return null

  return normalizeCollection(payload).map((item) => {
    const seriesKey = getItemSeriesKey(item)

    if (!seriesKey) return item

    if (isFullPrice) {
      return {
        ...item,
        [seriesKey]: limitWindow(item[seriesKey].slice(0, cursor), maxSnapshotPoints),
      }
    }

    const currentTime = clockMap[item?.symbol]

    return {
      ...item,
      [seriesKey]: sliceSeriesByTime(item[seriesKey], currentTime, maxSnapshotPoints),
    }
  })
}

const buildSnapshot = (sources, cursor, maxSnapshotPoints) => {
  const clockMap = getSymbolClockMap(sources.fullPrice, cursor)

  return Object.keys(DEFAULT_FEEDS).reduce((snapshot, feedName) => {
    snapshot[feedName] = sliceFeed(
      sources[feedName],
      cursor,
      clockMap,
      maxSnapshotPoints,
      feedName === 'fullPrice'
    )
    return snapshot
  }, {})
}

const getMaxCursor = (sources) => {
  return normalizeCollection(sources.fullPrice).reduce((max, item) => {
    return Math.max(max, getPriceSeries(item).length)
  }, 0)
}

export const useIncrementalMarketEngine = ({
  initialSpeed = 120,
  maxSnapshotPoints = DEFAULT_SNAPSHOT_WINDOW,
} = {}) => {
  const sourcesRef = React.useRef(DEFAULT_FEEDS)
  const cursorRef = React.useRef(0)
  const maxCursorRef = React.useRef(0)
  const timerRef = React.useRef(null)
  const speedRef = React.useRef(initialSpeed)

  const [snapshot, setSnapshot] = React.useState(() => buildSnapshot(DEFAULT_FEEDS, 0, maxSnapshotPoints))
  const [status, setStatus] = React.useState('idle')
  const [cursor, setCursor] = React.useState(0)
  const [maxCursor, setMaxCursor] = React.useState(0)
  const [speed, setSpeedState] = React.useState(initialSpeed)

  const stopTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const publishCursor = React.useCallback((nextCursor) => {
    cursorRef.current = nextCursor
    setCursor(nextCursor)
    setSnapshot(buildSnapshot(sourcesRef.current, nextCursor, maxSnapshotPoints))
  }, [maxSnapshotPoints])

  const pause = React.useCallback(() => {
    stopTimer()
    setStatus(current => current === 'completed' ? current : 'paused')
  }, [stopTimer])

  const tick = React.useCallback(() => {
    const nextCursor = Math.min(cursorRef.current + 1, maxCursorRef.current)
    publishCursor(nextCursor)

    if (nextCursor >= maxCursorRef.current) {
      stopTimer()
      setStatus('completed')
    }
  }, [publishCursor, stopTimer])

  const play = React.useCallback(() => {
    stopTimer()

    if (maxCursorRef.current <= 0) {
      setStatus('idle')
      return
    }

    if (cursorRef.current >= maxCursorRef.current) {
      publishCursor(0)
    }

    setStatus('running')
    timerRef.current = setInterval(tick, speedRef.current)
  }, [publishCursor, stopTimer, tick])

  const reset = React.useCallback(() => {
    stopTimer()
    publishCursor(0)
    setStatus('idle')
  }, [publishCursor, stopTimer])

  const loadSources = React.useCallback((nextSources, options = {}) => {
    stopTimer()

    sourcesRef.current = {
      ...DEFAULT_FEEDS,
      ...nextSources,
    }

    const nextMaxCursor = getMaxCursor(sourcesRef.current)
    maxCursorRef.current = nextMaxCursor
    setMaxCursor(nextMaxCursor)
    publishCursor(0)
    setStatus(nextMaxCursor > 0 ? 'ready' : 'idle')

    if (options.autoStart && nextMaxCursor > 0) {
      setTimeout(play, 0)
    }
  }, [play, publishCursor, stopTimer])

  const setSpeed = React.useCallback((nextSpeed) => {
    const parsedSpeed = Number(nextSpeed)
    const normalizedSpeed = Number.isFinite(parsedSpeed)
      ? Math.max(MIN_TIMER_SPEED, parsedSpeed)
      : initialSpeed

    speedRef.current = normalizedSpeed
    setSpeedState(normalizedSpeed)

    if (timerRef.current) {
      stopTimer()
      setStatus('running')
      timerRef.current = setInterval(tick, normalizedSpeed)
    }
  }, [initialSpeed, stopTimer, tick])

  React.useEffect(() => {
    return () => stopTimer()
  }, [stopTimer])

  return {
    snapshot,
    status,
    cursor,
    maxCursor,
    speed,
    loadSources,
    play,
    pause,
    continue: play,
    reset,
    setSpeed,
    isRunning: status === 'running',
  }
}
