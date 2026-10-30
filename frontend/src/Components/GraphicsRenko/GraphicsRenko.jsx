
import React from 'react'
import { createPortal } from 'react-dom'
import './GraphicsRenko.css'
import { ContextGraphics } from '../../ContextGraphics/ContextGraphics.jsx'
import { CandlestickSeries, ColorType, CrosshairMode, LineSeries, LineStyle, createChart, createSeriesMarkers } from 'lightweight-charts'

import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

import MovementTables from '../MovementTables/MovementTables.jsx';
import AnalysisTools from '../AnalysisTools/AnalysisTools.jsx';

import { useOperatingData } from '../../hooks/OperatingData/OperatingData.js';
import { useOperatingDataPrimary } from '../../hooks/OperationDataPrimary/OperationDataPrimary.js';
import { useVpprData } from '../../hooks/OperationDataVppr/OperationDataVppr.js';
import { useAmrsiData } from '../../hooks/OperationDataAmrsi/OperationDataAmrsi.js';
import { useOperatingInputs } from '../../hooks/OperatingInputs/OperatingInputs.js';
import { useSchrodingerData } from '../../hooks/OperationDataSchrodinger/OperationDataSchrodinger.js';
import IndicatorPanel from '../IndicatorPanel/IndicatorPanel.jsx'
import OrderTicket from '../../Components/OrderTicket/OrderTicket.jsx'
import TradingOverlayPanel from '../../Components/TradingOverlayPanel/TradingOverlayPanel.jsx'
import ActiveOperationOverlay from './ActiveOperationOverlay.jsx'
import { buildCompletedTradeMarkers } from './tradeMarkers.js'



const UP_COLOR = '#22AB94'
const DOWN_COLOR = '#fc5b5b'
const MIN_ENGINE_SPEED = 100
const MAX_ENGINE_SPEED = 5000
const DEFAULT_ENGINE_SPEED = 500

const FIBONACCI_LEVELS = [0, 0.382, 0.5, 0.618, 1]
const FUTURE_PROJECTION_DAYS = 60
const SECONDS_PER_DAY = 24 * 60 * 60

const buildFutureProjectionTimes = (candles, drawings) => {
  const lastTime = candles[candles.length - 1]?.time
  if (typeof lastTime !== 'number') return []

  const drawingTimes = drawings.flatMap(drawing => drawing.points)
    .map(point => point.time)
    .filter(Number.isFinite)
  const furthestDrawingTime = Math.max(lastTime, ...drawingTimes)
  const projectionDays = Math.max(
    FUTURE_PROJECTION_DAYS,
    Math.ceil((furthestDrawingTime - lastTime) / SECONDS_PER_DAY),
  )
  const projectionTimes = new Set(
    Array.from({ length: projectionDays }, (_, index) => (
      lastTime + (index + 1) * SECONDS_PER_DAY
    )),
  )
  drawingTimes.forEach(time => projectionTimes.add(time))

  return Array.from(projectionTimes)
    .sort((first, second) => first - second)
    .map(time => ({ time }))
}

const AnalysisDrawingOverlay = ({
  chart,
  series,
  drawings,
  energySurges = [],
  candles = [],
  draft,
  preview,
  renderVersion,
  activeTool,
  selectedDrawingIndex,
  onDrawingPointerDown,
}) => {
  if (!chart || !series) return null

  const toCoordinates = (point) => {
    const rawX = chart.timeScale().timeToCoordinate(point.time)
    const y = series.priceToCoordinate(point.price)

    // LOG apenas quando o ponto está na zona estendida (time > lastCandle)
    if (typeof point.time === 'number' && window.__lastCandleTime && point.time > window.__lastCandleTime) {
      console.log('[toCoord]', {
        time: point.time,
        rawX,
        lastCandle: window.__lastCandleTime,
        barSpacing: chart.timeScale().options().barSpacing,
        rightOffset: chart.timeScale().options().rightOffset,
        visibleRange: chart.timeScale().getVisibleRange(),
        logicalRange: chart.timeScale().getVisibleLogicalRange(),
      })
    }

    return { x: rawX, y }
  }
  const renderDrawing = (drawing, key, drawingIndex = null, isPreview = false) => {
    const points = drawing.points.map(toCoordinates)
    if (points.every(p => p.x === null || p.y === null)) return null

    const color =
      drawing.type === 'support' ? '#22ab94'
        : drawing.type === 'resistance' ? '#f23645'
          : '#a88aff'

    const common = {
      stroke: color,
      strokeWidth: 2,
      vectorEffect: 'non-scaling-stroke',
      pointerEvents: 'none',
    }

    const first = points[0]
    const selectable = !isPreview && activeTool === 'cursor' && drawingIndex !== null
    const isSelected = selectedDrawingIndex === drawingIndex

    const beginDrag = (pointIndex) => (event) => {
      if (!selectable) return
      event.preventDefault()
      event.stopPropagation()
      onDrawingPointerDown(drawingIndex, pointIndex, event)
    }

    const handle = (cx, cy, i) => {
      if (!selectable || cx === null || cy === null) return null
      return (
        <circle
          key={`handle-${i}`}
          cx={cx}
          cy={cy}
          r={isSelected ? 6 : 5}
          fill={color}
          stroke="#ffff"
          strokeWidth={isSelected ? 3.5 : 1}
          pointerEvents="all"
          style={{ cursor: 'move' }}
          onPointerDown={beginDrag(i)}
        />
      )
    }
    // ── Support / Resistance ──
    if (drawing.type === 'support' || drawing.type === 'resistance') {
      if (first.y === null) return null
      return (
        <g key={key}>
          <line
            x1="0"
            y1={first.y}
            x2="95%"
            y2={first.y}
            {...common}
          />
          {/* Alça sempre visível quando selectable — não depende de isSelected */}
          {selectable && handle('50%', first.y, 0)}
        </g>
      )
    }

    // ── Trendline ──
    if (drawing.type === 'trendline') {
      if (points.length < 2) return null
      const second = points[1]
      if (
        first.x === null || first.y === null ||
        second.x === null || second.y === null
      ) {
        return null
      }
      return (
        <g key={key}>
          <line x1={first.x} y1={first.y} x2={second.x} y2={second.y} {...common} />
          {selectable && points.map((p, i) => handle(p.x, p.y, i))}
        </g>
      )
    }

    // ── Channel ──
    if (drawing.type === 'channel') {
      if (points.length < 2) return null
      const second = points[1]

      if (points.length < 3) {
        if (
          first.x === null || first.y === null ||
          second.x === null || second.y === null
        ) {
          return null
        }
        return (
          <g key={key}>
            <line x1={first.x} y1={first.y} x2={second.x} y2={second.y} {...common} />
            {selectable && points.map((p, i) => handle(p.x, p.y, i))}
          </g>
        )
      }

      const third = points[2]
      if (
        first.x === null || first.y === null ||
        second.x === null || second.y === null ||
        third.x === null || third.y === null
      ) {
        return null
      }

      const dx = second.x - first.x
      const dy = second.y - first.y
      const length = Math.hypot(dx, dy) || 1
      const offset = ((third.x - first.x) * -dy + (third.y - first.y) * dx) / length
      const offsetX = (-dy / length) * offset
      const offsetY = (dx / length) * offset

      return (
        <g key={key}>
          <polygon
            points={`${first.x},${first.y} ${second.x},${second.y} ${second.x + offsetX},${second.y + offsetY} ${first.x + offsetX},${first.y + offsetY}`}
            fill={color}
            fillOpacity="0.08"
            pointerEvents="none"
          />
          <line x1={first.x} y1={first.y} x2={second.x} y2={second.y} {...common} />
          <line
            x1={first.x + offsetX}
            y1={first.y + offsetY}
            x2={second.x + offsetX}
            y2={second.y + offsetY}
            {...common}
          />
          {selectable && points.map((p, i) => handle(p.x, p.y, i))}
        </g>
      )
    }

    // ── Fibonacci ──
    if (drawing.type === 'fibonacci') {
      if (points.length < 2) return null
      const second = points[1]
      if (first.x === null || second.x === null) return null

      const priceDelta = drawing.points[1].price - drawing.points[0].price

      return (
        <g key={key}>
          {FIBONACCI_LEVELS.map(level => {
            const y = series.priceToCoordinate(
              drawing.points[0].price + priceDelta * level
            )
            if (y === null) return null
            return (
              <g key={level}>
                <line
                  x1={first.x}
                  y1={y}
                  x2={second.x}
                  y2={y}
                  {...common}
                  strokeOpacity="0.8"
                />
                <text
                  x={Math.max(first.x, second.x) + 5}
                  y={y - 3}
                  fill={color}
                  fontSize="10"
                  pointerEvents="none"
                >
                  {(level * 100).toFixed(1)}%
                </text>
              </g>
            )
          })}
          {selectable && points.map((p, i) => handle(p.x, p.y, i))}
        </g>
      )
    }

    return null
  }
  const draftPoints = draft && preview ? [...draft.points, preview] : draft?.points

  // ===============================|Mostra no Gráfico os pontos de maior energia|=============================== //
  return (
    <svg className="graphics-renko__analysis-overlay" aria-hidden="true" data-render-version={renderVersion}>
      {energySurges.map((surge, index) => {
        if (
          surge?.time == null ||
          surge?.power_surges_price == null ||
          surge?.energia == null
        ) return null

        const time = parseChartTime(surge?.time, index)
        const price = Number(surge?.power_surges_price)
        const energy = Number(surge?.energia)
        if (!Number.isFinite(time) || !Number.isFinite(price) || !Number.isFinite(energy)) return null

        let x = chart.timeScale().timeToCoordinate(time)
        if (!Number.isFinite(x) && candles.length > 0) {
          const nearestCandle = candles.reduce((nearest, candle) => (
            Math.abs(candle.time - time) < Math.abs(nearest.time - time) ? candle : nearest
          ))
          x = chart.timeScale().timeToCoordinate(nearestCandle.time)
        }
        const y = series.priceToCoordinate(price)
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null

        return (
          <g key={`${time}-${surge?.ordem ?? index}`} pointerEvents="none">
            <title>
              {`Energy: ${surge.energia} | Order: ${surge.ordem ?? '—'} | Price: ${price}`}
            </title>
            <svg viewBox="0 0 200 200" width="100" height="100" x={x - 50} y={y - 50} pointerEvents="none">
              <g className="atom">
                {/* Órbitas */}
                <ellipse className="atom-orbit atom-orbit--1" cx="100" cy="100" rx="40" ry="20" />
                <ellipse className="atom-orbit atom-orbit--2" cx="100" cy="100" rx="34" ry="34" />
                <ellipse className="atom-orbit atom-orbit--3" cx="100" cy="100" rx="20" ry="40" />


                {/* Núcleo */}
                <circle
                  className="energy-surge"
                  cx="100"
                  cy="100"
                  r="10"
                  fill="#b464ffaf"
                  stroke="#fff"
                  strokeWidth="1.5"
                />

                {/* Elétrons */}
                <circle className="atom-electron atom-electron--1" cx="100" cy="100" r="3" fill="#fff" />
                <circle className="atom-electron atom-electron--2" cx="100" cy="100" r="3" fill="#e0b0ff" />
                <circle className="atom-electron atom-electron--3" cx="100" cy="100" r="3" fill="#fff" />
                <circle className="atom-electron atom-electron--4" cx="100" cy="100" r="3" fill="#fff" />
              </g>
            </svg>
            <text
              x={x + 8}
              y={y - 8}
              fill="#ff3030"
              fontSize="11"
              fontWeight="700"
              stroke="#101820"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {energy.toFixed(4)}
            </text>
          </g>
        )
      })}
      {drawings.map((drawing, index) => renderDrawing(drawing, `drawing-${index}`, index))}
      {draft && renderDrawing({ ...draft, points: draftPoints }, 'drawing-preview', null, true)}
    </svg>
  )
}

const normalizeTrend = (trend) => {
  if (!trend) return []
  return Array.isArray(trend) ? trend : [trend]
}

const normalizeMarketCollection = (payload) => {
  if (!payload) return []
  const collection = payload.data ?? payload
  return Array.isArray(collection) ? collection : [collection]
}

const normalizeSymbol = (symbol) => {
  return String(symbol || '').trim().toUpperCase()
}

const selectMarketBySymbol = (payload, activeSymbol) => {
  const selectedSymbol = normalizeSymbol(activeSymbol)
  if (!selectedSymbol) return null

  return normalizeMarketCollection(payload).find(
    item => normalizeSymbol(item?.symbol) === selectedSymbol
  ) ?? null
}

//--------------/Formata datas/--------------
const parseChartTime = (closeTime, fallbackIndex) => {
  if (closeTime == null) return fallbackIndex + 1

  if (typeof closeTime === 'number') {
    // Aceita timestamps em milissegundos ou segundos
    return closeTime > 9999999999 ? Math.floor(closeTime / 1000) : closeTime
  }

  if (typeof closeTime !== 'string') return fallbackIndex + 1

  // Remove espaços e garante formato ISO
  const cleanTime = closeTime.replace(' ', 'T')
  const date = new Date(cleanTime)

  if (Number.isNaN(date.getTime())) return fallbackIndex + 1

  // Ajusta para UTC-3 (Brasília) sem alterar a hora exibida
  // Se a data já está em UTC, subtrai 3 horas
  const brasiliaOffset = +3 // UTC+3
  const utcTimestamp = date.getTime()
  const brasiliaTimestamp = utcTimestamp - (brasiliaOffset * 60 * 60 * 1000)

  return Math.floor(brasiliaTimestamp / 1000)
}

const buildRenkoCandles = (movements) => {
  const points = normalizeTrend(movements)
    .map((point, index) => ({
      ...point,
      closePrice: Number(point?.closePrice),
      time: parseChartTime(point?.closeTime, index),
    }))
    .filter((point) => Number.isFinite(point.closePrice))

  return points.slice(1).reduce((candles, point, index) => {
    const previous = points[index]

    if (!previous || point.closePrice === previous.closePrice) {
      return candles
    }

    const open = previous.closePrice
    const close = point.closePrice
    const isUp = close > open

    candles.push({
      time: point.time,
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      color: isUp ? UP_COLOR : DOWN_COLOR,
      wickColor: isUp ? UP_COLOR : DOWN_COLOR,
      borderColor: isUp ? UP_COLOR : DOWN_COLOR,
    })

    return candles
  }, [])
}

const buildLineData = (market, valueKey, seriesKey = 'result') => {
  const result = Array.isArray(market?.[seriesKey]) ? market[seriesKey] : []

  return result
    .map((point, index) => ({
      time: parseChartTime(point?.time, index),
      value: Number(point?.[valueKey]),
    }))
    .filter((point, index) => (
      result[index]?.[valueKey] != null &&
      result[index][valueKey] !== '' &&
      Number.isFinite(point.value)
    ))
}

const buildReferenceLineData = (baseData, value) => {
  return baseData.map((point) => ({
    time: point.time,
    value,
  }))
}

const RETEST_LEVELS = [
  { name: 'buy', label: 'Buy', color: '#22ab50' },
  { name: 'sell', label: 'Sell', color: '#fc5b5b' },
  { name: 'pivot', label: 'Pivot', color: '#ffffff' },
  { name: 'stop', label: 'Stop', color: '#414141' },
]
const MAX_RETEST_LEVELS = 2;

const buildRetestLevelSegments = (movements, chartEndTime) => {
  const points = (Array.isArray(movements) ? movements : [])
    .flatMap((movement, index) => {
      const pivot = movement?.pivot
      const trade = pivot?.trade
      const time = pivot?.pivot_closeTime ?? movement?.closeTime

      if (!trade || typeof trade !== 'object' || time == null) return []

      return [{
        time: parseChartTime(time, index),
        entry: trade.entry,
        pivot: trade.pivot,
        stop: trade.stop,
        // 👇buy/sell para o preço de entrada
        buy: trade.type === 'buy' ? trade.entry : undefined,
        sell: trade.type === 'sell' ? trade.entry : undefined,
      }]
    })
    .filter(point => Number.isFinite(point.time))
    .sort((first, second) => first.time - second.time)

  return RETEST_LEVELS.flatMap(({ name, label, color }) => points
    .filter(point => point[name] != null && point[name] !== '' && Number.isFinite(Number(point[name])))
    .reduce((uniquePoints, point) => {
      const previousPoint = uniquePoints[uniquePoints.length - 1]

      if (previousPoint?.time === point.time) {
        uniquePoints[uniquePoints.length - 1] = point
      } else {
        uniquePoints.push(point)
      }

      return uniquePoints
    }, [])
    .slice(-MAX_RETEST_LEVELS)
    .flatMap((point, index, visiblePoints) => {
      const value = Number(point[name])
      const nextTime = visiblePoints[index + 1]?.time ?? chartEndTime

      if (!Number.isFinite(value) || !Number.isFinite(nextTime) || nextTime <= point.time) {
        return []
      }

      return [{
        key: `${name}-${point.time}`,
        label,
        color,
        data: [
          { time: point.time, value },
          { time: nextTime, value },
        ],
      }]
    }))
}

const getChartTimeKey = (time) => {
  if (time == null) return null

  if (typeof time === 'object') {
    return `${time.year}-${time.month}-${time.day}`
  }

  return Number(time)
}

const sortAndDeduplicateSeriesData = (data) => {
  const pointMap = new Map()

  data.forEach((point) => {
    const timeKey = getChartTimeKey(point?.time)

    if (timeKey != null) {
      pointMap.set(timeKey, point)
    }
  })

  return Array.from(pointMap.values()).sort((a, b) => {
    const timeA = getChartTimeKey(a.time)
    const timeB = getChartTimeKey(b.time)

    if (typeof timeA === 'number' && typeof timeB === 'number') {
      return timeA - timeB
    }

    return String(timeA).localeCompare(String(timeB))
  })
}

const updateSeriesData = (seriesApi, data, metaRef) => {
  const nextData = sortAndDeduplicateSeriesData(data)
  const previous = metaRef.current
  const nextLength = nextData.length
  const nextFirstTime = getChartTimeKey(nextData[0]?.time)
  const nextLastTime = getChartTimeKey(nextData[nextLength - 1]?.time)

  if (
    !previous ||
    nextLength === 0 ||
    nextLength < previous.length ||
    nextFirstTime !== previous.firstTime ||
    nextLastTime < previous.lastTime
  ) {
    seriesApi.setData(nextData)
  } else if (nextLength === previous.length) {
    if (nextLastTime === previous.lastTime && nextData[nextLength - 1]) {
      seriesApi.update(nextData[nextLength - 1])
    } else {
      seriesApi.setData(nextData)
    }
  } else {
    for (let index = previous.length; index < nextLength; index += 1) {
      const point = nextData[index]
      const pointTime = getChartTimeKey(point?.time)

      if (point && pointTime > previous.lastTime) {
        seriesApi.update(point)
      }
    }
  }

  metaRef.current = {
    length: nextLength,
    firstTime: nextFirstTime,
    lastTime: nextLastTime,
  }
}

//=================/Formata datas/================= //
const formatDate = (date) => {
  if (!date) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const hasInvalidDateRange = (range) => {
  if (!Array.isArray(range) || range.length !== 2 || !range[0] || !range[1]) {
    return false
  }

  const start = range[0] instanceof Date ? range[0].getTime() : new Date(range[0]).getTime()
  const end = range[1] instanceof Date ? range[1].getTime() : new Date(range[1]).getTime()

  return Number.isFinite(start) && Number.isFinite(end) && start > end
}

const IndicatorChart = ({ title, emptyMessage, series, resetKey }) => {
  const containerRef = React.useRef(null)
  const chartRef = React.useRef(null)
  const popupRef = React.useRef(null)
  const seriesMapRef = React.useRef(new Map())
  const seriesMetaMapRef = React.useRef(new Map())
  const hadVisibleSeriesRef = React.useRef(false)
  const lastResetKeyRef = React.useRef(resetKey)
  const [popupWindow, setPopupWindow] = React.useState(null)

  const visibleSeries = React.useMemo(() => {
    return series.filter(item => item.data.length > 0)
  }, [series])

  const restoreToPanel = () => {
    popupRef.current?.close()
    popupRef.current = null
    setPopupWindow(null)
  }

  const openInWindow = () => {
    const windowName = `indicator-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    const indicatorWindow = window.open(
      '',
      windowName,
      'popup=yes,width=900,height=420,resizable=yes,scrollbars=yes',
    )

    if (!indicatorWindow) {
      window.alert('O navegador bloqueou a janela do indicador. Permita pop-ups para este site e tente novamente.')
      return
    }

    indicatorWindow.document.title = `${title} | NextAtonTrading`
    indicatorWindow.document.documentElement.style.height = '100%'
    indicatorWindow.document.body.classList.add('graphics-renko-indicator-window')
    indicatorWindow.document.body.style.margin = '0'
    indicatorWindow.document.body.style.padding = '12px'
    indicatorWindow.document.body.style.minWidth = '320px'
    indicatorWindow.document.body.style.background = '#111318'

    document.querySelectorAll('link[rel="stylesheet"], style').forEach((stylesheet) => {
      if (stylesheet instanceof HTMLLinkElement) {
        const link = indicatorWindow.document.createElement('link')
        link.rel = 'stylesheet'
        link.href = stylesheet.href
        indicatorWindow.document.head.appendChild(link)
      } else {
        indicatorWindow.document.head.appendChild(stylesheet.cloneNode(true))
      }
    })

    popupRef.current = indicatorWindow
    setPopupWindow(indicatorWindow)
  }

  React.useEffect(() => {
    if (!popupWindow) return undefined

    const checkWindowClosed = window.setInterval(() => {
      if (popupWindow.closed) {
        popupRef.current = null
        setPopupWindow(null)
      }
    }, 500)

    return () => window.clearInterval(checkWindowClosed)
  }, [popupWindow])

  React.useEffect(() => {
    return () => popupRef.current?.close()
  }, [])

  React.useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    chartRef.current = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#d1d4dc',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.35)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.35)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(117, 134, 150, 0.22)',
      },
      timeScale: {
        borderColor: 'rgba(117, 134, 150, 0.22)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
      },
      localization: {
        priceFormatter: (price) => Number(price).toFixed(2),
      },
    })

    return () => {
      chartRef.current?.remove()
      chartRef.current = null
      seriesMapRef.current.clear()
      seriesMetaMapRef.current.clear()
    }
  }, [popupWindow])


  React.useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    if (lastResetKeyRef.current !== resetKey) {
      seriesMapRef.current.forEach((lineSeries) => {
        chart.removeSeries(lineSeries)
      })

      seriesMapRef.current.clear()
      seriesMetaMapRef.current.clear()
      hadVisibleSeriesRef.current = false
      lastResetKeyRef.current = resetKey
    }

    const visibleNames = new Set(visibleSeries.map(item => item.name))

    seriesMapRef.current.forEach((lineSeries, name) => {
      if (!visibleNames.has(name)) {
        chart.removeSeries(lineSeries)
        seriesMapRef.current.delete(name)
        seriesMetaMapRef.current.delete(name)
      }
    })

    visibleSeries.forEach((item) => {
      let lineSeries = seriesMapRef.current.get(item.name)

      if (!lineSeries) {
        lineSeries = chart.addSeries(LineSeries, {
          color: item.color,
          lineWidth: item.lineWidth ?? 2,
          lineStyle: item.lineStyle ?? LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: true,
        })
        seriesMapRef.current.set(item.name, lineSeries)
        seriesMetaMapRef.current.set(item.name, { current: null })
      }

      lineSeries.applyOptions({
        color: item.color,
        lineWidth: item.lineWidth ?? 2,
        lineStyle: item.lineStyle ?? LineStyle.Solid,
      })
      updateSeriesData(lineSeries, item.data, seriesMetaMapRef.current.get(item.name))
    })

    // ── Aplica margem à direita (rightOffset) proporcional aos dados ──
    const applyRightOffset = () => {
      // Pega a série "principal" do painel (a primeira visível que tem dados)
      const base = visibleSeries[0]?.data
      if (!base || base.length < 2) {
        chart.timeScale().applyOptions({ rightOffset: 20 })
        return
      }

      const firstTime = base[0].time
      const lastTime = base[base.length - 1].time

      // Se time for numérico (segundos), estima candles por dia
      if (typeof firstTime === 'number' && typeof lastTime === 'number') {
        const totalDays = Math.max(1, (lastTime - firstTime) / 86400)
        const pointsPerDay = base.length / totalDays
        const DAYS_AHEAD = 3
        const desiredOffset = Math.ceil(pointsPerDay * DAYS_AHEAD)
        const rightOffset = Math.max(10, Math.min(50, desiredOffset))
        chart.timeScale().applyOptions({ rightOffset })
      } else {
        chart.timeScale().applyOptions({ rightOffset: 20 })
      }
    }

    if (visibleSeries.length > 0 && !hadVisibleSeriesRef.current) {
      chart.timeScale().fitContent()
      // ⚠️ fitContent() zera o rightOffset — reaplicar em seguida
      applyRightOffset()
    } else {
      // Mesmo sem fitContent, garante o offset em cada atualização
      applyRightOffset()
    }

    hadVisibleSeriesRef.current = visibleSeries.length > 0
  }, [visibleSeries, resetKey, popupWindow])

  const indicatorPanel = (
    <div className="graphics-renko__indicator-panel">
      <div className="graphics-renko__indicator-header">
        <span>{title}</span>
        <div className="graphics-renko__indicator-actions">
          <div className="graphics-renko__indicator-legend">
            {series.map((item) => (
              <small key={item.name}>
                <i style={{ backgroundColor: item.color }} />
                {item.name}
              </small>
            ))}
          </div>
          <button
            className="graphics-renko__indicator-window-button"
            type="button"
            onClick={popupWindow ? restoreToPanel : openInWindow}
          >
            {popupWindow ? 'Voltar ao painel' : 'Abrir em janela'}
          </button>
        </div>
      </div>
      <div className="graphics-renko__indicator-chart" ref={containerRef}>
        {visibleSeries.length === 0 && (
          <div className="graphics-renko__empty">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  )

  if (!popupWindow) return indicatorPanel

  return (
    <>
      <div className="graphics-renko__indicator-placeholder">
        <span>{title} está em outra janela</span>
        <button
          className="graphics-renko__indicator-window-button"
          type="button"
          onClick={restoreToPanel}
        >
          Trazer de volta
        </button>
      </div>
      {createPortal(indicatorPanel, popupWindow.document.body)}
    </>
  )
}

const GraphicsRenko = () => {
  const {
    trend,
    trendPrimary,
    schrodinger,
    activeSymbol,
    rsi,
    vppr,
    setMode,
    mode,
    dateToSimulation,
    download,
    setDownload,
    loading,
    setLoading,
    movementTables,
    setMovementTables,
    incrementalEngine,
    orderStop,
    setOrderStop,
    orderTakeProfit,
    setOrderTakeProfit,
    isTrend,
    setIsTrend,
    dates, 
    setDates,
    fullPrice,
    resultOperations
  } = React.useContext(ContextGraphics)
  const chartContainerRef = React.useRef(null);
  const chartRef = React.useRef(null);
  const analysisChartLifecycleRef = React.useRef(null);
  const candlestickSeriesRef = React.useRef(null);
  const futureProjectionSeriesRef = React.useRef(null);
  const retestLevelSeriesRef = React.useRef(new Map());
  const retestLevelMarkersRef = React.useRef(new Map());
  const candlestickSeriesMetaRef = React.useRef(null);
  const signalChartTimeCacheRef = React.useRef(new WeakMap());
  const hadRenkoCandlesRef = React.useRef(false);
  const lastChartSymbolRef = React.useRef(activeSymbol);
  const [activeAnalysisTool, setActiveAnalysisTool] = React.useState('cursor');
  const [analysisDrawings, setAnalysisDrawings] = React.useState([]);
  const [analysisDraft, setAnalysisDraft] = React.useState(null);
  const [analysisPreview, setAnalysisPreview] = React.useState(null);
  const [analysisRenderVersion, setAnalysisRenderVersion] = React.useState(0);
  const [analysisChart, setAnalysisChart] = React.useState(null);
  const [analysisSeries, setAnalysisSeries] = React.useState(null);
  const [selectedAnalysisDrawing, setSelectedAnalysisDrawing] = React.useState(null);
  const selectedAnalysisDrawingRef = React.useRef(null);
  const activeAnalysisToolRef = React.useRef(activeAnalysisTool);
  const analysisDraftRef = React.useRef(null);
  const analysisDragRef = React.useRef(null);
  const [dateErro, setDateErro] = React.useState(null);
  const [isIndicatorPanelVisible, setIsIndicatorPanelVisible] = React.useState(true);
  const [isOrderTicketOpen, setIsOrderTicketOpen] = React.useState(false);
  const [orderTicketSide, setOrderTicketSide] = React.useState('buy');

  console.log(fullPrice)
  let footer = `Please pick the first day.`;

  React.useEffect(() => {
    activeAnalysisToolRef.current = activeAnalysisTool
  }, [activeAnalysisTool])

  React.useEffect(() => {
    const getChartPoint = (event) => {
      const chart = chartRef.current
      const series = candlestickSeriesRef.current
      const bounds = chartContainerRef.current?.getBoundingClientRect()
      if (!chart || !series || !bounds) return null

      const priceScaleWidth = chart.priceScale('right').width()
      const timeScaleHeight = chart.timeScale().height()
      const chartWidth = bounds.width - priceScaleWidth
      const chartHeight = bounds.height - timeScaleHeight

      const x = Math.max(0, Math.min(chartWidth - 1, event.clientX - bounds.left))
      const y = Math.max(0, Math.min(chartHeight - 1, event.clientY - bounds.top))

      const time = chart.timeScale().coordinateToTime(x)
      const price = series.coordinateToPrice(y)
      if (time === null || price === null) return null
      return { x, y, time, price }
    }
    const handlePointerMove = (event) => {
      const drag = analysisDragRef.current
      const chart = chartRef.current
      const series = candlestickSeriesRef.current
      if (!drag || !chart || !series) return

      const current = getChartPoint(event)
      if (!current) return

      setAnalysisDrawings(drawings => drawings.map((drawing, index) => {
        if (index !== drag.drawingIndex) return drawing

        return {
          ...drawing,
          points: drawing.points.map((point, pointIndex) => (
            pointIndex === drag.pointIndex
              ? {
                time: drawing.type === 'support' || drawing.type === 'resistance'
                  ? point.time
                  : current.time,
                price: current.price,
              }
              : point
          )),
        }
      }))
    }
    const handlePointerUp = () => {
      if (analysisDragRef.current) {
        analysisDragRef.current = null
      }
    }

    const handleKeyDown = (event) => {
      if (!['Escape', 'Delete'].includes(event.key) || event.defaultPrevented) return
      const target = event.target
      if (target instanceof HTMLElement && (
        target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      )) return

      if (event.key === 'Delete') {
        const selectedIndex = selectedAnalysisDrawingRef.current
        if (selectedIndex === null) return
        event.preventDefault()
        setAnalysisDrawings(drawings => drawings.filter((_, index) => index !== selectedIndex))
        selectedAnalysisDrawingRef.current = null
        setSelectedAnalysisDrawing(null)
        return
      }

      event.preventDefault()
      if (analysisDraftRef.current) {
        analysisDraftRef.current = null
        setAnalysisDraft(null)
        setAnalysisPreview(null)
        return
      }

      setAnalysisDrawings(drawings => drawings.slice(0, -1))
      selectedAnalysisDrawingRef.current = null
      setSelectedAnalysisDrawing(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const handleAnalysisDrawingPointerDown = (drawingIndex, pointIndex, event) => {
    const chart = chartRef.current
    const series = candlestickSeriesRef.current
    const bounds = chartContainerRef.current?.getBoundingClientRect()
    if (!chart || !series || !bounds || !Number.isInteger(pointIndex)) return

    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    const time = chart.timeScale().coordinateToTime(x)
    const price = series.coordinateToPrice(y)
    if (time === null || price === null) return

    const drawing = analysisDrawings[drawingIndex]
    if (!drawing) return
    selectedAnalysisDrawingRef.current = drawingIndex
    setSelectedAnalysisDrawing(drawingIndex)
    analysisDragRef.current = {
      drawingIndex,
      pointIndex,
      startPoint: { x, y, time, price },
    }
  }

  //===================/ Chama os hooks /===================//
  useOperatingData(trend);
  const { retestPointsStatePrimaryRef } = useOperatingDataPrimary(trendPrimary);
  const { vpprDataRef } = useVpprData(vppr);
  const { amrsiDataRef } = useAmrsiData(rsi);
  const { schrodingerDataRef, indicatorsBySymbol: schrodingerIndicatorsBySymbol } = useSchrodingerData(schrodinger);
  const {
    signalsBySymbol,
    price: operatingPrices,
    calculateOrder,
    executeOrder,
    updateActiveStop,
    updateActiveTakeProfit,
    getLastTrendBySymbol,
    getLastTrendPrimaryBySymbol,
    getLastVpprBySymbol,
    getLastAmrsiBySymbol
  } = useOperatingInputs();

  const handleOpenOrderTicket = React.useCallback((side) => {
    const symbolSignals = signalsBySymbol?.[activeSymbol] || [];
    const lastEntryIndex = symbolSignals.reduce((latestIndex, signal, index) => (
      ['BUY', 'SELL'].includes(String(signal?.action || '').toUpperCase())
        ? index
        : latestIndex
    ), -1);
    const lastExitIndex = symbolSignals.reduce((latestIndex, signal, index) => (
      ['EXIT_BUY', 'EXIT_SELL', 'STOP_BUY', 'STOP_SELL'].includes(String(signal?.action || '').toUpperCase())
        ? index
        : latestIndex
    ), -1);
    const activeTakeProfit = lastEntryIndex > lastExitIndex
      ? symbolSignals[lastEntryIndex]?.takeProfit
      : '';
    setOrderTicketSide(side);
    setOrderStop('');
    setOrderTakeProfit(activeTakeProfit ? String(activeTakeProfit) : '');
    setIsOrderTicketOpen(true);
  }, [activeSymbol, setOrderStop, setOrderTakeProfit, signalsBySymbol]);

  const handleCalculateOrder = React.useCallback(async (side, stop, settings) => {
    const result = await calculateOrder(side, stop, settings);
    if (result && (stop == null || stop === '')) {
      setOrderStop(String(result.config.stop));
    }
    return result;
  }, [calculateOrder, setOrderStop]);

  const closeOrderTicket = React.useCallback(() => {
    setIsOrderTicketOpen(false);
  }, []);

  const handleConfirmOrder = React.useCallback(async (order) => {
    await executeOrder(order);
  }, [executeOrder]);

  const currentOrderPrice = Number(
    operatingPrices.find(item => item.symbol === activeSymbol)?.result?.at(-1)?.Fechamento ??
    operatingPrices[0]?.result?.at(-1)?.Fechamento ??
    0
  );
  //===================//===================//


  // alterna entre dados classificados de primário e secundário
  const trendCurrent = isTrend ? trend : trendPrimary;

  // Pega o sinal para o (Painel)
  const lastTrend = getLastTrendBySymbol(activeSymbol);
  const lastTrendPrimary = getLastTrendPrimaryBySymbol(activeSymbol);
  const lastVppr = getLastVpprBySymbol(activeSymbol);
  const lastAmrsi = getLastAmrsiBySymbol(activeSymbol);


  // seleciona o ativo que está ativo
  const selectedMarket = React.useMemo(() => {
    return selectMarketBySymbol(trendCurrent, activeSymbol)
  }, [trendCurrent, activeSymbol])

  const selectedRsiMarket = React.useMemo(() => {
    return selectMarketBySymbol(rsi, activeSymbol)
  }, [rsi, activeSymbol])

  const selectedVpprMarket = React.useMemo(() => {
    return selectMarketBySymbol(vppr, activeSymbol)
  }, [vppr, activeSymbol])

  const selectedSchrodingerMarket = React.useMemo(() => {
    return selectMarketBySymbol(schrodinger, activeSymbol)
  }, [schrodinger, activeSymbol])

  const energySurges = Array.isArray(selectedSchrodingerMarket?.power_surges)
    ? selectedSchrodingerMarket.power_surges
    : []

  const schrodingerIndicatorSeries = React.useMemo(() => ({
    emaVolume: [{
      name: 'EMA Volume',
      color: '#cda1ff',
      data: buildLineData(selectedSchrodingerMarket, 'value', 'ema_volume'),
    }],
    kineticEnergy: [{
      name: 'Energia cinética',
      color: '#22ab94',
      data: buildLineData(selectedSchrodingerMarket, 'value', 'energy_kinetic'),
    }],
    potentialEnergy: [{
      name: 'Energia potencial',
      color: '#f5a623',
      data: buildLineData(selectedSchrodingerMarket, 'value', 'potential_energy'),
    }],
    evolution_series: [
      {
        name: 'Buy',
        color: '#22ab50',
        data: buildLineData(selectedSchrodingerMarket, 'psi_buy', 'evolution_series'),
      },
      {
        name: 'Sell',
        color: '#fc5b5b',
        data: buildLineData(selectedSchrodingerMarket, 'psi_sell', 'evolution_series'),
      },
    ],
  }), [selectedSchrodingerMarket])

  const renkoCandles = React.useMemo(() => buildRenkoCandles(
    selectedMarket?.movements || []
  ), [selectedMarket])

  // Serie RSI
  const rsiSeries = React.useMemo(() => {
    const rsiData = buildLineData(selectedRsiMarket, 'rsi')
    const rsiMaData = buildLineData(selectedRsiMarket, 'rsi_ma')
    const referenceBaseData = rsiData.length > 0 ? rsiData : rsiMaData

    return [
      {
        name: 'RSI',
        color: '#a1f442',
        data: rsiData,
      },
      /*
      {
        name: 'Media',
        color: '#cda1ff',
        lineWidth: 1,
        data: rsiMaData,
      },*/
      {
        name: '70',
        color: 'rgba(242, 54, 69, 0.72)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        data: buildReferenceLineData(referenceBaseData, 70),
      },
      {
        name: '50',
        color: 'rgba(209, 212, 220, 0.52)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        data: buildReferenceLineData(referenceBaseData, 50),
      },
      {
        name: '30',
        color: 'rgba(34, 171, 148, 0.72)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        data: buildReferenceLineData(referenceBaseData, 30),
      },
    ]
  }, [selectedRsiMarket])

  // Serie VPPR
  const vpprSeries = React.useMemo(() => ([
    {
      name: 'VPPR',
      color: '#22AB94',
      data: buildLineData(selectedVpprMarket, 'vppr'),
    },
    {
      name: 'EMA',
      color: '#fc5b5b',
      lineWidth: 1,
      data: buildLineData(selectedVpprMarket, 'vppr_ema'),
    },
  ]), [selectedVpprMarket])


  React.useEffect(() => {
    if (!chartContainerRef.current) return

    const container = chartContainerRef.current
    chartRef.current = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#d1d4dc',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.45)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.45)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(117, 134, 150, 0.65)',
          width: 1,
          labelBackgroundColor: '#2A2E39',
        },
        horzLine: {
          color: 'rgba(117, 134, 150, 0.65)',
          width: 1,
          labelBackgroundColor: '#2A2E39',
        },
      },
      rightPriceScale: {
        autoScale: true,
        borderColor: 'rgba(117, 134, 150, 0.22)',
        scaleMargins: {
          top: 0.12,
          bottom: 0.16,
        },
      },
      timeScale: {
        borderColor: 'rgba(117, 134, 150, 0.22)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,   // ← margem inicial
      },
      localization: {
        priceFormatter: (price) => Number(price).toFixed(2),
      },
    })
    const chartLifecycle = { chart: chartRef.current, disposed: false }
    analysisChartLifecycleRef.current = chartLifecycle

    candlestickSeriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    })
    futureProjectionSeriesRef.current = chartRef.current.addSeries(LineSeries, {
      color: 'rgba(0, 0, 0, 0)',
      lineWidth: 1,
      priceScaleId: '',
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })
    setAnalysisChart(chartRef.current)
    setAnalysisSeries(candlestickSeriesRef.current)

    const chartMarkersRef = createSeriesMarkers(candlestickSeriesRef.current, [], {
      position: 'atPriceTop',
      color: '#000000',
      size: 12,
      shape: 'circle',
    })

    candlestickSeriesRef.current.chartMarkers = chartMarkersRef

    const drawingPointFromEvent = (event) => {
      if (!event.point || event.time === undefined || event.time === null) return null
      const price = candlestickSeriesRef.current?.coordinateToPrice(event.point.y)
      if (price === null || price === undefined) return null
      return { time: event.time, price }
    }

    const handleChartClick = (event) => {
      const tool = activeAnalysisToolRef.current
      if (tool === 'cursor') return

      const point = drawingPointFromEvent(event)
      if (!point) return

      if (tool === 'support' || tool === 'resistance') {
        setAnalysisDrawings(current => [...current, { type: tool, points: [point] }])
        setActiveAnalysisTool('cursor')
        activeAnalysisToolRef.current = 'cursor'
        return
      }

      const requiredPoints = tool === 'channel' ? 3 : 2
      const currentDraft = analysisDraftRef.current
      const nextDraft = currentDraft?.type === tool
        ? { ...currentDraft, points: [...currentDraft.points, point] }
        : { type: tool, points: [point] }

      if (nextDraft.points.length === requiredPoints) {
        setAnalysisDrawings(current => [...current, nextDraft])
        analysisDraftRef.current = null
        setAnalysisDraft(null)
        setAnalysisPreview(null)
        setActiveAnalysisTool('cursor')
        activeAnalysisToolRef.current = 'cursor'
      } else {
        analysisDraftRef.current = nextDraft
        setAnalysisDraft(nextDraft)
        setAnalysisPreview(null)
      }
    }

    const handleCrosshairMove = (event) => {
      if (!analysisDraftRef.current) return
      const point = drawingPointFromEvent(event)
      setAnalysisPreview(point)
    }

    let refreshFrameId = null
    const refreshDrawings = () => {
      if (refreshFrameId !== null) return

      refreshFrameId = requestAnimationFrame(() => {
        refreshFrameId = null
        setAnalysisRenderVersion(version => version + 1)
      })
    }
    chartRef.current.subscribeClick(handleChartClick)
    chartRef.current.subscribeCrosshairMove(handleCrosshairMove)
    chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(refreshDrawings)
    chartRef.current.timeScale().subscribeVisibleTimeRangeChange(refreshDrawings)
    chartRef.current.timeScale().subscribeSizeChange(refreshDrawings)

    const containerEl = chartContainerRef.current
    const resizeObserver = new ResizeObserver(() => {
      refreshDrawings()
    })
    if (containerEl) resizeObserver.observe(containerEl)

    return () => {
      const chart = chartRef.current
      if (chart) {
        if (analysisChartLifecycleRef.current?.chart === chart) {
          analysisChartLifecycleRef.current.disposed = true
        }
        chart.unsubscribeClick(handleChartClick)
        chart.unsubscribeCrosshairMove(handleCrosshairMove)
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(refreshDrawings)
        chart.timeScale().unsubscribeVisibleTimeRangeChange(refreshDrawings)
        chart.timeScale().unsubscribeSizeChange(refreshDrawings)
        //chart.priceScale('right').unsubscribeSizeChange(refreshDrawings)

        retestLevelMarkersRef.current.forEach((markers) => markers.setMarkers([]))
        retestLevelMarkersRef.current.clear()
        retestLevelSeriesRef.current.forEach((series) => chart.removeSeries(series))
        retestLevelSeriesRef.current.clear()

        chart.remove()
      }

      chartRef.current = null
      candlestickSeriesRef.current = null
      futureProjectionSeriesRef.current = null
      candlestickSeriesMetaRef.current = null

      if (refreshFrameId !== null) {
        cancelAnimationFrame(refreshFrameId)
      }
      resizeObserver.disconnect()
    }
  }, [])

  React.useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current) return

    if (lastChartSymbolRef.current !== activeSymbol) {
      candlestickSeriesRef.current.setData([])
      candlestickSeriesMetaRef.current = null
      hadRenkoCandlesRef.current = false
      lastChartSymbolRef.current = activeSymbol
      signalChartTimeCacheRef.current = new WeakMap()
      analysisDraftRef.current = null
      analysisDragRef.current = null
      setAnalysisDraft(null)
      setAnalysisPreview(null)
      setAnalysisDrawings([])
      selectedAnalysisDrawingRef.current = null
      setSelectedAnalysisDrawing(null)

      retestLevelMarkersRef.current.forEach((markers) => markers.setMarkers([]))
      retestLevelMarkersRef.current.clear()
      retestLevelSeriesRef.current.forEach((series) => chartRef.current.removeSeries(series))
      retestLevelSeriesRef.current.clear()
    }

    updateSeriesData(candlestickSeriesRef.current, renkoCandles, candlestickSeriesMetaRef)

    const chartEndTime = renkoCandles[renkoCandles.length - 1]?.time
    let retestSegments = null
    retestSegments = isTrend ?
      retestSegments = buildRetestLevelSegments(
        selectMarketBySymbol(trend, activeSymbol)?.movements,
        chartEndTime
      ) :
      retestSegments = buildRetestLevelSegments(
        selectMarketBySymbol(trendPrimary, activeSymbol)?.movements,
        chartEndTime
      )

    const visibleSegmentKeys = new Set(retestSegments.map(segment => segment.key))

    retestLevelSeriesRef.current.forEach((series, key) => {
      if (!visibleSegmentKeys.has(key)) {
        retestLevelMarkersRef.current.get(key)?.setMarkers([])
        retestLevelMarkersRef.current.delete(key)
        chartRef.current.removeSeries(series)
        retestLevelSeriesRef.current.delete(key)
      }
    })

    retestSegments.forEach(({ key, label, color, data }) => {
      let levelSeries = retestLevelSeriesRef.current.get(key)
      let levelMarkers = retestLevelMarkersRef.current.get(key)

      if (!levelSeries) {
        levelSeries = chartRef.current.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        retestLevelSeriesRef.current.set(key, levelSeries)
        levelMarkers = createSeriesMarkers(levelSeries, [], {
          position: 'aboveBar',
          size: 1,
        })
        retestLevelMarkersRef.current.set(key, levelMarkers)
      }

      levelSeries.setData(data)
      levelMarkers?.setMarkers([{
        time: data[0].time,
        position: 'aboveBar',
        color,
        shape: 'circle',
        text: label,
        size: 1,
      }])
    })

    const activeSignals = signalsBySymbol?.[activeSymbol] || []
    const markers = buildCompletedTradeMarkers(activeSignals, renkoCandles, signalChartTimeCacheRef.current)
    candlestickSeriesRef.current.chartMarkers?.setMarkers(markers)

    if (renkoCandles.length > 0 && !hadRenkoCandlesRef.current) {
      chartRef.current.timeScale().fitContent()
    }
    hadRenkoCandlesRef.current = renkoCandles.length > 0
  }, [renkoCandles, activeSymbol, signalsBySymbol, trend])

  React.useEffect(() => {
    if (!futureProjectionSeriesRef.current) return
    futureProjectionSeriesRef.current.setData(
      buildFutureProjectionTimes(renkoCandles, analysisDrawings),
    )
  }, [renkoCandles, analysisDrawings, analysisChart, schrodinger])

  //-------------------------/Calendário/-------------------------
  // Função para formatar quando precisar salvar ou mostrar
  // Quando precisar usar as datas formatadas:
  const formattedDates = React.useMemo(() => {
    if (!dates) return null
    return Array.isArray(dates)
      ? dates.map(d => formatDate(d))
      : formatDate(dates)
  }, [dates]);

  // Formata as datas
  const formattedDatesObj = React.useMemo(() => {
    if (!Array.isArray(formattedDates) || formattedDates.length !== 2) {
      return null
    }
    return {
      dateStart: formattedDates[0],
      dateEnd: formattedDates[1]
    }
  }, [formattedDates]);

  const handleDatesChange = (value) => {
    if (hasInvalidDateRange(value)) {
      setDateErro("The start date cannot be greater than the end date.");
      return;
    }
    setDateErro(null)
    setDates(value)
  }
  // Função para enviar datas
  const handleSubmitDate = async () => {
    if (!formattedDatesObj?.dateStart || !formattedDatesObj?.dateEnd || dateErro) {
      return;
    };
    setDownload(true);
    dateToSimulation(formattedDatesObj)
  }

  // Função para alternar entre Real time e simulação
  const buttonSimulation = async () => {
    setMode(mode === "simulation"
      ? "real"
      : "simulation")
    window.location.reload();
  };

  const increaseSimulationSpeed = () => {
    const currentSpeed = Number(incrementalEngine?.speed) || DEFAULT_ENGINE_SPEED
    incrementalEngine?.setSpeed(Math.max(MIN_ENGINE_SPEED, Math.round(currentSpeed / 2)))
  }

  const decreaseSimulationSpeed = () => {
    const currentSpeed = Number(incrementalEngine?.speed) || DEFAULT_ENGINE_SPEED
    incrementalEngine?.setSpeed(Math.min(MAX_ENGINE_SPEED, Math.round(currentSpeed * 2)))
  }

  const resetSimulation = () => {
    incrementalEngine?.reset()
  }

  const handleStepChange = (event) => {
    const nextStep = Number(event.target.value)
    incrementalEngine?.setStep(nextStep)
  }

  const speedLabel = React.useMemo(() => {
    const currentSpeed = Number(incrementalEngine?.speed) || DEFAULT_ENGINE_SPEED
    return `${currentSpeed}ms`
  }, [incrementalEngine?.speed])

  const stepLabel = React.useMemo(() => {
    return Number(incrementalEngine?.step) || 1
  }, [incrementalEngine?.step])



  //=======================|Retorna resultaddo da operação|==========================//
  return (
    <section className="graphics-renko">
            {isOrderTicketOpen && <OrderTicket
              symbol={activeSymbol}
              price={currentOrderPrice}
              isOpen
              initialSide={orderTicketSide}
              orderStop={orderStop}
              setOrderStop={setOrderStop}
              orderTakeProfit={orderTakeProfit}
              setOrderTakeProfit={setOrderTakeProfit}
              onCalculateOrder={handleCalculateOrder}
              onConfirm={handleConfirmOrder}
              onClose={closeOrderTicket}
            />}
      <div style={{ display: "flex", justifyContent: "center" }}>
        {movementTables &&
          <MovementTables />
        }
      </div>
      <div className="graphics-renko__card">
        <div className="graphics-renko__header">
          <div className="graphics-renko__title">
            <span className="graphics-renko__eyebrow">Crypto graphics</span>
            {/**Botão para alternar entre gráficos primário e secundário */}
            <div className='button-graphic'>
              <button
                onClick={() => setIsTrend(!isTrend)}
              > {isTrend ? 'Secundary' : 'Primary'}
              </button>
            </div>
          </div>

          <div className="graphics-renko__status">
            {renkoCandles.length} Blocks
          </div>
          <div className='movementTables' id={!movementTables ? 'movementTables' : 'movementTables-Active'}>
            <button
              onClick={() => { movementTables ? setMovementTables(false) : setMovementTables(true) }}
            >Movement Tables</button>
          </div>
        </div>

        {/**GRÁFICO RENKO PERSONALIZADO */}
        <div className="graphics-renko__workspace">
          <AnalysisTools
            activeTool={activeAnalysisTool}
            onToolSelect={(tool) => {
              activeAnalysisToolRef.current = tool
              setActiveAnalysisTool(tool)
              selectedAnalysisDrawingRef.current = null
              setSelectedAnalysisDrawing(null)
              analysisDragRef.current = null
              analysisDraftRef.current = null
              setAnalysisDraft(null)
              setAnalysisPreview(null)
            }}
            onClear={() => {
              analysisDraftRef.current = null
              analysisDragRef.current = null
              setAnalysisDraft(null)
              setAnalysisPreview(null)
              setAnalysisDrawings([])
              selectedAnalysisDrawingRef.current = null
              setSelectedAnalysisDrawing(null)
            }}
          />
          <div className="graphics-renko__chart" ref={chartContainerRef}>
            <ActiveOperationOverlay
              chart={analysisChart}
              chartLifecycleRef={analysisChartLifecycleRef}
              chartContainerRef={chartContainerRef}
              candles={renkoCandles}
              signals={signalsBySymbol?.[activeSymbol] || []}
              calculatedPosition={(resultOperations?.positions?.open || []).find(
                position => position.symbol === activeSymbol,
              )}
              timeCacheRef={signalChartTimeCacheRef}
              onStopChange={updateActiveStop}
              onTakeProfitChange={updateActiveTakeProfit}
            />
            <AnalysisDrawingOverlay
              chart={analysisChart}
              series={analysisSeries}
              drawings={analysisDrawings}
              energySurges={energySurges}
              candles={renkoCandles}
              draft={analysisDraft}
              preview={analysisPreview}
              renderVersion={analysisRenderVersion}
              activeTool={activeAnalysisTool}
              selectedDrawingIndex={selectedAnalysisDrawing}
              onDrawingPointerDown={handleAnalysisDrawingPointerDown}
            />
            <div className='button-simulation'>
              <button
                className="simulation-mode-toggle"
                onClick={buttonSimulation}
              >
                {mode === "simulation" ? "Simulation" : "Real time"}
              </button>


              {/*-----------------/Calendário/-----------------*/}
              {mode === "simulation" &&
                <div
                  className="card-dates flex justify-content-center "
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                >

                  {loading === false &&
                    <div style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    >
                      <DayPicker animate
                        autoFocus
                        classNames={{
                          selected: 'meu-dia-selecionado',
                          range_start: 'meu-range-inicio',
                          range_end: 'meu-range-fim',
                          today: 'meu-hoje',
                        }}


                        captionLayout="dropdown"
                        startMonth={new Date(2018, 0)}
                        navLayout="around"
                        mode="range"
                        footer={footer}
                        min={1}
                        selected={dates && Array.isArray(dates) && dates.length === 2
                          ? { from: dates[0], to: dates[1] }
                          : undefined}
                        onSelect={(range) => {
                          // Converte { from, to } de volta para o array [Date, Date]
                          if (range?.from && range?.to) {
                            handleDatesChange([range.from, range.to]);
                          } else if (range?.from) {
                            // Se só o "from" foi selecionado, passa um array com um item
                            // para o seu handleDatesChange lidar (como no Calendar antigo)
                            handleDatesChange([range.from, null]);
                          } else {
                            handleDatesChange(null);
                          }
                        }}
                      />

                      {dateErro && <p style={{ color: "red" }}>{dateErro}</p>}

                      {formattedDatesObj?.dateStart && formattedDatesObj?.dateEnd && !dateErro &&
                        <div className={download ? 'loading' : 'download'}>
                          <button
                            type="button"
                            className="p-button"
                            aria-label="Baixar simulação"
                            disabled={loading || download}
                            onClick={handleSubmitDate}
                          >
                            <span aria-live="polite">
                              {download ? "Loading..." : "⤓ download"}
                            </span>
                          </button>
                        </div>
                      }
                    </div>
                  }
                  { /**Mostra que foi caregado */}
                  {loading === true &&
                    <div className="loaded">
                      <button
                        type="button"
                        className="p-button"
                        aria-label="Baixar simulação"
                        disabled={loading || download}
                      >
                        <span aria-hidden="true">⤓</span>
                      </button>
                    </div>
                  }
                </div>
              }

              {/*-----------------/Botão de controle/-----------------*/}
              {loading && mode === "simulation" &&

                <div className='simulation-control'>

                  {!incrementalEngine.isRunning ? (
                    <button
                      type="button"
                      onClick={incrementalEngine?.play}
                      disabled={incrementalEngine?.isRunning}
                      title="Play"
                    >
                      Play
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={incrementalEngine?.pause}
                      disabled={!incrementalEngine?.isRunning}
                      title="Pause"
                    >
                      Pause
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={incrementalEngine?.continue}
                    disabled={incrementalEngine?.isRunning || incrementalEngine?.status === 'completed'}
                    title="Continue"
                  >
                    Continue
                  </button>
                  <button
                    id='button-reset'
                    type="button"
                    onClick={resetSimulation}
                    title="Reset"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoading(false)}
                    title="Liberar seleção e download de datas"
                  >
                    Reset loading
                  </button>
                  <span className='separates-speed'></span>
                  <div className='controlle-speed-container'>
                    <div className='controlle-speed'>
                      <button
                        type="button"
                        onClick={decreaseSimulationSpeed}
                        disabled={(Number(incrementalEngine?.speed) || DEFAULT_ENGINE_SPEED) >= MAX_ENGINE_SPEED}
                        title="Decrease speed"
                      >
                        -
                      </button>
                      <span className="simulation-control__speed">{speedLabel}</span>
                      <button
                        type="button"
                        onClick={increaseSimulationSpeed}
                        disabled={(Number(incrementalEngine?.speed) || DEFAULT_ENGINE_SPEED) <= MIN_ENGINE_SPEED}
                        title="Increase speed"
                      >
                        +
                      </button>
                    </div>

                    <div className='controlle-step'>
                      <label htmlFor="slider">Step: {stepLabel}</label>
                      <input
                        type="range"
                        id="slider"
                        name="slider"
                        min="1"
                        max="10"
                        value={stepLabel}
                        onChange={handleStepChange}
                      />
                    </div>
                  </div>
                </div>
              }

            </div>
            {renkoCandles.length === 0 && (
              <div className="graphics-renko__empty">
                Waiting for enough movement to form the blocks.
              </div>
            )}

            {/**==========================|Botão para compra e venda|============================ */}
            <TradingOverlayPanel onOpenTicket={handleOpenOrderTicket} />
          </div>
          <aside
            className={`graphics-renko__indicator-sidebar${isIndicatorPanelVisible ? '' : ' graphics-renko__indicator-sidebar--collapsed'}`}
            aria-label={`Indicadores de ${activeSymbol}`}
          >
            { /*<button
              className="graphics-renko__indicator-toggle"
              type="button"
              aria-expanded={isIndicatorPanelVisible}
              aria-controls="graphics-renko-indicator-panel"
              onClick={() => setIsIndicatorPanelVisible(visible => !visible)}
            >
              {isIndicatorPanelVisible ? 'Ocultar painel' : 'Mostrar painel'}
            </button>*/}
            {isIndicatorPanelVisible && (
              <IndicatorPanel
                key={activeSymbol}
                id="graphics-renko-indicator-panel"
                activeSymbol={activeSymbol}
                lastTrend={lastTrend}
                lastTrendPrimary={lastTrendPrimary}
                lastVppr={lastVppr}
                lastAmrsi={lastAmrsi}
                schrodingerIndicators={schrodingerIndicatorsBySymbol[activeSymbol]}
              />
            )}
          </aside>
        </div>

        {/**==========================|Painel dos indicadores|============================ */}
        <aside className="graphics-renko__indicators" aria-label="Graficos dos indicadores do ativo selecionado">
          <div className='indicators-container' >
            <span style={{ 'position': 'absolute' }}>
            </span>
            <IndicatorChart
              title="AMRSI"
              series={rsiSeries}
              emptyMessage="No RSI history available for this asset."
              resetKey={activeSymbol}
            />
          </div>

          <div className='painel-vppr'>
            <IndicatorChart
              title="VPPR"
              series={vpprSeries}
              emptyMessage="No VPPR history available for this asset."
              resetKey={activeSymbol}
            />
          </div>

          <div className="indicators-container">
            <IndicatorChart
              title="EMA Volume"
              series={schrodingerIndicatorSeries.emaVolume}
              emptyMessage="No EMA volume history available for this asset."
              resetKey={activeSymbol}
            />
          </div>

          <div className="indicators-container">
            <IndicatorChart
              title="Energia cinética"
              series={schrodingerIndicatorSeries.kineticEnergy}
              emptyMessage="No kinetic energy history available for this asset."
              resetKey={activeSymbol}
            />
          </div>

          <div className="indicators-container">
            <IndicatorChart
              title="Energia potencial"
              series={schrodingerIndicatorSeries.potentialEnergy}
              emptyMessage="No potential energy history available for this asset."
              resetKey={activeSymbol}
            />
          </div>

          <div className="indicators-container">
            <IndicatorChart
              title="Função de onda  Schrödinger — Buy / Sell Ψ"
              series={schrodingerIndicatorSeries.evolution_series}
              emptyMessage="No collapsed probabilities available for this asset."
              resetKey={activeSymbol}
            />
          </div>

        </aside>
      </div>
    </section >
  )
}

export default GraphicsRenko
