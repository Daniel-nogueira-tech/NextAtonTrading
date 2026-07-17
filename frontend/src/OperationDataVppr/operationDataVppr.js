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
                    currentTrend: null,        // 'TREND_BUY' | 'TREND_SELL' | null
                    trendVpprUp: false,        // Flag para compra
                    trendVpprDown: false,      // Flag para venda
                    vpprHistory: [],
                    lastCrossTime: null,       // Para evitar múltiplos sinais no mesmo candle
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
                if (state.vpprHistory.length > 8) state.vpprHistory.shift();

                // ====================== BANDAS DE TENDÊNCIA ======================
                const percentage = Math.abs(vpprEma) * 0.01; // 1%
                const bandTop = vpprEma + percentage;
                const bandBottom = vpprEma - percentage;

                let currentTrend = null;
                let trendChanged = false;

                // ================================================================
                // LÓGICA DA STATE MACHINE
                // ================================================================

                // Estado 1: SEM TENDÊNCIA (modo neutro)
                // Só entra se não houver tendência definida
                if (state.currentTrend === null) {
                    // Verifica se saiu da banda para cima
                    if (vppr > bandTop) {
                        currentTrend = 'TREND_BUY';
                        state.trendVpprUp = true;
                        state.trendVpprDown = false;
                        trendChanged = true;
                        console.log(`🟢 [${symbol}] INICIANDO TREND BUY - VPPR: ${vppr.toFixed(4)} > Banda Top: ${bandTop.toFixed(4)}`);
                    }
                    // Verifica se saiu da banda para baixo
                    else if (vppr < bandBottom) {
                        currentTrend = 'TREND_SELL';
                        state.trendVpprDown = true;
                        state.trendVpprUp = false;
                        trendChanged = true;
                        console.log(`🔴 [${symbol}] INICIANDO TREND SELL - VPPR: ${vppr.toFixed(4)} < Banda Bottom: ${bandBottom.toFixed(4)}`);
                    }
                    // Continua neutro
                    else {
                        currentTrend = null;
                    }
                }

                // Estado 2: EM TREND_BUY
                else if (state.currentTrend === 'TREND_BUY') {
                    // Verifica se teve reversão para SELL (saiu para baixo da banda)
                    if (vppr < bandBottom) {
                        currentTrend = 'TREND_SELL';
                        state.trendVpprUp = false;
                        state.trendVpprDown = true;
                        trendChanged = true;
                        console.log(`🔄 [${symbol}] REVERSÃO: TREND_BUY → TREND_SELL - VPPR: ${vppr.toFixed(4)} < Banda Bottom: ${bandBottom.toFixed(4)}`);
                    }
                    // Continua em BUY (mesmo que volte para dentro da banda)
                    else {
                        currentTrend = 'TREND_BUY';
                        // Se entrar na banda, mantém a flag ativa
                        if (vppr <= bandTop && vppr >= bandBottom) {
                            console.log(`📊 [${symbol}] MANTENDO TREND_BUY (dentro da banda) - VPPR: ${vppr.toFixed(4)}`);
                        }
                    }
                }

                // Estado 3: EM TREND_SELL
                else if (state.currentTrend === 'TREND_SELL') {
                    // Verifica se teve reversão para BUY (saiu para cima da banda)
                    if (vppr > bandTop) {
                        currentTrend = 'TREND_BUY';
                        state.trendVpprDown = false;
                        state.trendVpprUp = true;
                        trendChanged = true;
                        console.log(`🔄 [${symbol}] REVERSÃO: TREND_SELL → TREND_BUY - VPPR: ${vppr.toFixed(4)} > Banda Top: ${bandTop.toFixed(4)}`);
                    }
                    // Continua em SELL (mesmo que volte para dentro da banda)
                    else {
                        currentTrend = 'TREND_SELL';
                        if (vppr <= bandTop && vppr >= bandBottom) {
                            console.log(`📊 [${symbol}] MANTENDO TREND_SELL (dentro da banda) - VPPR: ${vppr.toFixed(4)}`);
                        }
                    }
                }

                // Atualiza o estado atual
                state.currentTrend = currentTrend;

                // ================================================================
                // LOG PARA DEBUG DETALHADO
                // ================================================================
                console.log(`📊 [${symbol}] VPPR: ${vppr.toFixed(4)} | EMA: ${vpprEma.toFixed(4)}`);
                console.log(`📊 [${symbol}] Banda: [${bandBottom.toFixed(4)} - ${bandTop.toFixed(4)}]`);
                console.log(`📊 [${symbol}] Posição: ${vppr > bandTop ? '🔺 ACIMA' : vppr < bandBottom ? '🔻 ABAIXO' : '⏺ DENTRO'}`);
                console.log(`📊 [${symbol}] Trend Atual: ${currentTrend || '⏸ NEUTRO'}`);
                console.log(`📊 [${symbol}] Mudou: ${trendChanged ? '✅ SIM' : '❌ NÃO'}`);

                // ================================================================
                // DETECÇÃO DE ACUMULAÇÃO
                // ================================================================
                let accumulationSignal = null;

                if (state.vpprHistory.length >= 7) {
                    const recent = state.vpprHistory.slice(-7);
                    const values = recent.map(x => x.vppr);

                    const mean = values.reduce((a, b) => a + b, 0) / values.length;
                    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
                    const stdDev = Math.sqrt(variance);

                    const slope = (values[values.length - 1] - values[0]) / (values.length - 1);

                    const volatilityThreshold = Math.abs(mean) * 0.08;

                    if (stdDev < volatilityThreshold && Math.abs(slope) < volatilityThreshold * 0.5) {
                        const direction = slope > 0 ? 'BULLISH' : 'BEARISH';
                        accumulationSignal = `Accumulation ${direction}`;
                    }
                }

                // ================================================================
                // GERAÇÃO DE SINAIS (SÓ EMITE QUANDO HOUVER MUDANÇA)
                // ================================================================
                const signalsToAdd = [];

                // Sinal de Tendência - Só emite quando a tendência MUDA
                if (currentTrend && trendChanged) {
                    const signalType = currentTrend === 'TREND_BUY' ? 'Trend Buy' : 'Trend Sell';
                    const side = currentTrend === 'TREND_BUY' ? 'buy' : 'sell';
                    
                    // Verifica se é um sinal único (evita duplicatas)
                    const signalId = `${symbol}|${signalType}|${item.time}`;
                    const alreadyExists = nextVpprHistory[symbol]?.some(s => s.id === signalId);
                    
                    if (!alreadyExists) {
                        signalsToAdd.push({
                            type: signalType,
                            side: side,
                            trend: currentTrend === 'TREND_BUY' ? 'buy' : 'sell',
                            value: vppr,
                            bandTop: bandTop,
                            bandBottom: bandBottom
                        });
                        
                        console.log(`🚀 [${symbol}] NOVO SINAL: ${signalType}`);
                    }
                }

                // Sinal de Acumulação (só emite se mudou)
                if (accumulationSignal && accumulationSignal !== state.lastSignalState) {
                    signalsToAdd.push({
                        type: accumulationSignal,
                        side: accumulationSignal.includes('BULLISH') ? 'buy' : 'sell',
                        trend: currentTrend === 'TREND_BUY' ? 'buy' : 'sell',
                        value: vppr
                    });
                }

                // Adiciona os sinais ao histórico
                signalsToAdd.forEach(({ type, side, trend, value, bandTop, bandBottom }) => {
                    const signalId = `${symbol}|${type}|${item.time}`;

                    if (!nextVpprHistory[symbol]) nextVpprHistory[symbol] = [];

                    if (!nextVpprHistory[symbol].some(s => s.id === signalId)) {
                        const signalData = {
                            id: signalId,
                            signals: [
                                { name: "type", value: type },
                                { name: "trend", value: trend },
                                { name: "side", value: side },
                                { name: "time", value: item.time },
                                { name: "vppr", value: vppr },
                                { name: "vppr_ema", value: vpprEma },
                            ]
                        };

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


