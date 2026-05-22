import React, { useMemo, useState } from 'react'
import './MovementTables.css'
import { ContextGraphics } from '../../ContextGraphics/ContextGraphics.jsx'

const MOVIMENTOS = [
    'Rally secundario',
    'Rally natural',
    'Tendencia Alta',
    'Tendencia Baixa',
    'Reacao natural',
    'Reacao secundaria',
]

const TIPO_TO_COL = {
    'Rally Natural (inicial)': 'Rally natural',
    'Rally Natural (fundo)': 'Rally natural',
    'Rally Natural (topo)': 'Rally natural',
    'Rally Natural (Baixa)': 'Rally natural',
    'Rally Natural (Alta)': 'Rally natural',
    'Rally Natural (retorno)': 'Rally natural',

    'Tendência Alta': 'Tendencia Alta',
    'Tendência Alta (compra)': 'Tendencia Alta',
    'Tendência Alta (topo)': 'Tendencia Alta',
    'Tendencia Alta': 'Tendencia Alta',
    'Tendencia Alta (compra)': 'Tendencia Alta',
    'Tendencia Alta (topo)': 'Tendencia Alta',

    'Tendência Baixa': 'Tendencia Baixa',
    'Tendência Baixa (venda)': 'Tendencia Baixa',
    'Tendência Baixa (fundo)': 'Tendencia Baixa',
    'Tendencia Baixa': 'Tendencia Baixa',
    'Tendencia Baixa (venda)': 'Tendencia Baixa',
    'Tendencia Baixa (fundo)': 'Tendencia Baixa',

    'Reação Natural (topo)': 'Reacao natural',
    'Reação Natural (fundo)': 'Reacao natural',
    'Reação Natural (de baixa)': 'Reacao natural',
    'Reação Natural (Alta)': 'Reacao natural',
    'Reação Natural (Baixa)': 'Reacao natural',
    'Reacao Natural (topo)': 'Reacao natural',
    'Reacao Natural (fundo)': 'Reacao natural',
    'Reacao Natural (de baixa)': 'Reacao natural',
    'Reacao Natural (Alta)': 'Reacao natural',
    'Reacao Natural (Baixa)': 'Reacao natural',

    'Reação secundária': 'Reacao secundaria',
    'Reação secundária (Fundo)': 'Reacao secundaria',
    'Reação secundária (topo)': 'Reacao secundaria',
    'Reação secundária (retomada)': 'Reacao secundaria',
    'Reação secundária (Alta)': 'Reacao secundaria',
    'Reacao secundaria': 'Reacao secundaria',
    'Reacao secundaria (Fundo)': 'Reacao secundaria',
    'Reacao secundaria (topo)': 'Reacao secundaria',
    'Reacao secundaria (retomada)': 'Reacao secundaria',
    'Reacao secundaria (Alta)': 'Reacao secundaria',

    'Rally secundário (Topo)': 'Rally secundario',
    'Rally secundário (Fundo)': 'Rally secundario',
    'Rally secundário (Alta)': 'Rally secundario',
    'Rally secundário (Baixa)': 'Rally secundario',
    'Rally secundario (Topo)': 'Rally secundario',
    'Rally secundario (Fundo)': 'Rally secundario',
    'Rally secundario (Alta)': 'Rally secundario',
    'Rally secundario (Baixa)': 'Rally secundario',
}

const formatDateTime = (value) => {
    if (!value) return ''

    const date = new Date(value.replace(' ', 'T'))

    if (Number.isNaN(date.getTime())) {
        return value
    }

    return date.toLocaleString('pt-BR', {
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
    const { trend, activeSymbol } = React.useContext(ContextGraphics)
    const [currentPage, setCurrentPage] = useState(1)

    const itemsPerPage = 15

    const selectedSymbol = normalizeSymbol(activeSymbol)

    const dadosTables = useMemo(() => {
        if (!Array.isArray(trend)) return []

        const selectedTrend = trend.find(item => normalizeSymbol(item?.symbol) === selectedSymbol)

        if (!selectedTrend) return []

        return (selectedTrend.movements || [])
            .filter(item => item?.closeTime && item?.tipo)
            .slice()
            .reverse()
    }, [trend, selectedSymbol])

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
    }, [trend, selectedSymbol])

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
                                        <th>Data/Hora</th>
                                        {MOVIMENTOS.map(mov => (
                                            <th key={mov}>{mov}</th>
                                        ))}
                                        <th>Limite</th>
                                        <th>Tipo original</th>
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
                                            <td>{linha.tipo}</td>
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
                                Anterior
                            </button>
                            <span>Pagina {currentPage} de {totalPages}</span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage >= totalPages}
                            >
                                Proxima
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default MovementTables
