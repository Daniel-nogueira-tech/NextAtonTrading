import { useEffect, useRef, useState } from 'react'
import { createSeriesMarkers, LineSeries, LineStyle } from 'lightweight-charts'
import { getCandleTimeForSignal } from './tradeMarkers.js'
import Swal from 'sweetalert2'

const ENTRY_ACTIONS = new Set(['BUY', 'SELL'])
const EXIT_ACTIONS = new Set(['EXIT_BUY', 'EXIT_SELL', 'STOP_BUY', 'STOP_SELL'])
const LINE_EXTENSION_SECONDS = 7 * 24 * 60 * 60

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

const getActiveTrade = (signals = [], calculatedPosition = null) => {
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

  const signalCount = Math.max(1, Number(activeTrade.signal.count) || 1)
  const positionMatchesSignal =
    calculatedPosition &&
    calculatedPosition.side === activeTrade.side &&
    Number(calculatedPosition.count) === signalCount
  const position = positionMatchesSignal ? calculatedPosition : null
  const entryPrice = normalizePrice(
    position?.entryPrice,
    activeTrade.signal.avgEntryPrice,
    activeTrade.signal.entryPrice,
    activeTrade.side === 'BUY'
      ? activeTrade.signal.expectedPriceBuy
      : activeTrade.signal.expectedPriceSell,
  )

  const stopPrice = normalizePrice(
    position?.stopPrice,
    activeTrade.signal.stop,
    activeTrade.signal.stopPrice,
    activeTrade.signal.expectedPriceStop,
  )

  const quantity = normalizePrice(
    activeTrade.signal.totalQuantity,
    position?.quantity,
    Number(activeTrade.signal.quantity) * signalCount,
    activeTrade.signal.quantity,
  )

  return entryPrice
    ? { ...activeTrade, entryPrice, stopPrice, quantity }
    : null
}

const formatSigned = (value, decimals = 2) => {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}`
}

const ActiveOperationOverlay = ({
  chart,
  chartLifecycleRef,
  chartContainerRef,
  candles = [],
  signals = [],
  calculatedPosition = null,
  timeCacheRef,
  onStopChange,
}) => {
  const lineSeriesRef = useRef(null)
  const stopSeriesRef = useRef(null)
  const entryMarkerRef = useRef(null)
  const activeTradeRef = useRef(null)
  const currentPriceRef = useRef(null)
  const stopPriceRef = useRef(null)
  const draggingPointerRef = useRef(null)
  const dragStopPriceRef = useRef(null)
  const onStopChangeRef = useRef(onStopChange)
  const [dragStopPrice, setDragStopPrice] = useState(null)
  const activeTrade = getActiveTrade(signals, calculatedPosition)
  const displayedStopPrice = dragStopPrice ?? activeTrade?.stopPrice ?? null
  const currentCandle = candles.at(-1)
  const currentPrice = Number(currentCandle?.close)
  const priceChange = activeTrade
    ? (currentPrice - activeTrade.entryPrice) * (activeTrade.side === 'BUY' ? 1 : -1)
    : 0
  const pnlPercent = activeTrade
    ? (priceChange / activeTrade.entryPrice) * 100
    : 0
  const pnlAmount = Number.isFinite(activeTrade?.quantity) && activeTrade.quantity > 0
    ? priceChange * activeTrade.quantity
    : null
  const isProfitable = priceChange > 0
  const lineColor = priceChange === 0 ? '#a1a1aa' : isProfitable ? '#22c55e' : '#ef4444'

  useEffect(() => {
    activeTradeRef.current = activeTrade
    currentPriceRef.current = currentPrice
    stopPriceRef.current = displayedStopPrice
    onStopChangeRef.current = onStopChange
  }, [activeTrade, currentPrice, displayedStopPrice, onStopChange])

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
    const stopSeries = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
      title: 'STOP',
    })
    lineSeriesRef.current = lineSeries
    stopSeriesRef.current = stopSeries
    entryMarkerRef.current = createSeriesMarkers(lineSeries, [])

    return () => {
      entryMarkerRef.current = null
      if (
        chartLifecycle?.chart === chart &&
        !chartLifecycle.disposed
      ) {
        chart.removeSeries(lineSeries)
        chart.removeSeries(stopSeries)
      }
      lineSeriesRef.current = null
      stopSeriesRef.current = null
    }
  }, [chart, chartLifecycleRef])

  useEffect(() => {
    const container = chartContainerRef?.current
    if (!chart || !container) return undefined

    const onPointerDown = (event) => {
      const trade = activeTradeRef.current
      const stopSeries = stopSeriesRef.current
      const stopPrice = stopPriceRef.current
      if (!trade || !stopSeries || !Number.isFinite(stopPrice)) return

      const lineY = stopSeries.priceToCoordinate(stopPrice)
      const bounds = container.getBoundingClientRect()
      if (lineY == null || Math.abs(event.clientY - bounds.top - lineY) > 10) return

      event.preventDefault()
      event.stopPropagation()
      draggingPointerRef.current = event.pointerId
      dragStopPriceRef.current = stopPrice
      container.setPointerCapture(event.pointerId)
      container.classList.add('is-dragging-stop')
    }

    const onPointerMove = (event) => {
      const stopSeries = stopSeriesRef.current
      const trade = activeTradeRef.current
      const bounds = container.getBoundingClientRect()
      if (draggingPointerRef.current !== event.pointerId) {
        const stopPrice = stopPriceRef.current
        const lineY = Number.isFinite(stopPrice)
          ? stopSeries?.priceToCoordinate(stopPrice)
          : null
        container.classList.toggle(
          'is-stop-hover',
          Boolean(trade && lineY != null && Math.abs(event.clientY - bounds.top - lineY) <= 10),
        )
        return
      }

      const nextStop = stopSeries?.coordinateToPrice(event.clientY - bounds.top)
      if (!trade || !Number.isFinite(nextStop)) return


      const currentPrice = currentPriceRef.current
      if (!Number.isFinite(currentPrice)) return

      const isInProfit = trade.side === 'BUY'
        ? currentPrice > trade.entryPrice
        : currentPrice < trade.entryPrice

      const isOnValidSide = isInProfit
        ? (trade.side === 'BUY'
          ? nextStop < currentPrice
          : nextStop > currentPrice)
        : (trade.side === 'BUY'
          ? nextStop < trade.entryPrice
          : nextStop > trade.entryPrice)

      if (!isOnValidSide) return

      event.preventDefault()
      event.stopPropagation()
      dragStopPriceRef.current = nextStop
      setDragStopPrice(nextStop)
    }

    const finishDragging = async (event, shouldCommit) => {
      if (draggingPointerRef.current !== event.pointerId) return

      const nextStop = dragStopPriceRef.current
      draggingPointerRef.current = null
      dragStopPriceRef.current = null
      setDragStopPrice(null)
      container.classList.remove('is-dragging-stop')
      if (container.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId)
      }

      if (!shouldCommit || !Number.isFinite(nextStop)) return

      try {
        await onStopChangeRef.current?.(nextStop)
      } catch (error) {
        console.error('Erro ao atualizar stop pelo gráfico:', error)
        await Swal.fire({
          icon: 'error',
          title: 'Não foi possível atualizar o stop',
          text: error instanceof Error ? error.message : 'Ocorreu um erro ao atualizar o nível de stop.',
        })
      }
    }

    const onPointerUp = (event) => finishDragging(event, true)
    const onPointerCancel = (event) => finishDragging(event, false)

    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', onPointerUp)
    container.addEventListener('pointercancel', onPointerCancel)

    return () => {
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('pointercancel', onPointerCancel)
      container.classList.remove('is-dragging-stop')
      container.classList.remove('is-stop-hover')
    }
  }, [chart, chartContainerRef])

  useEffect(() => {
    const lineSeries = lineSeriesRef.current
    const stopSeries = stopSeriesRef.current
    if (!lineSeries || !stopSeries) return

    if (
      !activeTrade ||
      !currentCandle ||
      !Number.isFinite(currentPrice) ||
      !Number.isFinite(currentCandle.time)
    ) {
      lineSeries.setData([])
      stopSeries.setData([])
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
      stopSeries.setData([])
      entryMarkerRef.current?.setMarkers([])
      return
    }

    const lineEndTime = currentCandle.time + LINE_EXTENSION_SECONDS
    if (
      !Number.isFinite(entryCandle.time) ||
      !Number.isFinite(lineEndTime) ||
      !Number.isFinite(activeTrade.entryPrice)
    ) {
      lineSeries.setData([])
      stopSeries.setData([])
      entryMarkerRef.current?.setMarkers([])
      return
    }

    lineSeries.setData([
      { time: entryCandle.time, value: activeTrade.entryPrice },
      { time: lineEndTime, value: activeTrade.entryPrice },
    ])
    if (Number.isFinite(displayedStopPrice)) {
      stopSeries.applyOptions({
        title: `STOP ${displayedStopPrice.toFixed(2)} (arraste para ajustar)`,
      })
      stopSeries.setData([
        { time: entryCandle.time, value: displayedStopPrice },
        { time: lineEndTime, value: displayedStopPrice },
      ])
    } else {
      stopSeries.setData([])
    }
    entryMarkerRef.current?.setMarkers([{
      time: entryCandle.time,
      position: 'aboveBar',
      color: lineColor,
      shape: 'square',
      text: activeTrade.side,
      size: 1,
    }])
  }, [activeTrade, candles, currentCandle, currentPrice, displayedStopPrice, lineColor, pnlPercent, timeCacheRef])

  if (!activeTrade || !Number.isFinite(currentPrice)) return null

  return (
    <div
      className={`graphics-renko__active-operation${isProfitable ? ' is-profitable' : priceChange < 0 ? ' is-losing' : ''}`}
      aria-live="polite"
    >
      <strong>{activeTrade.side === 'BUY' ? 'Compra aberta' : 'Venda aberta'}</strong>
      <span>Entrada {activeTrade.entryPrice.toFixed(2)}</span>
      <span>Atual {currentPrice.toFixed(2)}</span>
      <span>
        Variação {formatSigned(priceChange)} pontos · {formatSigned(pnlPercent)}%
      </span>
      {Number.isFinite(displayedStopPrice) && (
        <span className="graphics-renko__active-operation-stop">
          Stop {displayedStopPrice.toFixed(2)} · arraste a linha para ajustar
        </span>
      )}
      <strong>
        Resultado {pnlAmount != null ? `${formatSigned(pnlAmount)} USDT` : 'calculando'}
      </strong>
    </div>
  )
}

export default ActiveOperationOverlay
