// useOperatingInputs.js
import { useMemo, useEffect, useContext, useRef, useState, useCallback } from 'react';
import { ContextGraphics } from '../../ContextGraphics/ContextGraphics.jsx';
import Swal from 'sweetalert2'
import { calculatePositionSize as calculatePositionSizeFromSignals } from '../CalculateOperation/CalculateOperation.js'
import { parseDecimal } from '../../utils/parseDecimal.js'

// Função genérica que aceita arrays diretos, arrays de arrays, objetos com result/operations/signals e preços.
const normalizeCollection = (collection, symbolPrefix, keys = ["buy"], dataKey = "result") => {
    if (!collection) return [];

    const groups = Array.isArray(collection) ? collection : [collection];

    return groups.flatMap((group, index) => {
        if (Array.isArray(group)) {
            if (group.length > 0 && group.every(item => Array.isArray(item))) {
                return group.flatMap((nestedGroup, nestedIndex) => {
                    if (!Array.isArray(nestedGroup)) return [];
                    return [{
                        symbol: `${symbolPrefix}_${index + 1}_${nestedIndex + 1}`,
                        result: nestedGroup.map(item => normalizeItem(item, keys))
                    }];
                });
            }

            if (group.length > 0 && group.every(item => item && typeof item === "object" && !Array.isArray(item) && ("Fechamento" in item || "close" in item || "price" in item || "symbol" in item))) {
                return [{
                    symbol: group[0]?.symbol || `${symbolPrefix}_${index + 1}`,
                    result: group.map(item => normalizeItem(item, keys))
                }];
            }

            return [{
                symbol: `${symbolPrefix}_${index + 1}`,
                result: group.map(item => normalizeItem(item, keys))
            }];
        }

        if (group && typeof group === "object") {
            const candidateItems = Array.isArray(group[dataKey])
                ? group[dataKey]
                : Array.isArray(group.result)
                    ? group.result
                    : Array.isArray(group.operations)
                        ? group.operations
                        : Array.isArray(group.signals)
                            ? group.signals
                            : Array.isArray(group.prices)
                                ? group.prices
                                : Array.isArray(group.price)
                                    ? group.price
                                    : Array.isArray(group.data)
                                        ? group.data
                                        : null;

            if (candidateItems) {
                return [{
                    symbol: group.symbol || `${symbolPrefix}_${index + 1}`,
                    result: candidateItems.map(item => normalizeItem(item, keys))
                }];
            }
        }

        return [];
    });
};

const normalizeItem = (item, keys) => {
    if (item == null) return {};

    if (Array.isArray(item)) {
        return normalizeItem(item.reduce((acc, entry) => {
            if (entry && typeof entry === "object") {
                if (entry.name && entry.value !== undefined) {
                    acc[entry.name] = entry.value;
                } else {
                    Object.assign(acc, entry);
                }
            }
            return acc;
        }, {}), keys);
    }

    if (typeof item !== "object") {
        return {};
    }

    const normalized = {};
    keys.forEach(key => {
        const directValue = item[key];
        const alternateValue = item[key.toLowerCase()];
        const camelValue = item[key.charAt(0).toLowerCase() + key.slice(1)];
        normalized[key] = directValue ?? alternateValue ?? camelValue ?? null;
    });

    if (item.time || item.Time || item.tempo || item.Tempo) {
        normalized.time = item.time ?? item.Time ?? item.tempo ?? item.Tempo;
    }

    if (item.operation && Array.isArray(item.operation)) {
        const operationObj = item.operation.reduce((acc, entry) => {
            if (entry && typeof entry === "object" && "name" in entry && "value" in entry) {
                acc[entry.name] = entry.value;
            }
            return acc;
        }, {});

        keys.forEach(key => {
            if (normalized[key] == null || normalized[key] === undefined) {
                normalized[key] = operationObj[key] ?? null;
            }
        });
    }

    if (item.symbol) {
        normalized.symbol = item.symbol;
    }

    return normalized;
};

export const useOperatingInputs = () => {
    const { sendOperationData: sendOperationDataToContext, signalsBySymbolState, setSignalsBySymbolState, retestPointsStateRef, retestPointsStatePrimaryRef, amrsiDataRef, vpprDataRef, fullPrice, buttonOperation, setButtonOperation, setResultOperations, activeSymbol, balanceAndRisk } = useContext(ContextGraphics);

    const calculatePositionSize = useCallback((signal, history, settings = balanceAndRisk) => {
        const balance = parseDecimal(settings?.balance);
        const risk = Number(settings?.risk) / 100;
        return calculatePositionSizeFromSignals(signal, history, { balance, risk });
    }, [balanceAndRisk]);

    const getTrendBandBounds = (trendItem) => {
        if (!trendItem) return { low: NaN, high: NaN };
        const low = Number(trendItem.BandLow ?? (trendItem.pivot != null && trendItem.limite != null ? trendItem.pivot - trendItem.limite / 2 : NaN));
        const high = Number(trendItem.BandHigh ?? (trendItem.pivot != null && trendItem.limite != null ? trendItem.pivot + trendItem.limite / 2 : NaN));
        return { low, high };
    };

    const getTrendIdentity = (trendItem) => {
        if (!trendItem) return null;
        return [trendItem.type, trendItem.time, trendItem.buy, trendItem.sell, trendItem.BandLow, trendItem.BandHigh].join('|');
    };

    const isPriceOutsideBand = (trendItem, closePrice) => {
        const { low, high } = getTrendBandBounds(trendItem);
        if (closePrice == null || !Number.isFinite(low) || !Number.isFinite(high)) return false;
        return closePrice < low || closePrice > high;
    };

    const isPriceInsideBand = (trendItem, closePrice) => !isPriceOutsideBand(trendItem, closePrice);

    // ====================== HOOKS DOS INDICADORES ======================
    const trend = useMemo(
        () => normalizeCollection(retestPointsStateRef.current, "TREND", ["type", "time", "buy", "sell", "stop", "limite", "BandLow", "BandHigh", "pivot", "pivotExit"], "operations"),
        [retestPointsStateRef.current]
    );

    const trendPrimary = useMemo(
        () => normalizeCollection(retestPointsStatePrimaryRef.current, "TREND_PRIMARY", ["type", "time", "buy", "sell", "stop"], "operations"),
        [retestPointsStatePrimaryRef.current]
    );

    const price = useMemo(
        () => normalizeCollection(fullPrice, "PRICE", ["Fechamento", "Tempo"], "result"),
        [fullPrice]
    );

    const vppr = useMemo(
        () => normalizeCollection(vpprDataRef.current, "VPPR", ["type", "vpprTrend", "time", "major", "volumeEmaSignal"], "signals"),
        [vpprDataRef.current]
    );

    const amrsi = useMemo(
        () => normalizeCollection(amrsiDataRef.current, "AMRSI", ["type", "time"], "signals"),
        [amrsiDataRef.current]
    );

    // Usar useRef para persistir as flags entre renders
    const flagsBySymbolRef = useRef(JSON.parse(localStorage.getItem("flagsBySymbol")) || {});
    const signalsHistoryRef = useRef(signalsBySymbolState || {});

    useEffect(() => {
        signalsHistoryRef.current = signalsBySymbolState || {};
    }, [signalsBySymbolState]);

    const sendOperationData = useCallback((operation, _signals, lastSignal) => (
        sendOperationDataToContext(operation, signalsHistoryRef.current, lastSignal)
    ), [sendOperationDataToContext]);

    const calculateOrder = useCallback(async (side, stopOverride, settings) => {
        const action = side === 'sell' ? 'SELL' : 'BUY';
        const indicatorSymbol = (collection) => (
            collection.find(item => item.symbol === activeSymbol) || collection[0]
        );
        const latestTrend = indicatorSymbol(trend)?.result?.at(-1);
        const latestPrice = indicatorSymbol(price)?.result?.at(-1);
        const entryPrice = Number(latestPrice?.Fechamento ?? latestPrice?.close ?? latestPrice?.price);
        const matchingSignals = (signalsBySymbolState?.[activeSymbol] || [])
            .filter(signal => String(signal?.action || '').toUpperCase() === action);
        const latestSignal = matchingSignals.at(-1);

        const sourceSignal = latestSignal || {
            symbol: activeSymbol,
            action,
            entryPrice,
            avgEntryPrice: entryPrice,
            stop: latestTrend?.stop,
            time: latestPrice?.Tempo ?? latestPrice?.time,
            trendSecondary: latestTrend?.type,
        };
        const stop = parseDecimal(stopOverride);
        const signal = {
            ...sourceSignal,
            symbol: activeSymbol || sourceSignal.symbol,
            action,
            entryPrice: Number.isFinite(entryPrice) && entryPrice > 0
                ? entryPrice
                : Number(sourceSignal.entryPrice ?? sourceSignal.avgEntryPrice),
            avgEntryPrice: Number.isFinite(entryPrice) && entryPrice > 0
                ? entryPrice
                : Number(sourceSignal.avgEntryPrice ?? sourceSignal.entryPrice),
            stop: Number.isFinite(stop) && stop > 0
                ? stop
                : Number(sourceSignal.stop ?? sourceSignal.stopPrice),
        };

        const normalizedEntry = Number(signal.entryPrice);
        const normalizedStop = Number(signal.stop);
        if (
            !Number.isFinite(normalizedEntry) ||
            normalizedEntry <= 0 ||
            !Number.isFinite(normalizedStop) ||
            normalizedStop <= 0 ||
            (action === 'BUY' && normalizedStop >= normalizedEntry) ||
            (action === 'SELL' && normalizedStop <= normalizedEntry)
        ) {
            return null;
        }

        return calculatePositionSize(signal, signalsBySymbolState, settings);
    }, [activeSymbol, calculatePositionSize, price, signalsBySymbolState, trend]);

    const executeOrder = useCallback(async (order) => {
        const symbol = order?.symbol || activeSymbol;
        const action = String(order?.side || '').toLowerCase();
        const executionPrice = Number(order?.price);
        const timestamp = new Date().toISOString();
        const symbolPrice = Number(
            price.find(item => item.symbol === symbol)?.result?.at(-1)?.Fechamento ??
            price[0]?.result?.at(-1)?.Fechamento
        );
        const finalPrice = Number.isFinite(executionPrice) && executionPrice > 0
            ? executionPrice
            : symbolPrice;

        if (!symbol || !Number.isFinite(finalPrice) || finalPrice <= 0) {
            throw new Error('Não há preço válido para executar a operação.');
        }

        const history = {
            ...(signalsHistoryRef.current || {}),
            [symbol]: [...(signalsHistoryRef.current?.[symbol] || [])],
        };
        const symbolSignals = history[symbol];
        const flags = flagsBySymbolRef.current[symbol] || {
            inputExecuted: false,
            isOperation: false,
            lastSignal: null,
            numberEntries: 0,
            signalCount: 0,
            upwardTrendCurrent: false,
            downwardTrendCurrent: false,
            exceededBand: false,
            blockedTrendIdentity: null,
        };
        flagsBySymbolRef.current[symbol] = flags;

        let signal;
        let calculationSignal;

        if (action === 'buy' || action === 'sell') {
            const signalAction = action.toUpperCase();
            const stop = Number(order.stop);
            if (!Number.isFinite(stop) || stop <= 0) {
                throw new Error('Informe um stop válido para executar a operação.');
            }
            if (
                (signalAction === 'BUY' && stop >= finalPrice) ||
                (signalAction === 'SELL' && stop <= finalPrice)
            ) {
                throw new Error('O stop precisa ficar abaixo do preço na compra e acima na venda.');
            }

            const trendItem = trend.find(item => item.symbol === symbol)?.result?.at(-1);
            const lastEntryIndex = symbolSignals.reduce((latestIndex, item, index) => (
                ['BUY', 'SELL'].includes(String(item?.action || '').toUpperCase())
                    ? index
                    : latestIndex
            ), -1);
            const lastExitIndex = symbolSignals.reduce((latestIndex, item, index) => (
                ['EXIT_BUY', 'EXIT_SELL', 'STOP_BUY', 'STOP_SELL'].includes(String(item?.action || '').toUpperCase())
                    ? index
                    : latestIndex
            ), -1);
            const currentEntry = lastEntryIndex > lastExitIndex
                ? symbolSignals[lastEntryIndex]
                : null;
            const count = String(currentEntry?.action || '').toUpperCase() === signalAction
                ? Math.max(1, Number(currentEntry.count) || 1) + 1
                : 1;
            const previousAverage = Number(currentEntry?.avgEntryPrice ?? currentEntry?.entryPrice);
            const averageEntry = count > 1 && Number.isFinite(previousAverage)
                ? ((previousAverage * (count - 1)) + finalPrice) / count
                : finalPrice;

            signal = {
                symbol,
                action: signalAction,
                entryPrice: averageEntry.toFixed(8),
                avgEntryPrice: averageEntry.toFixed(8),
                expectedPriceBuy: signalAction === 'BUY' ? finalPrice.toFixed(8) : undefined,
                expectedPriceSell: signalAction === 'SELL' ? finalPrice.toFixed(8) : undefined,
                stop: stop.toFixed(8),
                count,
                time: timestamp,
                timestamp,
                trendSecondary: trendItem?.type,
                quantity: Number(order.quantity) || undefined,
            };

            if (String(currentEntry?.action || '').toUpperCase() === signalAction) {
                const index = symbolSignals.lastIndexOf(currentEntry);
                symbolSignals[index] = signal;
            } else {
                symbolSignals.push(signal);
            }

            flags.inputExecuted = true;
            flags.isOperation = true;
            flags.isManualOperation = true;
            flags.numberEntries = count;
            flags.signalCount = (Number(flags.signalCount) || 0) + 1;
            flags.lastSignal = signal;
            flags.upwardTrendCurrent = signalAction === 'BUY';
            flags.downwardTrendCurrent = signalAction === 'SELL';
            calculationSignal = signal;
        } else if (action === 'exit') {
            const lastEntryIndex = symbolSignals.reduce((latestIndex, item, index) => (
                ['BUY', 'SELL'].includes(String(item?.action || '').toUpperCase())
                    ? index
                    : latestIndex
            ), -1);
            const lastExitIndex = symbolSignals.reduce((latestIndex, item, index) => (
                ['EXIT_BUY', 'EXIT_SELL', 'STOP_BUY', 'STOP_SELL'].includes(String(item?.action || '').toUpperCase())
                    ? index
                    : latestIndex
            ), -1);
            const activeEntry = lastEntryIndex > lastExitIndex
                ? symbolSignals[lastEntryIndex]
                : null;

            if (!activeEntry) {
                throw new Error(`Não há posição aberta para ${symbol}.`);
            }

            const entryAction = String(activeEntry.action).toUpperCase();
            const count = Math.max(
                1,
                Math.round(Number(activeEntry.count) || Number(flags.numberEntries) || 1)
            );
            signal = {
                symbol,
                action: entryAction === 'BUY' ? 'EXIT_BUY' : 'EXIT_SELL',
                exitPrice: finalPrice.toFixed(8),
                count,
                time: timestamp,
                timestamp,
                closed: true,
                closedAt: timestamp,
            };
            symbolSignals.push(signal);

            flags.inputExecuted = false;
            flags.isOperation = false;
            flags.isManualOperation = false;
            flags.numberEntries = 0;
            flags.upwardTrendCurrent = false;
            flags.downwardTrendCurrent = false;
            flags.exceededBand = false;
            flags.blockedTrendIdentity = null;
            flags.lastSignal = signal;
            calculationSignal = activeEntry;
        } else {
            throw new Error('Ação de operação inválida.');
        }

        if (symbolSignals.length > 100) {
            history[symbol] = symbolSignals.slice(-100);
        }
        signalsHistoryRef.current = history;
        localStorage.setItem('flagsBySymbol', JSON.stringify(flagsBySymbolRef.current));
        setSignalsBySymbolState(history);
        setButtonOperation({ buy: false, sell: false, exit: false });

        const result = await calculatePositionSize(calculationSignal, history);
        if (!result) {
            throw new Error('A operação foi registrada, mas não foi possível calcular os resultados.');
        }
        setResultOperations(result);
        await sendOperationData(Promise.resolve(result), history, signal);

        return { signal, result };
    }, [
        activeSymbol,
        calculatePositionSize,
        price,
        sendOperationData,
        setButtonOperation,
        setResultOperations,
        setSignalsBySymbolState,
        trend,
    ]);

    //Usar useRef para armazenar o último trend de cada símbolo
    const lastTrendRef = useRef({});
    const [lastTrendState, setLastTrendState] = useState({});
    const lastTrendRefPrimary = useRef({});
    const [lastTrendStatePrimary, setLastTrendStatePrimary] = useState({});
    const lastVpprRef = useRef({});
    const [lastVpprState, setLastVpprState] = useState({});
    const lastAmrsiRef = useRef({});
    const [lastAmrsiState, setLastAmrsiState] = useState({});
    const operationCalculationIdRef = useRef(0);
    const operationResults = {};




    useEffect(() => {
        const allSignals = Object.values(signalsBySymbolState || {}).flatMap(signals => (
            Array.isArray(signals) ? signals : []
        ));

        const entries = allSignals.filter(signal => (
            ['BUY', 'SELL'].includes(String(signal?.action).toUpperCase())
        ));
        const lastEntry = entries.sort((first, second) => (
            new Date(second?.timestamp || second?.time || 0).getTime() -
            new Date(first?.timestamp || first?.time || 0).getTime()
        ))[0];

        if (!lastEntry) {
            return;
        }

        const calculationId = ++operationCalculationIdRef.current;
        let cancelled = false;

        calculatePositionSize(lastEntry, signalsBySymbolState)
            .then(result => {
                if (!cancelled && calculationId === operationCalculationIdRef.current && result) {
                    setResultOperations(result);
                }
            })
            .catch(error => {
                console.error('Erro ao atualizar resultado das operações:', error);
            });

        return () => {
            cancelled = true;
        };
    }, [signalsBySymbolState, balanceAndRisk, calculatePositionSize, setResultOperations]);

    useEffect(() => {
        if (price.length === 0 || trend.length === 0 || trendPrimary.length === 0 || amrsi.length === 0 || vppr.length === 0) {
            console.log("⏳ Aguardando dados...");
            return;
        }

        // Lista de todos símbolos presentes (extraindo de forma consistente)
        const allSymbols = [
            ...new Set([
                ...trend.map(item => item.symbol),
                ...trendPrimary.map(item => item.symbol),
                ...amrsi.map(item => item.symbol),
                ...vppr.map(item => item.symbol),
                ...price.map(item => item.symbol),
            ])
        ];

        const signalsBySymbol = {};
        const newLastTrends = {};
        const newLastTrendsPrimary = {};
        const newLastVppr = {};
        const newLastAmrsi = {};

        // salva no localStorage
        localStorage.setItem("flagsBySymbol", JSON.stringify(flagsBySymbolRef.current));

        // Intera sobre os indicadores para verificar entradas
        allSymbols.forEach(symbol => {
            // Inicializa flags para cada símbolo
            if (!flagsBySymbolRef.current[symbol]) {
                flagsBySymbolRef.current[symbol] = {
                    inputExecutedBreakup: false,
                    inputExecuted: false,
                    upwardTrendCurrent: false,
                    downwardTrendCurrent: false,
                    downwardAmrsiCurrent: false,
                    upwardAmrsiCurrent: false,
                    exceededBand: false,
                    blockedTrendIdentity: null,
                    isOperation: false,
                    isManualOperation: false,
                    lastSignal: null,
                    signalCount: 0,
                    confirmationPending: false,
                    numberEntries: 0,
                    entryPoints: {},
                };
            }


            // Busca correta usando o symbol
            const lastTrendArray = trend.find(item => item.symbol === symbol)?.result || [];
            const lastTrendPrimaryArray = trendPrimary.find(item => item.symbol === symbol)?.result || [];
            const lastAmrsiArray = amrsi.find(item => item.symbol === symbol)?.result || [];
            const lastVpprArray = vppr.find(item => item.symbol === symbol)?.result || [];
            const lastPriceArray = price.find(item => item.symbol === symbol)?.result || [];

            // Pega o valor mais recente
            const lastTrend = lastTrendArray[lastTrendArray.length - 1];
            const lastTrendPrimary = lastTrendPrimaryArray[lastTrendPrimaryArray.length - 1];
            const lastAmrsi = lastAmrsiArray[lastAmrsiArray.length - 1];
            const lastVppr = lastVpprArray[lastVpprArray.length - 1];
            const lastPrice = lastPriceArray[lastPriceArray.length - 1];

            // Verifica se os dados necessários existem
            if (!lastTrend || !lastTrendPrimary || !lastPrice || !lastVppr || !lastAmrsi) {
                console.log(`⚠️ [${symbol}] Dados insuficientes:`, {
                    lastTrend: !!lastTrend,
                    lastTrendPrimary: !!lastTrendPrimary,
                    lastPrice: !!lastPrice
                });
                return;
            }

            const previousTrendIdentity = getTrendIdentity(lastTrendRef.current[symbol]);
            const currentTrendIdentity = getTrendIdentity(lastTrend);
            const flags = flagsBySymbolRef.current[symbol];

            // Assignar os últimos trends aos estados e refs
            if (lastTrend) {
                newLastTrends[symbol] = lastTrend;
                lastTrendRef.current[symbol] = lastTrend;
            }

            if (lastTrendPrimary) {
                newLastTrendsPrimary[symbol] = lastTrendPrimary;
                lastTrendRefPrimary.current[symbol] = lastTrendPrimary;
            }
            if (lastVppr) {
                newLastVppr[symbol] = lastVppr;
                lastVpprRef.current[symbol] = lastVppr;
            }
            if (lastAmrsi) {
                newLastAmrsi[symbol] = lastAmrsi;
                lastAmrsiRef.current[symbol] = lastAmrsi;
            }


            let signal = null;

            // Tipos para entrada
            const TYPE_BUY = ["PIVOT_BUY_TREND", "PIVOT_BUY_RALLY", "PIVOT_BUY_RALLY_REVERSE", "PIVOT_BUY_RALLY_SEC", "PIVOT_BUY_RALLY_REACT_SEC", "PIVOT_BUY_RALLY_SEC_LATE"];//"ENTRY_BUY_RALLY_SEC", "ENTRY_BUY_RALLY_SEC_LATE"
            const TYPE_SELL = ["PIVOT_SELL_TREND", "PIVOT_SELL_RALLY", "PIVOT_SELL_RALLY_REVERSE", "PIVOT_SELL_RALLY_SEC", "PIVOT_SELL_RALLY_REACT_SEC", "PIVOT_SELL_RALLY_SEC_LATE"]; //"ENTRY_SELL_RALLY_SEC",, "ENTRY_SELL_RALLY_SEC_LATE"
            const TYPE_BUY_PRI = ["PIVOT_BUY_TREND", "PIVOT_BUY_RALLY", "PIVOT_BUY_RALLY_SEC", "PIVOT_BUY_RALLY_REVERSE", "PIVOT_BREAK_BUY", " PIVOT_BREAK_RALLY_BUY", "PIVOT_BUY_RALLY_REACT_SEC", "PIVOT_BUY_RALLY_SEC_LATE"];
            const TYPE_SELL_PRI = ["PIVOT_SELL_TREND", "PIVOT_SELL_RALLY", "PIVOT_SELL_RALLY_SEC", "PIVOT_SELL_RALLY_REVERSE", "PIVOT_BREAK_SELL", " PIVOT_BREAK_RALLY_SELL", "PIVOT_SELL_RALLY_REACT_SEC", "PIVOT_SELL_RALLY_SEC_LATE"];

            // Tipos para saída
            const TYPE_BUY_EXIT = ["PIVOT_EXIT_BUY_TREND", "PIVOT_EXIT_BUY_SEC"];
            const TYPE_SELL_EXIT = ["PIVOT_EXIT_SELL_TREND", "PIVOT_EXIT_SELL_SEC"]
            const TYPE_BUY_EXIT_REVERSE = ["PIVOT_BREAK_SELL"];
            const TYPE_SELL_EXIT_REVERSE = ["PIVOT_BREAK_BUY"];
            const TYPE_BUY_BREAK_UP = ["PIVOT_BREAK_BUY", "PIVOT_BREAK_RALLY_BUY"];
            const TYPE_SELL_BREAK_UP = ["PIVOT_BREAK_SELL", "PIVOT_BREAK_RALLY-SELL"];
            const TYPE_BREAK = ["PIVOT_BREAK_BUY", "PIVOT_BREAK_SELL"];

            // Reseta flags de trava de bandas excedidas
            if (lastTrend && previousTrendIdentity && previousTrendIdentity !== currentTrendIdentity) {
                flags.exceededBand = false;
                flags.blockedTrendIdentity = null;
            }

            const isTrendBlocked = flags.blockedTrendIdentity === currentTrendIdentity;
            const { low: bandLow, high: bandHigh } = getTrendBandBounds(lastTrend);
            const isOutsideBand = lastTrend && Number.isFinite(bandLow) && Number.isFinite(bandHigh)
                ? (!flags.inputExecuted && TYPE_BUY.includes(lastTrend.type) && lastPrice?.Fechamento < bandLow - (lastTrend.limite / 5)) ||
                (!flags.inputExecuted && TYPE_SELL.includes(lastTrend.type) && lastPrice?.Fechamento > bandHigh + (lastTrend.limite / 5))
                : false;

            if (isOutsideBand && !isTrendBlocked) {
                flags.exceededBand = true;
                flags.blockedTrendIdentity = currentTrendIdentity;
                console.log(`⛔ [${symbol}] Tendência excedeu banda e ficará bloqueada até novo trend:`, { bandLow, bandHigh, price: lastPrice?.Fechamento, trend: lastTrend?.type });
                return;
            };

            if (isTrendBlocked) {
                console.log(`⛔ [${symbol}] Trend bloqueado até novo signal:`, { blockedTrendIdentity: flags.blockedTrendIdentity, currentTrendIdentity });
                return;
            };


            // Reseta flag de entrada apenas quando não há operação ativa
            if (!flags.isOperation && flags.inputExecuted && TYPE_BREAK.includes(lastTrend?.type)) {
                flags.exceededBand = false;
                flags.inputExecuted = false;
                flags.blockedTrendIdentity = null;
                return;
            };



            //==============================|✅ENTRADAS EM OPERAÇÕES RETESTES|==============================//
            //🟢 Entrada de compra
            const conditionBuy =
                buttonOperation.buy

            // ***Muda as  classe dos butão
            //   const btnBuy = document.querySelector('.btn-buy');
            //  conditionBuyMain ? btnBuy.classList.add('btn-pulse-buy') : btnBuy.classList.remove('btn-pulse-buy');

            if (conditionBuy) {
                const newSignal = {
                    symbol,
                    action: "BUY",
                    expectedPriceBuy: lastTrend.buy.toFixed(2),
                    avgEntryPrice: lastPrice?.Fechamento.toFixed(2),
                    entryPrice: lastPrice?.Fechamento.toFixed(2),
                    time: lastPrice?.Tempo || lastPrice?.time,
                    stop: lastTrend.stop.toFixed(2),
                    trendPrimary: lastTrendPrimary?.type,
                    trendSecondary: lastTrend?.type
                };

                // Atualiza flags e histórico imediatamente
                flags.upwardTrendCurrent = true;
                flags.inputExecuted = true;
                flags.isOperation = true;
                flags.isManualOperation = false;
                flags.signalCount += 1;
                flags.upwardAmrsiCurrent = false;
                flags.numberEntries += 1;

                // **Calcula preçomédio
                const entryPrice = Number(lastPrice?.Fechamento ?? 0);
                const ts = new Date().toISOString();
                if (!signalsHistoryRef.current[symbol]) signalsHistoryRef.current[symbol] = [];
                const history = signalsHistoryRef.current[symbol];
                const last = history.at(-1) || null;
                if (last && last.action === 'BUY' && !last.closed) {
                    const prevCount = last.count || 1;
                    const prevAvg = Number(last.avgEntryPrice ?? last.entryPrice ?? entryPrice);
                    const newCount = prevCount + 1;
                    const newAvg = (prevAvg * prevCount + entryPrice) / newCount;
                    const updated = {
                        ...last, count: newCount,
                        avgEntryPrice: newAvg.toFixed(2),
                        entryPrice: newAvg.toFixed(2),
                        timestamp: ts
                    };
                    history[history.length - 1] = updated;
                    signalsBySymbol[symbol] = updated;
                    flags.lastSignal = updated;
                } else {
                    const aggregated = { ...newSignal, count: 1, avgEntryPrice: entryPrice.toFixed(2), entryPrice: entryPrice.toFixed(2), timestamp: ts };
                    history.push(aggregated);
                    if (history.length > 100) {
                        signalsHistoryRef.current[symbol] = history.slice(-100);
                    }
                    signalsBySymbol[symbol] = aggregated;
                    flags.lastSignal = aggregated;
                }

                // **Chama a Função para calcular o tamanho do lote e calcular ganhos e perdas
                const getSizeOperation = calculatePositionSize(flags.lastSignal, signalsHistoryRef.current);

                // **Chama função e passa os parametros para enviar ao beckend
                sendOperationData(getSizeOperation, signalsBySymbolState);

                // **Atualiza botões e estado de simbolos
                setButtonOperation({ buy: false, sell: false, exit: false });
                setSignalsBySymbolState({ ...signalsHistoryRef.current });

                console.log(`✅ [${symbol}] SINAL DE COMPRA GERADO! #${flags.signalCount}`);
            }

            //🔴 Entrada de venda
                const conditionSell =

                    buttonOperation.sell

                if (conditionSell) {
                    const newSignal = {
                        symbol,
                        action: "SELL",
                        expectedPriceSell: lastTrend.sell.toFixed(2),
                        avgEntryPrice: lastPrice?.Fechamento.toFixed(2),
                        entryPrice: lastPrice?.Fechamento.toFixed(2),
                        time: lastPrice?.Tempo || lastPrice?.time,
                        stop: lastTrend.stop.toFixed(2),
                        trendPrimary: lastTrendPrimary?.type,
                        trendSecondary: lastTrend?.type
                    };

                    flags.downwardTrendCurrent = true;
                    flags.inputExecuted = true;
                    flags.isOperation = true;
                    flags.isManualOperation = false;
                    flags.signalCount += 1;
                    flags.downwardAmrsiCurrent = false;
                    flags.numberEntries += 1;

                    const entryPriceSell = Number(lastPrice?.Fechamento ?? 0);
                    const tsSell = new Date().toISOString();
                    if (!signalsHistoryRef.current[symbol]) signalsHistoryRef.current[symbol] = [];
                    const historyS = signalsHistoryRef.current[symbol];
                    const lastS = historyS.at(-1) || null;
                    if (lastS && lastS.action === 'SELL' && !lastS.closed) {
                        const prevCountS = lastS.count || 1;
                        const prevAvgS = Number(lastS.avgEntryPrice ?? lastS.entryPrice ?? entryPriceSell);
                        const newCountS = prevCountS + 1;
                        const newAvgS = (prevAvgS * prevCountS + entryPriceSell) / newCountS;
                        const updatedS = {
                            ...lastS, count: newCountS,
                            avgEntryPrice: newAvgS.toFixed(2),
                            entryPrice: newAvgS.toFixed(2),
                            timestamp: tsSell
                        };
                        historyS[historyS.length - 1] = updatedS;
                        signalsBySymbol[symbol] = updatedS;
                        flags.lastSignal = updatedS;
                    } else {
                        const aggregatedS = {
                            ...newSignal, count: 1,
                            avgEntryPrice: entryPriceSell.toFixed(2),
                            entryPrice: entryPriceSell.toFixed(2),
                            timestamp: tsSell
                        };
                        historyS.push(aggregatedS);
                        if (historyS.length > 100) {
                            signalsHistoryRef.current[symbol] = historyS.slice(-100);
                        }
                        signalsBySymbol[symbol] = aggregatedS;
                        flags.lastSignal = aggregatedS;
                    }

                    // **Chama a Função para calcular o tamanho do lote e calcular ganhos e perdas
                    const getSizeOperation = calculatePositionSize(flags.lastSignal, signalsHistoryRef.current);

                    // **Chama função e passa os parametros para enviar ao beckend
                    sendOperationData(getSizeOperation, signalsBySymbolState, flags.lastSignal);

                    // **Atualiza botões e estado de simbolos
                    setButtonOperation({ buy: false, sell: false, exit: false });
                    setSignalsBySymbolState({ ...signalsHistoryRef.current });

                    console.log(`✅ [${symbol}] SINAL DE VENDA GERADO! #${flags.signalCount}`);

                }




            //==============================|🚫EXIT|==============================//
            //🟢 Condição de saída principal
            /*   const conditionExitBuyMain =
                   //lastPrice.Fechamento <= lastTrend?.stop &&
                   flags.isOperation &&
                   flags.inputExecuted &&
                   lastVppr?.vpprTrend === 'sell' &&
                   TYPE_BUY_EXIT.includes(lastTrend?.type);*/

            /* const conditionExitSellMain =
                 // lastPrice.Fechamento >= lastTrend?.stop &&
                 flags.isOperation &&
                 flags.inputExecuted &&
                 lastVppr?.vpprTrend === 'buy' &&
                 TYPE_SELL_EXIT.includes(lastTrend?.type);*/

            // const btnExit = document.querySelector('.btn-exit');
            // const shouldPulseExit = conditionExitBuyMain || conditionExitSellMain;

            /* if (btnExit) {
                 shouldPulseExit ? btnExit.classList.add('btn-pulse-exit') : btnExit.classList.remove('btn-pulse-exit');
             }*/

            if (flags.inputExecuted && flags.isOperation && flags.numberEntries > 0) {
                const conditionExitBuy =
                    // conditionExitBuyMain &&
                    buttonOperation?.exit;


                if (conditionExitBuy) {
                    if (!flags.confirmationPending) {
                        flags.confirmationPending = true;


                        try {
                            if (result.isConfirmed) {
                                const exitPrice = Number(lastPrice?.Fechamento ?? 0);
                                const ts = new Date().toISOString();
                                const execTime = lastPrice?.Tempo ?? lastPrice?.time ?? ts;

                                // Atualiza flags
                                flags.upwardTrendCurrent = false;
                                flags.exceededBand = false;
                                flags.blockedTrendIdentity = null;
                                flags.numberEntries -= 1;

                                const isLastExit = flags.numberEntries === 0;
                                if (isLastExit) {
                                    flags.inputExecuted = false;
                                    flags.isOperation = false;
                                }

                                if (!signalsHistoryRef.current[symbol]) signalsHistoryRef.current[symbol] = [];

                                const history = signalsHistoryRef.current[symbol];

                                // PROCURAR POR UM PARTIAL_BUY EXISTENTE
                                let partialBuyIndex = -1;
                                let partialBuyObj = null;

                                for (let i = history.length - 1; i >= 0; i--) {
                                    const h = history[i];
                                    if (h && h.action === 'PARTIAL_BUY' && !h.closed) {
                                        partialBuyIndex = i;
                                        partialBuyObj = h;
                                        break;
                                    }
                                }

                                // Se existe PARTIAL_BUY, atualiza com a nova média
                                if (partialBuyObj) {
                                    const prevCount = partialBuyObj.count || 0;
                                    const prevAvg = Number(partialBuyObj.avgExitPrice ?? partialBuyObj.exitPrice ?? 0);
                                    const newCount = prevCount + 1;
                                    const newAvg = (prevAvg * prevCount + exitPrice) / newCount;

                                    // Se for a última saída, transforma em EXIT_BUY
                                    if (isLastExit) {
                                        history[partialBuyIndex] = {
                                            ...partialBuyObj,
                                            action: 'EXIT_BUY',
                                            count: newCount,
                                            exitPrice: newAvg.toFixed(2),
                                            avgExitPrice: newAvg.toFixed(2),
                                            time: execTime,
                                            timestamp: ts,
                                            closed: true,
                                            closedAt: ts
                                        };
                                        signalsBySymbol[symbol] = history[partialBuyIndex];
                                        flags.lastSignal = history[partialBuyIndex];
                                        console.log(`🚪 [${symbol}] ÚLTIMA SAÍDA DE COMPRA - EXIT_BUY criado`);
                                    } else {
                                        // Atualiza o PARTIAL_BUY existente com a nova média
                                        history[partialBuyIndex] = {
                                            ...partialBuyObj,
                                            count: newCount,
                                            exitPrice: newAvg.toFixed(2),
                                            avgExitPrice: newAvg.toFixed(2),
                                            time: execTime,
                                            timestamp: ts
                                        };
                                        signalsBySymbol[symbol] = history[partialBuyIndex];
                                        flags.lastSignal = history[partialBuyIndex];
                                        console.log(`📊 [${symbol}] PARTIAL_BUY atualizado - Média: ${newAvg.toFixed(2)}`);
                                    }
                                } else {
                                    // Cria um novo PARTIAL_BUY (primeira saída)
                                    const exitSignal = {
                                        symbol,
                                        action: isLastExit ? 'EXIT_BUY' : 'PARTIAL_BUY',
                                        exitPrice: exitPrice.toFixed(2),
                                        count: 1,
                                        avgExitPrice: exitPrice.toFixed(2),
                                        time: execTime,
                                        timestamp: ts,
                                        closed: isLastExit ? true : false,
                                        closedAt: isLastExit ? ts : undefined
                                    };
                                    history.push(exitSignal);
                                    signalsBySymbol[symbol] = exitSignal;
                                    flags.lastSignal = exitSignal;

                                    if (isLastExit) {
                                        console.log(`🚪 [${symbol}] SAÍDA ÚNICA DE COMPRA - EXIT_BUY`);
                                    } else {
                                        console.log(`📊 [${symbol}] PRIMEIRA SAÍDA PARCIAL DE COMPRA`);
                                    }
                                }

                                if (history.length > 100) signalsHistoryRef.current[symbol] = history.slice(-100);

                                // **Chama a Função para calcular o tamanho do lote e calcular ganhos e perdas
                                const getSizeOperation = calculatePositionSize(flags.lastSignal, signalsHistoryRef.current);

                                // **Chama função e passa os parametros para enviar ao beckend
                                sendOperationData(getSizeOperation, signalsBySymbolState);


                                // **Atualiza botões e estado de simbolos
                                setButtonOperation({ buy: false, sell: false, exit: false });
                                setSignalsBySymbolState({ ...signalsHistoryRef.current });

                                console.log(`🚪 [${symbol}] SAÍDA DE COMPRA`);
                            } else {
                                console.log(`❌ [${symbol}] Saída cancelada pelo usuário`);
                            }
                        } finally {
                            flags.confirmationPending = false;
                        }

                    }
                }
            }

            if (flags.inputExecuted && flags.isOperation && flags.numberEntries > 0) {
                const conditionExitSell =
                    // conditionExitSellMain &&
                    buttonOperation?.exit;

                if (conditionExitSell) {
                    if (!flags.confirmationPending) {
                        flags.confirmationPending = true;

                        try {
                            if (result.isConfirmed) {
                                const exitPriceS = Number(lastPrice?.Fechamento ?? 0);
                                const tsS = new Date().toISOString();
                                const execTimeS = lastPrice?.Tempo ?? lastPrice?.time ?? tsS;

                                flags.downwardTrendCurrent = false;
                                flags.exceededBand = false;
                                flags.blockedTrendIdentity = null;
                                flags.numberEntries -= 1;

                                const isLastExit = flags.numberEntries === 0;
                                if (isLastExit) {
                                    flags.inputExecuted = false;
                                    flags.isOperation = false;
                                }

                                if (!signalsHistoryRef.current[symbol]) signalsHistoryRef.current[symbol] = [];

                                const historyS = signalsHistoryRef.current[symbol];

                                // PROCURAR POR UM PARTIAL_SELL EXISTENTE
                                let partialSellIndex = -1;
                                let partialSellObj = null;

                                for (let i = historyS.length - 1; i >= 0; i--) {
                                    const h = historyS[i];
                                    if (h && h.action === 'PARTIAL_SELL' && !h.closed) {
                                        partialSellIndex = i;
                                        partialSellObj = h;
                                        break;
                                    }
                                }

                                // Se existe PARTIAL_SELL, atualiza com a nova média
                                if (partialSellObj) {
                                    const prevCount = partialSellObj.count || 0;
                                    const prevAvg = Number(partialSellObj.avgExitPrice ?? partialSellObj.exitPrice ?? 0);
                                    const newCount = prevCount + 1;
                                    const newAvg = (prevAvg * prevCount + exitPriceS) / newCount;

                                    // Se for a última saída, transforma em EXIT_SELL
                                    if (isLastExit) {
                                        historyS[partialSellIndex] = {
                                            ...partialSellObj,
                                            action: 'EXIT_SELL',
                                            count: newCount,
                                            exitPrice: newAvg.toFixed(2),
                                            avgExitPrice: newAvg.toFixed(2),
                                            time: execTimeS,
                                            timestamp: tsS,
                                            closed: true,
                                            closedAt: tsS
                                        };
                                        signalsBySymbol[symbol] = historyS[partialSellIndex];
                                        flags.lastSignal = historyS[partialSellIndex];
                                        console.log(`🚪 [${symbol}] ÚLTIMA SAÍDA - EXIT_SELL criado`);
                                    } else {
                                        // Atualiza o PARTIAL_SELL existente com a nova média
                                        historyS[partialSellIndex] = {
                                            ...partialSellObj,
                                            count: newCount,
                                            exitPrice: newAvg.toFixed(2),
                                            avgExitPrice: newAvg.toFixed(2),
                                            time: execTimeS,
                                            timestamp: tsS
                                        };
                                        signalsBySymbol[symbol] = historyS[partialSellIndex];
                                        flags.lastSignal = historyS[partialSellIndex];
                                        console.log(`📊 [${symbol}] PARTIAL_SELL atualizado - Média: ${newAvg.toFixed(2)}`);
                                    }
                                } else {
                                    // Cria um novo PARTIAL_SELL (primeira saída)
                                    const exitSignalS = {
                                        symbol,
                                        action: isLastExit ? 'EXIT_SELL' : 'PARTIAL_SELL',
                                        exitPrice: exitPriceS,
                                        count: 1,
                                        avgExitPrice: exitPriceS,
                                        time: execTimeS,
                                        timestamp: tsS,
                                        closed: isLastExit ? true : false,
                                        closedAt: isLastExit ? tsS : undefined
                                    };
                                    historyS.push(exitSignalS);
                                    signalsBySymbol[symbol] = exitSignalS;
                                    flags.lastSignal = exitSignalS;

                                    if (isLastExit) {
                                        console.log(`🚪 [${symbol}] SAÍDA ÚNICA - EXIT_SELL`);
                                    } else {
                                        console.log(`📊 [${symbol}] PRIMEIRA SAÍDA PARCIAL`);
                                    }
                                }

                                if (historyS.length > 100) signalsHistoryRef.current[symbol] = historyS.slice(-100);

                                // **Chama a Função para calcular o tamanho do lote e calcular ganhos e perdas
                                const getSizeOperation = calculatePositionSize(flags.lastSignal, signalsHistoryRef.current);

                                // **Chama função e passa os parametros para enviar ao beckend
                                sendOperationData(getSizeOperation, signalsBySymbolState);

                                // **Atualiza botões e estado de simbolos
                                setButtonOperation({ buy: false, sell: false, exit: false });
                                setSignalsBySymbolState({ ...signalsHistoryRef.current });

                            } else {
                                console.log(`❌ [${symbol}] Saída cancelada pelo usuário`);
                            }
                        } finally {
                            flags.confirmationPending = false;
                        }
                    }
                }
            }

            if (flags.isManualOperation && flags.inputExecuted && flags.isOperation && flags.numberEntries > 0) {
                const symbolSignals = signalsHistoryRef.current[symbol] || [];
                const lastEntryIndex = symbolSignals.reduce((latestIndex, item, index) => (
                    ['BUY', 'SELL'].includes(String(item?.action || '').toUpperCase())
                        ? index
                        : latestIndex
                ), -1);
                const lastExitIndex = symbolSignals.reduce((latestIndex, item, index) => (
                    ['EXIT_BUY', 'EXIT_SELL', 'STOP_BUY', 'STOP_SELL'].includes(String(item?.action || '').toUpperCase())
                        ? index
                        : latestIndex
                ), -1);
                const activeEntry = lastEntryIndex > lastExitIndex
                    ? symbolSignals[lastEntryIndex]
                    : null;
                const entryAction = String(activeEntry?.action || '').toUpperCase();
                const stopPrice = Number(activeEntry?.stop);
                const currentPrice = Number(lastPrice?.Fechamento);
                const stopTriggered = Number.isFinite(stopPrice) &&
                    Number.isFinite(currentPrice) &&
                    ((entryAction === 'BUY' && currentPrice <= stopPrice) ||
                        (entryAction === 'SELL' && currentPrice >= stopPrice));

                if (!stopTriggered) {
                    return;
                }

                signal = {
                    symbol,
                    action: entryAction === 'BUY' ? 'STOP_BUY' : 'STOP_SELL',
                    count: flags.numberEntries,
                    expectedPriceExitBuy: entryAction === 'BUY' ? stopPrice.toFixed(2) : undefined,
                    expectedPriceExitSell: entryAction === 'SELL' ? stopPrice.toFixed(2) : undefined,
                    exitPrice: currentPrice.toFixed(2),
                    time: lastPrice?.Tempo || lastPrice?.time,
                };
                flags.upwardTrendCurrent = false;
                flags.downwardTrendCurrent = false;
                flags.inputExecuted = false;
                flags.isOperation = false;
                flags.isManualOperation = false;
                flags.exceededBand = false;
                flags.blockedTrendIdentity = null;
                flags.numberEntries = 0;
            }

            //==============================|❌STOPS|==============================//
            //==============================|🚫SAÍDA DE OPERAÇÃO EM UM STOP|==============================//
            if (lastTrend?.stop && flags.inputExecuted && flags.isOperation && flags.numberEntries > 0) {
                const stop = signalsHistoryRef.current[symbol]?.at(-1) ?? null;

                // Lógica para saída de operações stop
                if (
                    TYPE_BUY.includes(lastTrend?.type) &&
                    flags.upwardTrendCurrent &&
                    lastPrice.Fechamento <= stop?.stop
                ) {

                    signal = {
                        symbol,
                        action: "STOP_BUY",
                        count: flags.numberEntries,
                        expectedPriceExitBuy: lastTrend.stop.toFixed(2),
                        exitPrice: lastPrice?.Fechamento.toFixed(2),
                        time: lastPrice?.Tempo || lastPrice?.time
                    };
                    flags.upwardTrendCurrent = false;
                    flags.downwardTrendCurrent = false;
                    flags.inputExecuted = false;
                    flags.isOperation = false;
                    flags.exceededBand = false;
                    flags.blockedTrendIdentity = null;
                    flags.numberEntries = 0;

                    // **Chama a Função para calcular o tamanho do lote e calcular ganhos e perdas
                    const getSizeOperation = calculatePositionSize(flags.lastSignal, signalsHistoryRef.current);

                    // **Chama função e passa os parametros para enviar ao beckend
                    sendOperationData(getSizeOperation, signalsBySymbolState);

                    // **Atualiza botões e estado de simbolos
                    setButtonOperation({ buy: false, sell: false, exit: false });
                    setSignalsBySymbolState({ ...signalsHistoryRef.current });

                    console.log(`🚪 [${symbol}] STOP DE COMPRA`);
                }
                if (
                    TYPE_SELL.includes(lastTrend?.type) &&
                    flags.downwardTrendCurrent &&
                    lastPrice.Fechamento >= stop?.stop
                ) {
                    signal = {
                        symbol,
                        action: "STOP_SELL",
                        count: flags.numberEntries,
                        expectedPriceExitSell: lastTrend?.stop?.toFixed(2),
                        exitPrice: lastPrice?.Fechamento.toFixed(2),
                        time: lastPrice?.Tempo || lastPrice?.time
                    };
                    flags.downwardTrendCurrent = false;
                    flags.upwardTrendCurrent = false;
                    flags.inputExecuted = false;
                    flags.isOperation = false;
                    flags.exceededBand = false;
                    flags.blockedTrendIdentity = null;
                    flags.numberEntries = 0;

                    // **Chama a Função para calcular o tamanho do lote e calcular ganhos e perdas
                    const getSizeOperation = calculatePositionSize(flags.lastSignal, signalsHistoryRef.current);

                    // **Chama função e passa os parametros para enviar ao beckend
                    sendOperationData(getSizeOperation, signalsBySymbolState);

                    // **Atualiza botões e estado de simbolos
                    setButtonOperation({ buy: false, sell: false, exit: false });
                    setSignalsBySymbolState({ ...signalsHistoryRef.current });

                    console.log(`🚪 [${symbol}] STOP DE VENDA`);
                }
            }


            //==============================|📗Armazena o sinal se existir|==============================//
            if (signal) {
                // Inicializa histórico do símbolo se não existir
                if (!signalsHistoryRef.current[symbol]) {
                    signalsHistoryRef.current[symbol] = [];
                }
                // Adiciona ao histórico
                signalsHistoryRef.current[symbol].push({
                    ...signal,
                    timestamp: new Date().toISOString()
                });
                // Mantém apenas os últimos 100 sinais
                if (signalsHistoryRef.current[symbol].length > 100) {
                    signalsHistoryRef.current[symbol] = signalsHistoryRef.current[symbol].slice(-100);
                }

                signalsBySymbol[symbol] = signal;
                flags.lastSignal = signal;
                if (signal.action === 'STOP_BUY' || signal.action === 'STOP_SELL') {
                    sendOperationData(
                        calculatePositionSize(signal, signalsHistoryRef.current),
                        signalsHistoryRef.current,
                        signal
                    );
                }
            }
        });
        console.log('📊 Histórico de sinais por símbolo:', signalsHistoryRef.current);
        // Retorna os sinais para uso externo se necessário
        if (Object.keys(signalsBySymbol).length > 0) {
            console.log("🎯 Novos sinais detectados:", Object.keys(signalsBySymbol));
        }
        //console.log("📊 Histórico de sinais por símbolo:", signalsHistoryRef.current);

        if (Object.keys(signalsBySymbol).length > 0) {
            setSignalsBySymbolState({ ...signalsHistoryRef.current });
        }

        // Atualiza os estados de lastTrend e lastTrendPrimary apenas se houver mudanças
        if (Object.keys(newLastTrends).length > 0) {
            setLastTrendState({ ...newLastTrends });
        }
        if (Object.keys(newLastTrendsPrimary).length > 0) {
            setLastTrendStatePrimary({ ...newLastTrendsPrimary });
        }
        if (Object.keys(newLastVppr).length > 0) {
            setLastVpprState({ ...newLastVppr });
        }
        if (Object.keys(newLastAmrsi).length > 0) {
            setLastAmrsiState({ ...newLastAmrsi });
        }


    }, [
        trend,
        trendPrimary,
        amrsi,
        vppr,
        price,
        buttonOperation,
        calculatePositionSize,
        setButtonOperation,
        setSignalsBySymbolState,
        sendOperationData,
    ]);

    // Criar uma função para pegar o lastTrend de um símbolo específico

    const getLastTrendBySymbol = (symbol) => {
        return lastTrendRef.current[symbol] || null;
    };
    const getLastTrendPrimaryBySymbol = (symbol) => {
        return lastTrendRefPrimary.current[symbol] || null;
    };
    const getLastVpprBySymbol = (symbol) => {
        return lastVpprRef.current[symbol] || null;
    };
    const getLastAmrsiBySymbol = (symbol) => {
        return lastAmrsiRef.current[symbol] || null;
    }


    return {
        trend,
        trendPrimary,
        amrsi,
        vppr,
        price,
        lastTrend: lastTrendState,
        lastTrendPrimary: lastTrendStatePrimary,
        lastVppr: lastVpprState,
        lastAmrsi: lastAmrsiState,

        // Exporta funções auxiliares
        signalsBySymbol: signalsBySymbolState,
        operationResults,
        getLastAmrsiBySymbol,
        getLastVpprBySymbol,
        getLastTrendBySymbol,
        getLastTrendPrimaryBySymbol,
        calculateOrder,
        executeOrder,
        getSignalsBySymbol: (symbol) => signalsBySymbolState[symbol] || [],
        getAllSignals: () => signalsBySymbolState,
        getFlagsBySymbol: (symbol) => flagsBySymbolRef.current[symbol] || null
    };
};
