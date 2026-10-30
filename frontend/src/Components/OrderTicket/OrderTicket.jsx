// OrderTicket.jsx
import { useEffect, useMemo, useRef, useState, useContext } from 'react'
import './OrderTicket.css'
import { ContextGraphics } from '../../ContextGraphics/ContextGraphics.jsx'
import { parseDecimal } from '../../utils/parseDecimal.js'

const PERCENT_OPTIONS = [1, 2, 3, 4, 5]

const formatCurrency = (value) => {
    if (!Number.isFinite(value)) return '$0.00'
    return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
}

const OrderTicket = ({
    price = 0,
    isOpen = false,
    initialSide = 'buy',
    orderStop,
    setOrderStop,
    onCalculateOrder,
    onClose,
    onConfirm, // (order) => void
}) => {
    const { setBalanceAndRisk, balanceAndRisk , activeSymbol } = useContext(ContextGraphics)
    const [side, setSide] = useState(initialSide)
    const [quantity, setQuantity] = useState('')
    const [calculation, setCalculation] = useState(null)
    const [calculationError, setCalculationError] = useState(null)
    const [submissionError, setSubmissionError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const calculationRequestRef = useRef(0)

    const capitalNumber = useMemo(() => {
        const parsed = parseDecimal(balanceAndRisk.balance)
        return Number.isFinite(parsed) ? parsed : 0
    }, [balanceAndRisk.balance])

    const calculationKey = JSON.stringify([
        side,
        orderStop ?? '',
        balanceAndRisk.balance,
        balanceAndRisk.risk,
    ])
    const calculatedOrder = calculation?.key === calculationKey ? calculation.result : null
    const calculationMessage = calculationError?.key === calculationKey
        ? calculationError.message
        : ''
    const quantityComputed = Number(calculatedOrder?.capital?.positionSize ?? 0)
    const entryPrice = Number(calculatedOrder?.config?.entryPrice ?? price)
    const calculatedValue = Number(
        calculatedOrder?.capital?.positionValue ??
        (quantityComputed * entryPrice)
    )
    const estimatedRisk = Number(
        calculatedOrder?.capital?.risk?.amount ??
        (capitalNumber * Number(balanceAndRisk.risk || 0)) / 100
    )

    const isBuy = side === 'buy'
    const isExit = side === 'exit'

    useEffect(() => {
        if (!isOpen || isExit) return undefined

        const requestId = ++calculationRequestRef.current
        let cancelled = false

        if (!capitalNumber || capitalNumber <= 0) {
            return undefined
        }

        const stopValue = parseDecimal(orderStop)
        if (orderStop && (!Number.isFinite(stopValue) || stopValue <= 0)) {
            return undefined
        }

        Promise.resolve(onCalculateOrder?.(side, orderStop, balanceAndRisk))
            .then(result => {
                if (cancelled || requestId !== calculationRequestRef.current) return
                if (!result) {
                    setCalculationError({
                        key: calculationKey,
                        message: 'Não foi possível calcular. Verifique os sinais, o preço e o stop.',
                    })
                    return
                }
                setCalculation({ key: calculationKey, result })
                setCalculationError({ key: calculationKey, message: '' })
            })
            .catch(error => {
                if (cancelled || requestId !== calculationRequestRef.current) return
                console.error('Erro ao calcular os dados da boleta:', error)
                setCalculationError({
                    key: calculationKey,
                    message: 'Falha ao calcular a ordem. Tente novamente.',
                })
            })

        return () => {
            cancelled = true
        }
    }, [
        balanceAndRisk,
        capitalNumber,
        calculationKey,
        isOpen,
        isExit,
        onCalculateOrder,
        orderStop,
        side,
    ])

    const handleConfirm = async () => {
        const stopPrice = parseDecimal(orderStop)
        const selectedQuantity = parseDecimal(quantity) || quantityComputed
        if (isSubmitting) return
        if (isExit) {
            setIsSubmitting(true)
            setSubmissionError('')
            try {
                await onConfirm?.({
                    symbol:activeSymbol,
                    side: 'exit',
                    price,
                })
                onClose?.()
            } catch (error) {
                console.error('Erro ao executar a saída da operação:', error)
                setSubmissionError(error.message || 'Não foi possível executar a saída.')
            } finally {
                setIsSubmitting(false)
            }
            return
        }

        if (
            !capitalNumber ||
            capitalNumber <= 0 ||
            !Number.isFinite(stopPrice) ||
            stopPrice <= 0 ||
            !Number.isFinite(selectedQuantity) ||
            selectedQuantity <= 0 ||
            !calculatedOrder
        ) return

        const order = {
            symbol:activeSymbol,
            side,
            percent: balanceAndRisk.risk,
            capital: capitalNumber,
            price: entryPrice,
            stop: stopPrice,
            quantity: selectedQuantity,
            value: selectedQuantity * entryPrice,
        }
        setIsSubmitting(true)
        setSubmissionError('')
        try {
            await onConfirm?.(order)
            onClose?.()
        } catch (error) {
            console.error('Erro ao executar a ordem:', error)
            setSubmissionError(error.message || 'Não foi possível executar a ordem.')
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="order-ticket__backdrop" onMouseDown={event => {
            if (event.target === event.currentTarget) onClose?.()
        }}>
        <section className={`order-ticket order-ticket--${isExit ? 'exit' : isBuy ? 'buy' : 'sell'}`} role="dialog" aria-modal="true" aria-labelledby="order-ticket-title">
            {/* ============ Header com título do ativo ============ */}
            <header className="order-ticket__header">
                <div className="order-ticket__asset">
                    <div className="order-ticket__asset-icon">
                        {activeSymbol.charAt(0)}
                    </div>
                    <div className="order-ticket__asset-info">
                        <h3 className="order-ticket__symbol" id="order-ticket-title">{activeSymbol}</h3>
                        <span className="order-ticket__price">
                            Preço atual: <strong>{formatCurrency(entryPrice)}</strong>
                        </span>
                    </div>
                    <button type="button" className="order-ticket__close" aria-label="Fechar boleta" onClick={onClose}>×</button>
                </div>

                {/* Toggle compra / venda */}
                <div className="order-ticket__toggle" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={isBuy}
                        className={`order-ticket__toggle-btn ${isBuy ? 'is-active' : ''
                            } order-ticket__toggle-btn--buy`}
                        onClick={() => setSide('buy')}
                    >
                        Comprar
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={!isBuy}
                        className={`order-ticket__toggle-btn ${!isBuy ? 'is-active' : ''
                            } order-ticket__toggle-btn--sell`}
                        onClick={() => setSide('sell')}
                    >
                        Vender
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={isExit}
                        className={`order-ticket__toggle-btn ${isExit ? 'is-active' : ''} order-ticket__toggle-btn--exit`}
                        onClick={() => setSide('exit')}
                    >
                        Sair
                    </button>
                </div>
            </header>

            {!isExit && <>
            {/* ============ Capital ============ */}
            <div className="order-ticket__field">
                <label className="order-ticket__label" htmlFor="capital">
                    Capital disponível
                </label>
                <div className="order-ticket__input-wrapper">
                    <span className="order-ticket__input-prefix">$</span>
                    <input
                        id="capital"
                        type="text"
                        inputMode="decimal"
                        className="order-ticket__input"
                        placeholder="0.00"
                        value={balanceAndRisk.balance}
                        onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9.,]/g, '')

                            setBalanceAndRisk(prev => ({
                                ...prev,
                                balance: v
                            }))
                        }}
                    />
                </div>
            </div>

            {/* ============ Porcentagem ============ */}
            <div className="order-ticket__field">
                <label className="order-ticket__label">
                    Porcentagem do capital
                </label>
                <div className="order-ticket__percent-grid">
                    {PERCENT_OPTIONS.map((p) => (
                        <button
                            key={p}
                            type="button"
                            className={`order-ticket__percent-btn ${balanceAndRisk.risk === p ? 'is-active' : ''
                                }`}
                            onClick={() =>
                                setBalanceAndRisk(prev => ({
                                    ...prev,
                                    risk: p
                                }))
                            }
                        >
                            {p}%
                        </button>
                    ))}
                </div>
            </div>

            {/* ============ Stop manual ============ */}
            <div className="order-ticket__field">
                <label className="order-ticket__label" htmlFor="order-stop">
                    Preço do stop
                </label>
                <input
                    id="order-stop"
                    type="text"
                    inputMode="decimal"
                    className="order-ticket__input"
                    placeholder="Calculado pelo sinal"
                    value={orderStop ?? ''}
                    onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.,]/g, '')
                        setOrderStop(v)
                    }}
                />
            </div>

            <div className="order-ticket__field">
                <label className="order-ticket__label" htmlFor="quantity">
                    Quantidade
                </label>
                <input
                    id="quantity"
                    type="text"
                    inputMode="decimal"
                    className="order-ticket__input"
                    placeholder={quantityComputed ? quantityComputed.toFixed(8) : 'Calculado automaticamente'}
                    value={quantity || (quantityComputed ? String(quantityComputed) : '')}
                    onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.,]/g, ''))}
                />
            </div>
            </>}

            {/* ============ Resumo ============ */}
            {!isExit && <div className="order-ticket__summary">
                <div className="order-ticket__summary-row">
                    <span>Risco estimado</span>
                    <strong>{formatCurrency(estimatedRisk)}</strong>
                </div>
                <div className="order-ticket__summary-row">
                    <span>Porcentagem aplicada</span>
                    <strong>{balanceAndRisk.risk}%</strong>
                </div>
                <div className="order-ticket__summary-row">
                    <span>Distância do stop</span>
                    <strong>{Number(calculatedOrder?.config?.stopDistance?.points ?? 0).toFixed(2)}</strong>
                </div>
                <div className="order-ticket__summary-row order-ticket__summary-row--total">
                    <span>{isBuy ? 'Valor da compra' : 'Valor da venda'}</span>
                    <strong>{formatCurrency(calculatedValue)}</strong>
                </div>
            </div>
            }

            {isExit && <p className="order-ticket__exit-message">A posição aberta de {activeSymbol} será encerrada pelo preço atual de {formatCurrency(price)}.</p>}
            {!isExit && !capitalNumber && <p className="order-ticket__error" role="alert">Informe o capital disponível para calcular a ordem.</p>}
            {!isExit && orderStop && (!Number.isFinite(parseDecimal(orderStop)) || parseDecimal(orderStop) <= 0) && (
                <p className="order-ticket__error" role="alert">Informe um preço de stop válido.</p>
            )}
            {!isExit && calculationMessage && <p className="order-ticket__error" role="alert">{calculationMessage}</p>}
            {submissionError && <p className="order-ticket__error" role="alert">{submissionError}</p>}

            {/* ============ Botão ============ */}
            <button
                type="button"
                className="order-ticket__submit"
                disabled={isSubmitting || (isExit
                    ? !price
                    : !capitalNumber || capitalNumber <= 0 || !quantityComputed || !calculatedOrder || !orderStop)}
                onClick={handleConfirm}
            >
                <span>{isSubmitting ? 'Executando...' : isExit ? 'Confirmar Saída' : isBuy ? 'Confirmar Compra' : 'Confirmar Venda'}</span>
                <span className="order-ticket__submit-icon">
                    {isExit ? '' : isBuy ? '↑' : '↓'}
                </span>
            </button>

            {/* Glow decorativo */}
            <div className="order-ticket__glow" />
        </section>
        </div>
    )
}

export default OrderTicket