// IndicatorPanel.jsx
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
const IndicatorPanel = ({
    id,
    activeSymbol,
    lastTrend,
    lastTrendPrimary,
    lastVppr,
    lastAmrsi,
    schrodingerIndicators,
}) => {
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
    )
}

export default IndicatorPanel