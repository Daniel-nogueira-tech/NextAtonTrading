// IndicatorPanel.jsx
import React from 'react'
import './IndicatorPanel.css'

// =====================|Mapa de cores|=====================//
const colorMapVolume = {
    'Volume SELL Increasing': 'red',
    'Volume BUY Increasing': 'green',
    'Volume BUY Weakly Increasing': '#aeffb2',
    'Volume SELL Weakly Increasing': '#ffaaaa',
    'sell': 'red',
    'buy': 'green',
    'MajorBuy': 'green',
    'MajorSell': 'red',
}

const colorMapTrend = {
    'PIVOT_BUY_TREND': 'green',
    'PIVOT_BUY_RALLY': 'green',
    'PIVOT_BUY_RALLY_REVERSE': 'green',
    'PIVOT_BUY_RALLY_SEC': 'green',
    'PIVOT_BUY_RALLY_REACT_SEC': 'green',
    'PIVOT_BUY_RALLY_SEC_LATE': 'green',
    'PIVOT_BREAK_BUY': 'green',
    'PIVOT_SELL_TREND': 'red',
    'PIVOT_SELL_RALLY': 'red',
    'PIVOT_SELL_RALLY_REVERSE': 'red',
    'PIVOT_SELL_RALLY_SEC': 'red',
    'PIVOT_SELL_RALLY_REACT_SEC': 'red',
    'PIVOT_SELL_RALLY_SEC_LATE': 'red',
    'PIVOT_BREAK_SELL': 'red',
    'PIVOT_BREAK_RALLY_BUY': 'green',
    'PIVOT_BREAK_RALLY_SELL': 'red',
}

const colorMapAmrsi = {
    'POTENTIAL_SELL': 'red',
    'POTENTIAL_BUY': 'green',
    'OVERBOUGHT': '#ff8080',
    'OVERSOLD': '#aaffaa',
    'NEUTRAL': 'gray',
}

const colorMapVpprMacdClose = {
    'Vppr Macd close to average': '#d9ff03',
}

const colorMapVpprMacd = {
    'Vppr Macd SELL Increasing': 'red',
    'Vppr Macd BUY Increasing': 'green',
    'Vppr Macd BUY Weakly Increasing': '#aeffb2',
    'Vppr Macd SELL Weakly Increasing': '#ffaaaa',
}

// =====================|Componente|=====================//
const VOLUME_PROFILE_LEVELS = 20

const normalizeTrendPoints = (trend, activeSymbol) => {
    const collection = trend?.data ?? trend
    const markets = Array.isArray(collection) ? collection : collection ? [collection] : []
    const normalizedSymbol = String(activeSymbol || '').trim().toUpperCase()
    const market = markets.find(item => (
        String(item?.symbol || '').trim().toUpperCase() === normalizedSymbol
    )) || (markets.length === 1 ? markets[0] : null)
    const points = market?.movements ?? market?.result ?? market?.prices ?? market?.data
    return Array.isArray(points) ? points : []
}

const getVolumePoints = (points) => points.flatMap(point => {
    const price = Number(point?.closePrice ?? point?.Fechamento ?? point?.close ?? point?.price)
    const volume = Number(point?.volume ?? point?.Volume)
    return Number.isFinite(price) && Number.isFinite(volume) && volume > 0
        ? [{ price, volume }]
        : []
})

const getLatestClose = (fullPrice) => {
    const priceSeries = fullPrice?.prices ?? fullPrice?.result ?? fullPrice?.data ?? []
    for (let index = priceSeries.length - 1; index >= 0; index -= 1) {
        const close = Number(
            priceSeries[index]?.Fechamento ??
            priceSeries[index]?.close ??
            priceSeries[index]?.price ??
            priceSeries[index]?.closePrice
        )
        if (Number.isFinite(close)) return close
    }
    return null
}

const buildVolumeProfile = (trend, fullPrice, activeSymbol, currentPrice) => {
    const trendPoints = getVolumePoints(normalizeTrendPoints(trend, activeSymbol))
    const priceSeries = fullPrice?.prices ?? fullPrice?.result ?? fullPrice?.data ?? []
    const points = trendPoints.length > 0 ? trendPoints : getVolumePoints(priceSeries)
    if (points.length === 0) return []

    const prices = points.map(point => point.price)
    if (Number.isFinite(currentPrice)) prices.push(currentPrice)
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const priceRange = maxPrice - minPrice
    const binCount = priceRange === 0 ? 1 : VOLUME_PROFILE_LEVELS
    const binSize = priceRange / binCount
    const bins = Array.from({ length: binCount }, (_, index) => ({
        minPrice: minPrice + index * binSize,
        maxPrice: index === binCount - 1 ? maxPrice : minPrice + (index + 1) * binSize,
        volume: 0,
    }))

    let currentBinIndex = -1
    if (Number.isFinite(currentPrice)) {
        currentBinIndex = priceRange === 0
            ? 0
            : Math.min(Math.floor((currentPrice - minPrice) / binSize), binCount - 1)
    }

    points.forEach(({ price, volume }) => {
        const index = priceRange === 0
            ? 0
            : Math.min(Math.floor((price - minPrice) / binSize), binCount - 1)
        bins[index].volume += volume
    })

    return bins
        .map((bin, index) => ({ ...bin, isCurrent: index === currentBinIndex }))
        .filter(bin => bin.volume > 0 || bin.isCurrent)
        .reverse()
}

const IndicatorPanel = ({
    id,
    activeSymbol,
    trend,
    fullPrice,
    lastTrend,
    lastTrendPrimary,
    lastVppr,
    lastAmrsi,
    schrodingerIndicators,
}) => {
    const [activeView, setActiveView] = React.useState('indicators')
    const currentPrice = React.useMemo(() => getLatestClose(fullPrice), [fullPrice])
    const volumeProfile = React.useMemo(
        () => buildVolumeProfile(trend, fullPrice, activeSymbol, currentPrice),
        [trend, fullPrice, activeSymbol, currentPrice],
    )
    const maxVolume = Math.max(0, ...volumeProfile.map(bin => bin.volume))
    const kineticColor = schrodingerIndicators?.kineticTrend === 'increasing'
        ? '#f5d547'
        : '#71717a'
    const potentialColor = schrodingerIndicators?.potentialEnergy > 0.20
        ? '#f5d547'
        : '#71717a'
    const psiBuy = schrodingerIndicators?.evolution?.psiBuy
    const psiSell = schrodingerIndicators?.evolution?.psiSell
    const psiColor = psiBuy == null || psiSell == null || psiBuy === psiSell
        ? '#71717a'
        : psiSell > psiBuy
            ? '#fc5b5b'
            : psiBuy > 0.5
                ? '#22ab50'
                : '#71717a'
    const formatValue = (value) => (
        Number.isFinite(value) ? value.toFixed(3) : 'sem dados'
    )

    const signalColors = {
        '--signal-color-trend': colorMapTrend[lastTrend?.type] || 'gray',
        '--signal-color-trend-primary': colorMapTrend[lastTrendPrimary?.type] || 'gray',
        '--signal-color-vppr-trend': colorMapVolume[lastVppr?.vpprTrend] || 'gray',
        '--signal-color-vppr-major': colorMapVolume[lastVppr?.major] || 'gray',
        '--signal-color-vppr-ema': colorMapVolume[lastVppr?.volumeEmaSignal] || 'gray',
        '--signal-color-vppr-macd': colorMapVpprMacd[lastVppr?.macdVppr] || 'gray',
        '--signal-color-vppr-macd-close': colorMapVpprMacdClose[lastVppr?.macdCloseToAverage] || 'gray',
        '--signal-color-amrsi': colorMapAmrsi[lastAmrsi?.type] || 'gray',
        '--signal-color-kinetic': kineticColor,
        '--signal-color-potential': potentialColor,
        '--signal-color-psi': psiColor,
    }

    return (
        <div className="indicator-panel-shell">
            <div className="indicator-panel__view-switch" role="group" aria-label="Visualização do painel">
                <button
                    className={`indicator-panel__view-button${activeView === 'indicators' ? ' is-active' : ''}`}
                    type="button"
                    aria-pressed={activeView === 'indicators'}
                    onClick={() => setActiveView('indicators')}
                >
                    Indicadores
                </button>
                <button
                    className={`indicator-panel__view-button${activeView === 'volume' ? ' is-active' : ''}`}
                    type="button"
                    aria-pressed={activeView === 'volume'}
                    onClick={() => setActiveView('volume')}
                >
                    Volume por Preço
                </button>
            </div>
            {activeView === 'indicators' ? (
                <section id={id} className="indicator-panel" style={signalColors}>
                    <h3 className="indicator-panel__symbol">{activeSymbol}</h3>
                    <div className="indicator-panel__grid">
                {/* ===================== TREND ===================== */}
                <div className="indicator-panel__card">
                    <header className="indicator-panel__card-header">
                        <h4 className="indicator-panel__card-title">Trend</h4>
                        <span className="indicator-panel__card-badge">Pivot</span>
                    </header>
                    <div className="indicator-panel__card-body">
                        {lastTrendPrimary && (
                            <div className="indicator-panel__row">
                                <span className="indicator-panel__label">index</span>
                                <span className="indicator-panel__value">
                                    {lastTrendPrimary?.type}
                                    <span className="signal-circle signal-circle--trend-primary" />
                                </span>
                            </div>
                        )}
                        {lastTrend && (
                            <div className="indicator-panel__row">
                                <span className="indicator-panel__label">Trend</span>
                                <span className="indicator-panel__value">
                                    {lastTrend?.type}
                                    <span className="signal-circle signal-circle--trend" />
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ===================== VPPR ===================== */}
                <div className="indicator-panel__card">
                    <header className="indicator-panel__card-header">
                        <h4 className="indicator-panel__card-title">VPPR</h4>
                        <span className="indicator-panel__card-badge">Volume</span>
                    </header>
                    <div className="indicator-panel__card-body">
                        {lastVppr && (
                            <div className="indicator-panel__row">
                                <span className="indicator-panel__label">Major</span>
                                <span className="indicator-panel__value">
                                    {lastVppr?.major === 'MajorSell' ? 'Major Sell' : 'Major Buy'}
                                    <span className="signal-circle signal-circle--vppr" />
                                </span>
                            </div>
                        )}
                        {lastVppr && (
                            <div className="indicator-panel__row">
                                <span className="indicator-panel__label">Flow</span>
                                <span className="indicator-panel__value">
                                    {lastVppr?.vpprTrend}
                                    <span className="signal-circle signal-circle--vppr-trend" />
                                </span>
                            </div>
                        )}
                        {lastVppr && (
                            <div className="indicator-panel__row">
                                <span className="indicator-panel__label">EMA</span>
                                <span className="indicator-panel__value">
                                    {lastVppr?.volumeEmaSignal}
                                    <span className="signal-circle signal-circle--vppr-ema" />
                                </span>
                            </div>
                        )}
                        {lastVppr?.macdVppr && (
                            <div className="indicator-panel__row">
                                <span className="indicator-panel__label">MACD</span>
                                <span className="indicator-panel__value">
                                    {lastVppr?.macdVppr}
                                    <span className="signal-circle signal-circle--vppr-macd" />
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ===================== AMRSI ===================== */}
                <div className="indicator-panel__card">
                    <header className="indicator-panel__card-header">
                        <h4 className="indicator-panel__card-title">Schrödinger</h4>
                        <span className="indicator-panel__card-badge">Energy / Ψ</span>
                    </header>
                    <div className="indicator-panel__card-body">
                        <div className="indicator-panel__row">
                            <span className="indicator-panel__label">Kinetic energy</span>
                            <span className="indicator-panel__value">
                                {formatValue(schrodingerIndicators?.kineticEnergy)}
                                <span className="signal-circle signal-circle--kinetic" />
                            </span>
                        </div>
            
                        <div className="indicator-panel__row">
                            <span className="indicator-panel__label">Potential energy</span>
                            <span className="indicator-panel__value">
                                {formatValue(schrodingerIndicators?.potentialEnergy)}
                                <span className="signal-circle signal-circle--potential" />
                            </span>
                        </div>
                        <div className="indicator-panel__row">
                            <span className="indicator-panel__label">Ψ Buy / Sell</span>
                            <span className="indicator-panel__value">
                                {formatValue(psiBuy)} / {formatValue(psiSell)}
                                <span className="signal-circle signal-circle--psi" />
                            </span>
                        </div>
                        <div className="indicator-panel__row">
                            <span className="indicator-panel__label">Dominance</span>
                            <span className="indicator-panel__value">
                                {psiBuy == null || psiSell == null || psiBuy === psiSell
                                    ? 'Neutro'
                                    : psiSell > psiBuy
                                        ? 'Sell'
                                        : psiBuy > 0.5
                                            ? 'Buy'
                                            : 'Neutral'}
                                <span className="signal-circle signal-circle--psi" />
                            </span>
                        </div>
                    </div>
                </div>

                <div className="indicator-panel__card">
                    <header className="indicator-panel__card-header">
                        <h4 className="indicator-panel__card-title">AMRSI</h4>
                        <span className="indicator-panel__card-badge">Momentum</span>
                    </header>
                    <div className="indicator-panel__card-body">
                        {lastAmrsi ? (
                            <div className="indicator-panel__row">
                                <span className="indicator-panel__label">Signal</span>
                                <span className="indicator-panel__value">
                                    {lastAmrsi?.type}
                                    <span className="signal-circle signal-circle--amrsi" />
                                </span>
                            </div>
                        ) : (
                            <div className="indicator-panel__row">
                                <span className="indicator-panel__label">Signal</span>
                                <span className="indicator-panel__value indicator-panel__value--muted">
                                    no data
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                    </div>
                </section>
            ) : (
                <section id={id} className="indicator-panel volume-profile" aria-label={`Volume por preço de ${activeSymbol}`}>
                    <h3 className="indicator-panel__symbol">{activeSymbol} · Volume por Preço</h3>
                    <div className="volume-profile__current-price" aria-live="polite">
                        Preço atual: {Number.isFinite(currentPrice)
                            ? currentPrice.toLocaleString(undefined, { maximumFractionDigits: 8 })
                            : 'sem dados'}
                    </div>
                    {volumeProfile.length > 0 ? (
                        <div className="volume-profile__levels">
                            {volumeProfile.map((bin, index) => {
                                const relativeVolume = bin.volume / maxVolume
                                const volumeClass = relativeVolume >= 0.75
                                    ? 'volume-profile__bar--high'
                                    : relativeVolume >= 0.35
                                        ? 'volume-profile__bar--medium'
                                        : 'volume-profile__bar--low'
                                const formatPrice = value => value.toLocaleString(undefined, { maximumFractionDigits: 8 })

                                return (
                                    <div
                                        className={`volume-profile__row${bin.isCurrent ? ' volume-profile__row--current' : ''}`}
                                        key={`${bin.minPrice}-${index}`}
                                    >
                                        <span className="volume-profile__price">
                                            {bin.minPrice === bin.maxPrice
                                                ? formatPrice(bin.minPrice)
                                                : `${formatPrice(bin.minPrice)} – ${formatPrice(bin.maxPrice)}`}
                                            {bin.isCurrent && <span className="volume-profile__current-label">Atual</span>}
                                        </span>
                                        <div className="volume-profile__bar-track">
                                            <div
                                                className={`volume-profile__bar ${volumeClass}`}
                                                style={{ width: `${relativeVolume * 100}%` }}
                                            />
                                        </div>
                                        <span className="volume-profile__volume">
                                            {bin.volume.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="indicator-panel--empty">
                            <span>Sem dados de preço e volume para este ativo.</span>
                        </div>
                    )}
                    <div className="volume-profile__legend" aria-label="Legenda de volume">
                        <span><i className="volume-profile__legend-dot volume-profile__bar--high" /> Alto</span>
                        <span><i className="volume-profile__legend-dot volume-profile__bar--medium" /> Médio</span>
                        <span><i className="volume-profile__legend-dot volume-profile__bar--low" /> Baixo</span>
                    </div>
                </section>
            )}
        </div>
    )
}

export default IndicatorPanel