// Função para calcular distribuição de probabilidade
const roundDecimal = (value, decimals = 8) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? Number(numberValue.toFixed(decimals)) : 0;
};

export const calculateProbabilityDistribution = (operations, entryPrice) => {
    if (!Array.isArray(operations) || operations.length === 0 || !Number.isFinite(Number(entryPrice)) || Number(entryPrice) <= 0) {
        return {
            distribution: [],
            summary: {
                totalOperations: 0,
                avgReturn: 0,
                stdDeviation: 0,
                skewness: 0,
                kurtosis: 0,
            }
        };
    }

    // 1. Calcular o retorno percentual de cada operação
    const returns = operations.map(op => {
        // Para operações LONG: (exitPrice - entryPrice) / entryPrice * 100
        // Para operações SHORT: (entryPrice - exitPrice) / entryPrice * 100
        let returnPercent;
        if ((op.side || "").toUpperCase() === 'BUY' || (op.side || "").toUpperCase() === 'LONG') {
            returnPercent = ((op.exitPrice - op.entryPrice) / op.entryPrice) * 100;
        } else if ((op.side || "").toUpperCase() === 'SELL' || (op.side || "").toUpperCase() === 'SHORT') {
            returnPercent = ((op.entryPrice - op.exitPrice) / op.entryPrice) * 100;
        } else {
            returnPercent = (op.pnl / (op.quantity * op.entryPrice)) * 100;
        }

        return {
            ...op,
            returnPercent: roundDecimal(returnPercent, 2)
        };
    });

    // 2. Definir as faixas (bins) para a distribuição
    const bins = [
        { min: -Infinity, max: -2, label: "<-2%" },
        { min: -2, max: -1, label: "-2% a -1%" },
        { min: -1, max: 0, label: "-1% a 0%" },
        { min: 0, max: 1, label: "0% a 1%" },
        { min: 1, max: 2, label: "1% a 2%" },
        { min: 2, max: Infinity, label: ">2%" },
    ];

    // 3. Contar operações em cada faixa
    const distribution = bins.map(bin => {
        const count = returns.filter(r =>
            r.returnPercent >= bin.min && r.returnPercent < bin.max
        ).length;

        const percentage = operations.length > 0
            ? roundDecimal((count / operations.length) * 100, 2)
            : 0;

        return {
            range: bin.label,
            count: count,
            percentage: percentage,
            // Dados adicionais para análise
            minReturn: bin.min === -Infinity ? null : bin.min,
            maxReturn: bin.max === Infinity ? null : bin.max,
        };
    });

    // 4. Calcular estatísticas adicionais
    const returnValues = returns.map(r => r.returnPercent);
    const totalReturns = returnValues.length;

    // Média
    const avgReturn = totalReturns > 0
        ? roundDecimal(returnValues.reduce((a, b) => a + b, 0) / totalReturns, 2)
        : 0;

    // Desvio padrão
    const stdDeviation = totalReturns > 0
        ? roundDecimal(Math.sqrt(
            returnValues.reduce((sum, val) => sum + Math.pow(val - avgReturn, 2), 0) / totalReturns
        ), 2)
        : 0;

    // Assimetria (Skewness)
    const skewness = totalReturns > 0 && stdDeviation > 0
        ? roundDecimal(
            returnValues.reduce((sum, val) => sum + Math.pow(val - avgReturn, 3), 0) /
            (totalReturns * Math.pow(stdDeviation, 3)), 2)
        : 0;

    // Curtose (Kurtosis)
    const kurtosis = totalReturns > 0 && stdDeviation > 0
        ? roundDecimal(
            returnValues.reduce((sum, val) => sum + Math.pow(val - avgReturn, 4), 0) /
            (totalReturns * Math.pow(stdDeviation, 4)) - 3, 2)
        : 0;

    // 5. Calcular métricas de desempenho
    const positiveReturns = returns.filter(r => r.returnPercent > 0);
    const negativeReturns = returns.filter(r => r.returnPercent < 0);

    const avgPositiveReturn = positiveReturns.length > 0
        ? roundDecimal(positiveReturns.reduce((a, b) => a + b.returnPercent, 0) / positiveReturns.length, 2)
        : 0;

    const avgNegativeReturn = negativeReturns.length > 0
        ? roundDecimal(negativeReturns.reduce((a, b) => a + b.returnPercent, 0) / negativeReturns.length, 2)
        : 0;

    // 6. Calcular percentis
    const sortedReturns = [...returnValues].sort((a, b) => a - b);
    const percentiles = {
        p10: totalReturns > 0 ? sortedReturns[Math.floor(totalReturns * 0.1)] : 0,
        p25: totalReturns > 0 ? sortedReturns[Math.floor(totalReturns * 0.25)] : 0,
        p50: totalReturns > 0 ? sortedReturns[Math.floor(totalReturns * 0.5)] : 0,
        p75: totalReturns > 0 ? sortedReturns[Math.floor(totalReturns * 0.75)] : 0,
        p90: totalReturns > 0 ? sortedReturns[Math.floor(totalReturns * 0.9)] : 0,
    };

    return {
        distribution: distribution,
        summary: {
            totalOperations: operations.length,
            avgReturn: avgReturn,
            stdDeviation: stdDeviation,
            skewness: skewness,
            kurtosis: kurtosis,
            avgPositiveReturn: avgPositiveReturn,
            avgNegativeReturn: avgNegativeReturn,
            maxReturn: totalReturns > 0 ? Math.max(...returnValues) : 0,
            minReturn: totalReturns > 0 ? Math.min(...returnValues) : 0,
            percentiles: percentiles,
        },
        rawReturns: returns.map(r => r.returnPercent),
        returns: returns,
    };
};
