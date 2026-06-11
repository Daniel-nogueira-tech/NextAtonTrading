import { useEffect, useMemo, useRef, useState } from 'react';

const normalizeAmrsiData = (rsi) => {
    if (!rsi) return [];

    const collection = rsi?.data ?? rsi;
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

export const useAmrsiData = (rsi) => {
    const [amrsiData, setAmrsiData] = useState([]);

    const amrsiHistoryRef = useRef({});
    const symbolsStateRef = useRef({});
    const lastTimestampRef = useRef({});

    const amrsiGroups = useMemo(() => normalizeAmrsiData(rsi), [rsi]);

    useEffect(() => {
        if (!amrsiGroups?.length) return;

        const nextAmrsiHistory = { ...amrsiHistoryRef.current };

        amrsiGroups.forEach(({ symbol, result }) => {
            if (!result?.length) return;

            // Filtrar apenas novos itens
            const lastTime = lastTimestampRef.current[symbol] || 0;
            const newItems = result.filter(item => {
                const itemTime = new Date(item.time).getTime();
                return itemTime > lastTime;
            });

            if (newItems.length === 0) return;

            // Atualiza timestamp
            const latestTime = Math.max(...newItems.map(item => new Date(item.time).getTime()));
            lastTimestampRef.current[symbol] = latestTime;

            // Inicializa estado
            if (!symbolsStateRef.current[symbol]) {
                symbolsStateRef.current[symbol] = {
                    lastSignalState: null,
                    lastAmrsi: null,
                };
            }
            const state = symbolsStateRef.current[symbol];

            newItems.forEach((item) => {
                if (!item?.time || typeof item.rsi_ma === 'undefined') return;

                const amrsi = Number(item.rsi_ma);
                if (!Number.isFinite(amrsi)) return;

                let signalType = '';
                let signalSide = '';

                // ====================== LÓGICA DE SINAL ======================
                const isOverbought = amrsi >= 70;
                const isOversold = amrsi <= 30;

                if (state.lastSignalState === 'Overbought' && amrsi <= 60) {
                    signalType = 'Partial Buy';
                    signalSide = 'buy';
                } else if (state.lastSignalState === 'Oversold' && amrsi >= 40) {
                    signalType = 'Partial Sell';
                    signalSide = 'sell';
                } else if (isOverbought && state.lastSignalState !== 'Overbought') {
                    signalType = 'Overbought';
                    signalSide = 'sell';
                } else if (isOversold && state.lastSignalState !== 'Oversold') {
                    signalType = 'Oversold';
                    signalSide = 'buy';
                }

                // ====================== GERAÇÃO DE SINAL ======================
                if (signalType) {
                    const signalId = `${symbol}|${signalType}|${item.time}`;

                    if (!nextAmrsiHistory[symbol]) {
                        nextAmrsiHistory[symbol] = [];
                    }

                    const alreadyExists = nextAmrsiHistory[symbol].some(s => s.id === signalId);

                    if (!alreadyExists) {
                     //   console.log(`🚀 SINAL AMRSI [${symbol}]: ${signalType} | RSI_MA: ${amrsi.toFixed(2)}`);

                        nextAmrsiHistory[symbol].push({
                            id: signalId,
                            signals: [
                                { name: "type", value: signalType },
                                { name: signalSide, value: amrsi },
                                { name: "time", value: item.time },
                                { name: "amrsi", value: amrsi },
                            ]
                        });

                        // ====================== LIMITE DE 30 ITENS ======================
                        if (nextAmrsiHistory[symbol].length > 30) {
                            nextAmrsiHistory[symbol] = nextAmrsiHistory[symbol].slice(-30);
                        }
                    }

                    state.lastSignalState = signalType;
                }

                state.lastAmrsi = amrsi;
            });
        });

        amrsiHistoryRef.current = nextAmrsiHistory;

        const signalsArray = Object.entries(nextAmrsiHistory).map(([symbol, signals]) => ({
            symbol,
            signals: signals.map(item => item.signals)
        }));

        setAmrsiData(signalsArray);
        
    }, [amrsiGroups]);

    return { amrsiData };
};