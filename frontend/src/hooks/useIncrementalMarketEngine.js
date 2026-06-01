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

const getSeriesPointKey = (point, index) => {
  const timeValue = getTimeValue(point)
  return timeValue != null ? `time:${timeValue}` : `index:${index}`
}

const mergeSeries = (currentSeries = [], nextSeries = []) => {
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

const getItemKey = (item, index) => {
  return item?.symbol || `index:${index}`
}

const mergeFeed = (currentPayload, nextPayload) => {
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

    const currentSeriesKey = getItemSeriesKey(currentItem)
    const nextSeriesKey = getItemSeriesKey(nextItem)
    const seriesKey = nextSeriesKey || currentSeriesKey

    if (!seriesKey) {
      mergedMap.set(itemKey, { ...currentItem, ...nextItem })
      return
    }

    mergedMap.set(itemKey, {
      ...currentItem,
      ...nextItem,
      [seriesKey]: mergeSeries(currentItem[seriesKey], nextItem[seriesKey]),
    })
  })

  return Array.from(mergedMap.values())
}

const mergeSources = (currentSources, nextSources) => {
  return Object.keys(DEFAULT_FEEDS).reduce((merged, feedName) => {
    merged[feedName] = mergeFeed(currentSources[feedName], nextSources?.[feedName])
    return merged
  }, {})
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
  const statusRef = React.useRef('idle')

  const [snapshot, setSnapshot] = React.useState(() => buildSnapshot(DEFAULT_FEEDS, 0, maxSnapshotPoints))
  const [status, setStatus] = React.useState('idle')
  const [cursor, setCursor] = React.useState(0)
  const [maxCursor, setMaxCursor] = React.useState(0)
  const [speed, setSpeedState] = React.useState(initialSpeed)

  const setEngineStatus = React.useCallback((nextStatus) => {
    if (typeof nextStatus === 'function') {
      setStatus((currentStatus) => {
        const resolvedStatus = nextStatus(currentStatus)
        statusRef.current = resolvedStatus
        return resolvedStatus
      })
      return
    }

    statusRef.current = nextStatus
    setStatus(nextStatus)
  }, [])

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
    setEngineStatus(current => current === 'completed' ? current : 'paused')
  }, [setEngineStatus, stopTimer])

  const tick = React.useCallback(() => {
    const nextCursor = Math.min(cursorRef.current + 1, maxCursorRef.current)
    publishCursor(nextCursor)

    if (nextCursor >= maxCursorRef.current) {
      stopTimer()
      setEngineStatus('completed')
    }
  }, [publishCursor, setEngineStatus, stopTimer])

  const play = React.useCallback(() => {
    stopTimer()

    if (maxCursorRef.current <= 0) {
      setEngineStatus('idle')
      return
    }

    if (cursorRef.current >= maxCursorRef.current) {
      publishCursor(0)
    }

    setEngineStatus('running')
    timerRef.current = setInterval(tick, speedRef.current)
  }, [publishCursor, setEngineStatus, stopTimer, tick])

  const reset = React.useCallback(() => {
    stopTimer()
    publishCursor(0)
    setEngineStatus('idle')
  }, [publishCursor, setEngineStatus, stopTimer])

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
    setEngineStatus(nextMaxCursor > 0 ? 'ready' : 'idle')

    if (options.autoStart && nextMaxCursor > 0) {
      setTimeout(play, 0)
    }
  }, [play, publishCursor, setEngineStatus, stopTimer])

  const updateSources = React.useCallback((nextSources, options = {}) => {
    const previousMaxCursor = maxCursorRef.current
    const previousCursor = cursorRef.current
    const wasFollowingLatest = previousMaxCursor > 0 && previousCursor >= previousMaxCursor
    const wasRunning = timerRef.current != null || statusRef.current === 'running'
    const wasCompleted = statusRef.current === 'completed'

    sourcesRef.current = mergeSources(sourcesRef.current, nextSources)

    const nextMaxCursor = getMaxCursor(sourcesRef.current)
    maxCursorRef.current = nextMaxCursor
    setMaxCursor(nextMaxCursor)

    const nextCursor = options.followLatest && wasFollowingLatest
      ? nextMaxCursor
      : Math.min(cursorRef.current, nextMaxCursor)

    publishCursor(nextCursor)

    if (nextMaxCursor <= 0) {
      setEngineStatus('idle')
      return
    }

    if (wasCompleted && nextCursor < nextMaxCursor) {
      setEngineStatus('ready')
    }

    if (options.autoContinue && (wasRunning || wasCompleted)) {
      setEngineStatus('running')
      if (!timerRef.current) {
        timerRef.current = setInterval(tick, speedRef.current)
      }
    }
  }, [publishCursor, setEngineStatus, tick])

  const setSpeed = React.useCallback((nextSpeed) => {
    const parsedSpeed = Number(nextSpeed)
    const normalizedSpeed = Number.isFinite(parsedSpeed)
      ? Math.max(MIN_TIMER_SPEED, parsedSpeed)
      : initialSpeed

    speedRef.current = normalizedSpeed
    setSpeedState(normalizedSpeed)

    if (timerRef.current) {
      stopTimer()
      setEngineStatus('running')
      timerRef.current = setInterval(tick, normalizedSpeed)
    }
  }, [initialSpeed, setEngineStatus, stopTimer, tick])

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
    updateSources,
    play,
    pause,
    continue: play,
    reset,
    setSpeed,
    isRunning: status === 'running',
  }
}
