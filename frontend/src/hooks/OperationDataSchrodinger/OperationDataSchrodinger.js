import { useContext, useEffect, useMemo } from 'react'
import { ContextGraphics } from '../../ContextGraphics/ContextGraphics'

const getLatestValue = (series, key) => {
    if (!Array.isArray(series)) return null

    for (let index = series.length - 1; index >= 0; index -= 1) {
        const value = Number(series[index]?.[key])
        if (series[index]?.[key] != null && Number.isFinite(value)) return value
    }

    return null
}

const getKineticTrend = (series) => {
    if (!Array.isArray(series)) return 'unavailable'

    const values = series
        .map(point => Number(point?.value))
        .filter((value, index) => (
            series[index]?.value != null && Number.isFinite(value)
        ))
    if (values.length < 2) return 'unavailable'

    return values[values.length - 1] > values[values.length - 2]
        ? 'increasing'
        : 'decreasing'
}

export const useSchrodingerData = (schrodinger) => {
    const { schrodingerDataRef } = useContext(ContextGraphics)

    const indicatorsBySymbol = useMemo(() => {
        const markets = Array.isArray(schrodinger) ? schrodinger : []

        return markets.reduce((indicators, market) => {
            if (!market?.symbol) return indicators

            const kineticSeries = market.energy_kinetic
            const potentialEnergy = getLatestValue(market.potential_energy, 'value')
            const evolution = Array.isArray(market.evolution_series)
                ? market.evolution_series[market.evolution_series.length - 1]
                : null
            const psiBuy = evolution?.psi_buy == null ? null : Number(evolution.psi_buy)
            const psiSell = evolution?.psi_sell == null ? null : Number(evolution.psi_sell)

            indicators[String(market.symbol).trim().toUpperCase()] = {
                kineticEnergy: getLatestValue(kineticSeries, 'value'),
                kineticTrend: getKineticTrend(kineticSeries),
                potentialEnergy,
                evolution: {
                    psiBuy: Number.isFinite(psiBuy) ? psiBuy : null,
                    psiSell: Number.isFinite(psiSell) ? psiSell : null,
                },
            }

            return indicators
        }, {})
    }, [schrodinger])

    useEffect(() => {
        schrodingerDataRef.current = indicatorsBySymbol
    }, [indicatorsBySymbol, schrodingerDataRef])

    return { schrodingerDataRef, indicatorsBySymbol }
}
