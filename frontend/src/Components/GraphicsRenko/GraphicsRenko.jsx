
import React from 'react'
import './GraphicsRenko.css'
import { ContextGraphics } from '../../ContextGraphics/ContextGraphics.jsx'
import { CandlestickSeries, ColorType, CrosshairMode, LineSeries, LineStyle, createChart } from 'lightweight-charts'
import { Calendar } from 'primereact/calendar';
import { Button } from 'primereact/button';
import { useEffect } from 'react';

const UP_COLOR = '#22AB94'
const DOWN_COLOR = '#fc5b5b'

const normalizeTrend = (trend) => {
  if (!trend) return []
  return Array.isArray(trend) ? trend : [trend]
}

const normalizeMarketCollection = (payload) => {
  if (!payload) return []
  const collection = payload.data ?? payload
  return Array.isArray(collection) ? collection : [collection]
}

const selectMarketBySymbol = (payload, activeSymbol) => {
  if (!activeSymbol) return null

  return normalizeMarketCollection(payload).find(
    item => item?.symbol === activeSymbol
  ) ?? null
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

const buildLineData = (market, valueKey) => {
  const result = Array.isArray(market?.result) ? market.result : []

  return result
    .map((point, index) => ({
      time: parseChartTime(point?.time, index),
      value: Number(point?.[valueKey]),
    }))
    .filter((point) => Number.isFinite(point.value))
}

const buildReferenceLineData = (baseData, value) => {
  return baseData.map((point) => ({
    time: point.time,
    value,
  }))
}
//--------------/Formata datas/--------------
const formatDate = (date) => {
  if (!date) return null
  return date.toISOString().split('T')[0];
}

const formattedDateToNumber = (date) => {
  if (typeof date !== 'string') return null

  const [day, month, year] = date.split('/').map(Number)
  if (!day || !month || !year) return null

  return year * 10000 + month * 100 + day
}

const hasInvalidDateRange = (range) => {
  if (!Array.isArray(range) || range.length !== 2 || !range[0] || !range[1]) {
    return false
  }

  const dateStart = formatDate(range[0])
  const dateEnd = formatDate(range[1])
  const start = formattedDateToNumber(dateStart)
  const end = formattedDateToNumber(dateEnd)

  return Boolean(start && end && start > end)
}

const parseFormattedDate = (date) => {
  if (typeof date !== 'string') return null

  const [day, month, year] = date.split('/').map(Number)
  if (!day || !month || !year) return null

  return new Date(year, month - 1, day)
}

const IndicatorChart = ({ title, emptyMessage, series }) => {
  const containerRef = React.useRef(null)

  const visibleSeries = React.useMemo(() => {
    return series.filter(item => item.data.length > 0)
  }, [series])


  React.useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
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
      },
      localization: {
        priceFormatter: (price) => Number(price).toFixed(2),
      },
    })

    visibleSeries.forEach((item) => {
      const lineSeries = chart.addSeries(LineSeries, {
        color: item.color,
        lineWidth: item.lineWidth ?? 2,
        lineStyle: item.lineStyle ?? LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: true,
      })

      lineSeries.setData(item.data)
    })

    if (visibleSeries.length > 0) {
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
  }, [visibleSeries])

  return (
    <div className="graphics-renko__indicator-panel">
      <div className="graphics-renko__indicator-header">
        <span>{title}</span>
        <div className="graphics-renko__indicator-legend">
          {series.map((item) => (
            <small key={item.name}>
              <i style={{ backgroundColor: item.color }} />
              {item.name}
            </small>
          ))}
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
}

const GraphicsRenko = () => {
  const { marketData, trend, activeSymbol, rsi, vppr, setMode, mode, dateToSimulation, download,setDownload,loading } = React.useContext(ContextGraphics)
  const chartContainerRef = React.useRef(null);
  const [dates, setDates] = React.useState(null);
  const [dateErro, setDateErro] = React.useState(null);

  console.log("trend:",trend);
  console.log("rsi",rsi);
  console.log("vppr",vppr);
  
  
  
  // seleciona o ativo que está ativo
  const selectedMarket = React.useMemo(() => {
    return selectMarketBySymbol(trend, activeSymbol)
  }, [trend, activeSymbol])

  const selectedRsiMarket = React.useMemo(() => {
    return selectMarketBySymbol(rsi, activeSymbol)
  }, [rsi, activeSymbol])

  const selectedVpprMarket = React.useMemo(() => {
    return selectMarketBySymbol(vppr, activeSymbol)
  }, [vppr, activeSymbol])

  const renkoCandles = React.useMemo(() => buildRenkoCandles(
    selectedMarket?.movements || []
  ), [selectedMarket])

  const rsiSeries = React.useMemo(() => {
    const rsiData = buildLineData(selectedRsiMarket, 'rsi')
    const rsiMaData = buildLineData(selectedRsiMarket, 'rsi_ma')
    const referenceBaseData = rsiData.length > 0 ? rsiData : rsiMaData

    return [
      /*{
        name: 'RSI',
        color: '#f4c542',
        data: rsiData,
      }, */
      {
        name: 'Media',
        color: '#cda1ff',
        lineWidth: 1,
        data: rsiMaData,
      },
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

  // Impede que o usuário selecione datas decrecentes 
  const calendarMinDate = React.useMemo(() => {
    return Array.isArray(dates) && dates[0] && !dates[1] ? dates[0] : null
  }, [dates])

  const handleDatesChange = (value) => {
    if (hasInvalidDateRange(value)) {
      setDateErro("The start date cannot be greater than the end date.");
      return;
    }
    setDates(value)
  }
  // Função para enviar datas
  const handleSubmitDate = async () => {
    if (formattedDatesObj[1] === null) {
      return;
    };
    setDownload(true);
    dateToSimulation(formattedDatesObj)
  }

  useEffect(()=>{
    marketData();
  },[])

  return (
    <section className="graphics-renko">
      <div className="graphics-renko__card">
        <div className="graphics-renko__header">
          <div>
            <span className="graphics-renko__eyebrow">Crypto graphics</span>
            <h3>{activeSymbol || 'Trend Flow'}</h3>
          </div>
          <div className="graphics-renko__status">
            {renkoCandles.length} Blocks
          </div>
        </div>

        <div className="graphics-renko__chart" ref={chartContainerRef}>
                <div className='button-simulation'>
            <button
              onClick={() => setMode(
                mode === "simulation"
                  ? "real"
                  : "simulation")}
            >
              {mode === "simulation" ? "Simulation" : "Real time"}
            </button>


            {/*-----------------/Calendário/-----------------*/}
            {mode === "simulation" &&
              <div
                className="card-dates flex justify-content-center ">
                <Calendar
                  value={dates}
                  onChange={(e) => handleDatesChange(e.value)}
                  selectionMode="range"
                  minDate={calendarMinDate}
                  readOnlyInput
                  hideOnRangeSelection
                  showIcon
                  showButtonBar
                />
                {dateErro && <p style={{ color: "red" }}>{dateErro}</p>}

                {Array.isArray(formattedDates) && formattedDates[1] !== null && !dateErro &&
                  <div className={loading ? 'loaded' : 'download'}>
                    <Button 
                    label="⤓" icon="pi pi-check" loading={download} onClick={handleSubmitDate} />
                  </div>
                }
              </div>
            }
            {/*-----------------/Botão de controle/-----------------*/}
            {loading && mode ==="simulation" &&
              <div className='simulation-control'>
                <button>⏯️</button>
                <button>⏸️</button>
                <button>▶️</button>
              </div>
            }
          </div>
          {renkoCandles.length === 0 && (
            <div className="graphics-renko__empty">
              Waiting for enough movement to form the blocks.
            </div>
          )}
        </div>

        <aside className="graphics-renko__indicators" aria-label="Graficos dos indicadores do ativo selecionado">
          <IndicatorChart
            title="AMRSI (arithmetic mean of Relative Strength Index)"
            series={rsiSeries}
            emptyMessage="No RSI history available for this asset."
          />
          <IndicatorChart
            title="VPPR (Volume Price Pressure Ratio)"
            series={vpprSeries}
            emptyMessage="No VPPR history available for this asset."
          />
        </aside>
      </div>
    </section>
  )
}

export default GraphicsRenko
