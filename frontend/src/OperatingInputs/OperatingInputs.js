// useOperatingInputs.js
import { useMemo, useEffect, useContext } from 'react';
import { ContextGraphics } from '../ContextGraphics/ContextGraphics';

// Função genérica que aceita "result" ou "movements"
const normalizeCollection = (collection, symbolPrefix, keys = ["buy"], dataKey = "result") => {
    if (!collection) return [];

    const groups = Array.isArray(collection) ? collection : [collection];

    return groups.flatMap((group, index) => {
        if (Array.isArray(group)) {
            return [{
                symbol: `${symbolPrefix}_${index + 1}`,
                result: group.map(item => normalizeItem(item, keys))
            }];
        }
        if (Array.isArray(group?.[dataKey])) {
            return [{
                symbol: group.symbol || `${symbolPrefix}_${index + 1}`,
                result: group[dataKey].map(item => normalizeItem(item, keys))
            }];
        }
        return [];
    });
};

const normalizeItem = (item, keys) => {
    if (!item || typeof item !== "object") return {};

    // Caso o item seja um array de {name, value}
    if (Array.isArray(item)) {
        const obj = item.reduce((acc, { name, value }) => {
            acc[name] = value;
            return acc;
        }, {});
        // Retorna apenas as chaves desejadas
        const normalized = {};
        keys.forEach(key => {
            normalized[key] = obj[key] ?? null;
        });
        return normalized;
    }

    // Caso seja objeto plano
    const normalized = {};
    keys.forEach(key => {
        normalized[key] = item[key] ?? null;
    });
    if (item.time) normalized.time = item.time;
    return normalized;
};


export const useOperatingInputs = () => {
    const { retestPointsState, retestPointsStatePrimary, amrsiData, vpprData, fullPrice } = useContext(ContextGraphics);

    
    // ====================== HOOKS DOS INDICADORES ======================
    const trend = useMemo(
        () => normalizeCollection(retestPointsState, "TREND", ["type", "time", "buy", "sell", "stop"], "operations"),
        [retestPointsState]
    );

    const trendPrimary = useMemo(
        () => normalizeCollection(retestPointsStatePrimary, "TREND_PRIMARY", ["type", "time", "buy", "sell", "stop"], "operations"),
        [retestPointsStatePrimary]
    );

    const price = useMemo(
        () => normalizeCollection(fullPrice, "PRICE", ["Fechamento", "Tempo"], "result"),
        [fullPrice]
    );

    const vppr = useMemo(
        () => normalizeCollection(vpprData, "VPPR", ["type", "trend", "time"], "signals"),
        [vpprData]
    );

    const amrsi = useMemo(
        () => normalizeCollection(amrsiData, "AMRSI", ["type", "time"], "signals"),
        [amrsiData]
    );


    useEffect(() => {
        if (price.length === 0 || trend.length === 0 || trendPrimary.length === 0 || amrsi.length === 0 || vppr.length === 0) return;

        // Lista de todos símbolos presentes
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
        const flagsBySymbol = {};



        // Intera sobre os indicadores para verificar entradas
        allSymbols.forEach(symbol => {
            if (!flagsBySymbol[symbol]) {
                flagsBySymbol[symbol] = {
                    inputExecuted: false,
                    upwardTrendCurrent: false,
                    downwardTrendCurrent: false
                };
            }

            const lastTrendArray = trend.find(item => item.symbol === item.symbol)?.result || [];
            const lastTrendPrimaryArray = trendPrimary.find(item => item.symbol)?.result || [];
            const lastAmrsiArray = amrsi.find(item => item.symbol)?.result || [];
            const lastVpprArray = vppr.find(item => item.symbol)?.result || [];
            const lastPriceArray = price.find(item => item.symbol)?.result || [];

            // pega o valor atual
            const lastTrend = lastTrendArray[lastTrendArray.length - 1];
            const lastTrendPrimary = lastTrendPrimaryArray[lastTrendPrimaryArray.length - 1];
            const lastAmrsi = lastAmrsiArray[lastAmrsiArray.length - 1];
            const lastVppr = lastVpprArray[lastVpprArray.length - 1];
            const lastPrice = lastPriceArray[lastPriceArray.length - 1];

            
            // Verifica se os dados necessários existem
            if (!lastTrend || !lastTrendPrimary || !lastPrice) {
                return;
            }

            let signal = null;

            // Tipos para entrada
            const TYPE_BUY = ["ENTRY_BUY_TREND", "ENTRY_BUY_RALLY", "ENTRY_BUY_RALLY_SEC"];
            const TYPE_SELL = ["ENTRY_SELL_TREND", "ENTRY_SELL_RALLY", "ENTRY_SELL_RALLY_SEC"];

            const TYPE_BUY_SEC = ["pivotBreak-buy", "ENTRY_BUY_TREND", "ENTRY_BUY_RALLY", "ENTRY_BUY_RALLY_SEC"]
            const TYPE_SELL_SEC = ["pivotBreak-sell", "ENTRY_SELL_TREND", "ENTRY_SELL_RALLY", "ENTRY_SELL_RALLY_SEC"]

            // Tipos para saída
            const TYPE_BUY_EXIT = ["pivotBreak-buy"];
            const TYPE_SELL_EXIT = ["pivotBreak-sell"];

            const RESET_FLAG = ["pivotBreak-buy", "pivotBreak-sell"];



            // Logs para debug
            console.log(`🌚 [${symbol}] Trend Primary:`, lastTrendPrimary?.type);
            console.log(`🌚 [${symbol}] Trend Secondary:`, lastTrend?.type);
            console.log(`📊 [${symbol}] Primary:`, !flagsBySymbol[symbol].inputExecuted && TYPE_BUY.includes(lastTrendPrimary?.type));
            console.log(`📊 [${symbol}] Secondary:`, !flagsBySymbol[symbol].inputExecuted && TYPE_BUY.includes(lastTrend?.type));

            console.log(`📊 [${symbol}] Flag Executada:`, flagsBySymbol[symbol].inputExecuted);
            console.log(`📊 [${symbol}] Buy esperado:`, lastTrend?.buy);
            console.log(`📊 [${symbol}] Sell esperado:`, lastTrend?.sell);
            console.log(`vppr:`, lastTrend);
            //console.log('trend', trend);


            // Reseta flag de entrada
            if (flagsBySymbol[symbol].inputExecuted && RESET_FLAG.includes(lastTrend?.type)) {
                flagsBySymbol[symbol].inputExecuted = false;
                console.log("Flag resetada");
                return;
            };


            // Entrada de compra
            if (!flagsBySymbol[symbol].inputExecuted && TYPE_BUY.includes(lastTrendPrimary?.type)) {
                if (TYPE_BUY.includes(lastTrend?.type) && lastPrice.Fechamento >= lastTrend?.buy ) {
                    signal = {
                        symbol,
                        action: "BUY",
                        expectedPriceBuy: lastTrend.buy,
                        entryPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo
                    };
                    flagsBySymbol[symbol].upwardTrendCurrent = true;
                    flagsBySymbol[symbol].inputExecuted = true;
                    console.log("inputExecuted>", flagsBySymbol[symbol].inputExecuted);
                }
            }
            // Entrada de venda
            else if (!flagsBySymbol[symbol].inputExecuted && TYPE_SELL.includes(lastTrendPrimary?.type)) {
                if (TYPE_SELL.includes(lastTrend?.type) && lastPrice.Fechamento <= lastTrend?.sell) {
                    signal = {
                        symbol,
                        action: "SELL",
                        expectedPriceBuy: lastTrend.sell,
                        entryPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo
                    };
                    flagsBySymbol[symbol].downwardTrendCurrent = true;
                    flagsBySymbol[symbol].inputExecuted = true;
                }
            };


            // Saída de operações de compra
            if (TYPE_BUY_EXIT.includes(lastTrend?.type) && flagsBySymbol[symbol].upwardTrendCurrent) {
                if (lastPrice.Fechamento <= lastTrend.sell) {
                    signal = {
                        symbol,
                        action: "EXIT_BUY",
                        expectedPriceExitBuy: lastTrend.sell,
                        exitPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo
                    };
                    flagsBySymbol[symbol].upwardTrendCurrent = false;
                }
            }
            // Saída de operações de venda
            else if (TYPE_SELL_EXIT.includes(lastTrend?.type) && flagsBySymbol[symbol].downwardTrendCurrent) {
                if (lastPrice.Fechamento >= lastTrend.buy) {
                    signal = {
                        symbol,
                        action: "EXIT_SELL",
                        expectedPriceExitBuy: lastTrend.buy,
                        exitPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo
                    };
                    flagsBySymbol[symbol].downwardTrendCurrent = false;
                }
            }

            if (signal) {
                signalsBySymbol[symbol] = signal
            }
        });

        console.log("📊 Sinais combinados:", signalsBySymbol);

    }, [trend, trendPrimary, amrsi, vppr, price]);

    return { trend, trendPrimary, amrsi, vppr, price };
};
