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
                    vpprHistory: [],        // Guarda últimos 8 valores para análise
                };
            }
            const state = symbolsStateRef.current[symbol];

            newItems.forEach((item) => {
                if (!item?.time || typeof item.vppr === 'undefined' || typeof item.vppr_ema === 'undefined') return;

                const vppr = Number(item.vppr);
                const vpprEma = Number(item.vppr_ema);

                if (!Number.isFinite(vppr) || !Number.isFinite(vpprEma)) return;

                // Atualiza histórico local dos últimos 8 valores
                state.vpprHistory.push({ vppr, time: item.time, vpprEma });
                if (state.vpprHistory.length > 8) state.vpprHistory.shift();

                // ====================== BANDAS DE TENDÊNCIA ======================
                const percentage = Math.abs(vpprEma) * 0.01;
                const bandTop = vpprEma + percentage;
                const bandBottom = vpprEma - percentage;

                let currentTrend = null;
                if (vppr > vpprEma) currentTrend = 'TREND_BUY';
                else if (vppr < vpprEma) currentTrend = 'TREND_SELL';

                // ====================== DETECÇÃO DE ACUMULAÇÃO ======================
                let accumulationSignal = null;

                if (state.vpprHistory.length >= 7) {
                    const recent = state.vpprHistory.slice(-7);
                    const values = recent.map(x => x.vppr);

                    const mean = values.reduce((a, b) => a + b, 0) / values.length;
                    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
                    const stdDev = Math.sqrt(variance);

                    const slope = (values[values.length - 1] - values[0]) / (values.length - 1); // tendência simples

                    const volatilityThreshold = Math.abs(mean) * 0.08; // 8% da média

                    // Acumulação = baixa volatilidade + movimento lateral fraco
                    if (stdDev < volatilityThreshold && Math.abs(slope) < volatilityThreshold * 0.5) {
                        const direction = slope > 0 ? 'BULLISH' : 'BEARISH';
                        accumulationSignal = `Accumulation ${direction}`;
                    }
                }

                // ====================== GERAÇÃO DE SINAIS ======================
                const signalsToAdd = [];

                // Sinal de Tendência
                if (currentTrend && currentTrend !== state.lastSignalState) {
                    signalsToAdd.push({
                        type: currentTrend === 'TREND_BUY' ? 'Trend Buy' : 'Trend Sell',
                        side: currentTrend === 'TREND_BUY' ? 'buy' : 'sell',
                        trend: currentTrend === 'TREND_BUY' ? 'buy' : 'sell',
                        value: vppr
                    });
                }

                // Sinal de Acumulação
                if (accumulationSignal && accumulationSignal !== state.lastSignalState) {
                    signalsToAdd.push({
                        type: accumulationSignal,
                        side: accumulationSignal.includes('BULLISH') ? 'buy' : 'sell',
                        trend: currentTrend === 'TREND_BUY' ? 'buy' : 'sell',
                        value: vppr
                    });
                }

                signalsToAdd.forEach(({ type, side, trend, value }) => {
                    const signalId = `${symbol}|${type}|${item.time}`;

                    if (!nextVpprHistory[symbol]) nextVpprHistory[symbol] = [];

                    if (!nextVpprHistory[symbol].some(s => s.id === signalId)) {
                        //          console.log(`🚀 SINAL VPPR [${symbol}]: ${type} | VPPR: ${vppr.toFixed(2)}`);

                        nextVpprHistory[symbol].push({
                            id: signalId,
                            signals: [
                                { name: "type", value: type },
                                { name: "trend", value: trend },
                                { name: "side", value: side},
                                { name: "time", value: item.time },
                                { name: "vppr", value: vppr },
                                { name: "vppr_ema", value: vpprEma },
                            ]
                        });

                        // Limite de 30 sinais
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
        //console.log('vppr',vpprData);
        

    }, [vpprGroups]);

    return { vpprData };
};


