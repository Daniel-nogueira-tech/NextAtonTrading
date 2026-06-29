// useOperatingInputs.js
import { useMemo, useEffect, useContext, useRef } from 'react';
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

    // Usar useRef para persistir as flags entre renders
    const flagsBySymbolRef = useRef({});
    const signalsHistoryRef = useRef({});

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

        console.log(`📊 Processando ${allSymbols.length} símbolos:`, allSymbols);

        const signalsBySymbol = {};

        // Intera sobre os indicadores para verificar entradas
        allSymbols.forEach(symbol => {
            // Inicializa flags para cada símbolo
            if (!flagsBySymbolRef.current[symbol]) {
                flagsBySymbolRef.current[symbol] = {
                    inputExecutedBreakup: false,
                    inputExecuted: false,
                    upwardTrendCurrent: false,
                    downwardTrendCurrent: false,
                    lastSignal: null,
                    signalCount: 0
                };
            }

            // CORRIGIDO: Busca correta usando o symbol
            const lastTrendArray = trend.find(item => item.symbol === symbol)?.result || [];
            const lastTrendPrimaryArray = trendPrimary.find(item => item.symbol === symbol)?.result || [];
            const lastAmrsiArray = amrsi.find(item => item.symbol === symbol)?.result || [];
            const lastVpprArray = vppr.find(item => item.symbol === symbol)?.result || [];
            const lastPriceArray = price.find(item => item.symbol === symbol)?.result || [];

            // Verifica se encontrou dados
            console.log(`🔍 [${symbol}] Trend: ${lastTrendArray.length} itens, Primary: ${lastTrendPrimaryArray.length} itens, Price: ${lastPriceArray.length} itens`);

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

            let signal = null;
            const flags = flagsBySymbolRef.current[symbol];

            // Tipos para entrada
            const TYPE_BUY = ["ENTRY_BUY_TREND", "ENTRY_BUY_RALLY", "ENTRY_BUY_RALLY_SEC"];
            const TYPE_SELL = ["ENTRY_SELL_TREND", "ENTRY_SELL_RALLY", "ENTRY_SELL_RALLY_SEC"];

            // Tipos para saída
            const TYPE_BUY_EXIT = ["pivotBreak-sell"];
            const TYPE_SELL_EXIT = ["pivotBreak-buy"];
            const TYPE_BUY_BREAK_UP = ["pivotBreak-buy"];
            const TYPE_SELL_BREAK_UP = ["pivotBreak-sell"];
            const RESET_FLAG = ["pivotBreak-buy", "pivotBreak-sell"];

            // Logs para debug por símbolo
            console.log(`🌚 [${symbol}] Trend Primary:`, lastTrendPrimary?.type);
            console.log(`🌚 [${symbol}] Trend Secondary:`, lastTrend?.type);
            console.log(`📊 [${symbol}] Flag Executada:`, flags.inputExecuted);
            console.log(`📊 [${symbol}] Buy esperado:`, lastTrend?.buy);
            console.log(`📊 [${symbol}] Sell esperado:`, lastTrend?.sell);
            console.log(`📊 [${symbol}] Preço atual:`, lastPrice?.Fechamento);
            console.log(`📊 [${symbol}] VPPR Trend:`, lastVppr?.trend);

            // Reseta flag de entrada
            if (flags.inputExecuted && RESET_FLAG.includes(lastTrend?.type)) {
                flags.inputExecuted = false;
                console.log(`🔄 [${symbol}] Flag resetada por ${lastTrend?.type}`);
                return;
            }

            //🟢 Entrada de compra
            if (!flags.inputExecuted && TYPE_BUY.includes(lastTrendPrimary?.type)) {
                const conditionBuy = TYPE_BUY.includes(lastTrend?.type) &&
                    lastPrice.Fechamento >= lastTrend?.buy &&
                    lastVppr?.trend === 'buy';

                console.log(`📈 [${symbol}] Condição BUY:`, {
                    primaryOk: TYPE_BUY.includes(lastTrendPrimary?.type),
                    secondaryOk: TYPE_BUY.includes(lastTrend?.type),
                    priceOk: lastPrice.Fechamento >= lastTrend?.buy,
                    vpprOk: lastVppr?.trend === 'buy',
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
                    flags.signalCount += 1;
                    console.log(`✅ [${symbol}] SINAL DE COMPRA GERADO! #${flags.signalCount}`);
                }
            }
            //🔴 Entrada de venda
            else if (!flags.inputExecuted && TYPE_SELL.includes(lastTrendPrimary?.type)) {
                const conditionSell = TYPE_SELL.includes(lastTrend?.type) &&
                    lastPrice.Fechamento <= lastTrend?.sell &&
                    lastVppr?.trend === 'sell';

                console.log(`📉 [${symbol}] Condição SELL:`, {
                    primaryOk: TYPE_SELL.includes(lastTrendPrimary?.type),
                    secondaryOk: TYPE_SELL.includes(lastTrend?.type),
                    priceOk: lastPrice.Fechamento <= lastTrend?.sell,
                    vpprOk: lastVppr?.trend === 'sell',
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
                    flags.signalCount += 1;
                    console.log(`✅ [${symbol}] SINAL DE VENDA GERADO! #${flags.signalCount}`);
                }
            }
            console.log("BUY_EXIT:", TYPE_BUY_EXIT.includes(lastTrend?.type));
            console.log("upwardTrend >", flags.upwardTrendCurrent);
            console.log('inputExecuted', flags.inputExecuted);
            console.log('inputExecutedBreakup:',flags.inputExecutedBreakup);
            

            //🔵 Entrada compra em Rompimento de pivô
            if (!flags.inputExecutedBreakup && TYPE_BUY.includes(lastTrendPrimary?.type)) {
                const conditionBuy = TYPE_BUY_BREAK_UP.includes(lastTrend?.type) &&
                    lastPrice?.Fechamento >= lastTrend?.buy &&
                    lastVppr?.trend === 'buy';

                console.log(`📈 [${symbol}] Condição BUY:`, {
                    primaryOk: TYPE_BUY.includes(lastTrendPrimary?.type),
                    secondaryOk: TYPE_BUY_BREAK_UP.includes(lastTrend?.type),
                    priceOk: lastPrice.Fechamento >= lastTrend?.buy,
                    vpprOk: lastVppr?.trend === 'buy',
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
                    flags.inputExecutedBreakup = true;
                    flags.signalCount += 1;
                    console.log(`✅ [${symbol}] SINAL DE COMPRA GERADO! #${flags.signalCount}`);
                }
            }
            //🔴 Entrada venda em Rompimento de pivô
            else if (!flags.inputExecutedBreakup && TYPE_SELL.includes(lastTrendPrimary?.type)) {
                const conditionSell = TYPE_SELL_BREAK_UP.includes(lastTrend?.type) &&
                    lastPrice.Fechamento <= lastTrend?.sell &&
                    lastVppr?.trend === 'sell';

                console.log(`📉 [${symbol}] Condição SELL:`, {
                    primaryOk: TYPE_SELL.includes(lastTrendPrimary?.type),
                    secondaryOk: TYPE_SELL_BREAK_UP.includes(lastTrend?.type),
                    priceOk: lastPrice.Fechamento <= lastTrend?.sell,
                    vpprOk: lastVppr?.trend === 'sell',
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
                    flags.inputExecutedBreakup = true;
                    flags.signalCount += 1;
                    console.log(`✅ [${symbol}] SINAL DE VENDA GERADO! #${flags.signalCount}`);
                }
            }





            //🔺 Saída de operações de compra
            if (TYPE_BUY_EXIT.includes(lastTrend?.type) && flags.upwardTrendCurrent) {
                if (lastPrice.Fechamento <= lastTrend.sell) {
                    signal = {
                        symbol,
                        action: "EXIT_BUY",
                        expectedPriceExitBuy: lastTrend.sell,
                        exitPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo || lastPrice?.time
                    };
                    flags.upwardTrendCurrent = false;
                    flags.inputExecutedBreakup = false;
                    console.log(`🚪 [${symbol}] SAÍDA DE COMPRA`);
                }
            }
            //🔺 Saída de operações de venda
            else if (TYPE_SELL_EXIT.includes(lastTrend?.type) && flags.downwardTrendCurrent) {
                if (lastPrice.Fechamento >= lastTrend.buy) {
                    signal = {
                        symbol,
                        action: "EXIT_SELL",
                        expectedPriceExitSell: lastTrend.buy,
                        exitPrice: lastPrice?.Fechamento,
                        time: lastPrice?.Tempo || lastPrice?.time
                    };
                    flags.downwardTrendCurrent = false;
                    flags.inputExecutedBreakup = false;
                    console.log(`🚪 [${symbol}] SAÍDA DE VENDA`);
                }
            }

            // Armazena o sinal se existir
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

        // Log consolidado por símbolo
        console.log("📊 Sinais combinados por símbolo:", signalsBySymbol);

        // Log do status de todas as flags
        console.log("🏴 Status das Flags:", flagsBySymbolRef.current);

        // Retorna os sinais para uso externo se necessário
        if (Object.keys(signalsBySymbol).length > 0) {
            console.log("🎯 Novos sinais detectados:", Object.keys(signalsBySymbol));
        }

    }, [trend, trendPrimary, amrsi, vppr, price]);

    return {
        trend,
        trendPrimary,
        amrsi,
        vppr,
        price,
        // Exporta funções auxiliares
        getSignalsBySymbol: (symbol) => signalsHistoryRef.current[symbol] || [],
        getAllSignals: () => signalsHistoryRef.current,
        getFlagsBySymbol: (symbol) => flagsBySymbolRef.current[symbol] || null
    };
};