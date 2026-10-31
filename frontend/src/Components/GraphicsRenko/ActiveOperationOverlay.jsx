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
  const takeProfitPrice = normalizePrice(
    activeTrade.signal.takeProfit,
  )

  const quantity = normalizePrice(
    activeTrade.signal.totalQuantity,
    position?.quantity,
    Number(activeTrade.signal.quantity) * signalCount,
    activeTrade.signal.quantity,
  )

  return entryPrice
    ? { ...activeTrade, entryPrice, stopPrice, takeProfitPrice, quantity }
    : null
}

const formatSigned = (value, decimals = 2) => {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}`
}

const getTradePoints = (price, trade) => (
  (price - trade.entryPrice) * (trade.side === 'BUY' ? 1 : -1)
)

const ActiveOperationOverlay = ({
  chart,
  chartLifecycleRef,
  chartContainerRef,
  candles = [],
  signals = [],
  calculatedPosition = null,
  timeCacheRef,
  onStopChange,
  onTakeProfitChange,
}) => {
  const lineSeriesRef = useRef(null)
  const stopSeriesRef = useRef(null)
  const takeProfitSeriesRef = useRef(null)
  const entryMarkerRef = useRef(null)
  const activeTradeRef = useRef(null)
  const currentPriceRef = useRef(null)
  const stopPriceRef = useRef(null)
  const takeProfitPriceRef = useRef(null)
  const draggingPointerRef = useRef(null)
  const dragPriceRef = useRef(null)
  const dragLineTypeRef = useRef(null)
  const onStopChangeRef = useRef(onStopChange)
  const onTakeProfitChangeRef = useRef(onTakeProfitChange)
  const [draggedPrice, setDraggedPrice] = useState(null)
  const [draggedLineType, setDraggedLineType] = useState(null)
  const activeTrade = getActiveTrade(signals, calculatedPosition)
  const displayedStopPrice = draggedLineType === 'stop' ? draggedPrice : activeTrade?.stopPrice ?? null
  const displayedTakeProfitPrice = ['takeProfit', 'newTakeProfit'].includes(draggedLineType)
    ? draggedPrice
    : activeTrade?.takeProfitPrice ?? null
  const isTakeProfitPreview = draggedLineType === 'newTakeProfit'
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
    takeProfitPriceRef.current = displayedTakeProfitPrice
    onStopChangeRef.current = onStopChange
    onTakeProfitChangeRef.current = onTakeProfitChange
  }, [activeTrade, currentPrice, displayedStopPrice, displayedTakeProfitPrice, onStopChange, onTakeProfitChange])

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
    const takeProfitSeries = chart.addSeries(LineSeries, {
      color: '#22c55e',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
      title: 'TAKE PROFIT',
    })
    lineSeriesRef.current = lineSeries
    stopSeriesRef.current = stopSeries
    takeProfitSeriesRef.current = takeProfitSeries
    entryMarkerRef.current = createSeriesMarkers(lineSeries, [])

    return () => {
      entryMarkerRef.current = null
      if (
        chartLifecycle?.chart === chart &&
        !chartLifecycle.disposed
      ) {
        chart.removeSeries(lineSeries)
        chart.removeSeries(stopSeries)
        chart.removeSeries(takeProfitSeries)
      }
      lineSeriesRef.current = null
      stopSeriesRef.current = null
      takeProfitSeriesRef.current = null
    }
  }, [chart, chartLifecycleRef])

  useEffect(() => {
    const container = chartContainerRef?.current
    if (!chart || !container) return undefined

    const onPointerDown = (event) => {
      const trade = activeTradeRef.current
      const stopSeries = stopSeriesRef.current
      const stopPrice = stopPriceRef.current
      const takeProfitSeries = takeProfitSeriesRef.current
      const takeProfitPrice = takeProfitPriceRef.current
      const entrySeries = lineSeriesRef.current
      if (!trade) return

      const stopY = stopSeries && Number.isFinite(stopPrice)
        ? stopSeries.priceToCoordinate(stopPrice)
        : null
      const takeProfitY = takeProfitSeries && Number.isFinite(takeProfitPrice)
        ? takeProfitSeries.priceToCoordinate(takeProfitPrice)
        : null
      const entryY = entrySeries?.priceToCoordinate(trade.entryPrice)
      const bounds = container.getBoundingClientRect()
      const pointerY = event.clientY - bounds.top
      const stopDistance = stopY == null ? Infinity : Math.abs(pointerY - stopY)
      const takeProfitDistance = takeProfitY == null ? Infinity : Math.abs(pointerY - takeProfitY)
      const entryDistance = entryY == null ? Infinity : Math.abs(pointerY - entryY)
      const isExistingLine = Math.min(stopDistance, takeProfitDistance) <= 10
      const lineType = isExistingLine
        ? (stopDistance <= takeProfitDistance ? 'stop' : 'takeProfit')
        : !Number.isFinite(takeProfitPrice) && entryDistance <= 10
          ? 'newTakeProfit'
          : null
      if (!lineType) return

      event.preventDefault()
      event.stopPropagation()
      draggingPointerRef.current = event.pointerId
      dragLineTypeRef.current = lineType
      dragPriceRef.current = lineType === 'stop'
        ? stopPrice
        : lineType === 'takeProfit'
          ? takeProfitPrice
          : null
      setDraggedLineType(lineType)
      setDraggedPrice(dragPriceRef.current)
      container.setPointerCapture(event.pointerId)
      container.classList.add('is-dragging-stop')
    }

    const onPointerMove = (event) => {
      const lineType = dragLineTypeRef.current
      const stopSeries = stopSeriesRef.current
      const takeProfitSeries = takeProfitSeriesRef.current
      const activeSeries = lineType === 'stop'
        ? stopSeriesRef.current
        : lineType === 'takeProfit'
          ? takeProfitSeriesRef.current
          : lineSeriesRef.current
      const trade = activeTradeRef.current
      const bounds = container.getBoundingClientRect()
      if (draggingPointerRef.current !== event.pointerId) {
        const stopPrice = stopPriceRef.current
        const takeProfitPrice = takeProfitPriceRef.current
        const stopY = Number.isFinite(stopPrice)
          ? stopSeries?.priceToCoordinate(stopPrice)
          : null
        const takeProfitY = Number.isFinite(takeProfitPrice)
          ? takeProfitSeries?.priceToCoordinate(takeProfitPrice)
          : null
        const entryY = trade && lineSeriesRef.current?.priceToCoordinate(trade.entryPrice)
        const pointerY = event.clientY - bounds.top
        const entryDistance = entryY == null ? Infinity : Math.abs(pointerY - entryY)
        container.classList.toggle(
          'is-stop-hover',
          Boolean(trade && (
            (stopY != null && Math.abs(pointerY - stopY) <= 10) ||
            (takeProfitY != null && Math.abs(pointerY - takeProfitY) <= 10) ||
            (!Number.isFinite(takeProfitPrice) && entryDistance <= 10)
          )),
        )
        return
      }

      const nextPrice = activeSeries?.coordinateToPrice(event.clientY - bounds.top)
      if (!trade || !Number.isFinite(nextPrice)) {
        dragPriceRef.current = null
        setDraggedPrice(null)
        return
      }

      if (lineType === 'stop') {
        const currentPrice = currentPriceRef.current
        if (!Number.isFinite(currentPrice)) {
          dragPriceRef.current = null
          setDraggedPrice(null)
          return
        }

        const isInProfit = trade.side === 'BUY'
          ? currentPrice > trade.entryPrice
          : currentPrice < trade.entryPrice
        const isOnValidSide = isInProfit
          ? (trade.side === 'BUY' ? nextPrice < currentPrice : nextPrice > currentPrice)
          : (trade.side === 'BUY' ? nextPrice < trade.entryPrice : nextPrice > trade.entryPrice)
        if (!isOnValidSide) {
          dragPriceRef.current = null
          setDraggedPrice(null)
          return
        }
      } else if (
        (trade.side === 'BUY' && nextPrice <= trade.entryPrice) ||
        (trade.side === 'SELL' && nextPrice >= trade.entryPrice)
      ) {
        dragPriceRef.current = null
        setDraggedPrice(null)
        return
      }

      event.preventDefault()
      event.stopPropagation()
      dragPriceRef.current = nextPrice
      setDraggedPrice(nextPrice)
    }

    const finishDragging = async (event, shouldCommit) => {
      if (draggingPointerRef.current !== event.pointerId) return

      const nextPrice = dragPriceRef.current
      const lineType = dragLineTypeRef.current
      draggingPointerRef.current = null
      dragPriceRef.current = null
      dragLineTypeRef.current = null
      setDraggedPrice(null)
      setDraggedLineType(null)
      container.classList.remove('is-dragging-stop')
      if (container.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId)
      }

      if (!shouldCommit || !Number.isFinite(nextPrice)) return

      try {
        const updatePrice = lineType === 'stop'
          ? onStopChangeRef.current
          : onTakeProfitChangeRef.current
        if (typeof updatePrice !== 'function') {
          throw new Error(`A atualização de ${lineType === 'stop' ? 'stop' : 'take profit'} não está disponível.`)
        }
        await updatePrice(nextPrice)
      } catch (error) {
        const label = lineType === 'stop' ? 'stop' : 'take profit'
        console.error(`Erro ao atualizar ${label} pelo gráfico:`, error)
        await Swal.fire({
          icon: 'error',
          title: `Não foi possível atualizar ${label}`,
          text: error instanceof Error ? error.message : `Ocorreu um erro ao atualizar o nível de ${label}.`,
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
    const takeProfitSeries = takeProfitSeriesRef.current
    if (!lineSeries || !stopSeries || !takeProfitSeries) return

    if (
      !activeTrade ||
      !currentCandle ||
      !Number.isFinite(currentPrice) ||
      !Number.isFinite(currentCandle.time)
    ) {
      lineSeries.setData([])
      stopSeries.setData([])
      takeProfitSeries.setData([])
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
      takeProfitSeries.setData([])
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
      takeProfitSeries.setData([])
      entryMarkerRef.current?.setMarkers([])
      return
    }

    lineSeries.setData([
      { time: entryCandle.time, value: activeTrade.entryPrice },
      { time: lineEndTime, value: activeTrade.entryPrice },
    ])
    if (Number.isFinite(displayedStopPrice)) {
      const stopPoints = getTradePoints(displayedStopPrice, activeTrade)
      const estimatedStopResult = Number.isFinite(activeTrade.quantity)
        ? stopPoints * activeTrade.quantity
        : null
      stopSeries.applyOptions({
        title: `STOP ${displayedStopPrice.toFixed(2)} | ${formatSigned(stopPoints)} pts${estimatedStopResult == null ? '' : ` | ${formatSigned(estimatedStopResult)} est.`}`,
      })
      stopSeries.setData([
        { time: entryCandle.time, value: displayedStopPrice },
        { time: lineEndTime, value: displayedStopPrice },
      ])
    } else {
      stopSeries.setData([])
    }
    if (Number.isFinite(displayedTakeProfitPrice)) {
      const takeProfitPoints = getTradePoints(displayedTakeProfitPrice, activeTrade)
      const estimatedResult = Number.isFinite(activeTrade.quantity)
        ? takeProfitPoints * activeTrade.quantity
        : null
      takeProfitSeries.applyOptions({
        title: `TAKE PROFIT ${displayedTakeProfitPrice.toFixed(2)} | ${formatSigned(takeProfitPoints)} pts${estimatedResult == null ? '' : ` | ${formatSigned(estimatedResult)} est.`}`,
      })
      takeProfitSeries.setData([
        { time: entryCandle.time, value: displayedTakeProfitPrice },
        { time: lineEndTime, value: displayedTakeProfitPrice },
      ])
    } else {
      takeProfitSeries.setData([])
    }
    entryMarkerRef.current?.setMarkers([{
      time: entryCandle.time,
      position: 'aboveBar',
      color: lineColor,
      shape: 'square',
      text: activeTrade.side,
      size: 1,
    }])
  }, [activeTrade, candles, currentCandle, currentPrice, displayedStopPrice, displayedTakeProfitPrice, lineColor, pnlPercent, timeCacheRef])

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
          Stop {displayedStopPrice.toFixed(2)} · {formatSigned(getTradePoints(displayedStopPrice, activeTrade))} pontos
          {Number.isFinite(activeTrade.quantity)
            ? ` · ${formatSigned(getTradePoints(displayedStopPrice, activeTrade) * activeTrade.quantity)} estimado`
            : ''}
          · arraste a linha para ajustar
        </span>
      )}
      {Number.isFinite(displayedTakeProfitPrice) && (
        <span className="graphics-renko__active-operation-take-profit">
          Take profit {displayedTakeProfitPrice.toFixed(2)} · {formatSigned(getTradePoints(displayedTakeProfitPrice, activeTrade))} pontos
          {Number.isFinite(activeTrade.quantity)
            ? ` · ${formatSigned(getTradePoints(displayedTakeProfitPrice, activeTrade) * activeTrade.quantity)} estimado`
            : ''}
          {isTakeProfitPreview ? ' · prévia' : ' · arraste para ajustar'}
        </span>
      )}
      {!Number.isFinite(displayedTakeProfitPrice) && (
        <span className="graphics-renko__active-operation-take-profit">
          Arraste a partir da linha de entrada para definir o take profit
        </span>
      )}
      <strong>
        Resultado {pnlAmount != null ? `${formatSigned(pnlAmount)} USDT` : 'calculando'}
      </strong>
    </div>
  )
}

export default ActiveOperationOverlay
