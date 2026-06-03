
import React from 'react'
import './GraphicsRenko.css'
import { ContextGraphics } from '../../ContextGraphics/ContextGraphics.jsx'
import { CandlestickSeries, ColorType, CrosshairMode, LineSeries, LineStyle, createChart } from 'lightweight-charts'
import { Calendar } from 'primereact/calendar';
import { Button } from 'primereact/button';
import MovementTables from '../MovementTables/MovementTables.jsx';
import { useOperatingData } from '../OperatingData/operatingData.js';
import { useOperatingDataPrymary } from '../OperationDataPrimary/operationDataPrimary.js';

const UP_COLOR = '#22AB94'
const DOWN_COLOR = '#fc5b5b'
const MIN_ENGINE_SPEED = 100
const MAX_ENGINE_SPEED = 5000
const DEFAULT_ENGINE_SPEED = 500

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

const IndicatorChart = ({ title, emptyMessage, series, resetKey }) => {
  const containerRef = React.useRef(null)
  const chartRef = React.useRef(null)
  const seriesMapRef = React.useRef(new Map())
  const seriesMetaMapRef = React.useRef(new Map())
  const hadVisibleSeriesRef = React.useRef(false)
  const lastResetKeyRef = React.useRef(resetKey)

  const visibleSeries = React.useMemo(() => {
    return series.filter(item => item.data.length > 0)
  }, [series])


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
  }, [])

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

    if (visibleSeries.length > 0 && !hadVisibleSeriesRef.current) {
      chart.timeScale().fitContent()
    }
    hadVisibleSeriesRef.current = visibleSeries.length > 0
  }, [visibleSeries, resetKey])

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
  const { trend, trendPrimary, activeSymbol, rsi, vppr, setMode, mode, dateToSimulation, download, setDownload, loading, movementTables, setMovementTables, incrementalEngine } = React.useContext(ContextGraphics)
  const chartContainerRef = React.useRef(null);
  const chartRef = React.useRef(null);
  const candlestickSeriesRef = React.useRef(null);
  const candlestickSeriesMetaRef = React.useRef(null);
  const hadRenkoCandlesRef = React.useRef(false);
  const lastChartSymbolRef = React.useRef(activeSymbol);
  const [dates, setDates] = React.useState(null);
  const [dateErro, setDateErro] = React.useState(null);

  const { retestPointsState } = useOperatingData(trend);
  const { retestPointsStatePrimary } = useOperatingDataPrymary(trendPrimary);

  console.log(">>>",trend);
  

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

  // Serie RSI
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
      },
      localization: {
        priceFormatter: (price) => Number(price).toFixed(2),
      },

    })

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

    return () => {
      chartRef.current?.remove()
      chartRef.current = null
      candlestickSeriesRef.current = null
      candlestickSeriesMetaRef.current = null
    }
  }, [])

  React.useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current) return

    if (lastChartSymbolRef.current !== activeSymbol) {
      candlestickSeriesRef.current.setData([])
      candlestickSeriesMetaRef.current = null
      hadRenkoCandlesRef.current = false
      lastChartSymbolRef.current = activeSymbol
    }

    updateSeriesData(candlestickSeriesRef.current, renkoCandles, candlestickSeriesMetaRef)

    if (renkoCandles.length > 0 && !hadRenkoCandlesRef.current) {
      chartRef.current.timeScale().fitContent()
    }
    hadRenkoCandlesRef.current = renkoCandles.length > 0
  }, [renkoCandles, activeSymbol])

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

  // Função para alternar entre Real ime e simulação
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

  const speedLabel = React.useMemo(() => {
    const currentSpeed = Number(incrementalEngine?.speed) || DEFAULT_ENGINE_SPEED
    return `${currentSpeed}ms`
  }, [incrementalEngine?.speed])



  return (
    <section className="graphics-renko">
      <div style={{ display: "flex", justifyContent: "center" }}>
        {movementTables &&
          <MovementTables />
        }
      </div>
      <div className="graphics-renko__card">
        <div className="graphics-renko__header">
          <div>
            <span className="graphics-renko__eyebrow">Crypto graphics</span>
            <h3>{activeSymbol || 'Trend Flow'}</h3>
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

        <div className="graphics-renko__chart" ref={chartContainerRef}>
          <div className='button-simulation'>
            <button
              onClick={buttonSimulation}
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
                      label="⤓" icon="pi pi-check" loading={download} onClick={!loading ? handleSubmitDate : null}
                      disabled={loading}
                    />
                  </div>
                }
              </div>
            }

            {/*-----------------/Botão de controle/-----------------*/}
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
                  type="button"
                  onClick={resetSimulation}
                  title="Reset"
                >
                  Reset
                </button>
                <span className='separates-speed'>--</span>
                <button
                  type="button"
                  onClick={decreaseSimulationSpeed}
                  disabled={(Number(incrementalEngine?.speed) || DEFAULT_ENGINE_SPEED) >= MAX_ENGINE_SPEED}
                  title="Reduzir velocidade"
                >
                  Slower -
                </button>
                <span className="simulation-control__speed">{speedLabel}</span>
                <button
                  type="button"
                  onClick={increaseSimulationSpeed}
                  disabled={(Number(incrementalEngine?.speed) || DEFAULT_ENGINE_SPEED) <= MIN_ENGINE_SPEED}
                  title="Aumentar velocidade"
                >
                  Faster +
                </button>
              </div>
            }
            {!loading && mode === "simulation" &&
              <div className='simulation-control'>
                Please select another asset or download the date range.
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
            resetKey={activeSymbol}
          />
          <IndicatorChart
            title="VPPR (Volume Price Pressure Ratio)"
            series={vpprSeries}
            emptyMessage="No VPPR history available for this asset."
            resetKey={activeSymbol}
          />
        </aside>
      </div>
    </section>
  )
}

export default GraphicsRenko
