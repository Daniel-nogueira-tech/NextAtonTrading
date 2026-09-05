import { useContext, useEffect } from 'react';
import { getSymbolInfo } from '../BinanceInforApi/BinanceInforApi.js'
import { ContextGraphics } from '../ContextGraphics/ContextGraphics';
import { calculateProbabilityDistribution } from '../ProbabilityDistribution/ProbabilityDistribution.js'


// Função auxiliar para ajustar o valor ao stepSize exato
const formatByStepSize = (value, stepSize) => {
    if (!stepSize || stepSize === 0) return value;

    // Descobre quantas casas decimais o stepSize possui
    const precision = stepSize.toString().includes('.')
        ? stepSize.toString().split('.')[1].length
        : 0;

    // Arredonda para baixo respeitando os passos e fixa as casas decimais
    const stepped = Math.floor(value / stepSize) * stepSize;

    return parseFloat(stepped.toFixed(precision));
};

const roundDecimal = (value, decimals = 8) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? Number(numberValue.toFixed(decimals)) : 0;
};

// ==============================|Função principal para calcular o tamanho do lote|============================== //
export const calculatePositionSize = async (lastSignal, signalsBySymbolState) => {
    if (!lastSignal) return null;
    const symbolInfor = await getSymbolInfo(lastSignal);

    const balanceAndRisk = {
        balance: 10000,
        risk: 0.02
    };

    try {
        const symbol = lastSignal.symbol || symbolInfor?.symbol || 'UNKNOWN';
        const stopPoint = Number(lastSignal?.stop ?? 0);
        const entryPrice = Number(lastSignal?.avgEntryPrice ?? 0);
        const count = Number(lastSignal?.count ?? 1);


        if (!entryPrice || !stopPoint) return null;

        const isLong = lastSignal?.action === 'BUY'
        const isShort = lastSignal?.action === 'SELL';

        // 🔥 Distância do stop em PONTOS (não percentual)
        const stopDistancePoints = Math.abs(entryPrice - stopPoint);

        // 🔥 Risco total da operação (2% do saldo)
        const riskBudget = Number(balanceAndRisk.balance) * Number(balanceAndRisk.risk); // 200 USDT

        // 🔥 Divide pelo número de entradas parciais
        const riskBudgetPerPartial = riskBudget / count;

        // 🔥 Quantidade por entrada = Risco / Distância do Stop
        const qtyPerPartial = riskBudgetPerPartial / stopDistancePoints;

        // 🔥 Quantidade total = Quantidade por entrada * número de entradas
        const totalQty = qtyPerPartial * count;

        const stepSize = Number(symbolInfor?.stepSize || 0);
        const minQty = Number(symbolInfor?.minQty || 0);
        const maxQty = Number(symbolInfor?.maxQty || 0);

        if (!stepSize || !minQty) return null;

        // 🔥 Ajustar para o stepSize da Binance
        let adjustedQty = formatByStepSize(totalQty, stepSize);

        if (adjustedQty < minQty) {
            adjustedQty = minQty;
            console.warn(`Quantidade ajustada para o mínimo: ${minQty}`);
        }

        if (maxQty && adjustedQty > maxQty) {
            adjustedQty = maxQty;
            console.warn(`Quantidade ajustada para o máximo: ${maxQty}`);
        }

        const quantityPerEntry = adjustedQty * count;
        const valuePerEntry = roundDecimal(quantityPerEntry * entryPrice);
        const totalPositionValue = roundDecimal(valuePerEntry * count);

        // 🔥Calcular risco real
        const actualRisk = roundDecimal(adjustedQty * stopDistancePoints);
        const riskPercentage = (actualRisk / balanceAndRisk.balance) * 100;

        console.log('✅ Resultado final:', {
            symbol,
            count,
            side: isLong ? 'LONG' : isShort ? 'SHORT' : 'UNKNOWN',
            entryPrice,
            stop: stopPoint,
            stopDistance: stopDistancePoints.toFixed(2),
            stopPercent: ((stopDistancePoints / entryPrice) * 100).toFixed(2) + '%',
            positionSize: adjustedQty.toFixed(8),
            totalValue: (adjustedQty * entryPrice).toFixed(2),
            riskAmount: actualRisk.toFixed(2),
            riskPercentage: riskPercentage.toFixed(2) + '%',
            balance: balanceAndRisk.balance,
        });


        //==================================|Calcula resultado das operações|=====================================//
        const operations = [];
        const perSymbol = {};
        const toNumber = (value, fallback = 0) => {
            const n = Number(value ?? fallback);
            return Number.isFinite(n) ? n : fallback;
        };

        Object.entries(signalsBySymbolState).forEach(([symbol, signals]) => {
            if (!Array.isArray(signals)) return;

            let openPosition = null;

            signals.forEach((signal) => {
                const action = String(signal?.action || '').toUpperCase();

                if (action === 'BUY') {
                    const count = Math.max(1, Math.round(toNumber(signal?.count, 1)));
                    const entryPrice = toNumber(signal?.entryPrice ?? signal?.avgEntryPrice ?? signal?.expectedPriceBuy, 0);
                    // 🔥 Usar o stop do sinal, se existir
                    const stopPrice = toNumber(
                        signal?.stop ??
                        signal?.expectedPriceStop ??
                        signal?.stopPrice ??
                        (entryPrice * 0.98),
                        0
                    );
                    openPosition = {
                        symbol,
                        side: 'BUY',
                        count,
                        quantityPerEntry,
                        totalValue: totalPositionValue,
                        entryPrice,
                        stopPrice,
                        entrySignal: signal,
                        entryTime: signal.time || null,
                    };
                    return;
                }

                if (action === 'SELL') {
                    const count = Math.max(1, Math.round(toNumber(signal?.count, 1)));
                    const entryPrice = toNumber(signal?.entryPrice ?? signal?.avgEntryPrice ?? signal?.expectedPriceSell, 0);
                    // 🔥 Usar o stop do sinal, se existir
                    const stopPrice = toNumber(
                        signal?.stop ??
                        signal?.expectedPriceStop ??
                        signal?.stopPrice ??
                        (entryPrice * 1.02),
                        0
                    );
                    openPosition = {
                        symbol,
                        side: 'SELL',
                        count,
                        quantityPerEntry,
                        totalValue: totalPositionValue,
                        entryPrice,
                        stopPrice,
                        entrySignal: signal,
                        entryTime: signal.time || null,
                    };
                    return;
                }

                if (!openPosition) return;

                const exitPrice = toNumber(
                    signal?.exitPrice ??
                    signal?.partialPrice ??
                    signal?.avgExitPrice ??
                    signal?.entryPrice ??
                    signal?.expectedPriceExitBuy ??
                    signal?.expectedPriceExitSell,
                    0
                );

                if (action === 'EXIT_BUY' || action === 'STOP_BUY') {
                    if (openPosition.side === 'BUY') {
                        const realizedUnits = action === 'STOP_BUY'
                            ? openPosition.count
                            : 1;
                        const realizedQty = openPosition.quantityPerEntry * realizedUnits;

                        // 🔥Calcular a distância do stop corretamente
                        const stopDistance = Math.max(openPosition.entryPrice - openPosition.stopPrice, 0);
                        const risk = roundDecimal(stopDistance * realizedQty);

                        const pnl = roundDecimal((exitPrice - openPosition.entryPrice) * realizedQty);

                        operations.push({
                            symbol,
                            side: 'BUY',
                            count: realizedUnits,
                            quantity: roundDecimal(realizedQty),
                            entryPrice: openPosition.entryPrice,
                            stopPrice: openPosition.stopPrice,
                            stopDistance: roundDecimal(stopDistance),
                            exitPrice,
                            pnl,
                            risk,
                            rr: risk > 0 ? pnl / risk : 0,
                            action,
                            entryTime: openPosition.entryTime,
                            exitTime: signal.time || null,
                        });
                        openPosition.count -= realizedUnits;
                        if (openPosition.count <= 0) openPosition = null;
                    }
                    return;
                }

                if (action === 'EXIT_SELL' || action === 'STOP_SELL') {
                    if (openPosition.side === 'SELL') {
                        const realizedUnits = action === 'STOP_SELL'
                            ? openPosition.count
                            : 1;
                        const realizedQty = openPosition.quantityPerEntry * realizedUnits;

                        // 🔥 Calcular a distância do stop corretamente
                        const stopDistance = Math.max(openPosition.stopPrice - openPosition.entryPrice, 0);
                        const risk = roundDecimal(stopDistance * realizedQty);

                        const pnl = roundDecimal((openPosition.entryPrice - exitPrice) * realizedQty);

                        operations.push({
                            symbol,
                            side: 'SELL',
                            count: realizedUnits,
                            quantity: roundDecimal(realizedQty),
                            entryPrice: openPosition.entryPrice,
                            stopPrice: openPosition.stopPrice,
                            stopDistance: roundDecimal(stopDistance),
                            exitPrice,
                            pnl,
                            risk,
                            rr: risk > 0 ? pnl / risk : 0,
                            action,
                            entryTime: openPosition.entryTime,
                            exitTime: signal.time || null,
                        });
                        openPosition.count -= realizedUnits;
                        if (openPosition.count <= 0) openPosition = null;
                    }
                    return;
                }
            });

            if (openPosition) {
                perSymbol[symbol] = {
                    symbol,
                    openPosition,
                    openPnl: null,
                };
            }
        });

        const totalProfit = operations.reduce((sum, item) => sum + (item.pnl > 0 ? item.pnl : 0), 0);
        const totalLoss = operations.reduce((sum, item) => sum + (item.pnl < 0 ? item.pnl : 0), 0);
        const netPnl = totalProfit + totalLoss;

        // 🔥 Estatísticas detalhadas
        const totalRisk = operations.reduce((sum, item) => sum + item.risk, 0);
        const avgRisk = operations.length > 0 ? totalRisk / operations.length : 0;
        const avgRr = operations.length > 0 ? operations.reduce((sum, item) => sum + item.rr, 0) / operations.length : 0;
        const closedPositionResults = operations.reduce((results, operation) => {
            const key = `${operation.symbol}-${operation.side}-${operation.entryTime}`;
            const current = results[key] || {
                symbol: operation.symbol,
                side: operation.side,
                entryPrice: operation.entryPrice,
                entryTime: operation.entryTime,
                quantity: 0,
                exitQuantity: 0,
                totalPnl: 0,
                totalRisk: 0,
                exits: 0,
            };

            current.quantity += operation.quantity;
            current.exitQuantity += operation.quantity;
            current.totalPnl += operation.pnl;
            current.totalRisk += operation.risk;
            current.exits += 1;
            current.exitPrice = operation.exitPrice;
            current.exitTime = operation.exitTime;
            results[key] = current;
            return results;
        }, {});
        const closedPositionResultsArray = Object.values(closedPositionResults).map(result => ({
            ...result,
            quantity: roundDecimal(result.quantity),
            exitQuantity: roundDecimal(result.exitQuantity),
            totalPnl: roundDecimal(result.totalPnl),
            totalRisk: roundDecimal(result.totalRisk),
            rr: result.totalRisk > 0 ? roundDecimal(result.totalPnl / result.totalRisk, 4) : 0,
        }));
        const totalOperationResult = roundDecimal(
            closedPositionResultsArray.reduce((sum, result) => sum + result.totalPnl, 0)
        );
        const openPositions = Object.values(perSymbol).map(({ openPosition }) => ({
            ...openPosition,
            quantityPerEntry: roundDecimal(openPosition.quantityPerEntry),
            quantity: roundDecimal(openPosition.quantityPerEntry * openPosition.count),
            totalValue: roundDecimal(openPosition.quantityPerEntry * openPosition.entryPrice * openPosition.count),
            entryPrice: roundDecimal(openPosition.entryPrice),
            stopPrice: roundDecimal(openPosition.stopPrice),
            stopDistance: roundDecimal(Math.abs(openPosition.entryPrice - openPosition.stopPrice)),
            risk: roundDecimal(Math.abs(openPosition.entryPrice - openPosition.stopPrice) * openPosition.quantityPerEntry * openPosition.count),
        }));

        const openRisk = roundDecimal(openPositions.reduce((sum, position) => sum + position.risk, 0));

        const probabilityData = calculateProbabilityDistribution(operations, entryPrice);

        console.log('📊 Resultado das operações', {
            // === DADOS PRINCIPAIS ===
            symbol,
            side: isLong ? 'LONG' : isShort ? 'SHORT' : 'UNKNOWN',
            count: count || 0,

            // === CONFIGURAÇÃO DA OPERAÇÃO ===  
            config: {
                entryPrice: roundDecimal(entryPrice),
                stop: stopPoint,
                stopDistance: {
                    points: roundDecimal(stopDistancePoints),
                    percent: roundDecimal((stopDistancePoints / entryPrice) * 100, 2),
                }
            },

            // === DISTRIBUIÇÃO DE PROBABILIDADES ===
            probabilityDistribution: {
                distribution: probabilityData.distribution,
                summary: probabilityData.summary,
                rawReturns: probabilityData.rawReturns,
            },

            // === GESTÃO DE CAPITAL ===
            capital: {
                balance: balanceAndRisk.balance,
                riskPerTrade: balanceAndRisk.risk * 100,
                positionSize: roundDecimal(adjustedQty),
                positionValue: totalPositionValue,
                risk: {
                    amount: roundDecimal(actualRisk),
                    percentage: roundDecimal(riskPercentage, 2),
                }
            },

            // === INFORMAÇÕES DO ATIVO ===
            assetInfo: {
                minQty,
                maxQty,
                stepSize,
                tickSize: Number(symbolInfor?.tickSize || 0),
                minNotional: Number(symbolInfor?.minNotional || 0)
            },

            // === HISTÓRICO DE OPERAÇÕES ===
            history: {
                operations: operations.map(operation => ({
                    ...operation,
                    entryPrice: roundDecimal(operation.entryPrice),
                    stopPrice: roundDecimal(operation.stopPrice),
                    exitPrice: roundDecimal(operation.exitPrice),
                    quantity: roundDecimal(operation.quantity),
                    pnl: roundDecimal(operation.pnl),
                    risk: roundDecimal(operation.risk),
                    rr: roundDecimal(operation.rr, 4),
                })),
                summary: {
                    totalOperations: operations.length,
                    wins: operations.filter((item) => item.pnl > 0).length,
                    losses: operations.filter((item) => item.pnl < 0).length,
                    winRate: operations.length
                        ? roundDecimal((operations.filter(o => o.pnl > 0).length / operations.length) * 100, 2)
                        : 0
                },
            },

            // === RESULTADOS ===
            results: {
                netPnl: roundDecimal(netPnl),
                totalProfit: roundDecimal(totalProfit),
                totalLoss: roundDecimal(totalLoss),
                avgRisk: roundDecimal(avgRisk),
                totalRisk: roundDecimal(totalRisk),
                avgRr: roundDecimal(avgRr, 4),

            },

            // === POSIÇÕES ATUAIS ===
            positions: {
                open: openPositions,
                openRisk,
                closed: closedPositionResultsArray,
                perSymbol,
                hasOpen: Object.keys(perSymbol).length > 0,
                sizePerEntry: roundDecimal(quantityPerEntry),
                valuePerEntry,
                realizedPnl: roundDecimal(netPnl),
                totalOperationResult,
            },
        });

        return {
            // === DADOS PRINCIPAIS ===
            symbol,
            side: isLong ? 'LONG' : isShort ? 'SHORT' : 'UNKNOWN',
            count: count || 0,

            // === CONFIGURAÇÃO DA OPERAÇÃO ===  
            config: {
                entryPrice: roundDecimal(entryPrice),
                stop: stopPoint,
                stopDistance: {
                    points: roundDecimal(stopDistancePoints),
                    percent: roundDecimal((stopDistancePoints / entryPrice) * 100, 2),
                }
            },

            // === DISTRIBUIÇÃO DE PROBABILIDADES ===
            probabilityDistribution: {
                distribution: probabilityData.distribution,
                summary: probabilityData.summary,
                rawReturns: probabilityData.rawReturns,
            },
            // === GESTÃO DE CAPITAL ===
            capital: {
                balance: balanceAndRisk.balance,
                riskPerTrade: balanceAndRisk.risk * 100,
                positionSize: roundDecimal(adjustedQty),
                positionValue: totalPositionValue,
                risk: {
                    amount: roundDecimal(actualRisk),
                    percentage: roundDecimal(riskPercentage, 2),
                }
            },

            // === INFORMAÇÕES DO ATIVO ===
            assetInfo: {
                minQty,
                maxQty,
                stepSize,
                tickSize: Number(symbolInfor?.tickSize || 0),
                minNotional: Number(symbolInfor?.minNotional || 0)
            },

            // === HISTÓRICO DE OPERAÇÕES ===
            history: {
                operations: operations.map(operation => ({
                    ...operation,
                    entryPrice: roundDecimal(operation.entryPrice),
                    stopPrice: roundDecimal(operation.stopPrice),
                    exitPrice: roundDecimal(operation.exitPrice),
                    quantity: roundDecimal(operation.quantity),
                    pnl: roundDecimal(operation.pnl),
                    risk: roundDecimal(operation.risk),
                    rr: roundDecimal(operation.rr, 4),
                })),
                summary: {
                    totalOperations: operations.length,
                    wins: operations.filter((item) => item.pnl > 0).length,
                    losses: operations.filter((item) => item.pnl < 0).length,
                    winRate: operations.length
                        ? roundDecimal((operations.filter(o => o.pnl > 0).length / operations.length) * 100, 2)
                        : 0
                },
            },

            // === RESULTADOS ===
            results: {
                netPnl: roundDecimal(netPnl),
                totalProfit: roundDecimal(totalProfit),
                totalLoss: roundDecimal(totalLoss),
                avgRisk: roundDecimal(avgRisk),
                totalRisk: roundDecimal(totalRisk),
                avgRr: roundDecimal(avgRr, 4),

            },

            // === POSIÇÕES ATUAIS ===
            positions: {
                open: openPositions,
                openRisk,
                closed: closedPositionResultsArray,
                perSymbol,
                hasOpen: Object.keys(perSymbol).length > 0,
                sizePerEntry: roundDecimal(quantityPerEntry),
                valuePerEntry,
                realizedPnl: roundDecimal(netPnl),
                totalOperationResult,
            },
        };
    } catch (error) {
        console.error('Erro ao calcular tamanho da posição:', error);
        return null;
    }
};

export const useCalculatePositionSize = (lastSignal, signalsBySymbolState) => {
    const { setResultOperations } = useContext(ContextGraphics);

    useEffect(() => {
        let cancelled = false;

        if (!lastSignal) {
            return undefined;
        }
        calculatePositionSize(lastSignal, signalsBySymbolState)
            .then(result => {
                if (!cancelled && result) {
                    setResultOperations(result);

                }

            })
            .catch(error => {
                console.error('Erro ao atualizar resultado das operações:', error);
            });

        return () => {
            cancelled = true;
        };


    }, [lastSignal, signalsBySymbolState, setResultOperations]);

    return null;
};

