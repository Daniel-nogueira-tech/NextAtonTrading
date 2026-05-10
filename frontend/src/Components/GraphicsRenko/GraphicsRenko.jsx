
import React from 'react'
import './GraphicsRenko.css'
import { ContextGraphics } from '../../ContextGraphics/ContextGraphics.jsx'
import { CandlestickSeries, ColorType, CrosshairMode, createChart } from 'lightweight-charts'

const UP_COLOR = '#22AB94'
const DOWN_COLOR = '#fc5b5b'

const normalizeTrend = (trend) => {
  if (!trend) return []
  return Array.isArray(trend) ? trend : [trend]
}

const parseChartTime = (closeTime, fallbackIndex) => {
  if (typeof closeTime !== 'string') return fallbackIndex + 1


  const timestamp = Date.parse(closeTime.replace(' ', 'T'))
  if (Number.isNaN(timestamp)) return fallbackIndex + 1

  return Math.floor(timestamp / 1000)
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

const GraphicsRenko = () => {
  const { trend, activeSymbol } = React.useContext(ContextGraphics)
  const chartContainerRef = React.useRef(null)

// seleciona o ativo que está ativo
  const selectedMarket = React.useMemo(() => {
    if (!trend || !activeSymbol) return null
  return trend.find(
    item => item.symbol === activeSymbol
  )
}, [trend, activeSymbol])


  const renkoCandles = React.useMemo(() => buildRenkoCandles(
    selectedMarket?.movements || []
  ), [selectedMarket])

  React.useEffect(() => {
    if (!chartContainerRef.current) return

    const container = chartContainerRef.current
    const chart = createChart(container, {
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
      },
      localization: {
        priceFormatter: (price) => Number(price).toFixed(2),
      },
    })

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
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

    candlestickSeries.setData(renkoCandles)

    if (renkoCandles.length > 0) {
      chart.timeScale().fitContent()
    }

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      })
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
    }
  }, [renkoCandles])

  

  return (
    <section className="graphics-renko">
      <div className="graphics-renko__card">
        <div className="graphics-renko__header">
          <div>
            <span className="graphics-renko__eyebrow">Crypto Renko</span>
            <h3>Fluxo de Tendência</h3>
          </div>
          <div className="graphics-renko__status">
            {renkoCandles.length} blocos
          </div>
        </div>

        <div className="graphics-renko__chart" ref={chartContainerRef}>
          {renkoCandles.length === 0 && (
            <div className="graphics-renko__empty">
              Waiting for enough movement to form the blocks.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default GraphicsRenko
