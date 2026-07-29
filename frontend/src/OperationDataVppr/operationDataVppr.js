import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ContextGraphics } from '../ContextGraphics/ContextGraphics';

const normalizeVpprData = (vppr) => {
    if (!vppr) return [];
    const collection = vppr?.data ?? vppr;
    const groups = Array.isArray(collection) ? collection : [collection];

    return groups.flatMap((group, index) => {
        if (Array.isArray(group)) {
            return [{
                symbol: `SYMBOL_${index + 1}`,
                result: group
            }];
        }
        if (Array.isArray(group?.result)) {
            return [{
                symbol: group.symbol || `SYMBOL_${index + 1}`,
                result: group.result,
            }];
        }
        return [];
    });
};

export const useVpprData = (vppr) => {
    const { vpprData, setVpprData } = useContext(ContextGraphics)

    const vpprHistoryRef = useRef({});
    const symbolsStateRef = useRef({});
    const lastTimestampRef = useRef({});

    const vpprGroups = useMemo(() => normalizeVpprData(vppr), [vppr]);

    useEffect(() => {
        if (!vpprGroups?.length) return;

        const nextVpprHistory = { ...vpprHistoryRef.current };

        vpprGroups.forEach(({ symbol, result }) => {
            if (!result?.length) return;

            const lastTime = lastTimestampRef.current[symbol] || 0;
            const newItems = result.filter(item => new Date(item.time).getTime() > lastTime);

            if (newItems.length === 0) return;

            const latestTime = Math.max(...newItems.map(item => new Date(item.time).getTime()));
            lastTimestampRef.current[symbol] = latestTime;

            if (!symbolsStateRef.current[symbol]) {
                symbolsStateRef.current[symbol] = {
                    lastSignalState: null,
                    lastVppr: null,
                    currentTrend: null,
                    currentMajorityTrend: null,
                    previousVppr: 0,
                    majortrendUp: false,
                    majortrendDown: false,
                    trendVpprUp: false,
                    trendVpprDown: false,
                    vpprHistory: [],
                    lastCrossTime: null,
                    majorTrendInitialized: false,
                };
            }
            const state = symbolsStateRef.current[symbol];

            newItems.forEach((item) => {
                if (!item?.time || typeof item.vppr === 'undefined' || typeof item.vppr_ema === 'undefined') return;

                const vppr = Number(item.vppr);
                const vpprEma = Number(item.vppr_ema);

                if (!Number.isFinite(vppr) || !Number.isFinite(vpprEma)) return;

                // Atualiza histórico
                state.vpprHistory.push({ vppr, time: item.time, vpprEma });
                if (state.vpprHistory.length > 12) state.vpprHistory.shift();

                // ====================== BANDAS DE TENDÊNCIA ======================
                const percentage = Math.abs(vpprEma) * 0.001;
                const bandTop = vpprEma + percentage;
                const bandBottom = vpprEma - percentage;

                let currentTrend = null;
                let currentMajorityTrend = null;
                let trendChanged = false;
                let majorityTrendChanged = false;

                // ================================================================
                // LÓGICA DA STATE MACHINE PARA TREND (BANDAS)
                // ================================================================

                if (state.currentTrend === null) {
                    if (vppr > bandTop) {
                        currentTrend = 'TREND_BUY';
                        state.trendVpprUp = true;
                        state.trendVpprDown = false;
                        trendChanged = true;
                    } else if (vppr < bandBottom) {
                        currentTrend = 'TREND_SELL';
                        state.trendVpprDown = true;
                        state.trendVpprUp = false;
                        trendChanged = true;
                    } else {
                        currentTrend = null;
                    }
                } else if (state.currentTrend === 'TREND_BUY') {
                    if (vppr < bandBottom) {
                        currentTrend = 'TREND_SELL';
                        state.trendVpprUp = false;
                        state.trendVpprDown = true;
                        trendChanged = true;
                    } else {
                        currentTrend = 'TREND_BUY';
                    }
                } else if (state.currentTrend === 'TREND_SELL') {
                    if (vppr > bandTop) {
                        currentTrend = 'TREND_BUY';
                        state.trendVpprDown = false;
                        state.trendVpprUp = true;
                        trendChanged = true;
                    } else {
                        currentTrend = 'TREND_SELL';
                    }
                }

                // ================================================================
                // LÓGICA DA TENDÊNCIA MAJORITÁRIA
                // ================================================================

                // 1: Inicialização do Major Trend
                if (!state.majorTrendInitialized && vppr !== 0) {
                    currentMajorityTrend = vppr > 0 ? 'MAJOR_BUY' : 'MAJOR_SELL';
                    state.majortrendUp = vppr > 0;
                    state.majortrendDown = vppr < 0;
                    state.majorTrendInitialized = true;
                    majorityTrendChanged = true;
                    console.log(`🎯 [${symbol}] MAJOR TREND INICIAL: ${currentMajorityTrend}`);
                }
                // 2: Verifica cruzamento do zero (só se já foi inicializado)
                else if (state.majorTrendInitialized) {
                    const wasPositive = state.previousVppr > 0;
                    const isPositive = vppr > 0;
                    const wasNegative = state.previousVppr < 0;
                    const isNegative = vppr < 0;

                    // Detecta cruzamento do zero (positivo → negativo OU negativo → positivo)
                    const crossedFromPositiveToNegative = wasPositive && isNegative;
                    const crossedFromNegativeToPositive = wasNegative && isPositive;
                    const crossedZero = crossedFromPositiveToNegative || crossedFromNegativeToPositive;

                    if (crossedZero) {
                        if (vppr > 0) {
                            currentMajorityTrend = 'MAJOR_BUY';
                            state.majortrendUp = true;
                            state.majortrendDown = false;
                            majorityTrendChanged = true;
                            console.log(`📈 [${symbol}] MAJOR TREND → BUY (cruzou para positivo): ${vppr.toFixed(4)}`);
                        } else if (vppr < 0) {
                            currentMajorityTrend = 'MAJOR_SELL';
                            state.majortrendUp = false;
                            state.majortrendDown = true;
                            majorityTrendChanged = true;
                            console.log(`📉 [${symbol}] MAJOR TREND → SELL (cruzou para negativo): ${vppr.toFixed(4)}`);
                        }
                    } else {
                        // 3: Mantém a tendência majoritária atual
                        currentMajorityTrend = state.currentMajorityTrend;
                    }
                }

                // 4: Se ainda não foi inicializado e vppr = 0, mantém null
                if (!state.majorTrendInitialized && vppr === 0) {
                    currentMajorityTrend = null;
                }

                // Atualiza o estado
                state.currentTrend = currentTrend;
                state.currentMajorityTrend = currentMajorityTrend;
                state.previousVppr = vppr;

                // ================================================================
                // ANÁLISE DE TENDÊNCIA DO VOLUME - VERSÃO OTIMIZADA
                // ================================================================
                let volumeEmaSignal = null;
                const analyzeVolumeTrend = (history, windowSize = 12) => {
                    // Usa vpprEma diretamente (valor pré-calculado) em vez de recalcular a EMA
                    if (!history || history.length < windowSize) {
                        return {
                            signal: 'Insufficient Data',
                            direction: 'neutral',
                            strength: 0,
                            emaChange: 0,
                            slopePercent: 0
                        };
                    }

                    const recent = history.slice(-windowSize);
                    const values = recent.map(x => Number(x.vpprEma ?? x.vppr ?? 0));

                    if (values.length < 2) {
                        return {
                            signal: 'Insufficient Data',
                            direction: 'neutral',
                            strength: 0,
                            emaChange: 0,
                            slopePercent: 0
                        };
                    }

                    const firstVal = values[0];
                    const lastVal = values[values.length - 1];

                    // Proteção contra divisão por zero
                    const emaChange = firstVal === 0 ? 0 : ((lastVal - firstVal) / Math.abs(firstVal)) * 100;

                    // Calcula slope (regressão linear simples) sobre a série de vpprEma
                    const n = values.length;
                    const xValues = Array.from({ length: n }, (_, i) => i);
                    const sumX = xValues.reduce((a, b) => a + b, 0);
                    const sumY = values.reduce((a, b) => a + b, 0);
                    const sumXY = xValues.reduce((a, b, i) => a + b * values[i], 0);
                    const sumX2 = xValues.reduce((a, b) => a + b * b, 0);
                    const denom = (n * sumX2 - sumX * sumX) || 1;
                    const slope = (n * sumXY - sumX * sumY) / denom;
                    const slopePercent = firstVal === 0 ? 0 : (slope / Math.abs(firstVal)) * 100;

                    // Consistência usando últimos 3 valores de vpprEma
                    const lastThree = values.slice(-3);
                    const isConsistentlyIncreasing = lastThree.length < 2 ? false : lastThree.every((val, idx, arr) => idx === 0 || val > arr[idx - 1]);
                    const isConsistentlyDecreasing = lastThree.length < 2 ? false : lastThree.every((val, idx, arr) => idx === 0 || val < arr[idx - 1]);

                    // Decisão de sinal (mesma heurística anterior, agora com vpprEma)
                    const MIN_CHANGE = 0.03; // 0.3% mínima
                    const MIN_SLOPE = 0.005; // 0.005% mínima

                    let signal = 'Volume Stable';
                    let direction = 'neutral';
                    let strength = 0;

                    if (Math.abs(emaChange) >= MIN_CHANGE && Math.abs(slopePercent) >= MIN_SLOPE) {
                        if (emaChange > 0 && slopePercent > 0 && isConsistentlyIncreasing) {
                            signal = 'Volume BUY Increasing';
                            direction = 'up';
                            strength = Math.min(Math.abs(emaChange) / 5, 100);
                        } else if (emaChange < 0 && slopePercent < 0 && isConsistentlyDecreasing) {
                            signal = 'Volume SELL Increasing';
                            direction = 'down';
                            strength = Math.min(Math.abs(emaChange) / 5, 100);
                        } else if (emaChange > 0) {
                            signal = 'Volume BUY Weakly Increasing';
                            direction = 'up_weak';
                            strength = Math.min(Math.abs(emaChange) / 10, 50);
                        } else if (emaChange < 0) {
                            signal = 'Volume SELL Weakly Increasing';
                            direction = 'down_weak';
                            strength = Math.min(Math.abs(emaChange) / 10, 50);
                        }
                    }

                    return {
                        signal,
                        direction,
                        strength,
                        emaChange,
                        slopePercent,
                        lastEma: lastVal,
                        firstEma: firstVal,
                        isConsistent: isConsistentlyIncreasing || isConsistentlyDecreasing
                    };
                };

                const volumeTrend = analyzeVolumeTrend(state.vpprHistory);

                // Atualiza o estado
                volumeEmaSignal = volumeTrend.signal;

                // ================================================================
                // GERAÇÃO DE SINAIS
                // ================================================================
                const signalsToAdd = [];

                // 5: Determina o valor do major corretamente
                const getMajorValue = () => {
                    if (state.currentMajorityTrend === 'MAJOR_BUY') return 'MajorBuy';
                    if (state.currentMajorityTrend === 'MAJOR_SELL') return 'MajorSell';
                    return 'Neutral';
                };

                // Sinal de Tendência (bandas)
                if (currentTrend && trendChanged) {
                    const signalType = currentTrend === 'TREND_BUY' ? 'Trend Buy' : 'Trend Sell';
                    const side = currentTrend === 'TREND_BUY' ? 'buy' : 'sell';
                    const majorValue = getMajorValue();

                    const signalId = `${symbol}|${signalType}|${item.time}`;
                    const alreadyExists = nextVpprHistory[symbol]?.some(s => s.id === signalId);

                    if (!alreadyExists) {
                        signalsToAdd.push({
                            major: majorValue,
                            type: signalType,
                            side: side,
                            trend: currentTrend === 'TREND_BUY' ? 'buy' : 'sell',
                            value: vppr,
                            bandTop: bandTop,
                            bandBottom: bandBottom
                        });

                        console.log(`🚀 [${symbol}] NOVO SINAL: ${signalType} | Major: ${majorValue}`);
                    }
                }

                // 6: Sinal de Major Trend (quando muda)
                if (currentMajorityTrend && majorityTrendChanged) {
                    const signalType = currentMajorityTrend === 'MAJOR_BUY' ? 'Major Buy' : 'Major Sell';
                    const side = currentMajorityTrend === 'MAJOR_BUY' ? 'buy' : 'sell';
                    const majorValue = getMajorValue();

                    const signalId = `${symbol}|${signalType}|${item.time}`;
                    const alreadyExists = nextVpprHistory[symbol]?.some(s => s.id === signalId);

                    if (!alreadyExists) {
                        signalsToAdd.push({
                            major: majorValue,
                            type: signalType,
                            side: side,
                            trend: currentTrend === 'TREND_BUY' ? 'buy' : 'sell',
                            value: vppr,
                            isMajorSignal: true
                        });

                        console.log(`🎯 [${symbol}] NOVO SINAL MAJOR: ${signalType} | Major: ${majorValue}`);
                    }
                }

                // Sinal de Volume EMA
                if (volumeEmaSignal && volumeEmaSignal !== state.lastSignalState) {
                    const majorValue = getMajorValue();
                    signalsToAdd.push({
                        major: majorValue,
                        type: volumeEmaSignal,
                        volumeEmaSignal: volumeEmaSignal,
                        side: volumeEmaSignal.includes('Increasing') ? 'PURCHASE_VOLUME' : 'SALES_VOLUME',
                        trend: currentTrend === 'TREND_BUY' ? 'buy' : 'sell',
                        value: vppr
                    });
                }


                // Adiciona os sinais ao histórico
                signalsToAdd.forEach(({ major, type, side, trend, value, bandTop, bandBottom, isMajorSignal, volumeEmaSignal }) => {
                    const signalId = `${symbol}|${type}|${item.time}`;

                    if (!nextVpprHistory[symbol]) nextVpprHistory[symbol] = [];

                    if (!nextVpprHistory[symbol].some(s => s.id === signalId)) {
                        const signalData = {
                            id: signalId,
                            signals: [
                                { name: "major", value: major || 'Neutral' },
                                { name: "type", value: type },
                                { name: "trend", value: trend },
                                { name: "side", value: side },
                                { name: "time", value: item.time },
                                { name: "vppr", value: vppr },
                                { name: "vppr_ema", value: vpprEma },
                                { name: "volumeEmaSignal", value: volumeEmaSignal }
                            ]
                        };

                        if (isMajorSignal) {
                            signalData.signals.push({ name: "is_major", value: true });
                        }

                        if (bandTop !== undefined) {
                            signalData.signals.push(
                                { name: "band_top", value: bandTop },
                                { name: "band_bottom", value: bandBottom }
                            );
                        }

                        nextVpprHistory[symbol].push(signalData);

                        if (nextVpprHistory[symbol].length > 30) {
                            nextVpprHistory[symbol] = nextVpprHistory[symbol].slice(-30);
                        }
                    }

                    state.lastSignalState = type;
                });

                state.lastVppr = vppr;
            });
        });

        vpprHistoryRef.current = nextVpprHistory;

        const signalsArray = Object.entries(nextVpprHistory).map(([symbol, signals]) => ({
            symbol,
            signals: signals.map(item => item.signals)
        }));

        setVpprData(signalsArray);

    }, [vpprGroups]);

    return { vpprData };
};

