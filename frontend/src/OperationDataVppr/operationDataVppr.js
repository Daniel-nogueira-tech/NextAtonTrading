import { useEffect, useMemo, useRef, useState } from 'react';

// Função para normalizar dados de Vppr (mantida)
const normalizeVpprData = (vppr) => {
    if (!vppr) return [];

    const collection = vppr?.data ?? vppr;
    const groups = Array.isArray(collection) ? collection : [collection];

    return groups.flatMap((group, index) => {
        if (Array.isArray(group)) {
            return [{ symbol: `SYMBOL_${index + 1}`, result: group }];
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
    const [vpprData, setVpprData] = useState([]);

    const vpprHistoryRef = useRef({});
    const symbolsStateRef = useRef({});
    const lastTimestampRef = useRef({});

    const vpprGroups = useMemo(() => normalizeVpprData(vppr), [vppr]);

    useEffect(() => {
        if (!vpprGroups?.length) return;

        const nextVpprHistory = { ...vpprHistoryRef.current };

        vpprGroups.forEach(({ symbol, result }) => {
            if (!result?.length) return;

            // 🔥 CORREÇÃO 1: Usar newItems e atualizar timestamp
            const lastTime = lastTimestampRef.current[symbol] || 0;
            const newItems = result.filter(item => new Date(item.time).getTime() > lastTime);

            if (newItems.length === 0) return;

            // Atualiza o último timestamp processado
            const lastNewItemTime = newItems[newItems.length - 1].time;
            lastTimestampRef.current[symbol] = new Date(lastNewItemTime).getTime();

            // Inicializa estado por símbolo
            if (!symbolsStateRef.current[symbol]) {
                symbolsStateRef.current[symbol] = {
                    lastSignalState: null,
                    lastVppr: null,
                    currentSignalState: null,
                    trendUp: false,
                    trendDown: false,
                };
            }
            const state = symbolsStateRef.current[symbol];

            // 🔥 CORREÇÃO 2: Usar newItems em vez de result
            newItems.forEach((item) => {
                if (!item?.time || typeof item.vppr === 'undefined' || typeof item.vppr_ema === 'undefined') return;

                const vppr = Number(item.vppr);
                const vpprEma = Number(item.vppr_ema);

                if (!Number.isFinite(vppr) || !Number.isFinite(vpprEma)) return;

                // ====================== BANDAS ======================
                const percentage = Math.abs(vpprEma) * 0.05;
                const bandTop = vpprEma + percentage;
                const bandBottom = vpprEma - percentage;

                // ====================== DETERMINAÇÃO DO ESTADO ATUAL ======================
                vppr > 0 ? state.trendUp = true : state.trendDown = true;

                if (vppr > bandTop) {
                    state.currentSignalState = 'TREND_BUY';
                    state.trendDown = false;
                } else if (vppr < bandBottom) {
                    state.currentSignalState = 'TREND_SELL';
                    state.trendUp = false;
                }


                // ====================== GERAÇÃO DE SINAL ======================
                const shouldGenerateSignal =
                    state.currentSignalState !== null &&
                    state.currentSignalState !== state.lastSignalState;

                if (shouldGenerateSignal) {
                    let signalType = '';
                    let signalSide = '';

                    switch (state.currentSignalState) {
                        case 'TREND_BUY':
                            signalType = 'Trend Buy';
                            signalSide = 'buy';
                            break;
                        case 'TREND_SELL':
                            signalType = 'Trend Sell';
                            signalSide = 'sell';
                            break;
                    }

                    // Verifica se o último sinal já é do mesmo tipo
                    const lastSignalsForSymbol = nextVpprHistory[symbol];
                    let lastType = null;
                    if (lastSignalsForSymbol && lastSignalsForSymbol.length > 0) {
                        const lastSignalObj = lastSignalsForSymbol[lastSignalsForSymbol.length - 1];
                        const typeField = lastSignalObj.signals.find(s => s.name === 'type');
                        lastType = typeField ? typeField.value : null;
                    }

                    // Só adiciona se for um tipo diferente do último
                    if (lastType !== signalType) {
                        console.log(`🚀 SINAL GERADO [${symbol}]: ${signalType} | VPPR: ${vppr.toFixed(4)} | EMA: ${vpprEma.toFixed(4)}`);

                        const signalId = `${symbol}|${signalType}|${item.time}`;

                        if (!nextVpprHistory[symbol]) nextVpprHistory[symbol] = [];

                        const alreadyExists = nextVpprHistory[symbol].some(s => s.id === signalId);

                        if (!alreadyExists) {
                            nextVpprHistory[symbol].push({
                                id: signalId,
                                signals: [
                                    { name: "type", value: signalType },
                                    { name: signalSide, value: vppr },
                                    { name: "time", value: item.time },
                                    { name: "vppr", value: vppr },
                                    { name: "vppr_ema", value: vpprEma },
                                ]
                            });
                        }

                        state.lastSignalState = state.currentSignalState;
                    }
                }

                state.lastVppr = vppr;
            });
        });

        // Atualiza histórico e estado
        vpprHistoryRef.current = nextVpprHistory;

        const signalsArray = Object.entries(nextVpprHistory).map(([symbol, signals]) => ({
            symbol,
            signals: signals.map(item => item.signals)
        }));

        setVpprData(signalsArray);
        console.log("vpprData :", vpprData);


    }, [vpprGroups]);

    return { vpprData };
};