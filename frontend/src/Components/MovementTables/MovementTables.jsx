import React, { useMemo, useState } from 'react'
import './MovementTables.css'
import { ContextGraphics } from '../../ContextGraphics/ContextGraphics.jsx'

const MOVIMENTOS = [
    'Secondary rally',
    'Natural rally',
    'Upward Trend',
    'Downward Trend',
    'Natural reaction',
    'Secondary reaction',
]


const TIPO_TO_COL = {
    'Rally Natural (inicial)': 'Natural rally',
    'Rally Natural (fundo)': 'Natural rally',
    'Rally Natural (topo)': 'Natural rally',
    'Rally Natural (Baixa)': 'Natural rally',
    'Rally Natural (Alta)': 'Natural rally',
    'Rally Natural (retorno)': 'Natural rally',

    'Tendência Alta': 'Upward Trend',
    'Tendência Alta (compra)': 'Upward Trend',
    'Tendência Alta (topo)': 'Upward Trend',
    'Tendencia Alta': 'Upward Trend',
    'Tendencia Alta (compra)': 'Upward Trend',
    'Tendencia Alta (topo)': 'Upward Trend',

    'Tendência Baixa': 'Downward Trend',
    'Tendência Baixa (venda)': 'Downward Trend',
    'Tendência Baixa (fundo)': 'Downward Trend',
    'Tendencia Baixa': 'Downward Trend',
    'Tendencia Baixa (venda)': 'Downward Trend',
    'Tendencia Baixa (fundo)': 'Downward Trend',

    'Reação Natural (topo)': 'Natural reaction',
    'Reação Natural (fundo)': 'Natural reaction',
    'Reação Natural (de baixa)': 'Natural reaction',
    'Reação Natural (Alta)': 'Natural reaction',
    'Reação Natural (Baixa)': 'Natural reaction',
    'Reacao Natural (topo)': 'Natural reaction',
    'Reacao Natural (fundo)': 'Natural reaction',
    'Reacao Natural (de baixa)': 'Natural reaction',
    'Reacao Natural (Alta)': 'Natural reaction',
    'Reacao Natural (Baixa)': 'Natural reaction',

    'Reação secundária': 'Secondary reaction',
    'Reação secundária (Fundo)': 'Secondary reaction',
    'Reação secundária (topo)': 'Secondary reaction',
    'Reação secundária (retomada)': 'Secondary reaction',
    'Reação secundária (Alta)': 'Secondary reaction',
    'Reacao secundaria': 'Secondary reaction',
    'Reacao secundaria (Fundo)': 'Secondary reaction',
    'Reacao secundaria (topo)': 'Secondary reaction',
    'Reacao secundaria (retomada)': 'Secondary reaction',
    'Reacao secundaria (Alta)': 'Secondary reaction',

    'Rally secundário (Topo)': 'Secondary rally',
    'Rally secundário (Fundo)': 'Secondary rally',
    'Rally secundário (Alta)': 'Secondary rally',
    'Rally secundário (Baixa)': 'Secondary rally',
    'Rally secundario (Topo)': 'Secondary rally',
    'Rally secundario (Fundo)': 'Secondary rally',
    'Rally secundario (Alta)': 'Secondary rally',
    'Rally secundario (Baixa)': 'Secondary rally',
}

const formatDateTime = (value) => {
    if (!value) return ''

    const date = new Date(value.replace(' ', 'T'))

    if (Number.isNaN(date.getTime())) {
        return value
    }

    return date.toLocaleString('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

const formatCurrency = (value) => {
    return Number(value).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
    })
}

const normalizeSymbol = (symbol) => {
    return String(symbol || '').trim().toUpperCase()
}

const MovementTables = () => {
    const { trend, trendPrimary, activeSymbol, isTrend, setIsTrend } = React.useContext(ContextGraphics)
    const [currentPage, setCurrentPage] = useState(1)

    const itemsPerPage = 25

    const selectedSymbol = normalizeSymbol(activeSymbol)

    const trends = isTrend ? trend : trendPrimary

    const dadosTables = useMemo(() => {
        if (!Array.isArray(trends)) return []

        const selectedTrend = trends.find(item => normalizeSymbol(item?.symbol) === selectedSymbol)

        if (!selectedTrend) return []

        return (selectedTrend.movements || [])
            .filter(item => item?.closeTime && item?.tipo)
            .slice()
            .reverse()
    }, [trends, selectedSymbol])

    const linhas = useMemo(() => {
        return dadosTables.map(item => {
            const movimentoFormatado = TIPO_TO_COL[item.tipo] || item.tipo

            return {
                dataHora: formatDateTime(item.closeTime),
                tipo: item.tipo,
                limite: item.limite,
                valores: MOVIMENTOS.map(mov =>
                    mov === movimentoFormatado ? item.closePrice : null
                ),
            }
        })
    }, [dadosTables])

    const totalPages = Math.max(1, Math.ceil(linhas.length / itemsPerPage))

    const linePage = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage
        const end = start + itemsPerPage
        return linhas.slice(start, end)
    }, [linhas, currentPage])

    React.useEffect(() => {
        setCurrentPage(1)
    }, [trends, selectedSymbol])

    return (
        <div className='graphics-main'>
            <div className='table-container'>
                <h2 className='title-table'>Movement Tables {selectedSymbol ? `- ${selectedSymbol}` : ''}</h2>

                {linhas.length === 0 ? (
                    <p className='empty-table'>No movement found.</p>
                ) : (
                    <>
                        <div className='movement-table-scroll'>
                            <table className='table'>
                                <thead>
                                    <tr>
                                        <th>Date/Time</th>
                                        {MOVIMENTOS.map(mov => (
                                            <th key={mov}>{mov}</th>
                                        ))}
                                        <th>Limit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {linePage.map((linha, i) => (
                                        <tr key={`${linha.dataHora}-${linha.tipo}-${i}`}>
                                            <td>{linha.dataHora}</td>
                                            {linha.valores.map((valor, j) => (
                                                <td key={MOVIMENTOS[j]}>
                                                    {valor != null ? formatCurrency(valor) : ''}
                                                </td>
                                            ))}
                                            <td>{Number(linha.limite).toFixed(4)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className='paginacao'>
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                            >
                                Previous
                            </button>
                            <span>Page {currentPage} of {totalPages}</span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage >= totalPages}
                            >
                                Next
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default MovementTables
