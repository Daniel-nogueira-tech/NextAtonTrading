// useOperatingInputs.js
import { useMemo, useEffect, useContext, useRef, useState } from 'react';
import { ContextGraphics } from '../ContextGraphics/ContextGraphics';

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
    const { retestPointsStateRef, retestPointsStatePrimaryRef, amrsiData, vpprData, fullPrice } = useContext(ContextGraphics);

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
        () => normalizeCollection(vpprData, "VPPR", ["type", "vpprTrend", "time", "major", "volumeEmaSignal"], "signals"),
        [vpprData]
    );

    const amrsi = useMemo(
        () => normalizeCollection(amrsiData, "AMRSI", ["type", "time"], "signals"),
        [amrsiData]
    );

    // Usar useRef para persistir as flags entre renders
    const flagsBySymbolRef = useRef({});
    const signalsHistoryRef = useRef({});
    const [signalsBySymbolState, setSignalsBySymbolState] = useState({});

    //Usar useRef para armazenar o último trend de cada símbolo
    const lastTrendRef = useRef({});
    const [lastTrendState, setLastTrendState] = useState({});
    const lastTrendRefPrimary = useRef({});
    const [lastTrendStatePrimary, setLastTrendStatePrimary] = useState({});
    const lastVpprRef = useRef({});
    const [lastVpprState, setLastVpprState] = useState({});
    const lastAmrsiRef = useRef({});
    const [lastAmrsiState, setLastAmrsiState] = useState({});

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
                    lastSignal: null,
                    signalCount: 0
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
            if (!lastTrend || !lastTrendPrimary || !lastPrice) {
                console.log(`⚠️ [${symbol}] Dados insuficientes:`, {
                    lastTrend: !!lastTrend,
                    lastTrendPrimary: !!lastTrendPrimary,
                    lastPrice: !!lastPrice
                });
                return;
            }

            const flags = flagsBySymbolRef.current[symbol];
            const previousTrendIdentity = getTrendIdentity(lastTrendRef.current[symbol]);
            const currentTrendIdentity = getTrendIdentity(lastTrend);

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
            const TYPE_BUY_PRI = ["PIVOT_BUY_TREND", "PIVOT_BUY_RALLY", "PIVOT_BUY_RALLY_SEC", "PIVOT_BUY_RALLY_REVERSE", "pivotBreak-buy"];
            const TYPE_SELL_PRI = ["PIVOT_SELL_TREND", "PIVOT_SELL_RALLY", "PIVOT_SELL_RALLY_SEC", "PIVOT_SELL_RALLY_REVERSE", "pivotBreak-sell"];

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
                ? (!flags.inputExecuted && TYPE_BUY.includes(lastTrend.type) && lastPrice?.Fechamento < bandLow) ||
                (!flags.inputExecuted && TYPE_SELL.includes(lastTrend.type) && lastPrice?.Fechamento > bandHigh)
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
                console.log(`🔄 [${symbol}] Flag resetada por ${lastTrend?.type}`);
                return;
            };
            console.log(`📉 [${symbol}] Condição SELL:`, {
                primaryOk: TYPE_SELL_PRI.includes(lastTrendPrimary?.type),
                secondaryOk: TYPE_SELL.includes(lastTrend?.type),
                priceOk: lastPrice.Fechamento <= lastTrend?.sell,
                vpprOk: lastVppr?.trend === 'sell',
                vpprMajorOk: lastVppr?.major === "MajorSell",
                volumeEmaSignal: lastVppr?.volumeEmaSignal === 'Volume SELL Increasing',
                exceededBandOk: !flags.exceededBand,
                bandaOk: lastPrice.Fechamento >= lastTrend?.sell - (lastTrend?.limite / 3),
                bandaPrice: lastTrend?.sell - (lastTrend?.limite / 3),
                bandLowOk: lastPrice.Fechamento >= lastTrend?.pivotExit + (lastTrend?.limite / 2),
                pivoExit: lastTrend?.pivotExit,

            });
            //==============================|✅ENTRADAS EM OPERAÇÕES RETESTES|==============================//
            //🟢 Entrada de compra
            if (!flags.isOperation &&
                !flags.inputExecuted &&
                !flags.exceededBand &&
                flags.blockedTrendIdentity !== currentTrendIdentity &&
                TYPE_BUY_PRI.includes(lastTrendPrimary?.type)
            ) {
                const conditionBuy = TYPE_BUY.includes(lastTrend?.type) &&
                    lastPrice.Fechamento >= lastTrend?.buy &&
                    lastPrice.Fechamento <= lastTrend?.buy + (lastTrend?.limite / 2) &&
                    //  lastPrice.Fechamento <= lastTrend?.pivotExit - (lastTrend?.limite * 1.5) &&
                    lastVppr?.trend === 'buy' &&
                    lastVppr?.major === 'MajorBuy' &&
                    lastVppr?.volumeEmaSignal === 'Volume BUY Increasing'

                console.log(`📈 [${symbol}] Condição BUY:`, {
                    primaryOk: TYPE_BUY_PRI.includes(lastTrendPrimary?.type),
                    secondaryOk: TYPE_BUY.includes(lastTrend?.type),
                    priceOk: lastPrice.Fechamento >= lastTrend?.buy,
                    vpprOk: lastVppr?.trend === 'buy',
                    vpprMajorOk: lastVppr?.major === 'MajorBuy',
                    volumeEmaSignal: lastVppr?.volumeEmaSignal === 'Volume BUY Increasing',
                    exceededBandOk: !flags.exceededBand,
                    bandaOk: lastPrice.Fechamento <= lastTrend?.buy + (lastTrend?.limite / 2),
                    result: conditionBuy
                });

                if (conditionBuy) {
                    signal = {
                        symbol,
                        action: "BUY",
                        expectedPriceBuy: lastTrend.buy,
                        entryPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo || lastPrice?.time,
                        trendPrimary: lastTrendPrimary?.type,
                        trendSecondary: lastTrend?.type
                    };
                    flags.upwardTrendCurrent = true;
                    flags.inputExecuted = true;
                    flags.isOperation = true;
                    flags.signalCount += 1;
                    flags.upwardAmrsiCurrent = false; // Resetar a flag de AMRSI para permitir nova entrada parcial
                    console.log(`✅ [${symbol}] SINAL DE COMPRA GERADO! #${flags.signalCount}`);
                }
            }
            //🔴 Entrada de venda
            else if (!flags.isOperation &&
                !flags.inputExecuted &&
                !flags.exceededBand &&
                flags.blockedTrendIdentity !== currentTrendIdentity &&
                TYPE_SELL_PRI.includes(lastTrendPrimary?.type)
            ) {
                const conditionSell = TYPE_SELL.includes(lastTrend?.type) &&
                    lastPrice.Fechamento <= lastTrend?.sell &&
                    //lastPrice.Fechamento >= lastTrend?.sell - (lastTrend?.limite / 2) &&
                    // lastPrice.Fechamento >= lastTrend?.pivotExit + (lastTrend?.limite * 1.5) &&
                    lastVppr?.trend === 'sell' &&
                    lastVppr?.major === 'MajorSell' &&
                    lastVppr?.volumeEmaSignal === 'Volume SELL Increasing'

                console.log(`📉 [${symbol}] Condição SELL:`, {
                    primaryOk: TYPE_SELL_PRI.includes(lastTrendPrimary?.type),
                    secondaryOk: TYPE_SELL.includes(lastTrend?.type),
                    priceOk: lastPrice.Fechamento <= lastTrend?.sell,
                    vpprOk: lastVppr?.trend === 'sell',
                    vpprMajorOk: lastVppr?.major === "MajorSell",
                    volumeEmaSignal: lastVppr?.volumeEmaSignal === 'Volume SELL Increasing',
                    exceededBandOk: !flags.exceededBand,
                    bandaOk: lastPrice.Fechamento >= lastTrend?.sell - (lastTrend?.limite / 3),
                    bandaPrice: lastTrend?.sell - (lastTrend?.limite / 3),
                    bandLowOk: lastPrice.Fechamento >= lastTrend?.pivotExit + (lastTrend?.limite / 2),
                    pivoExit: lastTrend?.pivotExit,
                    result: conditionSell
                });

                if (conditionSell) {
                    signal = {
                        symbol,
                        action: "SELL",
                        expectedPriceSell: lastTrend.sell,
                        entryPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo || lastPrice?.time,
                        trendPrimary: lastTrendPrimary?.type,
                        trendSecondary: lastTrend?.type
                    };
                    flags.downwardTrendCurrent = true;
                    flags.inputExecuted = true;
                    flags.isOperation = true;
                    flags.signalCount += 1;
                    flags.downwardAmrsiCurrent = false; // Resetar a flag de AMRSI para permitir nova entrada parcial
                    console.log(`✅ [${symbol}] SINAL DE VENDA GERADO! #${flags.signalCount}`);
                }
            };

            //==============================|❌STOPS|==============================//

            //==============================|🚫SAÍDA DE OPERAÇÃO EM UM STOP|==============================//
            if (lastTrend?.stop && flags.inputExecuted && flags.isOperation) {
                // Lógica para saída de operações stop
                if (TYPE_BUY.includes(lastTrend?.type) && flags.upwardTrendCurrent && lastPrice.Fechamento <= lastTrend.stop) {
                    signal = {
                        symbol,
                        action: "STOP_BUY",
                        expectedPriceExitBuy: lastTrend.stop,
                        exitPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo || lastPrice?.time
                    };
                    flags.upwardTrendCurrent = false;
                    flags.downwardTrendCurrent = false;
                    flags.inputExecuted = false;
                    flags.isOperation = false;
                    flags.exceededBand = false;
                    flags.blockedTrendIdentity = null;
                    console.log(`🚪 [${symbol}] STOP DE COMPRA`);
                } else if (TYPE_SELL.includes(lastTrend?.type) && flags.downwardTrendCurrent && lastPrice.Fechamento >= lastTrend.stop) {
                    signal = {
                        symbol,
                        action: "STOP_SELL",
                        expectedPriceExitSell: lastTrend.stop,
                        exitPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo || lastPrice?.time
                    };
                    flags.downwardTrendCurrent = false;
                    flags.upwardTrendCurrent = false;
                    flags.inputExecuted = false;
                    flags.isOperation = false;
                    flags.exceededBand = false;
                    flags.blockedTrendIdentity = null;
                    console.log(`🚪 [${symbol}] STOP DE VENDA`);
                }
            }

            //==============================|🚫PONTOS DE SAÍDA EM ROMPIMENTO DE COM INVERSÃO DE TENDÊNCIA (SÓ POR SEGURANÇA)|==============================//
            //🔺 Saída de operações de compra
            if (TYPE_BUY_EXIT_REVERSE.includes(lastTrend?.type) && flags.upwardTrendCurrent && flags.inputExecuted && flags.isOperation) {
                if (lastPrice.Fechamento <= lastTrend.sell) {

                    console.log(`📉 [${symbol}] Condição EXIT BUY REVERSE:`, {
                        upwardTrendCurrentOk: flags.upwardTrendCurrent,
                        secondaryOk: TYPE_BUY_EXIT_REVERSE.includes(lastTrend?.type),
                        priceOk: lastPrice.Fechamento <= lastTrend?.sell,
                        result: TYPE_BUY_EXIT_REVERSE.includes(lastTrend?.type) && flags.upwardTrendCurrent
                    });
                    signal = {
                        symbol,
                        action: "EXIT_BUY",
                        expectedPriceExitBuy: lastTrend.sell,
                        exitPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo || lastPrice?.time
                    };
                    flags.upwardTrendCurrent = false;
                    flags.downwardTrendCurrent = false;
                    flags.inputExecuted = false;
                    flags.isOperation = false;
                    flags.exceededBand = false;
                    flags.blockedTrendIdentity = null;

                    console.log(`🚪 [${symbol}] SAÍDA DE COMPRA`);
                }
            }
            //🔺 Saída de operações de venda
            else if (TYPE_SELL_EXIT_REVERSE.includes(lastTrend?.type) && flags.downwardTrendCurrent && flags.inputExecuted && flags.isOperation) {
                if (lastPrice.Fechamento >= lastTrend.buy) {

                    console.log(`📉 [${symbol}] Condição EXIT SELL REVERSE:`, {
                        downwardTrendCurrentOk: flags.downwardTrendCurrent,
                        secondaryOk: TYPE_SELL_EXIT_REVERSE.includes(lastTrend?.type),
                        priceOk: lastPrice.Fechamento >= lastTrend?.buy,
                        result: TYPE_SELL_EXIT_REVERSE.includes(lastTrend?.type) && flags.downwardTrendCurrent
                    });
                    signal = {
                        symbol,
                        action: "EXIT_SELL",
                        expectedPriceExitSell: lastTrend.buy,
                        exitPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo || lastPrice?.time
                    };
                    flags.downwardTrendCurrent = false;
                    flags.upwardTrendCurrent = false;
                    flags.inputExecuted = false;
                    flags.isOperation = false;
                    flags.exceededBand = false;
                    flags.blockedTrendIdentity = null;
                    console.log(`🚪 [${symbol}] SAÍDA DE VENDA`);
                }
            }
            //=============================//PARCIAIS OU SAÍDAS//=============================//
            let trendUpPivotPlusLimit = lastTrend?.buy + (lastTrend?.limite * 4);
            let trendDownPivotPlusLimit = lastTrend?.sell - (lastTrend?.limite * 4);
            //🍰🟢 Parcial compra 
            if (
                TYPE_BUY_BREAK_UP.includes(lastTrend?.type) &&
                lastPrice?.Fechamento >= trendUpPivotPlusLimit &&
                flags.upwardTrendCurrent &&
                !flags.upwardAmrsiCurrent &&
                String(lastAmrsi?.type).toUpperCase() === 'PARTIAL_BUY'
            ) {

                console.log(`📉 [${symbol}] Condição PARTIAL BUY:`, {
                    upwardTrendCurrentOk: flags.upwardTrendCurrent,
                    amrsiType: lastAmrsi?.type,
                    amrsiOk: String(lastAmrsi?.type).toUpperCase() === 'PARTIAL_BUY',
                    result: flags.upwardTrendCurrent && String(lastAmrsi?.type).toUpperCase() === 'PARTIAL_BUY',
                });

                signal = {
                    symbol,
                    action: "EXIT_BUY",
                    partialPrice: lastPrice?.Fechamento,
                    time: lastPrice?.Tempo || lastPrice?.time
                };
                flags.upwardAmrsiCurrent = true;
                flags.upwardTrendCurrent = false;
                flags.inputExecuted = false;
                flags.isOperation = false;
                flags.exceededBand = false;
                flags.blockedTrendIdentity = null;
                flags.signalCount += 1;
                console.log(`🚪💲 [${symbol}] PARTIAL BUY`);
            }
            //🍰🔴 Parcial de venda
            else if (
                TYPE_SELL_BREAK_UP.includes(lastTrend?.type) &&
                flags.downwardTrendCurrent &&
                lastPrice?.Fechamento <= trendDownPivotPlusLimit &&
                !flags.downwardAmrsiCurrent &&
                String(lastAmrsi?.type).toUpperCase() === 'PARTIAL_SELL'
            ) {

                console.log(`📉 [${symbol}] Condição PARTIAL SELL:`, {
                    downwardTrendCurrentOk: flags.downwardTrendCurrent,
                    amrsiType: lastAmrsi?.type,
                    amrsiOk: String(lastAmrsi?.type).toUpperCase() === 'PARTIAL_SELL',
                    result: flags.downwardTrendCurrent && String(lastAmrsi?.type).toUpperCase() === 'PARTIAL_SELL',
                });

                signal = {
                    symbol,
                    action: "EXIT_SELL",
                    partialPrice: lastPrice?.Fechamento,
                    time: lastPrice?.Tempo || lastPrice?.time
                };
                flags.downwardAmrsiCurrent = true;
                flags.downwardTrendCurrent = false;
                flags.inputExecuted = false;
                flags.isOperation = false;
                flags.exceededBand = false;
                flags.blockedTrendIdentity = null;
                flags.signalCount += 1;

                console.log(`🚪💲 [${symbol}] PARTIAL SELL`);
            };

            //==============================|🚫EXIT|==============================//
            if (TYPE_BUY_EXIT.includes(lastTrend?.type) && flags.inputExecuted) {
                const conditionExitBuy = lastPrice.Fechamento <= lastTrend?.stop &&
                    lastVppr?.trend === 'sell';
                //const conditionExitBuy = lastPrice.Fechamento >= lastTrend?.stop - (lastTrend?.limite * 0.03)

                console.log(`📉 [${symbol}] Condição EXIT BUY:`, {
                    upwardTrendCurrentOk: flags.upwardTrendCurrent,
                    secondaryOk: TYPE_BUY_EXIT.includes(lastTrend?.type),
                    priceOk: lastPrice.Fechamento <= lastTrend?.sell,
                    result: TYPE_BUY_EXIT.includes(lastTrend?.type) && flags.upwardTrendCurrent
                });
                if (conditionExitBuy) {
                    signal = {
                        symbol,
                        action: "EXIT_BUY",
                        expectedPriceExitBuy: lastTrend.sell,
                        exitPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo || lastPrice?.time
                    };
                    flags.upwardTrendCurrent = false;
                    flags.inputExecuted = false;
                    flags.isOperation = false;
                    flags.exceededBand = false;
                    flags.blockedTrendIdentity = null;
                    console.log(`🚪 [${symbol}] SAÍDA DE COMPRA`);
                };
            } else if (TYPE_SELL_EXIT.includes(lastTrend?.type) && flags.inputExecuted && flags.isOperation) {
                const conditionExitSell = lastPrice.Fechamento >= lastTrend?.stop &&
                    lastVppr?.trend === 'buy';
                //const conditionExitSell = lastPrice.Fechamento <= lastTrend?.stop + (lastTrend?.limite * 0.03)
                if (conditionExitSell) {
                    signal = {
                        symbol,
                        action: "EXIT_SELL",
                        expectedPriceExitSell: lastTrend.buy,
                        exitPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo || lastPrice?.time
                    };
                    flags.downwardTrendCurrent = false;
                    flags.inputExecuted = false;
                    flags.isOperation = false;
                    flags.exceededBand = false;
                    flags.blockedTrendIdentity = null;
                    console.log(`🚪 [${symbol}] SAÍDA DE VENDA`);
                }
            }
            //==============================|🚫SAÍDA EM UM ROMPIMENTO (BREAK)|==============================//
            if (TYPE_BREAK.includes(lastTrend?.type) && flags.inputExecuted && flags.isOperation && flags.upwardTrendCurrent) {
                const conditionExitBuy = lastPrice.Fechamento <= lastTrend?.stop;

                console.log(`📉 [${symbol}] Condição BREAK EXIT BUY:`, {
                    upwardTrendCurrentOk: flags.upwardTrendCurrent,
                    secondaryOk: TYPE_BREAK.includes(lastTrend?.type),
                    priceOk: lastPrice.Fechamento <= lastTrend?.stop,
                    result: TYPE_BREAK.includes(lastTrend?.type) && flags.upwardTrendCurrent
                });
                if (conditionExitBuy) {
                    signal = {
                        symbol,
                        action: "EXIT_BUY",
                        expectedPriceExitBuy: lastTrend.stop,
                        exitPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo || lastPrice?.time
                    };
                    flags.upwardTrendCurrent = false;
                    flags.downwardTrendCurrent = false;
                    flags.inputExecuted = false;
                    flags.isOperation = false;
                    flags.exceededBand = false;
                    flags.blockedTrendIdentity = null;
                    console.log(`🚪 [${symbol}] SAÍDA DE COMPRA EM BREAK`);
                }
            } else if (TYPE_BREAK.includes(lastTrend?.type) && flags.inputExecuted && flags.isOperation && flags.downwardTrendCurrent) {
                const conditionExitSell = lastPrice.Fechamento >= lastTrend?.stop;
                console.log(`📉 [${symbol}] Condição BREAK EXIT SELL:`, {
                    downwardTrendCurrentOk: flags.downwardTrendCurrent,
                    secondaryOk: TYPE_BREAK.includes(lastTrend?.type),
                    priceOk: lastPrice.Fechamento >= lastTrend?.stop,
                    result: TYPE_BREAK.includes(lastTrend?.type) && flags.downwardTrendCurrent
                });
                if (conditionExitSell) {
                    signal = {
                        symbol,
                        action: "EXIT_SELL",
                        expectedPriceExitSell: lastTrend.stop,
                        exitPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo || lastPrice?.time
                    };
                    flags.downwardTrendCurrent = false;
                    flags.upwardTrendCurrent = false;
                    flags.inputExecuted = false;
                    flags.isOperation = false;
                    flags.exceededBand = false;
                    flags.blockedTrendIdentity = null;
                    console.log(`🚪 [${symbol}] SAÍDA DE VENDA EM BREAK`);
                }
            }
            //==============================|🚫SAÍDA PELO VOLUME|==============================//
            if (flags.inputExecuted && flags.isOperation && flags.upwardTrendCurrent) {
                // SAÍDA PARA COMPRA PELO VOLUME
                const conditionExitBuy =
                    lastVppr?.volumeEmaSignal === 'Volume Stable' ||
                    lastVppr?.volumeEmaSignal === 'Volume BUY Weakly Increasing' ||
                    lastVppr?.volumeEmaSignal === 'Volume BUY Increasing' &&
                    lastVppr?.trend === 'sell' &&
                    lastPrice.Fechamento >= lastTrend?.buy + lastTrend?.limite

                if (conditionExitBuy) {
                    signal = {
                        symbol,
                        action: "EXIT_BUY",
                        exitPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo || lastPrice?.time
                    };
                    flags.upwardTrendCurrent = false;
                    flags.downwardTrendCurrent = false;
                    flags.inputExecuted = false;
                    flags.isOperation = false;
                    flags.exceededBand = false;
                    flags.blockedTrendIdentity = null;
                    console.log(`🚪 [${symbol}] SAÍDA DE COMPRA COM INVERSÃO DE VOLUME`);
                }
            }
            //SAÍDA PARA VENDA PELO VOLUME
            else if (flags.inputExecuted && flags.isOperation && flags.downwardTrendCurrent) {
                const conditionExitSell =
                    lastVppr?.volumeEmaSignal === 'Volume Stable' &&
                    lastVppr?.trend === 'buy' &&
                    lastPrice.Fechamento <= lastTrend?.sell - lastTrend?.limite
                if (conditionExitSell) {
                    signal = {
                        symbol,
                        action: "EXIT_SELL",
                        exitPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo || lastPrice?.time
                    };
                    flags.downwardTrendCurrent = false;
                    flags.upwardTrendCurrent = false;
                    flags.inputExecuted = false;
                    flags.isOperation = false;
                    flags.exceededBand = false;
                    flags.blockedTrendIdentity = null;
                    console.log(`🚪 [${symbol}] SAÍDA DE VENDA COM INVERSÃO DE VOLUME`);
                }
            };

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
            }
        });

        // Retorna os sinais para uso externo se necessário
        if (Object.keys(signalsBySymbol).length > 0) {
            console.log("🎯 Novos sinais detectados:", Object.keys(signalsBySymbol));
        }
        console.log("📊 Histórico de sinais por símbolo:", signalsHistoryRef.current);

        setSignalsBySymbolState({ ...signalsHistoryRef.current });


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

    }, [trend, trendPrimary, amrsi, vppr, price]);

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

    const operationResults = useMemo(() => calculateSignalResults(signalsHistoryRef.current), [signalsBySymbolState]);

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
        getSignalsBySymbol: (symbol) => signalsBySymbolState[symbol] || [],
        getAllSignals: () => signalsBySymbolState,
        getFlagsBySymbol: (symbol) => flagsBySymbolRef.current[symbol] || null
    };
};

// ==============================|Calcula o resultado das operações|============================== //
const calculateSignalResults = (signalsBySymbolState = {}) => {
    const operations = [];
    const perSymbol = {};

    Object.entries(signalsBySymbolState).forEach(([symbol, signals]) => {
        if (!Array.isArray(signals)) return;

        let openPosition = null;

        signals.forEach((signal) => {
            const action = String(signal?.action || '').toUpperCase();
            const priceValue = (value) => Number(value ?? 0);

            if (action === 'BUY') {
                openPosition = {
                    symbol,
                    side: 'BUY',
                    entryPrice: priceValue(signal.entryPrice ?? signal.expectedPriceBuy),
                    entrySignal: signal,
                    entryTime: signal.time || null,
                };
                return;
            }

            if (action === 'SELL') {
                openPosition = {
                    symbol,
                    side: 'SELL',
                    entryPrice: priceValue(signal.entryPrice ?? signal.expectedPriceSell),
                    entrySignal: signal,
                    entryTime: signal.time || null,
                };
                return;
            }

            if (!openPosition) return;

            let exitPrice = null;
            if (action === 'EXIT_BUY' || action === 'STOP_BUY') {
                exitPrice = priceValue(signal.exitPrice ?? signal.partialPrice ?? signal.entryPrice ?? signal.expectedPriceExitBuy);
                if (openPosition.side === 'BUY') {
                    const pnl = exitPrice - openPosition.entryPrice;
                    operations.push({
                        symbol,
                        side: 'BUY',
                        entryPrice: openPosition.entryPrice,
                        exitPrice,
                        pnl,
                        action,
                        entryTime: openPosition.entryTime,
                        exitTime: signal.time || null,
                    });
                    openPosition = null;
                }
                return;
            }

            if (action === 'EXIT_SELL' || action === 'STOP_SELL') {
                exitPrice = priceValue(signal.exitPrice ?? signal.partialPrice ?? signal.entryPrice ?? signal.expectedPriceExitSell);
                if (openPosition.side === 'SELL') {
                    const pnl = openPosition.entryPrice - exitPrice;
                    operations.push({
                        symbol,
                        side: 'SELL',
                        entryPrice: openPosition.entryPrice,
                        exitPrice,
                        pnl,
                        action,
                        entryTime: openPosition.entryTime,
                        exitTime: signal.time || null,
                    });
                    openPosition = null;
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

    console.log('📊 Resultado das operações', {
        operations,
        totalOperations: operations.length,
        winningOperations: operations.filter((item) => item.pnl > 0).length,
        losingOperations: operations.filter((item) => item.pnl < 0).length,
        totalProfit,
        totalLoss,
        netPnl,
        perSymbol,
    });

    return {
        operations,
        totalOperations: operations.length,
        winningOperations: operations.filter((item) => item.pnl > 0).length,
        losingOperations: operations.filter((item) => item.pnl < 0).length,
        totalProfit,
        totalLoss,
        netPnl,
        perSymbol,
    };
};

export const useCalculateResults = (signalsBySymbolState = {}) => {
    return useMemo(() => calculateSignalResults(signalsBySymbolState), [signalsBySymbolState]);
};

