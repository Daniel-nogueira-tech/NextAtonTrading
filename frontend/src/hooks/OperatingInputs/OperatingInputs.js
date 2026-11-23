// useOperatingInputs.js
import { useMemo, useEffect, useContext, useRef, useState, useCallback } from 'react';
import { ContextGraphics } from '../../ContextGraphics/ContextGraphics.jsx';
import { useEngineFeed } from '../../engine/useEngine.js';
import { calculatePositionSize as calculatePositionSizeFromSignals } from '../CalculateOperation/CalculateOperation.js'
import { parseDecimal } from '../../utils/parseDecimal.js'

const TYPE_BUY_EXIT = ['PIVOT_EXIT_BUY_TREND', 'PIVOT_EXIT_BUY_SEC'];
const TYPE_SELL_EXIT = ['PIVOT_EXIT_SELL_TREND', 'PIVOT_EXIT_SELL_SEC'];
const TYPE_RALLY_BUY = [
    'PIVOT_BUY_TREND',
    'PIVOT_BUY_RALLY',
    'PIVOT_BUY_RALLY_REVERSE',
    'PIVOT_BUY_RALLY_SEC',
    'PIVOT_BUY_RALLY_SEC_LATE',
    'PIVOT_BUY_RALLY_REACT_SEC',
]
const TYPE_RALLY_SELL = [
    'PIVOT_SELL_TREND',
    'PIVOT_SELL_RALLY',
    'PIVOT_SELL_RALLY_REVERSE',
    'PIVOT_SELL_RALLY_SEC',
    'PIVOT_SELL_RALLY_SEC_LATE',
    'PIVOT_SELL_RALLY_REACT_SEC',

]
const ENTRY_PARTIAL_BUY = [
    'PARTIAL_BUY',
    'TREND_PARTIAL_BUY'
]
const ENTRY_PARTIAL_SELL = [
    'PARTIAL_SELL',
    'TREND_PARTIAL_SELL'
]

const mergeIfChanged = (previous, updates) => {
    const hasChanges = Object.entries(updates).some(([key, value]) => {
        const previousValue = previous[key];
        if (previousValue === value) return false;
        if (
            !previousValue ||
            !value ||
            typeof previousValue !== 'object' ||
            typeof value !== 'object' ||
            Array.isArray(previousValue) ||
            Array.isArray(value)
        ) {
            return true;
        }

        const previousKeys = Object.keys(previousValue);
        const nextKeys = Object.keys(value);
        return previousKeys.length !== nextKeys.length ||
            nextKeys.some(nextKey => previousValue[nextKey] !== value[nextKey]);
    });
    return hasChanges ? { ...previous, ...updates } : previous;
};

const getContextTrendMovements = (trendData, symbol) => {
    const collection = trendData?.data ?? trendData;
    const groups = Array.isArray(collection) ? collection : collection ? [collection] : [];
    const normalizedSymbol = String(symbol || '').trim().toUpperCase();
    const group = groups.find(item => (
        String(item?.symbol || '').trim().toUpperCase() === normalizedSymbol
    )) || (groups.length === 1 ? groups[0] : null);
    const movements = group?.movements ?? group?.result ?? group?.data;
    return Array.isArray(movements) ? movements : [];
};

const getTrendDirection = (type) => {
    const normalizedType = String(type || '').trim().toUpperCase();
    if (normalizedType.includes(TYPE_RALLY_SELL)) return 'BUY';
    if (normalizedType.includes(TYPE_RALLY_SELL)) return 'SELL';
    return null;
};

const getTrendMovementDirection = (movement) => {
    if (!movement) return null;

    const normalized = String(movement?.tipo || '').trim().toLowerCase();
    if (normalized.includes('reação') || normalized.includes('reacao')) {
        return null;
    }

    const isRally = normalized.includes('rally');
    const isTrend = normalized.includes('tendência') || normalized.includes('tendencia');
    if (!isRally && !isTrend) return null;

    if (normalized.includes('alta')) return 'BUY';
    if (normalized.includes('baixa')) return 'SELL';
    if (normalized.includes('topo')) return 'SELL';
    if (normalized.includes('fundo')) return 'SELL';

    return null;
};

const getOpenPosition = (signals = []) => {
    let activeEntry = null;
    for (const signal of signals) {
        const action = String(signal?.action || '').toUpperCase();
        if (action === 'BUY' || action === 'SELL') {
            activeEntry = { ...signal, action };
        } else if (
            activeEntry &&
            ((activeEntry.action === 'BUY' && ['EXIT_BUY', 'STOP_BUY'].includes(action)) ||
                (activeEntry.action === 'SELL' && ['EXIT_SELL', 'STOP_SELL'].includes(action)))
        ) {
            activeEntry = null;
        }
    }
    return activeEntry;
};

const getOpenEntryIndex = (signals = []) => {
    const entryIndex = signals.reduce((latestIndex, signal, index) => (
        ['BUY', 'SELL'].includes(String(signal?.action || '').toUpperCase())
            ? index
            : latestIndex
    ), -1);
    const exitIndex = signals.reduce((latestIndex, signal, index) => (
        ['EXIT_BUY', 'EXIT_SELL', 'STOP_BUY', 'STOP_SELL'].includes(
            String(signal?.action || '').toUpperCase()
        )
            ? index
            : latestIndex
    ), -1);
    return entryIndex > exitIndex ? entryIndex : -1;
};

const getIndicatorDirection = (type) => {
    const normalizedType = String(type || '').trim().toUpperCase();
    if (!normalizedType || normalizedType.includes('EXIT')) return null;
    if (normalizedType.includes('BUY')) return 'BUY';
    if (normalizedType.includes('SELL')) return 'SELL';
    if (normalizedType.includes(TYPE_BUY_EXIT)) return 'EXIT_BUY';
    if (normalizedType.includes(TYPE_SELL_EXIT)) return 'EXIT_SELL';
    return null;
};

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

    const indicatorValues = Array.isArray(item.operation)
        ? item.operation
        : Array.isArray(item.signals)
            ? item.signals
            : null;
    if (indicatorValues) {
        const operationObj = indicatorValues.reduce((acc, entry) => {
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

export const useOperatingInputs = (isAutomaticExecutionEnabled = false) => {
    // MIGR-F4: subscribe only to the market feeds used by the signal calculation.
    const trend = useEngineFeed('trend');
    const fullPrice = useEngineFeed('fullPrice');
    const vpprFeed = useEngineFeed('vppr');
    const rsiFeed = useEngineFeed('rsi');
    const {
        sendOperationData: sendOperationDataToContext,
        signalsBySymbolState,
        setSignalsBySymbolState,
        retestPointsStateRef,
        pontsPartialRef,
        retestPointsStatePrimaryRef,
        amrsiDataRef,
        vpprDataRef,
        buttonOperation,
        setButtonOperation,
        setResultOperations,
        resultOperations,
        activeSymbol,
        balanceAndRisk,
        setOrderStop,
        setOrderTakeProfit,
    } = useContext(ContextGraphics);
    // FIX: avoid rerendering when the requested operation-button flags are unchanged.
    const setButtonOperationSafe = useCallback((next) => {
        setButtonOperation(previous => (
            previous.buy === next.buy &&
            previous.sell === next.sell &&
            previous.exit === next.exit
                ? previous
                : next
        ));
    }, [setButtonOperation]);

    const balance = parseDecimal(balanceAndRisk?.balance);
    const risk = Number(balanceAndRisk?.risk);
    const hasValidTradingFunds = Number.isFinite(balance) &&
        balance > 0 &&
        Number.isFinite(risk) &&
        risk > 0;

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
    const trendClassification = useMemo(
        () => normalizeCollection(retestPointsStateRef.current, "TREND", ["type", "time", "buy", "sell", "stop", "limite", "BandLow", "BandHigh", "pivot", "pivotExit"], "operations"),
        [retestPointsStateRef.current]
    );

    const partialEntry = useMemo(
        () => normalizeCollection(pontsPartialRef.current, "PARTIAL", ["type", "time", "partialBuy", "partialSell"]),
        [pontsPartialRef.current]
    );

    const trendPrimary = useMemo(
        () => normalizeCollection(retestPointsStatePrimaryRef.current, "TREND_PRIMARY", ["type", "time", "buy", "sell", "stop", "pivotExit"], "operations"),
        [retestPointsStatePrimaryRef.current]
    );

    const price = useMemo(
        () => normalizeCollection(fullPrice, "PRICE", ["Fechamento", "Tempo"], "result"),
        [fullPrice]
    );

    const vppr = useMemo(
        () => normalizeCollection(vpprDataRef.current, "VPPR", ["type", "vpprTrend", "time", "major", "volumeEmaSignal"], "signals"),
        [vpprDataRef.current, vpprFeed]
    );

    const amrsi = useMemo(
        () => normalizeCollection(amrsiDataRef.current, "AMRSI", ["type", "time"], "signals"),
        [amrsiDataRef.current, rsiFeed]
    );

    const flagsBySymbolRef = useRef(JSON.parse(localStorage.getItem("flagsBySymbol")) || {});
    const signalsHistoryRef = useRef(signalsBySymbolState || {});
    useEffect(() => {
        signalsHistoryRef.current = signalsBySymbolState || {};
    }, [signalsBySymbolState]);

    const sendOperationData = useCallback((operation, signals, lastSignal) => (
        sendOperationDataToContext(operation, signals || signalsHistoryRef.current, lastSignal)
    ), [sendOperationDataToContext]);

    const calculateOrder = useCallback(async (side, stopOverride, settings, symbolOverride) => {
        const action = side === 'sell' ? 'SELL' : 'BUY';
        const symbol = symbolOverride || activeSymbol;
        const indicatorSymbol = (collection) => (
            collection.find(item => item.symbol === symbol) || collection[0]
        );
        const latestTrend = indicatorSymbol(trendClassification)?.result?.at(-1);
        const latestPrice = indicatorSymbol(price)?.result?.at(-1);
        const entryPrice = Number(latestPrice?.Fechamento ?? latestPrice?.close ?? latestPrice?.price);
        const matchingSignals = (signalsBySymbolState?.[symbol] || [])
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
    }, [activeSymbol, calculatePositionSize, price, signalsBySymbolState, trendClassification]);

    const executeOrder = useCallback(async (order) => {
        const symbol = order?.symbol || activeSymbol;
        const action = String(order?.side || '').toLowerCase();
        const isEntryOrder = action === 'buy' || action === 'sell';
        if (isEntryOrder && !hasValidTradingFunds) {
            throw new Error('Informe um saldo e um risco válidos antes de executar a ordem.');
        }
        const executionPrice = Number(order?.price);
        const timestamp = new Date().toISOString();
        const latestPrice = (
            price.find(item => item.symbol === symbol) ||
            price[0]
        )?.result?.at(-1);
        const symbolPrice = Number(
            latestPrice?.Fechamento
        );
        const marketTime = latestPrice?.Tempo ?? latestPrice?.time ?? timestamp;
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
        const flags = {
            ...(flagsBySymbolRef.current[symbol] || {
                inputExecuted: false,
                isOperation: false,
                lastSignal: null,
                numberEntries: 0,
                signalCount: 0,
                upwardTrendCurrent: false,
                downwardTrendCurrent: false,
                exceededBand: false,
                blockedTrendIdentity: null,
            }),
        };

        let signal;
        let calculationSignal;
        let nextOrderTakeProfit;

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

            const trendItem = trendClassification.find(item => item.symbol === symbol)?.result?.at(-1);
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
            if (
                currentEntry &&
                String(currentEntry.action).toUpperCase() !== signalAction
            ) {
                throw new Error(`Já existe uma posição aberta na direção oposta para ${symbol}.`);
            }
            const isAddingToPosition = String(currentEntry?.action || '').toUpperCase() === signalAction;
            const previousCount = isAddingToPosition
                ? Math.max(1, Number(currentEntry.count) || 1)
                : 0;
            const count = isAddingToPosition
                ? previousCount + 1
                : 1;
            const previousAverage = Number(currentEntry?.avgEntryPrice ?? currentEntry?.entryPrice);
            const entryQuantity = Number(order.quantity);
            if (!Number.isFinite(entryQuantity) || entryQuantity <= 0) {
                throw new Error('Informe uma quantidade válida para executar a operação.');
            }
            const previousTotalQuantity = isAddingToPosition
                ? Number(currentEntry.totalQuantity) ||
                (Number(currentEntry.quantity) * previousCount) ||
                0
                : 0;
            const totalQuantity = previousTotalQuantity + entryQuantity;
            const averageEntry = previousTotalQuantity > 0 && Number.isFinite(previousAverage)
                ? ((previousAverage * previousTotalQuantity) + (finalPrice * entryQuantity)) / totalQuantity
                : finalPrice;
            const requestedTakeProfit = order.takeProfit == null || order.takeProfit === ''
                ? null
                : parseDecimal(order.takeProfit);
            if (
                order.takeProfit != null &&
                order.takeProfit !== '' &&
                (!Number.isFinite(requestedTakeProfit) || requestedTakeProfit <= 0)
            ) {
                throw new Error('Informe um take profit válido ou deixe o campo vazio.');
            }
            const takeProfit = requestedTakeProfit ??
                (isAddingToPosition && !order.automatic
                    ? Number(currentEntry.takeProfit) || undefined
                    : undefined);
            if (
                Number.isFinite(takeProfit) &&
                ((signalAction === 'BUY' && takeProfit <= averageEntry) ||
                    (signalAction === 'SELL' && takeProfit >= averageEntry))
            ) {
                throw new Error('O take profit precisa ficar acima da entrada na compra e abaixo na venda.');
            }

            signal = {
                symbol,
                action: signalAction,
                entryPrice: averageEntry.toFixed(8),
                avgEntryPrice: averageEntry.toFixed(8),
                expectedPriceBuy: signalAction === 'BUY' ? finalPrice.toFixed(8) : undefined,
                expectedPriceSell: signalAction === 'SELL' ? finalPrice.toFixed(8) : undefined,
                stop: stop.toFixed(8),
                takeProfit: Number.isFinite(takeProfit) ? takeProfit.toFixed(8) : undefined,
                count,
                time: currentEntry?.time ?? marketTime,
                timestamp,
                trendSecondary: trendItem?.type,
                quantity: totalQuantity,
                totalQuantity,
                entryRallyIdentity: order.entryRallyIdentity ??
                    (isAddingToPosition ? currentEntry?.entryRallyIdentity : undefined),
                partialEntryType: order.partialEntryType,
                partialEntryTime: order.partialEntryTime,
                partialEntryValue: order.partialEntryValue,
                partialMovementIdentity: order.partialMovementIdentity,
            };

            if (String(currentEntry?.action || '').toUpperCase() === signalAction) {
                const index = symbolSignals.lastIndexOf(currentEntry);
                symbolSignals[index] = signal;
            } else {
                symbolSignals.push(signal);
            }

            flags.inputExecuted = true;
            flags.isOperation = true;
            flags.isManualOperation = !order.automatic;
            flags.numberEntries = count;
            flags.signalCount = (Number(flags.signalCount) || 0) + 1;
            flags.lastSignal = signal;
            nextOrderTakeProfit = Number.isFinite(takeProfit) ? String(takeProfit) : '';
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
                action: order.exitReason === 'stop'
                    ? entryAction === 'BUY' ? 'STOP_BUY' : 'STOP_SELL'
                    : entryAction === 'BUY' ? 'EXIT_BUY' : 'EXIT_SELL',
                exitPrice: finalPrice.toFixed(8),
                count,
                exitReason: order.exitReason,
                time: marketTime,
                timestamp,
                closed: true,
                closedAt: timestamp,
            };
            symbolSignals.push(signal);

            flags.inputExecuted = false;
            flags.isOperation = false;
            flags.isManualOperation = false;
            flags.numberEntries = 0;
            flags.firstEntryExecuted = false;
            flags.processedPartialEntries = [];
            flags.upwardTrendCurrent = false;
            flags.downwardTrendCurrent = false;
            flags.exceededBand = false;
            flags.blockedTrendIdentity = null;
            flags.lastSignal = signal;
            calculationSignal = activeEntry;
            nextOrderTakeProfit = '';
        } else {
            throw new Error('Ação de operação inválida.');
        }

        if (symbolSignals.length > 100) {
            history[symbol] = symbolSignals.slice(-100);
        }
        const result = await calculatePositionSize(calculationSignal, history);
        if (!result) {
            throw new Error('Não foi possível calcular a operação. O histórico não foi alterado.');
        }
        await sendOperationData(Promise.resolve(result), history, signal);

        signalsHistoryRef.current = history;
        flagsBySymbolRef.current[symbol] = flags;
        localStorage.setItem('flagsBySymbol', JSON.stringify(flagsBySymbolRef.current));
        setSignalsBySymbolState(history);
        setButtonOperationSafe({ buy: false, sell: false, exit: false });
        setResultOperations(result);
        if (nextOrderTakeProfit !== undefined) setOrderTakeProfit(nextOrderTakeProfit);
        if (action === 'exit') setOrderStop('');

        return { signal, result };
    }, [
        activeSymbol,
        calculatePositionSize,
        price,
        sendOperationData,
        setButtonOperationSafe,
        setResultOperations,
        setSignalsBySymbolState,
        setOrderTakeProfit,
        trendClassification,
        hasValidTradingFunds,
    ]);

    const updateActiveStop = useCallback(async (nextStopValue) => {
        const symbol = activeSymbol;
        const nextStop = Number(nextStopValue);
        if (!symbol || !Number.isFinite(nextStop) || nextStop <= 0) {
            throw new Error('Informe um nível de stop válido.');
        }

        const currentHistory = signalsHistoryRef.current || {};
        const symbolSignals = [...(currentHistory[symbol] || [])];
        const entryIndex = symbolSignals.reduce((latestIndex, item, index) => (
            ['BUY', 'SELL'].includes(String(item?.action || '').toUpperCase())
                ? index
                : latestIndex
        ), -1);
        const exitIndex = symbolSignals.reduce((latestIndex, item, index) => (
            ['EXIT_BUY', 'EXIT_SELL', 'STOP_BUY', 'STOP_SELL'].includes(String(item?.action || '').toUpperCase())
                ? index
                : latestIndex
        ), -1);

        if (entryIndex <= exitIndex) {
            throw new Error('Não há uma operação aberta para atualizar o stop.');
        }

        const activeEntry = symbolSignals[entryIndex];
        const side = String(activeEntry.action).toUpperCase();
        const entryPrice = Number(activeEntry.avgEntryPrice ?? activeEntry.entryPrice);
        const latestMarketPrice = Number(
            (price.find(item => item.symbol === symbol) || price[0])
                ?.result?.at(-1)?.Fechamento
        );
        if (!Number.isFinite(entryPrice) || !Number.isFinite(latestMarketPrice)) {
            throw new Error('Não foi possível validar o stop com os preços atuais.');
        }

        const isInProfit = side === 'BUY'
            ? latestMarketPrice > entryPrice
            : latestMarketPrice < entryPrice;
        const isOnValidSide = isInProfit
            ? (side === 'BUY' ? nextStop < latestMarketPrice : nextStop > latestMarketPrice)
            : (side === 'BUY' ? nextStop < entryPrice : nextStop > entryPrice);
        if (!isOnValidSide) {
            throw new Error(isInProfit
                ? 'O stop deve permanecer abaixo do preço atual na compra e acima na venda.'
                : 'Antes do lucro, o stop deve permanecer abaixo da entrada na compra e acima na venda.');
        }

        const updatedEntry = {
            ...activeEntry,
            stop: nextStop.toFixed(8),
            stopPrice: nextStop.toFixed(8),
            expectedPriceStop: nextStop.toFixed(8),
            stopRemoved: false,
        };
        if (!(Number(updatedEntry.totalQuantity) > 0)) {
            const previousCount = Math.max(1, Number(updatedEntry.count) || 1);
            const calculatedPosition = resultOperations?.positions?.open?.find(position => (
                position.symbol === symbol && position.side === side
            ));
            const existingQuantity = Number(updatedEntry.quantity);
            const totalQuantity = Number(calculatedPosition?.quantity) ||
                (Number.isFinite(existingQuantity) && existingQuantity > 0
                    ? existingQuantity * previousCount
                    : 0);
            if (totalQuantity > 0) {
                updatedEntry.quantity = totalQuantity;
                updatedEntry.totalQuantity = totalQuantity;
            }
        }
        symbolSignals[entryIndex] = updatedEntry;
        const history = {
            ...currentHistory,
            [symbol]: symbolSignals,
        };

        const result = await calculatePositionSize(updatedEntry, history);
        if (!result) {
            throw new Error('O stop foi atualizado, mas não foi possível recalcular os resultados.');
        }

        await sendOperationData(Promise.resolve(result), history, updatedEntry);
        signalsHistoryRef.current = history;
        setSignalsBySymbolState(history);
        setOrderStop(nextStop.toString());
        const flags = flagsBySymbolRef.current[symbol];
        if (flags) flags.lastSignal = updatedEntry;
        setResultOperations(result);
        return updatedEntry;
    }, [
        activeSymbol,
        calculatePositionSize,
        price,
        sendOperationData,
        setOrderStop,
        setResultOperations,
        setSignalsBySymbolState,
        resultOperations,
    ]);

    const updateActiveTakeProfit = useCallback(async (nextTakeProfitValue) => {
        const symbol = activeSymbol;
        const nextTakeProfit = Number(nextTakeProfitValue);
        if (!symbol || !Number.isFinite(nextTakeProfit) || nextTakeProfit <= 0) {
            throw new Error('Informe um nível de take profit válido.');
        }

        const currentHistory = signalsHistoryRef.current || {};
        const symbolSignals = [...(currentHistory[symbol] || [])];
        const entryIndex = symbolSignals.reduce((latestIndex, item, index) => (
            ['BUY', 'SELL'].includes(String(item?.action || '').toUpperCase())
                ? index
                : latestIndex
        ), -1);
        const exitIndex = symbolSignals.reduce((latestIndex, item, index) => (
            ['EXIT_BUY', 'EXIT_SELL', 'STOP_BUY', 'STOP_SELL'].includes(String(item?.action || '').toUpperCase())
                ? index
                : latestIndex
        ), -1);

        if (entryIndex <= exitIndex) {
            throw new Error('Não há uma operação aberta para atualizar o take profit.');
        }

        const activeEntry = symbolSignals[entryIndex];
        const side = String(activeEntry.action).toUpperCase();
        const entryPrice = Number(activeEntry.avgEntryPrice ?? activeEntry.entryPrice);
        if (!Number.isFinite(entryPrice)) {
            throw new Error('Não foi possível validar o take profit com o preço de entrada.');
        }
        if (
            (side === 'BUY' && nextTakeProfit <= entryPrice) ||
            (side === 'SELL' && nextTakeProfit >= entryPrice)
        ) {
            throw new Error('O take profit precisa ficar acima da entrada na compra e abaixo na venda.');
        }

        const updatedEntry = {
            ...activeEntry,
            takeProfit: nextTakeProfit.toFixed(8),
            takeProfitRemoved: false,
        };
        symbolSignals[entryIndex] = updatedEntry;
        const history = {
            ...currentHistory,
            [symbol]: symbolSignals,
        };

        const result = await calculatePositionSize(updatedEntry, history);
        if (!result) {
            throw new Error('O take profit foi atualizado, mas não foi possível recalcular os resultados.');
        }

        await sendOperationData(Promise.resolve(result), history, updatedEntry);
        signalsHistoryRef.current = history;
        setSignalsBySymbolState(history);
        setOrderTakeProfit(nextTakeProfit.toString());
        const flags = flagsBySymbolRef.current[symbol];
        if (flags) flags.lastSignal = updatedEntry;
        setResultOperations(result);
        return updatedEntry;
    }, [
        activeSymbol,
        calculatePositionSize,
        sendOperationData,
        setOrderTakeProfit,
        setResultOperations,
        setSignalsBySymbolState,
    ]);

    const removeActiveLevel = useCallback(async (level) => {
        const symbol = activeSymbol;
        if (!symbol) {
            throw new Error('Selecione um ativo antes de remover o nível.');
        }

        const currentHistory = signalsHistoryRef.current || {};
        const symbolSignals = [...(currentHistory[symbol] || [])];
        const entryIndex = getOpenEntryIndex(symbolSignals);
        if (entryIndex < 0) {
            throw new Error('Não há uma operação aberta para remover o nível.');
        }

        const activeEntry = symbolSignals[entryIndex];
        const isStop = level === 'stop';
        const updatedEntry = isStop
            ? {
                ...activeEntry,
                stop: null,
                stopPrice: null,
                expectedPriceStop: null,
                stopRemoved: true,
            }
            : {
                ...activeEntry,
                takeProfit: null,
                takeProfitRemoved: true,
            };
        symbolSignals[entryIndex] = updatedEntry;
        const history = { ...currentHistory, [symbol]: symbolSignals };

        const existingResult = resultOperations;
        const result = existingResult?.positions
            ? {
                ...existingResult,
                positions: {
                    ...existingResult.positions,
                    open: (existingResult.positions.open || []).map(position => {
                        if (position.symbol !== symbol) return position;
                        if (isStop) {
                            return { ...position, stopPrice: null, stopDistance: null, risk: 0 };
                        }
                        return { ...position, takeProfit: null };
                    }),
                    openRisk: isStop
                        ? (existingResult.positions.open || [])
                            .filter(position => position.symbol !== symbol)
                            .reduce((riskTotal, position) => riskTotal + (Number(position.risk) || 0), 0)
                        : existingResult.positions.openRisk,
                },
            }
            : existingResult;
        if (!result) {
            throw new Error('O resultado da operação ainda não está disponível para salvar a alteração.');
        }

        await sendOperationData(Promise.resolve(result), history, updatedEntry);
        signalsHistoryRef.current = history;
        setSignalsBySymbolState(history);
        setResultOperations(result);
        if (isStop) setOrderStop('');
        else setOrderTakeProfit('');
        const flags = flagsBySymbolRef.current[symbol];
        if (flags) flags.lastSignal = updatedEntry;
        return updatedEntry;
    }, [
        activeSymbol,
        resultOperations,
        sendOperationData,
        setOrderStop,
        setOrderTakeProfit,
        setResultOperations,
        setSignalsBySymbolState,
    ]);

    const removeActiveStop = useCallback(
        () => removeActiveLevel('stop'),
        [removeActiveLevel]
    );
    const removeActiveTakeProfit = useCallback(
        () => removeActiveLevel('takeProfit'),
        [removeActiveLevel]
    );

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
    const pendingExitsRef = useRef(new Set());
    const pendingAutomaticOrdersRef = useRef(new Set());
    const pendingPartialEntriesRef = useRef(new Set());
    const pendingAutomaticExitsRef = useRef(new Set());


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


    // Monitor de stop/take (funciona no modo manual também)
    useEffect(() => {
        Object.entries(signalsBySymbolState || {}).forEach(([symbol, symbolSignals]) => {
            if (!Array.isArray(symbolSignals)) return;
            const activeEntry = getOpenPosition(symbolSignals);
            if (!activeEntry) return;

            const side = String(activeEntry.action).toUpperCase();
            const currentPrice = Number(
                price.find(item => item.symbol === symbol)?.result?.at(-1)?.Fechamento,
            );
            if (!Number.isFinite(currentPrice) || currentPrice <= 0) return;

            const stop = Number(activeEntry.stopRemoved
                ? NaN
                : activeEntry.stop ?? activeEntry.stopPrice ?? activeEntry.expectedPriceStop);
            const takeProfit = Number(activeEntry.takeProfitRemoved
                ? NaN
                : activeEntry.takeProfit);

            const stopTriggered = Number.isFinite(stop) &&
                (side === 'BUY' ? currentPrice <= stop : currentPrice >= stop);
            const takeProfitTriggered = Number.isFinite(takeProfit) &&
                (side === 'BUY' ? currentPrice >= takeProfit : currentPrice <= takeProfit);
            const exitReason = stopTriggered
                ? 'stop'
                : takeProfitTriggered
                    ? 'takeProfit'
                    : null;
            if (!exitReason) return;

            const exitKey = `${symbol}:${activeEntry.timestamp || activeEntry.time}:${exitReason}`;
            if (pendingExitsRef.current.has(exitKey)) return;
            pendingExitsRef.current.add(exitKey);

            executeOrder({
                symbol,
                side: 'exit',
                price: currentPrice,
                exitReason,
            })
                .catch(error => console.error(`Erro ao encerrar ${symbol} por ${exitReason}:`, error))
                .finally(() => pendingExitsRef.current.delete(exitKey));
        });
    }, [executeOrder, price, signalsBySymbolState]);


    useEffect(() => {
        if (
            price.length === 0 &&
            trendClassification.length === 0 &&
            trendPrimary.length === 0 &&
            amrsi.length === 0 &&
            vppr.length === 0
        ) {
            return;
        }

        const allSymbols = [
            ...new Set([
                ...trendClassification.map(item => item.symbol),
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

        localStorage.setItem("flagsBySymbol", JSON.stringify(flagsBySymbolRef.current));

        allSymbols.forEach(symbol => {
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
                    lastProcessedMovement: null,
                    firstEntryExecuted: false,
                    processedPartialEntries: [],
                };
            }

            const lastTrendArray = trendClassification.find(item => item.symbol === symbol)?.result || [];
            const lastTrendPrimaryArray = trendPrimary.find(item => item.symbol === symbol)?.result || [];
            const lastAmrsiArray = amrsi.find(item => item.symbol === symbol)?.result || [];
            const lastVpprArray = vppr.find(item => item.symbol === symbol)?.result || [];
            const lastPriceArray = price.find(item => item.symbol === symbol)?.result || [];
            const lastPartialEntryArray = partialEntry.find(item => item.symbol === symbol)?.result || [];

            const lastTrend = lastTrendArray[lastTrendArray.length - 1];
            const lastTrendPrimary = lastTrendPrimaryArray[lastTrendPrimaryArray.length - 1];
            const lastAmrsi = lastAmrsiArray[lastAmrsiArray.length - 1];
            const lastVppr = lastVpprArray[lastVpprArray.length - 1];
            const lastPrice = lastPriceArray[lastPriceArray.length - 1];
            const lastPartialEntry = lastPartialEntryArray[lastPartialEntryArray.length - 1];
            const previousTrendIdentity = getTrendIdentity(lastTrendRef.current[symbol]);


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
            if (!lastTrend || !lastPrice) {
                return;
            }


            const currentTrendIdentity = getTrendIdentity(lastTrend);
            const flags = flagsBySymbolRef.current[symbol];
            const currentPrice = Number(lastPrice?.Fechamento);
            const openPosition = getOpenPosition(signalsHistoryRef.current?.[symbol] || []);
            const primaryDirection = getIndicatorDirection(lastTrendPrimary?.type);
            const vpprDirection = getIndicatorDirection(lastVppr?.vpprTrend);
            const amrsiDirection = getIndicatorDirection(lastAmrsi?.type);

            let signal = null;

            const TYPE_BREAK = ["PIVOT_BREAK_BUY", "PIVOT_BREAK_SELL"];

            if (lastTrend && previousTrendIdentity && previousTrendIdentity !== currentTrendIdentity) {
                flags.exceededBand = false;
                flags.blockedTrendIdentity = null;
            }

            const isTrendBlocked = flags.blockedTrendIdentity === currentTrendIdentity;
            const { low: bandLow, high: bandHigh } = getTrendBandBounds(lastTrend);

            const trendMovements = getContextTrendMovements(trend, symbol);
            const lastTrendMovement = trendMovements[trendMovements.length - 1] || null;
            const trendDirection = getTrendDirection(lastTrend?.type) ??
                getTrendMovementDirection(lastTrendMovement);

            // Evita repetição de ordens
            const currentMovementIdentity = [
                lastTrendMovement?.tipo,
                lastTrendMovement?.closeTime,
                lastTrendMovement?.closePrice,
                lastTrendMovement?.pivot?.index,
            ].join('|');

            const isNewMovement = flags.lastProcessedMovement !== currentMovementIdentity;

            const openDirection = openPosition ? String(openPosition.action).toUpperCase() : null;
            const directionAllowsBuy = openDirection !== 'SELL';
            const directionAllowsSell = openDirection !== 'BUY';


            const isOutsideBand = lastTrendMovement && Number.isFinite(bandLow) && Number.isFinite(bandHigh)
                ? (!flags.inputExecuted && trendDirection === 'BUY' && currentPrice < bandLow - (lastTrend.limite / 5)) ||
                (!flags.inputExecuted && trendDirection === 'SELL' && currentPrice > bandHigh + (lastTrend.limite / 5))
                : false;

            if (isOutsideBand && !isTrendBlocked) {
                flags.exceededBand = true;
                flags.blockedTrendIdentity = currentTrendIdentity;
                return;
            }

            if (isTrendBlocked) {
                return;
            }

            if (!flags.isOperation && flags.inputExecuted && TYPE_BREAK.includes(lastTrend?.type)) {
                flags.exceededBand = false;
                flags.inputExecuted = false;
                flags.blockedTrendIdentity = null;
                return;
            }


            const retestBuyPrice = Number(lastTrend?.buy);
            const buyTriggerPrice = retestBuyPrice;
            const retestSellPrice = Number(lastTrend?.sell);
            const sellTriggerPrice = retestSellPrice;
            const entryStop = Number(lastTrend?.stop);



            // ─── Condições técnicas (sem clique, sem modo) ─────────────────────────────
            const technicalBuyCondition =
                hasValidTradingFunds &&
                isNewMovement &&
                directionAllowsBuy &&
                Number.isFinite(currentPrice) &&
                Number.isFinite(buyTriggerPrice) &&
                Number.isFinite(entryStop) &&
                primaryDirection === 'BUY' &&
                TYPE_RALLY_BUY.includes(lastTrend?.type) &&
                entryStop < currentPrice &&
                currentPrice >= buyTriggerPrice

            const technicalSellCondition =
                hasValidTradingFunds &&
                isNewMovement &&
                directionAllowsSell &&
                Number.isFinite(currentPrice) &&
                Number.isFinite(sellTriggerPrice) &&
                Number.isFinite(entryStop) &&
                primaryDirection === 'SELL' &&
                TYPE_RALLY_SELL.includes(lastTrend?.type) &&
                entryStop > currentPrice &&
                currentPrice <= sellTriggerPrice

            const entryPartialBuy =
                hasValidTradingFunds &&
                Number.isFinite(currentPrice) &&
                Number.isFinite(lastPartialEntry?.partialBuy) &&
                ENTRY_PARTIAL_BUY.includes(lastPartialEntry?.type) &&
                currentPrice >= lastPartialEntry?.partialBuy

            const entryPartialSell =
                hasValidTradingFunds &&
                Number.isFinite(currentPrice) &&
                Number.isFinite(lastPartialEntry?.partialSell) &&
                ENTRY_PARTIAL_SELL.includes(lastPartialEntry?.type) &&
                currentPrice <= lastPartialEntry?.partialSell

            const partialBuyIdentity = entryPartialBuy
                ? ['PARTIAL_BUY', lastPartialEntry?.type, lastPartialEntry?.time, lastPartialEntry?.partialBuy].join('|')
                : null;
            const partialSellIdentity = entryPartialSell
                ? ['PARTIAL_SELL', lastPartialEntry?.type, lastPartialEntry?.time, lastPartialEntry?.partialSell].join('|')
                : null;
            const processedPartialEntries = Array.isArray(flags.processedPartialEntries)
                ? flags.processedPartialEntries
                : [];
            const partialBuyAlreadyExecuted = partialBuyIdentity
                ? processedPartialEntries.includes(partialBuyIdentity)
                : false;
            const partialSellAlreadyExecuted = partialSellIdentity
                ? processedPartialEntries.includes(partialSellIdentity)
                : false;

            // ─── Modo manual: exige clique em "buy"/"sell" e NÃO está no automático ────
            const conditionBuyManual =
                technicalBuyCondition && buttonOperation?.buy && !isAutomaticExecutionEnabled;
            const conditionSellManual =
                technicalSellCondition && buttonOperation?.sell && !isAutomaticExecutionEnabled;

            // ─── Modo automático: NÃO exige clique ─────────────────────────────────────
            const conditionBuyAuto =
                (technicalBuyCondition && isAutomaticExecutionEnabled) ||
                (entryPartialBuy && flags.firstEntryExecuted && !partialBuyAlreadyExecuted);
            const conditionSellAuto =
                (technicalSellCondition && isAutomaticExecutionEnabled) ||
                (entryPartialSell && flags.firstEntryExecuted && !partialSellAlreadyExecuted);

            // ─── Executor comum (manual e automático) ──────────────────────────────────
            const runEntry = async ({ side, stop, price, automatic, isTechnicalEntry, partialEntryIdentity }) => {
                const symbolKey = symbol;
                if (pendingAutomaticOrdersRef.current.has(symbolKey)) {
                    console.warn(`⏳ [${symbolKey}] entrada ${side} já em andamento, ignorando`);
                    return;
                }
                if (partialEntryIdentity) {
                    const partialKey = `${symbolKey}:${partialEntryIdentity}`;
                    if (pendingPartialEntriesRef.current.has(partialKey)) {
                        console.warn(`⏳ [${symbolKey}] parcial ${partialEntryIdentity} já em andamento, ignorando`);
                        return;
                    }
                    pendingPartialEntriesRef.current.add(partialKey);
                }
                pendingAutomaticOrdersRef.current.add(symbolKey);
                let timeoutId;
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(
                        () => reject(new Error(`Timeout de 15s na entrada ${side} de ${symbolKey}`)),
                        15000,
                    );
                });

                try {
                    const calculated = await Promise.race([
                        calculateOrder(side, stop, balanceAndRisk, symbolKey),
                        timeoutPromise,
                    ]);
                    if (!calculated) {
                        throw new Error(`Cálculo da ordem ${side.toUpperCase()} retornou vazio.`);
                    }
                    const quantity = Number(calculated?.capital?.positionSize);
                    if (!Number.isFinite(quantity) || quantity <= 0) {
                        throw new Error(`Quantidade inválida (${quantity}).`);
                    }

                    await Promise.race([
                        executeOrder({
                            symbol: symbolKey,
                            side,
                            price,
                            stop,
                            quantity,
                            automatic,
                        }),
                        timeoutPromise,
                    ]);

                    const currentFlags = flagsBySymbolRef.current[symbolKey];
                    if (currentFlags) {
                        if (isTechnicalEntry) {
                            currentFlags.firstEntryExecuted = true;
                        }
                        if (partialEntryIdentity) {
                            const processed = Array.isArray(currentFlags.processedPartialEntries)
                                ? currentFlags.processedPartialEntries
                                : [];
                            if (!processed.includes(partialEntryIdentity)) {
                                currentFlags.processedPartialEntries = [...processed, partialEntryIdentity];
                            }
                        }
                        currentFlags.lastProcessedMovement = currentMovementIdentity;
                        localStorage.setItem('flagsBySymbol', JSON.stringify(flagsBySymbolRef.current));
                    }
                    setButtonOperationSafe({ buy: false, sell: false, exit: false });
                } catch (error) {
                    console.error(`❌ [${symbolKey}] erro na entrada ${side}:`, error);
                } finally {
                    clearTimeout(timeoutId);
                    pendingAutomaticOrdersRef.current.delete(symbolKey);
                    if (partialEntryIdentity) {
                        pendingPartialEntriesRef.current.delete(`${symbolKey}:${partialEntryIdentity}`);
                    }
                }
            };

            if (conditionBuyManual || conditionBuyAuto) {
                runEntry({
                    side: 'buy',
                    stop: Number(entryStop),
                    price: currentPrice,
                    automatic: conditionBuyAuto,
                    isTechnicalEntry: technicalBuyCondition,
                    partialEntryIdentity: conditionBuyAuto && !technicalBuyCondition && entryPartialBuy
                        ? partialBuyIdentity
                        : null,
                });
            }

            if (conditionSellManual || conditionSellAuto) {
                runEntry({
                    side: 'sell',
                    stop: Number(entryStop),
                    price: currentPrice,
                    automatic: conditionSellAuto,
                    isTechnicalEntry: technicalSellCondition,
                    partialEntryIdentity: conditionSellAuto && !technicalSellCondition && entryPartialSell
                        ? partialSellIdentity
                        : null,
                });
            }

            //==============================|🚫EXIT|==============================//
            const conditionExitBuyMain =
                lastPrice.Fechamento <= lastTrend?.stop &&
                flags.isOperation &&
                flags.inputExecuted &&
                primaryDirection === 'EXIT_BUY'
                // lastVppr?.vpprTrend === 'sell' &&
                TYPE_BUY_EXIT.includes(lastTrend?.type);

            const conditionExitSellMain =
                lastPrice.Fechamento >= lastTrend?.stop &&
                flags.isOperation &&
                flags.inputExecuted &&
                primaryDirection === 'EXIT_SELL'
                // lastVppr?.vpprTrend === 'buy' &&
                TYPE_SELL_EXIT.includes(lastTrend?.type);

            // Saídas por stop/take (independem de indicador)
            const activeEntryForExit = getOpenPosition(signalsHistoryRef.current?.[symbol] || []);
            const activeSide = activeEntryForExit ? String(activeEntryForExit.action).toUpperCase() : null;
            const activeStop = activeEntryForExit
                ? Number(activeEntryForExit.stopRemoved
                    ? NaN
                    : activeEntryForExit.stop ?? activeEntryForExit.stopPrice ?? activeEntryForExit.expectedPriceStop)
                : NaN;
            const activeTakeProfit = activeEntryForExit
                ? Number(activeEntryForExit.takeProfitRemoved
                    ? NaN
                    : activeEntryForExit.takeProfit)
                : NaN;
            const stopHit =
                Number.isFinite(activeStop) &&
                (activeSide === 'BUY' ? currentPrice <= activeStop : currentPrice >= activeStop);
            const takeHit =
                Number.isFinite(activeTakeProfit) &&
                (activeSide === 'BUY' ? currentPrice >= activeTakeProfit : currentPrice <= activeTakeProfit);

            const exitReasonForBuy = stopHit ? 'stop' : takeHit ? 'takeProfit' : 'indicator';
            const exitReasonForSell = stopHit ? 'stop' : takeHit ? 'takeProfit' : 'indicator';

            if (flags.inputExecuted && flags.isOperation && flags.numberEntries > 0 && activeSide) {
                const canExitBuy =
                    activeSide === 'BUY' &&
                    (conditionExitBuyMain || stopHit || takeHit);

                const canExitSell =
                    activeSide === 'SELL' &&
                    (conditionExitSellMain || stopHit || takeHit);

                // Manual: exige clique em "exit". Automático: dispara sozinho.
                const conditionExitBuyManual =
                    canExitBuy && buttonOperation?.exit && !isAutomaticExecutionEnabled;
                const conditionExitSellManual =
                    canExitSell && buttonOperation?.exit && !isAutomaticExecutionEnabled;
                const conditionExitBuyAuto =
                    canExitBuy && isAutomaticExecutionEnabled && hasValidTradingFunds;
                const conditionExitSellAuto =
                    canExitSell && isAutomaticExecutionEnabled && hasValidTradingFunds;

                const runExit = async (side, reason) => {
                    // Evita reentrância por símbolo enquanto a ordem assíncrona roda
                    const key = `${symbol}:${side}:${reason}:${activeEntryForExit?.timestamp || activeEntryForExit?.time}`;
                    if (pendingAutomaticExitsRef.current.has(key)) return;
                    pendingAutomaticExitsRef.current.add(key);
                    flags.confirmationPending = true;

                    try {
                        await executeOrder({
                            symbol,
                            side: 'exit',
                            price: currentPrice,
                            exitReason: reason,
                            // 'stop' → STOP_BUY/STOP_SELL; 'takeProfit'|'indicator' → EXIT_BUY/EXIT_SELL
                        });

                        flags.upwardTrendCurrent = false;
                        flags.downwardTrendCurrent = false;
                        flags.exceededBand = false;
                        flags.blockedTrendIdentity = null;
                        flags.numberEntries = Math.max(0, (flags.numberEntries || 1) - 1);

                        const isLastExit = flags.numberEntries === 0;
                        if (isLastExit) {
                            flags.inputExecuted = false;
                            flags.isOperation = false;
                        }

                        setButtonOperationSafe({ buy: false, sell: false, exit: false });
                    } catch (error) {
                        console.error(`Erro ao encerrar ${symbol} (${side}, ${reason}):`, error);
                    } finally {
                        flags.confirmationPending = false;
                        pendingAutomaticExitsRef.current.delete(key);
                    }
                };

                if (conditionExitBuyManual) {
                    runExit('BUY', exitReasonForBuy);
                } else if (conditionExitSellManual) {
                    runExit('SELL', exitReasonForSell);
                } else if (conditionExitBuyAuto) {
                    runExit('BUY', exitReasonForBuy);
                } else if (conditionExitSellAuto) {
                    runExit('SELL', exitReasonForSell);
                }
            }


            if (signal) {
                const symbolHistory = signalsHistoryRef.current[symbol] || [];
                const nextHistory = [...symbolHistory, {
                    ...signal,
                    timestamp: new Date().toISOString()
                }].slice(-100);
                signalsHistoryRef.current = {
                    ...signalsHistoryRef.current,
                    [symbol]: nextHistory,
                };

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

        if (Object.keys(signalsBySymbol).length > 0) {
            setSignalsBySymbolState(previous => {
                const next = signalsHistoryRef.current;
                const keys = new Set([
                    ...Object.keys(previous || {}),
                    ...Object.keys(next),
                ]);
                // FIX: compare signal history contents instead of recreated object/array references.
                const hasChanges = [...keys].some(key => {
                    const previousHistory = previous?.[key] || [];
                    const nextHistory = next[key] || [];
                    if (previousHistory.length !== nextHistory.length) return true;

                    const previousLast = previousHistory[previousHistory.length - 1];
                    const nextLast = nextHistory[nextHistory.length - 1];
                    return previousLast?.timestamp !== nextLast?.timestamp ||
                        previousLast?.action !== nextLast?.action;
                });
                return hasChanges ? { ...next } : previous;
            });
        }

        if (Object.keys(newLastTrends).length > 0) {
            setLastTrendState(previous => mergeIfChanged(previous, newLastTrends));
        }
        if (Object.keys(newLastTrendsPrimary).length > 0) {
            setLastTrendStatePrimary(previous => mergeIfChanged(previous, newLastTrendsPrimary));
        }
        if (Object.keys(newLastVppr).length > 0) {
            setLastVpprState(previous => mergeIfChanged(previous, newLastVppr));
        }
        if (Object.keys(newLastAmrsi).length > 0) {
            setLastAmrsiState(previous => mergeIfChanged(previous, newLastAmrsi));
        }
    }, [
        trendClassification,
        trendPrimary,
        amrsi,
        vppr,
        price,
        trend,
        buttonOperation,
        isAutomaticExecutionEnabled,
        hasValidTradingFunds,
        calculatePositionSize,
        setButtonOperationSafe,
        setSignalsBySymbolState,
        sendOperationData,
    ]);

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
        trendClassification,
        trendPrimary,
        amrsi,
        vppr,
        price,
        lastTrend: lastTrendState,
        lastTrendPrimary: lastTrendStatePrimary,
        lastVppr: lastVpprState,
        lastAmrsi: lastAmrsiState,

        signalsBySymbol: signalsBySymbolState,
        operationResults,
        getLastAmrsiBySymbol,
        getLastVpprBySymbol,
        getLastTrendBySymbol,
        getLastTrendPrimaryBySymbol,
        calculateOrder,
        executeOrder,
        updateActiveStop,
        updateActiveTakeProfit,
        removeActiveStop,
        removeActiveTakeProfit,
        getSignalsBySymbol: (symbol) => signalsBySymbolState[symbol] || [],
        getAllSignals: () => signalsBySymbolState,
        getFlagsBySymbol: (symbol) => flagsBySymbolRef.current[symbol] || null
    };
};