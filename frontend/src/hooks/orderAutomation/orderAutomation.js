// orderAutomation.js
import { useEffect, useRef, useState } from 'react';
import { parseDecimal } from '../../utils/parseDecimal.js';

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

const getIndicatorExitConditions = ({
    side,
    symbol,
    currentPrice,
    trendClassification,
    vppr,
    flagsBySymbolRef,
}) => {
    const latestTrend = trendClassification
        .find(item => item.symbol === symbol)?.result?.at(-1);
    const latestVppr = vppr
        .find(item => item.symbol === symbol)?.result?.at(-1);
    const flags = flagsBySymbolRef.current[symbol];
    const trendType = String(latestTrend?.type || '').trim().toUpperCase();
    const stopLevel = Number(latestTrend?.stop);

    if (!Number.isFinite(stopLevel)) return false;

    return side === 'BUY'
        ? currentPrice <= stopLevel &&
        flags?.isOperation &&
        flags?.inputExecuted &&
        latestVppr?.vpprTrend === 'sell' &&
        ['PIVOT_EXIT_BUY_TREND', 'PIVOT_EXIT_BUY_SEC'].includes(trendType)
        : currentPrice >= stopLevel &&
        flags?.isOperation &&
        flags?.inputExecuted &&
        latestVppr?.vpprTrend === 'buy' &&
        ['PIVOT_EXIT_SELL_TREND', 'PIVOT_EXIT_SELL_SEC'].includes(trendType);
};

export const useOrderAutomation = ({
    enabled,
    entryCandidate,
    partialEntryCandidate,
    price,
    signalsBySymbolState,
    balanceAndRisk,
    hasValidTradingFunds,
    calculateOrder,
    executeOrder,
    trendClassification,
    vppr,
    flagsBySymbolRef,
}) => {
    const [automaticExecutionStatus, setAutomaticExecutionStatus] = useState(
        'Automação ativa; aguardando novo Rally',
    );
    const automaticExecutionEnabledRef = useRef(enabled);
    const automaticEntryTrendRef = useRef({});
    const automaticTrendCycleRef = useRef({});
    const partialEntryCycleRef = useRef({});
    const pendingAutomaticEntriesRef = useRef(new Set());
    const pendingAutomaticExitsRef = useRef(new Set());

    useEffect(() => {
        automaticExecutionEnabledRef.current = enabled;
    }, [enabled]);

    useEffect(() => {
        if (!enabled || !entryCandidate) return;

        const {
            symbol,
            side,
            entryPrice,
            stop: initialStop,
            trendStartIdentity,
            movementIdentity,
            rallyIdentity,
        } = entryCandidate;

        const signals = signalsBySymbolState?.[symbol] || [];
        const openPosition = getOpenPosition(signals);
        if (openPosition && openPosition.action !== side) return;

        let trendCycle = automaticTrendCycleRef.current[symbol];
        if (!trendCycle || trendCycle.trendStartIdentity !== trendStartIdentity) {
            // Nova tendência: reinicia o ciclo e limpa movimentos processados.
            trendCycle = { trendStartIdentity, closed: false };
            automaticTrendCycleRef.current[symbol] = trendCycle;
            automaticEntryTrendRef.current[symbol] = new Set();
        }
        // NÃO bloquear por trendCycle.closed: o ciclo só é recriado quando a
        // trendStartIdentity muda. Saídas não encerram a possibilidade de novas
        // entradas enquanto a mesma tendência permanecer válida.

        const processedMovements = automaticEntryTrendRef.current[symbol] || new Set();
        if (
            processedMovements.has(movementIdentity) ||
            pendingAutomaticEntriesRef.current.has(symbol)
        ) {
            return;
        }

        const stop = openPosition
            ? Number(openPosition.stopRemoved
                ? NaN
                : openPosition.stop ?? openPosition.stopPrice ?? openPosition.expectedPriceStop)
            : Number(initialStop);
        const isStopValid = Number.isFinite(stop) &&
            (side === 'BUY' ? stop > 0 && stop < entryPrice : stop > entryPrice);
        if (!isStopValid) return;

        const balance = parseDecimal(balanceAndRisk?.balance);
        const risk = Number(balanceAndRisk?.risk);
        if (
            !hasValidTradingFunds ||
            !Number.isFinite(balance) ||
            balance <= 0 ||
            !Number.isFinite(risk) ||
            risk <= 0
        ) return;

        pendingAutomaticEntriesRef.current.add(symbol);

        const placeAutomaticEntry = async () => {
            try {
                setAutomaticExecutionStatus(`Calculando entrada ${side} em ${symbol}`);
                const calculatedOrder = await calculateOrder(
                    side.toLowerCase(),
                    stop,
                    balanceAndRisk,
                    symbol,
                );
                if (!automaticExecutionEnabledRef.current) return;

                const quantity = Number(calculatedOrder?.capital?.positionSize);
                if (!Number.isFinite(quantity) || quantity <= 0) {
                    throw new Error('Cálculo da ordem sem quantidade válida. Verifique saldo, risco e stop.');
                }

                await executeOrder({
                    symbol,
                    side: side.toLowerCase(),
                    price: entryPrice,
                    stop,
                    quantity,
                    automatic: true,
                    entryRallyIdentity: rallyIdentity,
                });
                const nextProcessedMovements = new Set(
                    automaticEntryTrendRef.current[symbol] || [],
                );
                nextProcessedMovements.add(movementIdentity);
                if (nextProcessedMovements.size > 100) {
                    nextProcessedMovements.delete(nextProcessedMovements.values().next().value);
                }
                automaticEntryTrendRef.current[symbol] = nextProcessedMovements;
                setAutomaticExecutionStatus(`Entrada ${side} registrada no histórico de ${symbol}`);
            } catch (error) {
                console.error(`Erro ao executar a entrada automática ${side} em ${symbol}:`, error);
                setAutomaticExecutionStatus(
                    error instanceof Error ? error.message : `Falha na entrada ${side} de ${symbol}`,
                );
            } finally {
                pendingAutomaticEntriesRef.current.delete(symbol);
            }
        };

        placeAutomaticEntry();
    }, [
        balanceAndRisk,
        calculateOrder,
        enabled,
        executeOrder,
        entryCandidate,
        hasValidTradingFunds,
        // price,  ← removido: não é usado diretamente; entryCandidate já traz entryPrice.
        signalsBySymbolState,
    ]);

    useEffect(() => {
        if (!enabled || !partialEntryCandidate) return;

        const {
            symbol,
            side,
            type,
            entryPrice,
            signalValue,
            signalTime,
            signalIdentity,
            stop: initialStop,
            rallyIdentity,          // identidade do rally INICIAL (estável)
            movementIdentity,
            isInitialRallyMovement,
            isFirstRallyValid,
            isCurrentMovement,
            isTrendPartial,
        } = partialEntryCandidate;

        // Sinal precisa ser do movimento atual.
        if (!isCurrentMovement) return;

        const signals = signalsBySymbolState?.[symbol] || [];
        const openPosition = getOpenPosition(signals);

        // Direção oposta aberta → bloqueia.
        if (openPosition && openPosition.action !== side) return;

        // Há operação aberta vinculada ao rally inicial?
        // Keep the rally origin from the original entry even if later adds
        // replace the aggregate position record in the signal history.
        const rallyEntryIndex = signals.findIndex(signal =>
            ['BUY', 'SELL'].includes(String(signal?.action || '').toUpperCase()) &&
            String(signal?.action || '').toUpperCase() === side &&
            signal?.entryRallyIdentity === rallyIdentity
        );
        const rallyEntry = rallyEntryIndex >= 0 ? signals[rallyEntryIndex] : null;
        const rallyEntryIsOpen = Boolean(rallyEntry) && !signals.some((signal, index) => (
            index > rallyEntryIndex &&
            ['EXIT_BUY', 'EXIT_SELL', 'STOP_BUY', 'STOP_SELL'].includes(
                String(signal?.action || '').toUpperCase(),
            )
        ));
        const hasOpenPositionForRally =
            openPosition?.action === side &&
            openPosition?.entryRallyIdentity === rallyIdentity &&
            rallyEntryIsOpen;

        // Regras de admissão:
        // - Rally inicial: só entra se for válido (precedido de reação ou for trendStart)
        //   e ainda não houver operação aberta para esse rally.
        // - Continuação: só entra se JÁ existir operação aberta vinculada ao rally inicial.
        // - TREND_PARTIAL_*: mesma regra de continuação (nunca isolado).
        if (isInitialRallyMovement) {
            if (!isFirstRallyValid) return;
            // The first valid partial starts the operation; subsequent distinct
            // signals from that rally are allowed to scale it.
            if (hasOpenPositionForRally) {
                // continue through per-signal de-duplication below
            }
        } else {
            // Continuação (inclui TREND_PARTIAL_*): exige operação aberta no rally inicial.
            if (!hasOpenPositionForRally) return;
        }

        // De-duplicação por sinal.
        const cycle = partialEntryCycleRef.current[symbol] || {
            rallyIdentity,
            side,
            processedSignals: new Set(),
        };
        if (cycle.rallyIdentity !== rallyIdentity || cycle.side !== side) {
            // Novo rally inicial → novo ciclo.
            cycle.rallyIdentity = rallyIdentity;
            cycle.side = side;
            cycle.processedSignals = new Set();
        }
        if (cycle.processedSignals.has(signalIdentity)) return;
        if (pendingAutomaticEntriesRef.current.has(symbol)) return;

        const stop = openPosition
            ? Number(openPosition.stopRemoved
                ? NaN
                : openPosition.stop ?? openPosition.stopPrice ?? openPosition.expectedPriceStop)
            : Number(initialStop);
        const isStopValid = Number.isFinite(stop) &&
            (side === 'BUY' ? stop > 0 && stop < entryPrice : stop > entryPrice);
        if (!isStopValid) return;

        const balance = parseDecimal(balanceAndRisk?.balance);
        const risk = Number(balanceAndRisk?.risk);
        if (!hasValidTradingFunds ||
            !Number.isFinite(balance) || balance <= 0 ||
            !Number.isFinite(risk) || risk <= 0) return;

        pendingAutomaticEntriesRef.current.add(symbol);

        const placePartialEntry = async () => {
            try {
                setAutomaticExecutionStatus(`Calculando entrada parcial ${side} em ${symbol}`);
                const calculatedOrder = await calculateOrder(
                    side.toLowerCase(),
                    stop,
                    balanceAndRisk,
                    symbol,
                );
                if (!automaticExecutionEnabledRef.current) return;

                const quantity = Number(calculatedOrder?.capital?.positionSize);
                if (!Number.isFinite(quantity) || quantity <= 0) {
                    throw new Error('Cálculo da ordem parcial sem quantidade válida. Verifique saldo, risco e stop.');
                }

                await executeOrder({
                    symbol,
                    side: side.toLowerCase(),
                    price: entryPrice,
                    stop,
                    quantity,
                    automatic: true,
                    entryRallyIdentity: rallyIdentity,   // ← chave estável
                    partialEntryType: type,
                    partialEntryTime: signalTime,
                    partialEntryValue: signalValue,
                    partialMovementIdentity: movementIdentity,
                });

                const nextProcessedSignals = new Set(cycle.processedSignals);
                nextProcessedSignals.add(signalIdentity);
                if (nextProcessedSignals.size > 100) {
                    nextProcessedSignals.delete(nextProcessedSignals.values().next().value);
                }
                partialEntryCycleRef.current[symbol] = {
                    ...cycle,
                    processedSignals: nextProcessedSignals,
                };
                setAutomaticExecutionStatus(
                    `Entrada parcial ${side} registrada no histórico de ${symbol}`,
                );
            } catch (error) {
                console.error(`Erro ao executar a entrada parcial ${side} em ${symbol}:`, error);
                setAutomaticExecutionStatus(
                    error instanceof Error ? error.message : `Falha na entrada parcial ${side} de ${symbol}`,
                );
            } finally {
                pendingAutomaticEntriesRef.current.delete(symbol);
            }
        };

        placePartialEntry();
    }, [
        balanceAndRisk,
        calculateOrder,
        enabled,
        executeOrder,
        hasValidTradingFunds,
        partialEntryCandidate,
        signalsBySymbolState,
    ]);

    useEffect(() => {
        Object.entries(signalsBySymbolState || {}).forEach(([symbol, symbolSignals]) => {
            if (!Array.isArray(symbolSignals)) return;
            const activeEntry = getOpenPosition(symbolSignals);
            if (!activeEntry) return;

            const side = activeEntry.action;
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
            const indicatorExitTriggered = enabled && getIndicatorExitConditions({
                side,
                symbol,
                currentPrice,
                trendClassification,
                vppr,
                flagsBySymbolRef,
            });
            const exitReason = stopTriggered
                ? 'stop'
                : takeProfitTriggered
                    ? 'takeProfit'
                    : indicatorExitTriggered
                        ? 'indicator'
                        : null;
            if (!exitReason) return;

            const exitKey = `${symbol}:${activeEntry.timestamp || activeEntry.time}:${exitReason}`;
            if (pendingAutomaticExitsRef.current.has(exitKey)) return;
            pendingAutomaticExitsRef.current.add(exitKey);

            executeOrder({
                symbol,
                side: 'exit',
                price: currentPrice,
                exitReason,
            }).then(() => {
                // A saída NÃO encerra o ciclo de entradas. O ciclo só reinicia quando
                // uma nova trendStartIdentity surgir. Apenas atualizamos o status.
                setAutomaticExecutionStatus(`Saída executada em ${symbol} por ${exitReason}; aguardando novo Rally`);
            }).catch(error => {
                console.error(`Erro ao encerrar ${symbol} por ${exitReason}:`, error);
            }).finally(() => {
                pendingAutomaticExitsRef.current.delete(exitKey);
            });
        });
    }, [
        enabled,
        executeOrder,
        flagsBySymbolRef,
        price,
        signalsBySymbolState,
        trendClassification,
        vppr,
    ]);

    let validationStatus = null;
    if (!enabled) {
        validationStatus = 'Automação parada';
    } else if (!entryCandidate) {
        validationStatus = 'Aguardando sinal Rally compatível, direção e preço válidos';
    } else {
        const { symbol, side, entryPrice, stop: initialStop } = entryCandidate;
        const openPosition = getOpenPosition(signalsBySymbolState?.[symbol] || []);
        const stop = openPosition
            ? Number(openPosition.stopRemoved
                ? NaN
                : openPosition.stop ?? openPosition.stopPrice ?? openPosition.expectedPriceStop)
            : Number(initialStop);
        const balance = parseDecimal(balanceAndRisk?.balance);
        const risk = Number(balanceAndRisk?.risk);

        if (openPosition && openPosition.action !== side) {
            validationStatus = 'Posição aberta na direção oposta; entrada bloqueada';
        } else if (
            !Number.isFinite(stop) ||
            (side === 'BUY' ? stop <= 0 || stop >= entryPrice : stop <= entryPrice)
        ) {
            validationStatus = openPosition?.stopRemoved
                ? 'Defina um stop para continuar escalonando a posição'
                : 'Stop inicial do primeiro Rally inválido ou ausente';
        } else if (
            !hasValidTradingFunds ||
            !Number.isFinite(balance) ||
            balance <= 0 ||
            !Number.isFinite(risk) ||
            risk <= 0
        ) {
            validationStatus = 'Informe saldo e risco válidos na boleta';
        }
    }

    return { automaticExecutionStatus: validationStatus || automaticExecutionStatus };
};
