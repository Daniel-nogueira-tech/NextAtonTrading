import { useEffect, useRef } from 'react'
import { createSeriesMarkers, LineSeries } from 'lightweight-charts'
import { getCandleTimeForSignal } from './tradeMarkers.js'

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

const findEntryCandle = (signal, candles, timeCache) => {
  if (!candles.length) return null

  const chartTime = getCandleTimeForSignal(signal, candles, timeCache)
  if (!Number.isFinite(chartTime)) return null

  return candles.find(candle => candle.time === chartTime) ?? null
}

const getActiveTrade = (signals = []) => {
  let activeTrade = null

  signals.forEach((signal) => {
    const action = normalizeAction(signal)
    if (ENTRY_ACTIONS.has(action)) {
      activeTrade = { signal, side: action }
      return
    }

    if (EXIT_ACTIONS.has(action) && activeTrade) {
      const closesBuy = activeTrade.side === 'BUY' && ['EXIT_BUY', 'STOP_BUY'].includes(action)
      const closesSell = activeTrade.side === 'SELL' && ['EXIT_SELL', 'STOP_SELL'].includes(action)
      if (closesBuy || closesSell) activeTrade = null
    }
  })

  if (!activeTrade) return null

  const entryPrice = normalizePrice(
    activeTrade.signal.avgEntryPrice,
    activeTrade.signal.entryPrice,
    activeTrade.side === 'BUY'
      ? activeTrade.signal.expectedPriceBuy
      : activeTrade.signal.expectedPriceSell,
  )

  return entryPrice ? { ...activeTrade, entryPrice } : null
}

const formatSigned = (value, decimals = 2) => {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}`
}

const ActiveOperationOverlay = ({ chart, chartLifecycleRef, candles = [], signals = [], timeCacheRef }) => {
  const lineSeriesRef = useRef(null)
  const entryMarkerRef = useRef(null)
  const activeTrade = getActiveTrade(signals)
  const currentCandle = candles.at(-1)
  const currentPrice = Number(currentCandle?.close)
  const quantity = Number(activeTrade?.signal?.quantity)
  const priceChange = activeTrade
    ? (currentPrice - activeTrade.entryPrice) * (activeTrade.side === 'BUY' ? 1 : -1)
    : 0
  const pnlPercent = activeTrade
    ? (priceChange / activeTrade.entryPrice) * 100
    : 0
  const pnlAmount = Number.isFinite(quantity) && quantity > 0
    ? priceChange * quantity
    : null
  const isProfitable = priceChange > 0
  const lineColor = priceChange === 0 ? '#a1a1aa' : isProfitable ? '#22c55e' : '#ef4444'

  useEffect(() => {
    if (!chart) return undefined

    const chartLifecycle = chartLifecycleRef?.current
    const lineSeries = chart.addSeries(LineSeries, {
      color: '#a1a1aa',
      lineWidth: 3,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
    })
    lineSeriesRef.current = lineSeries
    entryMarkerRef.current = createSeriesMarkers(lineSeries, [])

    return () => {
      entryMarkerRef.current = null
      if (
        chartLifecycle?.chart === chart &&
        !chartLifecycle.disposed
      ) {
        chart.removeSeries(lineSeries)
      }
      lineSeriesRef.current = null
    }
  }, [chart, chartLifecycleRef])

  useEffect(() => {
    const lineSeries = lineSeriesRef.current
    if (!lineSeries) return

    if (
      !activeTrade ||
      !currentCandle ||
      !Number.isFinite(currentPrice) ||
      !Number.isFinite(currentCandle.time)
    ) {
      lineSeries.setData([])
      entryMarkerRef.current?.setMarkers([])
      return
    }

    lineSeries.applyOptions({
      color: lineColor,
      title: `${activeTrade.side === 'BUY' ? 'Compra' : 'Venda'} | ${formatSigned(pnlPercent)}%`,
    })

    const entryCandle = findEntryCandle(activeTrade.signal, candles, timeCacheRef?.current)
    if (!entryCandle) {
      lineSeries.setData([])
      entryMarkerRef.current?.setMarkers([])
      return
    }

    const lineEndTime = currentCandle.time > entryCandle.time
      ? currentCandle.time
      : entryCandle.time + 1
    if (
      !Number.isFinite(entryCandle.time) ||
      !Number.isFinite(lineEndTime) ||
      !Number.isFinite(activeTrade.entryPrice)
    ) {
      lineSeries.setData([])
      entryMarkerRef.current?.setMarkers([])
      return
    }

    lineSeries.setData([
      { time: entryCandle.time, value: activeTrade.entryPrice },
      { time: lineEndTime, value: activeTrade.entryPrice },
    ])
    entryMarkerRef.current?.setMarkers([{
      time: entryCandle.time,
      position: 'aboveBar',
      color: lineColor,
      shape: 'square',
      text: activeTrade.side,
      size: 1,
    }])
  }, [activeTrade, candles, currentCandle, currentPrice, lineColor, pnlPercent, timeCacheRef])

  if (!activeTrade || !Number.isFinite(currentPrice)) return null

  return (
    <div
      className={`graphics-renko__active-operation${isProfitable ? ' is-profitable' : priceChange < 0 ? ' is-losing' : ''}`}
      aria-live="polite"
    >
      <strong>{activeTrade.side === 'BUY' ? 'Compra aberta' : 'Venda aberta'}</strong>
      <span>Entrada {activeTrade.entryPrice.toFixed(2)}</span>
      <span>Atual {currentPrice.toFixed(2)}</span>
      <strong>
        {formatSigned(pnlPercent)}%
        {pnlAmount != null && ` (${formatSigned(pnlAmount)} USDT)`}
      </strong>
    </div>
  )
}

export default ActiveOperationOverlay
