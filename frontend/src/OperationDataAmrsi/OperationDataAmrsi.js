import { useContext } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ContextGraphics } from '../ContextGraphics/ContextGraphics';

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

const normalizeCollection = (payload) => {
    if (!payload) return [];
    const collection = payload?.data ?? payload;
    return Array.isArray(collection) ? collection : [collection];
};

const getTimeValue = (point) => {
    if (!point) return null;
    const rawTime = point.time ?? point.Tempo ?? point.closeTime ?? point.openTime;
    if (rawTime == null) return null;
    if (typeof rawTime === 'number') {
        return rawTime > 9999999999 ? rawTime : rawTime * 1000;
    }
    if (typeof rawTime === 'string') {
        const parsed = Date.parse(rawTime.replace(' ', 'T'));
        return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
};

const getPointPrice = (point) => {
    if (!point) return null;
    return point.price ?? point.Fechamento ?? point.close ?? point.value ?? point.lastPrice ?? null;
};

const getSymbolPriceSeries = (fullPricePayload) => {
    const seriesMap = {};

    normalizeCollection(fullPricePayload).forEach((item) => {
        const symbol = item?.symbol;
        if (!symbol) return;
        const seriesKey = Array.isArray(item?.data)
            ? 'data'
            : Array.isArray(item?.result)
                ? 'result'
                : Array.isArray(item?.prices)
                    ? 'prices'
                    : Array.isArray(item?.price)
                        ? 'price'
                        : null;

        if (!seriesKey) return;

        const series = item[seriesKey]
            .map((point) => ({
                time: getTimeValue(point),
                price: getPointPrice(point),
            }))
            .filter((point) => point.time != null && point.price != null)
            .sort((a, b) => a.time - b.time);

        if (series.length) {
            seriesMap[symbol] = series;
        }
    });

    return seriesMap;
};

const getPriceAtSignalTime = (series, signalTime) => {
    if (!Array.isArray(series) || series.length === 0 || signalTime == null) return null;
    const exact = series.find(point => point.time === signalTime);
    if (exact) return exact.price;

    let previous = null;
    for (const point of series) {
        if (point.time <= signalTime) {
            previous = point;
        } else {
            break;
        }
    }

    return previous ? previous.price : series[series.length - 1].price;
};

export const useAmrsiData = (rsi) => {
    const {amrsiData, setAmrsiData, fullPrice} = useContext(ContextGraphics)

    const amrsiHistoryRef = useRef({});
    const symbolsStateRef = useRef({});
    const lastTimestampRef = useRef({});

    const amrsiGroups = useMemo(() => normalizeAmrsiData(rsi), [rsi]);
    const fullPriceSeries = useMemo(() => getSymbolPriceSeries(fullPrice), [fullPrice]);

    useEffect(() => {
        if (!amrsiGroups?.length) return;

        const nextAmrsiHistory = { ...amrsiHistoryRef.current };

        amrsiGroups.forEach(({ symbol, result }) => {
            if (!result?.length) return;

            // Filtrar apenas novos itens usando tempo normalizado
            const lastTime = lastTimestampRef.current[symbol] || 0;
            const newItems = result
                .map((item) => ({
                    item,
                    time: getTimeValue(item) || new Date(String(item.time).replace(' ', 'T')).getTime()
                }))
                .filter(({ time }) => Number.isFinite(time) && time > lastTime)
                .map(({ item }) => item);

            if (newItems.length === 0) return;

            // Atualiza timestamp usando tempo normalizado
            const latestTime = Math.max(...newItems.map((item) => {
                const timeValue = getTimeValue(item) || new Date(String(item.time).replace(' ', 'T')).getTime();
                return Number.isFinite(timeValue) ? timeValue : 0;
            }));
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
                const signalTime = getTimeValue(item) || new Date(String(item.time).replace(' ', 'T')).getTime();
                const signalPrice = getPriceAtSignalTime(fullPriceSeries[symbol], signalTime);

                // ====================== LÓGICA DE SINAL ======================
                const isOverbought = amrsi >= 70;
                const isOversold = amrsi <= 30;

                if (state.lastSignalState === 'OVERBOUGHT' && amrsi <= 60) {
                    signalType = 'PARTIAL_BUY';
                    signalSide = 'buy';
                } else if (state.lastSignalState === 'OVERSOLD' && amrsi >= 40) {
                    signalType = 'PARTIAL_SELL';
                    signalSide = 'sell';
                } else if (isOverbought && state.lastSignalState !== 'OVERBOUGHT') {
                    signalType = 'OVERBOUGHT';
                    signalSide = 'sell';
                } else if (isOversold && state.lastSignalState !== 'OVERSOLD') {
                    signalType = 'OVERSOLD';
                    signalSide = 'buy';
                }

                // ====================== GERAÇÃO DE SINAL ======================
                if (signalType) {
                    const normalizedTime = signalTime || new Date(String(item.time).replace(' ', 'T')).getTime();
                    const signalId = `${symbol}|${signalType}|${normalizedTime}|${signalPrice ?? 'noprice'}`;

                    if (!nextAmrsiHistory[symbol]) {
                        nextAmrsiHistory[symbol] = [];
                    }

                    const alreadyExists = nextAmrsiHistory[symbol].some(s => s.id === signalId);

                    if (!alreadyExists) {
                     //   console.log(`🚀 SINAL AMRSI [${symbol}]: ${signalType} | RSI_MA: ${amrsi.toFixed(2)} | price: ${signalPrice}`);

                        nextAmrsiHistory[symbol].push({
                            id: signalId,
                            signals: [
                                { name: "type", value: signalType },
                                { name: signalSide, value: amrsi },
                                { name: "time", value: normalizedTime },
                                { name: "amrsi", value: amrsi },
                                { name: "price", value: signalPrice ?? null }
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
        //console.log("amrsi signals:", signalsArray);
        
        
    }, [amrsiGroups]);

    return { amrsiData };
};