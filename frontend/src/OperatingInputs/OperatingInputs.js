// useOperatingInputs.js
import { useMemo, useEffect, useContext, useRef, useState } from 'react';
import { ContextGraphics } from '../ContextGraphics/ContextGraphics';
import axios from 'axios';
import Swal from 'sweetalert2'

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
    const { retestPointsStateRef, retestPointsStatePrimaryRef, amrsiData, vpprData, fullPrice, buttonOperation, setButtonOperation } = useContext(ContextGraphics);

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
    const operationResults = {};


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
            if (!lastTrend || !lastTrendPrimary || !lastPrice) {
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
            const TYPE_BUY_PRI = ["PIVOT_BUY_TREND", "PIVOT_BUY_RALLY", "PIVOT_BUY_RALLY_SEC", "PIVOT_BUY_RALLY_REVERSE", "PIVOT_BREAK_BUY", "PIVOT_BUY_RALLY_REACT_SEC", "PIVOT_BUY_RALLY_SEC_LATE"];
            const TYPE_SELL_PRI = ["PIVOT_SELL_TREND", "PIVOT_SELL_RALLY", "PIVOT_SELL_RALLY_SEC", "PIVOT_SELL_RALLY_REVERSE", "PIVOT_BREAK_SELL", "PIVOT_SELL_RALLY_REACT_SEC", "PIVOT_SELL_RALLY_SEC_LATE"];

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

            //==============================|✅ENTRADAS EM OPERAÇÕES RETESTES|==============================//
            const conditionBuyMain = TYPE_BUY.includes(lastTrend?.type) &&
                lastPrice.Fechamento <= lastTrend?.buy + lastTrend?.limite &&
                lastPrice.Fechamento >= lastTrend?.buy - lastTrend?.limite &&  //banda
                lastVppr?.vpprTrend === 'buy' &&
               // lastVppr?.major === 'MajorBuy' &&
                lastVppr?.volumeEmaSignal === 'Volume BUY Increasing';


            //🟢 Entrada de compra
            if (!flags.exceededBand && flags.blockedTrendIdentity !== currentTrendIdentity) {

                const conditionBuy =
                    conditionBuyMain &&
                    buttonOperation.buy

                // ***Muda as  classe dos butão
                const btnBuy = document.querySelector('.btn-buy');
                conditionBuyMain ? btnBuy.classList.add('btn-pulse-buy') : btnBuy.classList.remove('btn-pulse-buy');

                console.log(`📈 [${symbol}] Condição BUY:`, {
                    secondaryOk: TYPE_BUY.includes(lastTrend?.type),
                    priceOk: lastPrice.Fechamento <= lastTrend?.buy,
                    vpprOk: lastVppr?.vpprTrend === 'buy',
                    vpprMajorOk: lastVppr?.major === 'MajorBuy',
                    volumeEmaSignal: lastVppr?.volumeEmaSignal === 'Volume BUY Increasing',
                    exceededBandOk: !flags.exceededBand,
                    bandaOk: lastPrice.Fechamento >= lastTrend?.buy - lastTrend?.limite,
                    buttonOperationOk: buttonOperation.buy,
                    result: conditionBuy
                });

                if (conditionBuy) {
                    if (!flags.confirmationPending) {
                        flags.confirmationPending = true;
                        Swal.fire({
                            title: `Confirmar compra ${symbol}`,
                            html: `Preço de entrada: <b>${lastPrice?.Fechamento}</b><br>Preço esperado: <b>${lastTrend.buy.toFixed(2)}</b></br> Total operations: <b>${flags.numberEntries}</b>`,
                            icon: 'question',
                            showCancelButton: true,
                            confirmButtonText: 'Buy',
                            cancelButtonText: 'Cancelar',
                            allowOutsideClick: false,
                            theme: 'dark',
                            width: '200px',
                            customClass: {
                                popup: 'my-swal-popup',
                                confirmButton: 'confirm-Button-buy'
                            }
                        }).then(result => {
                            try {
                                if (result.isConfirmed) {
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
                                    calculatePositionSize(flags.lastSignal, signalsHistoryRef.current), [signalsBySymbolState];
                                    // **Atualiza botões e estado de simbolos
                                    setButtonOperation({ buy: false, sell: false, exit: false });
                                    setSignalsBySymbolState({ ...signalsHistoryRef.current });

                                    console.log(`✅ [${symbol}] SINAL DE COMPRA GERADO! #${flags.signalCount}`);
                                } else {
                                    console.log(`❌ [${symbol}] Compra cancelada pelo usuário`);
                                }
                            } finally {
                                flags.confirmationPending = false;
                            }
                        }).catch(err => {
                            console.error('Erro na confirmação de compra', err);
                            flags.confirmationPending = false;
                        });
                    }
                }
            }

            // Condição de venda principal
            const conditionSellMain = TYPE_SELL.includes(lastTrend?.type) &&
                lastPrice.Fechamento <= lastTrend?.sell + lastTrend?.limite && //Banda acima
                lastPrice.Fechamento >= lastTrend?.sell - lastTrend?.limite &&
                lastVppr?.vpprTrend === 'sell' &&
                //lastVppr?.major === 'MajorSell' &&
                lastVppr?.volumeEmaSignal === 'Volume SELL Increasing';

            console.log('>>',  )

            //🔴 Entrada de venda
            if (!flags.exceededBand && flags.blockedTrendIdentity !== currentTrendIdentity) {
                // ***Muda as  classe dos butão
                const btnSell = document.querySelector('.btn-sell');
                conditionSellMain ? btnSell.classList.add('btn-pulse-sell') : btnSell.classList.remove('btn-pulse-sell');

                console.log('conditionSellMain>>', conditionSellMain)
                const conditionSell =
                    conditionSellMain &&
                    buttonOperation.sell


                console.log(`📉 [${symbol}] Condição SELL:`, {
                    secondaryOk: TYPE_SELL.includes(lastTrend?.type),
                    priceOk: lastPrice.Fechamento >= lastTrend?.sell,
                    vpprOk: lastVppr?.vpprTrend === 'sell',
                    vpprMajorOk: lastVppr?.major === "MajorSell",
                    volumeEmaSignal: lastVppr?.volumeEmaSignal === 'Volume SELL Increasing',
                    buttonOperationOk: buttonOperation.sell,
                    exceededBandOk: !flags.exceededBand,
                    bandaOk: lastPrice.Fechamento <= lastTrend?.sell + lastTrend?.limite,
                    bandaPrice: lastPrice.Fechamento >= lastTrend?.sell,
                    result: conditionSell
                });

                if (conditionSell) {
                    if (!flags.confirmationPending) {
                        flags.confirmationPending = true;
                        Swal.fire({
                            title: `Confirm sell ${symbol}`,
                            html: `Preço de entrada: <b>${lastPrice?.Fechamento}</b><br>Preço esperado: <b>${((lastTrend.sell)).toFixed(2)}</b><br> Total operation: <b>${flags.numberEntries}`,
                            icon: 'question',
                            showCancelButton: true,
                            confirmButtonText: 'Sell',
                            cancelButtonText: 'Cancel',
                            allowOutsideClick: false,
                            theme: 'dark',
                            width: '200px',
                            customClass: {
                                popup: 'my-swal-popup',
                                confirmButton: 'confirm-Button-sell'
                            }

                        }).then(result => {
                            try {
                                if (result.isConfirmed) {
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
                                    calculatePositionSize(flags.lastSignal, signalsHistoryRef.current), [signalsBySymbolState];

                                    // **Atualiza botões e estado de simbolos
                                    setButtonOperation({ buy: false, sell: false, exit: false });
                                    setSignalsBySymbolState({ ...signalsHistoryRef.current });

                                    console.log(`✅ [${symbol}] SINAL DE VENDA GERADO! #${flags.signalCount}`);
                                } else {
                                    console.log(`❌ [${symbol}] Venda cancelada pelo usuário`);
                                }
                            } finally {
                                flags.confirmationPending = false;
                            }
                        }).catch(err => {
                            console.error('Erro na confirmação de venda', err);
                            flags.confirmationPending = false;
                        });
                    }
                }
            };



            //==============================|🚫EXIT|==============================//
            //🟢 Condição de saída principal
            const conditionExitBuyMain =
                lastPrice.Fechamento <= lastTrend?.stop &&
                flags.isOperation &&
                flags.inputExecuted &&
                lastVppr?.vpprTrend === 'sell' &&
                TYPE_BUY_EXIT.includes(lastTrend?.type);

            const conditionExitSellMain =
                lastPrice.Fechamento >= lastTrend?.stop &&
                flags.isOperation &&
                flags.inputExecuted &&
                lastVppr?.vpprTrend === 'buy' &&
                TYPE_SELL_EXIT.includes(lastTrend?.type);

            const btnExit = document.querySelector('.btn-exit');
            const shouldPulseExit = conditionExitBuyMain || conditionExitSellMain;
            if (btnExit) {
                shouldPulseExit ? btnExit.classList.add('btn-pulse-exit') : btnExit.classList.remove('btn-pulse-exit');
            }

            if (TYPE_BUY_EXIT.includes(lastTrend?.type) && flags.inputExecuted && flags.isOperation && flags.numberEntries > 0) {
                const conditionExitBuy =
                    conditionExitBuyMain &&
                    buttonOperation?.exit;

                console.log(`📉 [${symbol}] Condição EXIT BUY:`, {
                    upwardTrendCurrentOk: flags.upwardTrendCurrent,
                    secondaryOk: TYPE_BUY_EXIT.includes(lastTrend?.type),
                    priceOk: lastPrice.Fechamento <= lastTrend?.sell,
                    result: TYPE_BUY_EXIT.includes(lastTrend?.type) && flags.upwardTrendCurrent
                });

                if (conditionExitBuy) {
                    if (!flags.confirmationPending) {
                        flags.confirmationPending = true;

                        Swal.fire({
                            title: `confirm purchase exit ${symbol}`,
                            html: `Preço de entrada: <b>${lastPrice?.Fechamento}</b> </br> Remaining operations:<b>${flags.numberEntries}</b>`,
                            icon: 'question',
                            showCancelButton: true,
                            confirmButtonText: 'Sell',
                            cancelButtonText: 'Cancelar',
                            allowOutsideClick: false,
                            theme: 'dark',
                            width: '200px',
                            customClass: {
                                popup: 'my-swal-popup',
                                confirmButton: 'confirm-Button-sell'
                            }
                        }).then(result => {
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
                                    calculatePositionSize(flags.lastSignal, signalsHistoryRef.current), [signalsBySymbolState];

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
                        }).catch(err => {
                            console.error('Erro na confirmação de operação de saída', err);
                            flags.confirmationPending = false;
                        });
                    }
                }
            }

            if (TYPE_SELL_EXIT.includes(lastTrend?.type) && flags.inputExecuted && flags.isOperation && flags.numberEntries > 0) {
                const conditionExitSell =
                    conditionExitSellMain &&
                    buttonOperation?.exit;

                if (conditionExitSell) {
                    if (!flags.confirmationPending) {
                        flags.confirmationPending = true;
                        Swal.fire({
                            title: `confirm sale exit ${symbol}`,
                            html: `Preço de saída: <b>${lastPrice?.Fechamento}</b> </br>Remaining operations: <b>${flags.numberEntries}</b>`,
                            icon: 'question',
                            showCancelButton: true,
                            confirmButtonText: 'Buy',
                            cancelButtonText: 'Cancel',
                            allowOutsideClick: false,
                            theme: 'dark',
                            width: '200px',
                            customClass: {
                                popup: 'my-swal-popup',
                                confirmButton: 'confirm-Button-buy'
                            }
                        }).then(result => {
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
                                    calculatePositionSize(flags.lastSignal, signalsHistoryRef.current), [signalsBySymbolState];

                                    // **Atualiza botões e estado de simbolos
                                    setButtonOperation({ buy: false, sell: false, exit: false });
                                    setSignalsBySymbolState({ ...signalsHistoryRef.current });

                                } else {
                                    console.log(`❌ [${symbol}] Saída cancelada pelo usuário`);
                                }
                            } finally {
                                flags.confirmationPending = false;
                            }
                        }).catch(err => {
                            console.error('Erro na confirmação de Saída', err);
                            flags.confirmationPending = false;
                        });
                    }
                }
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
                    calculatePositionSize(flags.lastSignal, signalsHistoryRef.current), [signalsBySymbolState];

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
                        expectedPriceExitSell: lastTrend.stop.toFixed(2),
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
                    calculatePositionSize(flags.lastSignal, signalsHistoryRef.current), [signalsBySymbolState];

                    // **Atualiza botões e estado de simbolos
                    setButtonOperation({ buy: false, sell: false, exit: false });
                    setSignalsBySymbolState({ ...signalsHistoryRef.current });

                    console.log(`🚪 [${symbol}] STOP DE VENDA`);
                }
            }

            //==============================|🚫PONTOS DE SAÍDA EM ROMPIMENTO DE COM INVERSÃO DE TENDÊNCIA (SÓ POR SEGURANÇA)|==============================//
            //🔺 Saída de operações de compra
            if (TYPE_BUY_EXIT_REVERSE.includes(lastTrend?.type) && flags.upwardTrendCurrent && flags.inputExecuted && flags.isOperation && flags.numberEntries > 0) {
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
                        count: flags.numberEntries,
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
                    flags.numberEntries = 0;

                    // **Chama a Função para calcular o tamanho do lote e calcular ganhos e perdas
                    calculatePositionSize(flags.lastSignal, signalsHistoryRef.current), [signalsBySymbolState];

                    // **Atualiza botões e estado de simbolos
                    setButtonOperation({ buy: false, sell: false, exit: false });
                    setSignalsBySymbolState({ ...signalsHistoryRef.current });

                    console.log(`🚪 [${symbol}] SAÍDA DE COMPRA`);
                }
            }
            //🔺 Saída de operações de venda
            if (TYPE_SELL_EXIT_REVERSE.includes(lastTrend?.type) && flags.downwardTrendCurrent && flags.inputExecuted && flags.isOperation && flags.numberEntries > 0) {
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
                        count: flags.numberEntries,
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
                    flags.numberEntries = 0;

                    // **Chama a Função para calcular o tamanho do lote e calcular ganhos e perdas
                    calculatePositionSize(flags.lastSignal, signalsHistoryRef.current), [signalsBySymbolState];

                    // **Atualiza botões e estado de simbolos
                    setButtonOperation({ buy: false, sell: false, exit: false });
                    setSignalsBySymbolState({ ...signalsHistoryRef.current });

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
                flags.numberEntries > 0 &&
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
                flags.numberEntries = 0;

                // **Chama a Função para calcular o tamanho do lote e calcular ganhos e perdas
                calculatePositionSize(flags.lastSignal, signalsHistoryRef.current), [signalsBySymbolState];

                // **Atualiza botões e estado de simbolos
                setButtonOperation({ buy: false, sell: false, exit: false });
                setSignalsBySymbolState({ ...signalsHistoryRef.current });

                console.log(`🚪💲 [${symbol}] PARTIAL BUY`);
            }
            //🍰🔴 Parcial de venda
            else if (
                TYPE_SELL_BREAK_UP.includes(lastTrend?.type) &&
                flags.downwardTrendCurrent &&
                lastPrice?.Fechamento <= trendDownPivotPlusLimit &&
                !flags.downwardAmrsiCurrent &&
                flags.numberEntries > 0 &&
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
                flags.numberEntries = 0;

                // **Chama a Função para calcular o tamanho do lote e calcular ganhos e perdas
                calculatePositionSize(flags.lastSignal, signalsHistoryRef.current), [signalsBySymbolState];

                // **Atualiza botões e estado de simbolos
                setButtonOperation({ buy: false, sell: false, exit: false });
                setSignalsBySymbolState({ ...signalsHistoryRef.current });

                console.log(`🚪💲 [${symbol}] PARTIAL SELL`);
            };



            //==============================|🚫SAÍDA EM UM ROMPIMENTO (BREAK)|==============================//
            if (TYPE_BREAK.includes(lastTrend?.type) && flags.inputExecuted && flags.isOperation && flags.upwardTrendCurrent && flags.numberEntries > 0) {
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
                    calculatePositionSize(flags.lastSignal, signalsHistoryRef.current), [signalsBySymbolState];

                    // **Atualiza botões e estado de simbolos
                    setButtonOperation({ buy: false, sell: false, exit: false });
                    setSignalsBySymbolState({ ...signalsHistoryRef.current });

                    console.log(`🚪 [${symbol}] SAÍDA DE COMPRA EM BREAK`);
                }
            }
            if (TYPE_BREAK.includes(lastTrend?.type) && flags.inputExecuted && flags.isOperation && flags.downwardTrendCurrent && flags.numberEntries > 0) {
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
                        count: flags.numberEntries,
                        expectedPriceExitSell: lastTrend.stop.toFixed(2),
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
                    calculatePositionSize(flags.lastSignal, signalsHistoryRef.current), [signalsBySymbolState];

                    // **Atualiza botões e estado de simbolos
                    setButtonOperation({ buy: false, sell: false, exit: false });
                    setSignalsBySymbolState({ ...signalsHistoryRef.current });

                    console.log(`🚪 [${symbol}] SAÍDA DE VENDA EM BREAK`);
                }
            }

            //==============================|🚫SAÍDA PELO VOLUME|==============================//
            if (flags.inputExecuted && flags.isOperation && flags.upwardTrendCurrent && flags.numberEntries > 0) {
                // SAÍDA PARA COMPRA PELO VOLUME
                const conditionExitBuy =
                    (lastVppr?.volumeEmaSignal === 'Volume SELL Weakly Increasing' ||
                        lastVppr?.volumeEmaSignal === 'Volume SELL Increasing') &&
                    lastVppr?.vpprTrend === 'sell' &&
                    lastAmrsi?.type === 'OVERBOUGHT' &&
                    lastPrice.Fechamento >= lastTrend?.buy + lastTrend?.limite

                if (conditionExitBuy) {
                    signal = {
                        symbol,
                        action: "EXIT_BUY",
                        count: flags.numberEntries,
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
                    calculatePositionSize(flags.lastSignal, signalsHistoryRef.current), [signalsBySymbolState];

                    // **Atualiza botões e estado de simbolos
                    setButtonOperation({ buy: false, sell: false, exit: false });
                    setSignalsBySymbolState({ ...signalsHistoryRef.current });

                    console.log(`🚪 [${symbol}] SAÍDA DE COMPRA COM INVERSÃO DE VOLUME`);
                }
            }
            //SAÍDA PARA VENDA PELO VOLUME
            if (flags.inputExecuted && flags.isOperation && flags.downwardTrendCurrent && flags.numberEntries > 0) {
                const conditionExitSell =
                    (
                        lastVppr?.volumeEmaSignal === 'Volume BUY Increasing' ||
                        lastVppr?.volumeEmaSignal === 'Volume BUY Weakly Increasing') &&
                    lastVppr?.volumeEmaSignal === 'Volume BUY Increasing' &&
                    lastVppr?.vpprTrend === 'buy' &&
                    lastAmrsi?.type === 'OVERSOLD' &&
                    lastPrice.Fechamento <= lastTrend?.sell - lastTrend?.limite
                if (conditionExitSell) {
                    signal = {
                        symbol,
                        action: "EXIT_SELL",
                        count: flags.numberEntries,
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
                    calculatePositionSize(flags.lastSignal, signalsHistoryRef.current), [signalsBySymbolState];

                    // **Atualiza botões e estado de simbolos
                    setButtonOperation({ buy: false, sell: false, exit: false });
                    setSignalsBySymbolState({ ...signalsHistoryRef.current });

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
        console.log('signalsBySymbolStat:>', signalsBySymbolState)

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

    }, [trend, trendPrimary, amrsi, vppr, price, buttonOperation]);

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
        getSignalsBySymbol: (symbol) => signalsBySymbolState[symbol] || [],
        getAllSignals: () => signalsBySymbolState,
        getFlagsBySymbol: (symbol) => flagsBySymbolRef.current[symbol] || null
    };
};

// ==============================|Função para calcular tamanho do lote e risco da operação|============================== //
const getSymbolInfo = async (lastSignal) => {
    const symbol = lastSignal.symbol;
    //  Passando o parâmetro diretamente na URL (mais simples)
    const url = `https://api.binance.com/api/v3/exchangeInfo?symbol=${symbol}`;

    try {
        const response = await axios.get(url);
        const data = response.data;
        const symbolInfo = data.symbols.find(s => s.symbol === symbol);
        console.log('data:', data)
        if (!symbolInfo) throw new Error(`Simbol ${symbol} not found`)

        return {
            minQty: parseFloat(symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE')?.minQty || 0),
            maxQty: parseFloat(symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE')?.maxQty || 0),
            stepSize: parseFloat(symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE')?.stepSize || 0),
            tickSize: parseFloat(symbolInfo.filters.find(f => f.filterType === 'PRICE_FILTER')?.tickSize || 0),
            minNotional: parseFloat(symbolInfo.filters.find(f => f.filterType === 'MIN_NOTIONAL')?.minNotional || 0)
        }

    } catch (error) {
        console.error('Erro ao buscar dados da Binance:', error.message);
        return null;
    }
}
// ==============================|Função principal para calcular o tamanho do lote|============================== //
const calculatePositionSize = async (lastSignal, signalsBySymbolState = {}) => {
    try {
        if (!lastSignal) return null;
        const symbolInfor = await getSymbolInfo(lastSignal);

        const balanceAndRisk = {
            balance: 10000,
            risk: 0.02
        };
        const symbol = lastSignal.symbol || symbolInfor.symbol || 'UNKNOWN';
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

        console.log('teste:', {
            stopPoint: stopPoint,
            entryPrice: entryPrice,
            count: count,
            symbol: symbol,
            isLong: isLong,
            isShort: isShort,
            stopDistancePoints: stopDistancePoints,
            riskBudget: riskBudget,
            riskBudgetPerPartial: riskBudgetPerPartial,
            qtyPerPartial: qtyPerPartial,
            totalQty: totalQty,

        })

        const stepSize = Number(symbolInfor.stepSize || 0);
        const minQty = Number(symbolInfor.minQty || 0);
        const maxQty = Number(symbolInfor.maxQty || 0);

        console.log('symbolInfor:', {
            symbolInfor,
            stepSize: symbolInfor.stepSize,
            minQty: symbolInfor.minQty,
            maxQty: symbolInfor.maxQty
        })

        if (!stepSize || !minQty) return null;
        console.log('📊 Cálculo detalhado:', {
            stopDistancePoints: stopDistancePoints.toFixed(2),
            riskBudget: riskBudget.toFixed(2),
            riskBudgetPerPartial: riskBudgetPerPartial.toFixed(2),
            qtyPerPartial: qtyPerPartial.toFixed(8),
            totalQty: totalQty.toFixed(8),
            totalValue: (totalQty * entryPrice).toFixed(2),
            stepSize: stepSize
        });

        // 🔥 Ajustar para o stepSize da Binance
        let adjustedQty = Math.floor(totalQty / stepSize) * stepSize;

        if (adjustedQty < minQty) {
            adjustedQty = minQty;
            console.warn(`Quantidade ajustada para o mínimo: ${minQty}`);
        }

        if (maxQty && adjustedQty > maxQty) {
            adjustedQty = maxQty;
            console.warn(`Quantidade ajustada para o máximo: ${maxQty}`);
        }

        // 🔥Calcular risco real
        const actualRisk = adjustedQty * stopDistancePoints;
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
                    // 🔥 CORREÇÃO: Usar o stop do sinal, se existir
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
                        const realizedUnits = Math.max(1, Math.min(openPosition.count, Math.max(1, Math.round(toNumber(signal?.count, openPosition.count)))));

                        // 🔥 CORREÇÃO: Calcular a distância do stop corretamente
                        const stopDistance = Math.max(openPosition.entryPrice - openPosition.stopPrice, 0);
                        const risk = stopDistance * realizedUnits;

                        const pnl = (exitPrice - openPosition.entryPrice) * realizedUnits;

                        operations.push({
                            symbol,
                            side: 'BUY',
                            count: realizedUnits,
                            entryPrice: openPosition.entryPrice,
                            stopPrice: openPosition.stopPrice,
                            stopDistance: stopDistance,
                            exitPrice,
                            pnl,
                            risk,
                            rr: risk > 0 ? pnl / risk : 0,
                            action,
                            entryTime: openPosition.entryTime,
                            exitTime: signal.time || null,
                        });
                        openPosition = null;
                    }
                    return;
                }

                if (action === 'EXIT_SELL' || action === 'STOP_SELL') {
                    if (openPosition.side === 'SELL') {
                        const realizedUnits = Math.max(1, Math.min(openPosition.count, Math.max(1, Math.round(toNumber(signal?.count, openPosition.count)))));

                        // 🔥 Calcular a distância do stop corretamente
                        const stopDistance = Math.max(openPosition.stopPrice - openPosition.entryPrice, 0);
                        const risk = stopDistance * realizedUnits;

                        const pnl = (openPosition.entryPrice - exitPrice) * realizedUnits;

                        operations.push({
                            symbol,
                            side: 'SELL',
                            count: realizedUnits,
                            entryPrice: openPosition.entryPrice,
                            stopPrice: openPosition.stopPrice,
                            stopDistance: stopDistance,
                            exitPrice,
                            pnl,
                            risk,
                            rr: risk > 0 ? pnl / risk : 0,
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

        // 🔥 Estatísticas detalhadas
        const totalRisk = operations.reduce((sum, item) => sum + item.risk, 0);
        const avgRisk = operations.length > 0 ? totalRisk / operations.length : 0;
        const avgRr = operations.length > 0 ? operations.reduce((sum, item) => sum + item.rr, 0) / operations.length : 0;

        console.log('📊 Resultado das operações', {
            operations: operations.map(op => ({
                ...op,
                risk: op.risk.toFixed(2) * adjustedQty,
                pnl: op.pnl.toFixed(2) * adjustedQty,
                rr: op.rr.toFixed(2),
            })),
            totalOperations: operations.length,
            winningOperations: operations.filter((item) => item.pnl > 0).length,
            losingOperations: operations.filter((item) => item.pnl < 0).length,
            totalProfit: totalProfit.toFixed(2) * adjustedQty,
            totalLoss: totalLoss.toFixed(2) * adjustedQty,
            netPnl: netPnl.toFixed(2) * adjustedQty,
            totalRisk: totalRisk.toFixed(2) * adjustedQty,
            avgRisk: avgRisk.toFixed(2) * adjustedQty,
            avgRr: avgRr.toFixed(2),
            perSymbol,
        });



        return {
            symbol,
            count,
            side: isLong ? 'LONG' : isShort ? 'SHORT' : 'UNKNOWN',
            entryPrice: entryPrice,
            stop: stopPoint,
            stopDistance: stopDistancePoints,
            stopPercent: ((stopDistancePoints / entryPrice) * 100).toFixed(2),
            positionSize: adjustedQty,
            positionSizePerEntry: adjustedQty / count,
            totalValue: adjustedQty * entryPrice,
            riskAmount: actualRisk,
            riskPercentage: riskPercentage.toFixed(2),
            balance: balanceAndRisk.balance,
            riskPerTrade: balanceAndRisk.risk * 100,
            symbolInfo: {
                minQty,
                maxQty,
                stepSize,
                tickSize: Number(symbolInfor.tickSize || 0),
                minNotional: Number(symbolInfor.minNotional || 0)
            },

            operations,
            totalOperations: operations.length,
            winningOperations: operations.filter((item) => item.pnl > 0).length,
            losingOperations: operations.filter((item) => item.pnl < 0).length,
            totalProfit,
            totalLoss,
            netPnl,
            totalRisk,
            avgRisk,
            avgRr,
            perSymbol,
        };
    } catch (error) {
        console.error('Erro ao calcular tamanho da posição:', error);
        return null;
    }
};

export const useCalculateResults = (signalsBySymbolState = {}) => {
    return useMemo(() => calculatePositionSize(signalsBySymbolState), [signalsBySymbolState]);
};

