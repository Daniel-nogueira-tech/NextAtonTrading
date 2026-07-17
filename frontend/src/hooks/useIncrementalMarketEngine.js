import React from 'react'

// Define as 5 fontes de dados esperadas pelo motor.
const DEFAULT_FEEDS = {
  fullPrice: null,
  trendPrimary: null,
  trend: null,
  vppr: null,
  rsi: null,
}

// Nomes de propriedades que contêm arrays de séries temporais dentro de cada item do feed. 
// O motor irá automaticamente detectar e fazer merge desses arrays ao atualizar os dados.
const ARRAY_KEYS = ['movements', 'result', 'prices', 'data']
const TIME_KEYS = ['Tempo', 'time', 'closeTime', 'openTime', 'open_time']


const DEFAULT_SNAPSHOT_WINDOW = 1200 // 1200 pontos máximo no histórico para evitar sobrecarga de memória 
const MIN_TIMER_SPEED = 100 // Velocidade mínima: 100ms

const createEmptySources = () => ({
  ...DEFAULT_FEEDS,
})

// Funções de Normalização e Extração
const normalizeCollection = (payload) => {
  if (!payload) return []
  const collection = payload.status && Array.isArray(payload.data)
    ? payload.data
    : payload
  return Array.isArray(collection) ? collection : [collection]
}

// Função para detectar qual chave contém a série temporal dentro de um item
const getItemSeriesKey = (item) => {
  return ARRAY_KEYS.find(key => Array.isArray(item?.[key])) ?? null
}

// Tenta encontrar qualquer campo definido em `TIME_KEYS`.
const getTimeValue = (point) => {
  if (!point) return null
  const value = TIME_KEYS.map(key => point[key]).find(Boolean)

  if (!value) return null

  //Converte: Números → se > 10 dígitos (ms), mantém; se menor, multiplica por 1000 (segundos → ms)
  if (typeof value === 'number') {
    return value > 9999999999 ? value : value * 1000
  }

  // Tenta analisar strings como datas ISO ou timestamps
  if (typeof value === 'string') {
    const parsed = Date.parse(value.replace(' ', 'T'))
    return Number.isNaN(parsed) ? null : parsed
  }

  return null
}

// Extrai a série temporal de um item usando a chave detectada
const getPriceSeries = (item) => {
  const seriesKey = getItemSeriesKey(item)
  return seriesKey ? item[seriesKey] : []
}

// Função de Merge Inteligente para Séries Temporais
const getSeriesPointKey = (point, index) => {
  const timeValue = getTimeValue(point)
  return timeValue != null ? `time:${timeValue}` : `index:${index}`
}

// Merge de duas séries temporais, evitando duplicatas e mantendo a ordem cronológica
const mergeSeries = (currentSeries = [], nextSeries = [], replaceMode = false) => {
  // Se replaceMode está ativo, apenas retorna a série nova (sem misturar com a antiga)
  if (replaceMode && nextSeries.length > 0) {
    return nextSeries
  }

  // Caso contrário, faz merge inteligente (evita duplicatas baseado no tempo)
  const mergedMap = new Map()

  // Adiciona pontos da série atual
  currentSeries.forEach((point, index) => {
    mergedMap.set(getSeriesPointKey(point, index), point)
  })

  // Adiciona pontos da série nova, sobrescrevendo os existentes com base na chave de tempo
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

// Merge de feeds completos, item por item, usando mergeSeries para as séries temporais dentro de cada item
const getItemKey = (item, index) => {
  return item?.symbol || `index:${index}`
}

// Merge inteligente de feeds, combinando itens por chave (ex: símbolo) e séries temporais dentro de cada item
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

    const currentSeriesKey = getItemSeriesKey(currentItem)
    const nextSeriesKey = getItemSeriesKey(nextItem)
    const seriesKey = nextSeriesKey || currentSeriesKey

    if (!seriesKey) {
      mergedMap.set(itemKey, { ...currentItem, ...nextItem })
      return
    }

    // Usar replaceMode para atualizar apenas dados novos sem misturar com antigos
    mergedMap.set(itemKey, {
      ...currentItem,
      ...nextItem,
      [seriesKey]: mergeSeries(
        currentItem[seriesKey],
        nextItem[seriesKey],
        useReplaceMode
      ),
    })
  })

  return Array.from(mergedMap.values())
}

// Função para merge completo de fontes, iterando por cada feed e usando mergeFeed para combinar os dados
const mergeSources = (currentSources, nextSources, useReplaceMode = false) => {
  return Object.keys(DEFAULT_FEEDS).reduce((merged, feedName) => {
    merged[feedName] = mergeFeed(
      currentSources[feedName],
      nextSources?.[feedName],
      useReplaceMode
    )
    return merged
  }, {})
}
//  Cria um mapa `{ simbolo: timestamp_atual }` baseado no cursor do motor.
// Este mapa é usado para sincronizar as séries temporais de diferentes feeds, 
// garantindo que apenas os dados até o ponto atual do cursor sejam incluídos no snapshot.
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

// Limita o número de pontos em uma série para evitar sobrecarga de memória, 
// mantendo os pontos mais recentes
const limitWindow = (series, maxSnapshotPoints) => {
  if (!Array.isArray(series) || series.length <= maxSnapshotPoints) {
    return series
  }

  return series.slice(series.length - maxSnapshotPoints)
}
// Extrai um slice da série temporal baseado no tempo atual do símbolo, garantindo que apenas os pontos até o cursor sejam incluídos no snapshot.
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

// fullPrice: corta por índice (cursor) / corta por timestamp (usando o clockMap) 
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

// Construção do Snapshot 
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
// Encontra o tamanho máximo entre todas as séries do `fullPrice`.
const getMaxCursor = (sources) => {
  return normalizeCollection(sources.fullPrice).reduce((max, item) => {
    return Math.max(max, getPriceSeries(item).length)
  }, 0)
}

// Gerencia a reprodução temporal sincronizada de múltiplos feeds de dados (preços, indicadores).
export const useIncrementalMarketEngine = ({
  initialSpeed = 120,
  maxSnapshotPoints = DEFAULT_SNAPSHOT_WINDOW,
} = {}) => {
  // Refs para armazenar o estado interno do motor sem causar re-renderizações desnecessárias
  const sourcesRef = React.useRef(createEmptySources())
  const cursorRef = React.useRef(0)
  const maxCursorRef = React.useRef(0)
  const timerRef = React.useRef(null)
  const speedRef = React.useRef(initialSpeed)
  const statusRef = React.useRef('idle')

  // Estado React para expor o snapshot atual, status, cursor e controle de velocidade
  const [snapshot, setSnapshot] = React.useState(() => buildSnapshot(createEmptySources(), 0, maxSnapshotPoints))
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

  // Para o timer de reprodução automática.
  const stopTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  //Atualiza o cursor e reconstrói o snapshot.
  const publishCursor = React.useCallback((nextCursor) => {
    cursorRef.current = nextCursor
    setCursor(nextCursor)
    setSnapshot(buildSnapshot(sourcesRef.current, nextCursor, maxSnapshotPoints))
  }, [maxSnapshotPoints])

  // Pausa a reprodução automática, mantendo o estado atual para possível continuação.
  const pause = React.useCallback(() => {
    stopTimer()
    setEngineStatus(current => current === 'completed' ? current : 'paused')
  }, [setEngineStatus, stopTimer])

  // Avança um passo na timeline. Se atingir o final, para o timer e marca como 'completed'.
  const tick = React.useCallback(() => {
    const nextCursor = Math.min(cursorRef.current + 1, maxCursorRef.current)
    publishCursor(nextCursor)

    if (nextCursor >= maxCursorRef.current) {
      stopTimer()
      setEngineStatus('completed')
    }
  }, [publishCursor, setEngineStatus, stopTimer])

  // Inicia ou retoma a reprodução automática. Se o cursor já estiver no final, reinicia do início.
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

  // Continua a reprodução automática se estiver pausada.
  const reset = React.useCallback(() => {
    location.reload(); 

    stopTimer()
    cursorRef.current = 0
    statusRef.current = 'idle'

    setCursor(0)
    setMaxCursor(maxCursorRef.current)
    setSnapshot(buildSnapshot(sourcesRef.current, 0, maxSnapshotPoints))
    setEngineStatus('idle')
  }, [maxSnapshotPoints, setEngineStatus, stopTimer])

  // Carrega novos dados no motor.
  const loadSources = React.useCallback((nextSources, options = {}) => {
    stopTimer()

    sourcesRef.current = {
      ...DEFAULT_FEEDS,
      ...nextSources,
    }

    // Recalcula o maxCursor com base nos dados carregados e publica o cursor inicial. O status é definido como 'ready' se houver dados para reproduzir, caso contrário, permanece 'idle'.
    const nextMaxCursor = getMaxCursor(sourcesRef.current)
    maxCursorRef.current = nextMaxCursor
    setMaxCursor(nextMaxCursor)
    publishCursor(0)
    setEngineStatus(nextMaxCursor > 0 ? 'ready' : 'idle')

    if (options.autoStart && nextMaxCursor > 0) {
      setTimeout(play, 0)
    }
  }, [play, publishCursor, setEngineStatus, stopTimer])

  // Atualiza os dados existentes no motor. Por padrão, faz merge inteligente para evitar duplicação de dados antigos, mas pode ser configurado para substituir completamente os dados de um feed específico.
  const updateSources = React.useCallback((nextSources, options = {}) => {
    const previousMaxCursor = maxCursorRef.current
    const previousCursor = cursorRef.current
    const wasFollowingLatest = previousMaxCursor > 0 && previousCursor >= previousMaxCursor
    const wasRunning = timerRef.current != null || statusRef.current === 'running'
    const wasCompleted = statusRef.current === 'completed'

    // Por padrão, usar replaceMode = true para atualizar apenas dados novos
    // Isso previne a mistura de dados antigos com novos
    const useReplaceMode = options.replaceMode !== false

    sourcesRef.current = mergeSources(sourcesRef.current, nextSources, useReplaceMode)

    // Recalcula o maxCursor com base nos dados atualizados
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

  // Ajusta a velocidade da reprodução automática. Se o motor estiver rodando, reinicia o timer com a nova velocidade.
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

  //  Limpa timer ao desmontar o componente, Evita memory leaks quando o componente é destruído.
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
