// TradingOverlayPanel.jsx
import React, { useMemo } from 'react'
import './TradingOverlayPanel.css'
import {ContextGraphics} from '../../ContextGraphics/ContextGraphics.jsx'

const formatNumber = (value, decimals = 2) => {
    const num = Number(value)
    if (!Number.isFinite(num)) return (0).toFixed(decimals)
    return num.toFixed(decimals)
}

const formatSigned = (value, decimals = 2) => {
    const num = Number(value)
    if (!Number.isFinite(num)) return (0).toFixed(decimals)
    const sign = num > 0 ? '$' : ''
    return `${sign}${num.toFixed(decimals)}`
}

const TradingOverlayPanel = ({
    current = 0,
    onOpenTicket,
}) => {
    const { resultOperations } = React.useContext(ContextGraphics)
    const [disabledButton, setDisabledButton] = React.useState(false);

    const netPnl = Number(resultOperations?.results?.netPnl ?? 0)
    const balance = Number(resultOperations?.capital?.balance ?? 0)
    const riskPct = Number(resultOperations?.capital?.risk?.percentage ?? 0)
    const positionSize = Number(resultOperations?.capital?.positionSize ?? 0)

    const pnlState = useMemo(() => {
        if (netPnl > 0) return 'positive'
        if (netPnl < 0) return 'negative'
        return 'neutral'
    }, [netPnl])

    const riskState = useMemo(() => {
        if (riskPct >= 3) return 'high'
        if (riskPct >= 1.5) return 'medium'
        return 'low'
    }, [riskPct])

    // ====================|Função para compra e venda de operação|==================== //
    const handleClick = (operation) => {
        setDisabledButton(true);
        if (operation === "buy" || operation === "sell" || operation === "exit") {
            onOpenTicket?.(operation);
            setTimeout(() => setDisabledButton(false), 300);
        }
    };

    return (
        <div className="top-overlay">
            <div className="top-overlay__panel">
                {/* ================= BOTÕES ================= */}
                <div className="top-overlay__actions">
                    <button
                        type="button"
                        className="top-overlay__btn top-overlay__btn--buy"
                        onClick={() => handleClick("buy")}
                        disabled={disabledButton}
                    >
                        Buy
                    </button>
                    <button
                        type="button"
                        className="top-overlay__btn top-overlay__btn--sell"
                        onClick={() => handleClick("sell")}
                        disabled={disabledButton}
                    >
                        Sell
                    </button>
                    <button
                        type="button"
                        className="top-overlay__btn top-overlay__btn--exit"
                        onClick={() => handleClick("exit")}
                        disabled={disabledButton}
                    >
                        Exit
                    </button>
                </div>

                {/* ================= DADOS ================= */}
                <div className="top-overlay__stats">
                    <div className="top-overlay__stat">
                        <span className="top-overlay__stat-label">Result</span>
                        <span
                            className={`top-overlay__stat-value top-overlay__stat-value--${pnlState}`}
                        >
                            {formatSigned(netPnl)}
                        </span>
                    </div>

                    <div className="top-overlay__stat">
                        <span className="top-overlay__stat-label">Balance</span>
                        <span className="top-overlay__stat-value">
                            ${formatNumber(balance)}
                        </span>
                    </div>

                    <div className="top-overlay__stat">
                        <span className="top-overlay__stat-label">Risk</span>
                        <span
                            className={`top-overlay__stat-value top-overlay__stat-value--risk-${riskState}`}
                        >
                            {formatNumber(riskPct)}%
                        </span>
                    </div>

                    <div className="top-overlay__stat">
                        <span className="top-overlay__stat-label">Size</span>
                        <span className="top-overlay__stat-value">
                            {formatNumber(positionSize, 4)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default TradingOverlayPanel