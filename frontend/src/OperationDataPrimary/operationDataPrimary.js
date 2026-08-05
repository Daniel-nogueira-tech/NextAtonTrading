import { useContext } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ContextGraphics } from '../ContextGraphics/ContextGraphics'


// Função para normalizar os dados de tendência, 
// garantindo que seja sempre um array de grupos de movimentos especificados por símbolo
const normalizeTrendGroups = (trend) => {
  if (!trend) return []

  const collection = trend?.data ?? trend
  const groups = Array.isArray(collection) ? collection : [collection]

  return groups.flatMap((group, index) => {
    if (Array.isArray(group)) {
      return [{
        symbol: `SYMBOL_${index + 1}`,
        movements: group,
      }]
    }

    if (Array.isArray(group?.movements)) {
      return [{
        symbol: group.symbol || `SYMBOL_${index + 1}`,
        movements: group.movements,
      }]
    }

    return []
  })
}

// Algoritimo de operações 
export const useOperatingDataPrimary = (trend) => {
  const { retestPointsStatePrimaryRef } = useContext(ContextGraphics)

  // Função auxiliar para converter timestamp em número para comparação
  const parseTimestamp = (time) => {
    if (typeof time === 'number') return time;
    if (!time) return 0;
    // Se for ISO 8601 ou formato de data válido
    const parsed = new Date(time).getTime();
    return isNaN(parsed) ? 0 : parsed;
  };
  // flag para verificar movimentos
  const canExecuteRallyRef = useRef(false);
  const canExecuteReactionRef = useRef(false);
  const canExecuteReactionSecRef = useRef(false);
  const canExecuteRallySecRef = useRef(false);
  const retestHistoryRef = useRef({});

  // capitura mudança de tendencia para primeiro pivot
  const trendHistoryRef = useRef([]);
  const useRallyRef = useRef(false);
  // estado isolado por símbolo
  const symbolStateRef = useRef({});

  // Normaliza os dados de tendência para garantir um formato consistente
  const trendGroups = useMemo(() => normalizeTrendGroups(trend), [trend]);


  useEffect(() => {
    // dados de classificação simulados 
    if (!trendGroups || trendGroups.length === 0) return;

    const nextRetestHistory = { ...retestHistoryRef.current };

    trendGroups.forEach(({ symbol, movements }) => {

      if (!movements || movements.length === 0) return;

      // ====================== |ESTADO ISOLADO POR SÍMBOLO| ====================== /
      if (!symbolStateRef.current[symbol]) {
        symbolStateRef.current[symbol] = {
          ultimoTopoAnterior: null,
          ultimoFundoAnterior: null,
          ultimoPivoAnterior: null,
          ultimoPivoAnteriorRally: null,
          ultimoPivoAnteriorRallySec: null,
          ultimoPivoSecFound: null,
          trendFound: null,
          rallyFound: null,
          rallySecFound: null,
          rallySec2Found: null,
          enteringTheTrendUpdate: null,
          rallySecExitUpdate: null,
          pivoRallysec: null,

          lastTrendRetestId: null,
          lastTrendExitId: null,
          lastRallyRetestId: null,
          lastRallySecRetestId: null,
          lastRallySecRetest2Id: null,
          lastSecondaryExitId: null,
          lastRallyExitId: null,
          lastRallyReverseRetestId: null,
          lastBreakoutId: null,
          lastBreakoutReturnId: null,
          lastRallyReactSecRetestId: null,
          lastpreviousPivotRallyReactSecRetestId: null,

          penultimoValor: [],
          penultimoValorFundo: [],
          rallyPivot: [],
          rallyPivotSec: [],
          trendPivotToRetest: [],
          rallyPivotToReturn: [],
          rallySecPivotToReturn: [],
          rallyPivotToSec2: [],
          pivoReversion: [],
          penultimopivoRallySec: [],

          currentTrend: "",

          executeTrendRally: false,
          executeEntrieRally: false,
          executeEntrieRallyReverse: false,
          executeEntrieRallySec: false,
          executeEntrieRallySec2: false,
          executeBreakout: false,
          executeBreakoutToRally: false,
          executeEntriePenultimatePivoRallySec: false,
          executeEntrieLastPivoRallySec: false,
        };
      }
      const state = symbolStateRef.current[symbol];

      // Variável locais por símbolo
      let currentTrendLocal = state.currentTrend;

      const setCurrentTrendForSymbol = (value) => {
        currentTrendLocal = value;
        state.currentTrend = value;
      };

      // reseta as travas de execução a cada nova análise
      canExecuteRallyRef.current = false;
      canExecuteReactionRef.current = false;
      canExecuteReactionSecRef.current = false;
      canExecuteRallySecRef.current = false;

      // função para setar os pontos de reteste
      const setRetestPoints = (points) => {
        if (!Array.isArray(points) || points.length === 0) return;

        const operation = points.some(item => item?.name === "symbol")
          ? points
          : [{ name: "symbol", value: symbol }, ...points];

        // Função de normalização com arredondamento a 4 casas decimais
        const normalizeOperationValue = (value) => {
          const numberValue = Number(value);
          if (Number.isFinite(numberValue)) {
            // Arredondar para 4 casas decimais para evitar variações mínimas
            return Math.round(numberValue * 10000) / 10000;
          }
          return String(value || "").trim();
        };

        // Gerar um ID único com mais informações para evitar duplicatas
        const operationType = operation.find(item => item?.name === "type");
        const operationSide = operation.find(item => item?.name === "buy" || item?.name === "sell");
        const operationStop = operation.find(item => item?.name === "stop");
        const operationTime = operation.find(item => item?.name === "time");

        // ID inclui: símbolo + tipo + lado + preço de entrada + preço de stop + tempo
        // Evita operação duplicada
        const operationId = [
          symbol,
          operationType?.value,
          operationSide?.name,
          normalizeOperationValue(operationSide?.value),
          normalizeOperationValue(operationStop?.value),
          operationTime?.value, // Incluir tempo para garantir unicidade
        ].join("|");

        const symbolHistory = nextRetestHistory[symbol] || [];

        // Checa se já existe uma operação praticamente idêntica
        const alreadyExists = symbolHistory.some(item => {
          // Comparar IDs exatos para evitar duplicatas perfeitas
          if (item.id === operationId) return true;

          // Comparação secundária: mesmo tipo, lado, valores aproximados E tempo
          const existingOp = item.operation;
          const existingType = existingOp.find(i => i?.name === "type");
          const existingSide = existingOp.find(i => i?.name === "buy" || i?.name === "sell");
          const existingEntry = existingOp.find(i => i?.name === "buy" || i?.name === "sell");
          const existingStop = existingOp.find(i => i?.name === "stop");
          const existingTime = existingOp.find(i => i?.name === "time");
          const existingPivot = existingOp.find(i => i?.name === "pivot");

          const isSameType = existingType?.value === operationType?.value;
          const isSameSide = existingSide?.name === operationSide?.name;
          const isSameEntry = normalizeOperationValue(existingEntry?.value) === normalizeOperationValue(operationSide?.value);
          const isSameStop = normalizeOperationValue(existingStop?.value) === normalizeOperationValue(operationStop?.value);
          // ✅Validar que o tempo também é igual
          const isSameTime = parseTimestamp(existingTime?.value) === parseTimestamp(operationTime?.value);

          return isSameType && isSameSide && isSameEntry && isSameStop && isSameTime;
        });

        if (!alreadyExists) {
          nextRetestHistory[symbol] = [
            ...symbolHistory,
            {
              id: operationId,
              operation,
            },
          ];
        }
      };

      // variaveis e constantes de controle
      let naturalReaction = null;
      let naturalReactionSec = null;
      let rallySecundaria = null;

      // ======================|IDENTIFICA O ÚLTIMO PIVÔ EM UMA TENDENCIA QUE DEU ORIGEM A UMA REAÇÃO NATURAL|====================== // 
      const identifyHighTop = (movements) => {
        let ultimoTopoAlta = null;
        let ultimoFundoBaixa = null;
        let encontrouReacaoNatural = false;
        let encontraPivoReversaoAlta = false;
        let pivoReversaoAlta = null;
        let encontraPivoReversaoBaixa = false;
        let pivoReversaoBaixa = null;

        for (let i = 0; i < movements.length; i++) {
          const movement = movements[i];
          const type = movement.tipo;

          // Busca tendência atual.
          if (type.includes('Tendência Alta (compra)')) {
            setCurrentTrendForSymbol("Tendência Alta");
          };
          if (type.includes('Tendência Baixa (venda)')) {
            setCurrentTrendForSymbol("Tendência Baixa");
          };
          // Busca reações e rally atual
          if (type.includes('Reação Natural')) {
            canExecuteReactionRef.current = true
            canExecuteRallyRef.current = false
            naturalReactionSec = null;
          };
          if (type.includes('Rally Natural')) {
            canExecuteRallyRef.current = true
            canExecuteReactionRef.current = false
          };
          if (type.includes('Rally secundário')) {
            canExecuteReactionSecRef.current = false
            canExecuteRallySecRef.current = true
            naturalReaction = null;
          };
          if (type.includes('Reação secundária')) {
            canExecuteRallySecRef.current = false
            canExecuteReactionSecRef.current = true
          };

          // Encontra a Reação secundária
          if (type.includes('Reação secundária')) {
            naturalReactionSec = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            }
            continue;
          };
        };

        for (let i = movements.length - 1; i >= 0; i--) {
          const movement = movements[i];
          const type = movement.tipo;

          // Verificar se é uma Reação Natural (pode ser "Reação Natural (Alta)" ou "Reação Natural (fundo)")
          if (type.includes('Reação Natural') && !encontrouReacaoNatural) {
            naturalReaction = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            }
            encontrouReacaoNatural = true;
            continue;
          };
          // Quando já encontrou uma reação natural, procura o último topo de alta
          if (encontrouReacaoNatural && type.includes('Tendência Alta')) {
            ultimoTopoAlta = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            break;
          };
          // Quando já encontrou uma reação natural, procura o último fundo de baixa
          if (encontrouReacaoNatural && type.includes('Tendência Baixa')) {
            ultimoFundoBaixa = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            break;
          }
        };

        //---------------------/encontra o pivo depois de uma reversão//---------------------//
        for (let i = movements.length - 1; i >= 0; i--) {
          const movement = movements[i];
          const type = movement.tipo;

          // -------------------------/alta/-------------------------//
          if (type.includes('Reação secundária') && !encontraPivoReversaoAlta) {
            encontraPivoReversaoAlta = true;
            continue;
          };
          if (encontraPivoReversaoAlta && type.includes('Rally Natural')) {
            pivoReversaoAlta = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            break;
          };

          // -------------------------/Baixa/-------------------------//
          if (type.includes('Reação secundária') && !encontraPivoReversaoBaixa) {
            encontraPivoReversaoBaixa = true;
            continue;
          };

          if (encontraPivoReversaoBaixa && type.includes('Reação Natural')) {
            pivoReversaoBaixa = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            break;
          };
        };

        return { ultimoTopoAlta, ultimoFundoBaixa, pivoReversaoAlta, pivoReversaoBaixa };
      };

      // ======================|ENCONTRA O PIVÔ DE RETESTE|====================== //
      const identifyRetestRally = (movements) => {
        let encontrouRallyNatural = false;
        let ultimoPivoRally = false;
        let naturalRally = null;
        let rallySecundarioOrigem = null;
        let encontrouRallySecundaria = false;
        let ultimoPivoRallySec = false;
        let encontrouRallyNaturalParaSec = false;
        let encontrouRallyNaturalSec_retest = false;
        let reacaoSecundaria = false;
        let pivotReactionSec = null;
        let pivotRallySec = null;
        let ultimaRallySecundaria = null;
        let pivotRetestRallyNatural = null;
        let pivotRallyToReactSec = null;

        for (let i = movements.length - 1; i >= 0; i--) {
          const movement = movements[i];
          const type = movement.tipo;

          // Encontra o ultimo rally natural
          if (!encontrouRallyNatural && type.includes('Rally Natural')) {
            naturalRally = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            }
            encontrouRallyNatural = true;
            continue;
          };
          if (encontrouRallyNatural && type.includes('Reação Natural')) {
            ultimoPivoRally = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            break;
          };
          // encontrar Rally secundário
          if (!encontrouRallySecundaria && type.includes('Rally secundário')) {
            rallySecundaria = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            encontrouRallySecundaria = true;
            continue;
          };
          // depois que encontrar acha o ultimo Reação secundária (que vai ser o pivo)
          if (!encontrouRallyNaturalParaSec && type.includes('Reação secundária')) {
            pivotReactionSec = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            setRetestPoints([]) // reseta os pontos
            encontrouRallyNaturalParaSec = true;
            continue;
          }
          // depois que encontrar acha o ultimo Reação secundária (que vai ser o pivo)
          if (!encontrouRallyNaturalSec_retest && type.includes('Reação secundária')) {
            pivotReactionSec = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            setRetestPoints([]) // reseta os pontos
            encontrouRallyNaturalParaSec = true;
            continue;
          };
        };

        // Pega último pivo "Reação secundária" que deu origem a um Rally secundário
        for (let i = movements.length - 1; i >= 0; i--) {
          const movement = movements[i];
          const type = movement.tipo;

          // 1️⃣ Primeiro encontra a última Reação secundária
          if (!ultimaRallySecundaria && type.includes("Rally secundário")) {
            ultimaRallySecundaria = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            continue;
          }
          // 2️⃣ Depois, a partir dela, encontra o Rally secundário anterior
          if (ultimaRallySecundaria && type.includes("Reação secundária")) {
            pivotRallySec = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            setRetestPoints([]); // resetar pontos
            break;
          }
        };

        for (let i = movements.length - 1; i >= 0; i--) {
          const movement = movements[i];
          const type = movement.tipo;
          // Verificar se é uma Rally Natural (pode ser "Rally Natural(Alta)" ou "Rally Natural (fundo)")
          if (encontrouRallyNaturalParaSec && type.includes('Rally Natural')) {
            ultimoPivoRallySec = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            setRetestPoints([])
            break;
          };
        };

        for (let i = movements.length - 1; i >= 0; i--) {
          const movement = movements[i];
          const type = movement.tipo;
          //(pode ser "Rally secundário (Alta)" ou "Rally secundário (fundo)")
          if (encontrouRallyNaturalSec_retest && type.includes('Rally secundário')) {
            ultimoPivoRallySec = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            setRetestPoints([])
            break;
          };
        };

        for (let i = movements.length - 1; i >= 0; i--) {
          const movement = movements[i];
          const type = movement.tipo;
          // 1️⃣ acha a reação secundária mais recente
          if (!reacaoSecundaria && type.includes('Reação secundária')) {
            reacaoSecundaria = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            continue;
          }
          // 2️⃣ depois disso, acha o primeiro rally secundário anterior
          if (reacaoSecundaria && type.includes('Rally secundário')) {
            rallySecundarioOrigem = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            break;
          }

          if (reacaoSecundaria && type.includes('Rally Natural')) {
            pivotRetestRallyNatural = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            break;

          }
        };
        console.log('pivotRetestRallyNatural', pivotRetestRallyNatural);

        return { naturalRally, ultimoPivoRally, ultimoPivoRallySec, rallySecundarioOrigem, pivotRallySec, pivotRetestRallyNatural };
      };

      // ======================|ENCONTRA O ROMPIMENTO DE PIVÔ (BREAKOUT)|====================== //
      const identifyBreakoutTrend = (movements) => {
        let enteringTheTrend = [];
        let enteringTheRallyNatural = [];

        for (let i = 0; i < movements.length; i++) {
          const movement = movements[i];
          const type = movement.tipo;

          // Primeiro ponto da Tendência Alta
          if (type.includes('Tendência Alta (compra)')) {
            enteringTheTrend = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            setRetestPoints([])
            continue;
          }
          // Primeiro ponto da Tendência Baixa
          if (type.includes('Tendência Baixa (venda)')) {
            enteringTheTrend = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            };
            setRetestPoints([])
            continue;
          }
          // Primeiro ponto do retorno de Rally Natural
          if (type.includes('Rally Natural (retorno)')) {
            enteringTheRallyNatural = {
              closePrice: movement.closePrice,
              closeTime: movement.closeTime,
              tipo: movement.tipo,
              limite: movement.limite,
              index: i
            }
            setRetestPoints([])
            continue;
          }
        }
        return { enteringTheTrend, enteringTheRallyNatural };
      };

      // Passas os objetos encontrados
      const { ultimoTopoAlta, ultimoFundoBaixa, pivoReversaoAlta, pivoReversaoBaixa } = identifyHighTop(movements);
      let { naturalRally, ultimoPivoRally, ultimoPivoRallySec, rallySecundarioOrigem, pivotRallySec, pivotRetestRallyNatural } = identifyRetestRally(movements);
      const { enteringTheTrend, enteringTheRallyNatural } = identifyBreakoutTrend(movements);

      // ======================|VERIFICA SE O VALOR EXISTE E PASSA PARA VARIÁVEL|====================== //
      let ultimoTopo = ultimoTopoAlta || null;
      let ultimoFundo = ultimoFundoBaixa || null;
      let inversion = pivoReversaoAlta || pivoReversaoBaixa || null;
      let rally = naturalRally || null;
      let rallyPivo = ultimoPivoRally || null;
      let rallySec = ultimoPivoRallySec || null;
      let trend = enteringTheTrend || null;
      let rallyNaturalReturn = enteringTheRallyNatural || null;
      let rallySecExit = rallySecundarioOrigem || null;
      let pivotRallySec2 = pivotRallySec || null;
      let pivotRetestRallyNaturalToReactSec = pivotRetestRallyNatural || null;

      // ======================|VERIFICA SE É UM NOVO TOPO (DIFERENTE DO ANTERIOR)|====================== //
      // **Último topo em uma Alta
      if (ultimoTopo) {
        const isNovoTopo = !state.ultimoTopoAnterior ||
          ultimoTopo.closePrice !== state.ultimoTopoAnterior.closePrice ||
          ultimoTopo.index !== state.ultimoTopoAnterior.index;
        if (isNovoTopo) {
          // Atualiza array de penúltimos valores, acumulando
          state.penultimoValor.push(ultimoTopo);
          state.ultimoTopoAnterior = ultimoTopo;
        } else {
          if (import.meta.env.VITE_NODE_ENV === 'development') {
            console.log('Topo já identificado anteriormente - ignorando repetição');
          }
        }
      } else {
        if (import.meta.env.VITE_NODE_ENV === 'development') {
          if (process.env.NODE_ENV === 'development') {
            console.log('Nenhum topo de alta antecedendo reação natural foi encontrado');
          }
        }
      };

      // **Último fundo em uma Baixa
      if (ultimoFundo) {
        const isNovoTopo = !state.ultimoFundoAnterior ||
          ultimoFundo.closePrice !== state.ultimoFundoAnterior.closePrice ||
          ultimoFundo.index !== state.ultimoFundoAnterior.index;
        if (isNovoTopo) {
          // Atualiza array de penúltimos valores, acumulando
          state.penultimoValorFundo.push(ultimoFundo);
          state.ultimoFundoAnterior = ultimoFundo;
        } else {
          if (import.meta.env.VITE_NODE_ENV === 'development') {
            console.log('Topo já identificado anteriormente - ignorando repetição');
          }
        }
      } else {
        if (import.meta.env.VITE_NODE_ENV === 'development') {
          if (process.env.NODE_ENV === 'development') {
            console.log('Nenhum topo de alta antecedendo reação natural foi encontrado');
          }
        }
      };

      // **Último Pivo depois de uma invesão de tendência
      if (inversion) {
        const isNovoPivo = !state.pivoReversaoAlta ||
          pivoReversaoAlta.closePrice !== state.pivoReversaoAlta.closePrice || state.pivoReversaoBaixa.closePrice ||
          pivoReversaoAlta.index !== state.pivoReversaoAlta.index ||
          pivoReversaoBaixa.index !== state.pivoReversaoBaixa.index;
        if (isNovoPivo) {
          state.pivoReversion.push(inversion)
        } else {
          if (import.meta.env.VITE_NODE_ENV === 'development') {
            console.log('Topo já identificado anteriormente - ignorando repetição');
          }
        }
      } else {
        if (import.meta.env.VITE_NODE_ENV === 'development') {
          console.log('Nenhum topo de alta antecedendo reação natural foi encontrado');
        }
      };

      // **Último pivo de uma rally
      if (rallyPivo) {
        const isNovoRally = !state.ultimoPivoAnteriorRally ||
          rallyPivo.closePrice !== state.ultimoPivoAnteriorRally.closePrice ||
          rallyPivo.index !== state.ultimoPivoAnteriorRally.index;
        if (isNovoRally) {
          // Atualiza array de penúltimos valores, acumulando
          state.rallyPivot.push(rallyPivo);
          state.ultimoPivoAnteriorRally = rallyPivo;
        };
      };

      // **Último pivo de uma rally sec
      if (rallySec) {
        const isNovoRallySec = !state.ultimoPivoAnteriorRallySec ||
          rallySec.closePrice !== state.ultimoPivoAnteriorRallySec.closePrice ||
          rallySec.index !== state.ultimoPivoAnteriorRallySec.index;
        // Atualiza array de penúltimos valores, acumulando
        if (isNovoRallySec) {
          state.rallyPivotSec.push(rallySec);
          state.ultimoPivoAnteriorRallySec = rallySec;
        };
      };

      // **Último pivo de (Breakout)
      if (trend) {
        const isNewTrend = !state.trendFound ||
          trend.closePrice !== state.trendFound.closePrice ||
          trend.index !== state.trendFound.index;
        // Atualiza array de valores, acumulando
        if (isNewTrend) {
          state.trendPivotToRetest.push(trend);
          state.trendFound = trend;
        };
      };

      // **Primeiro ponto de retorno de um rally natural em um (Breakout)
      if (rallyNaturalReturn) {
        const isNewrallyNaturalReturn = !state.rallyFound ||
          rallyNaturalReturn.closePrice !== state.rallyFound.closePrice ||
          rallyNaturalReturn.index !== state.rallyFound.index;

        // Atualiza array de valor acumulado
        if (isNewrallyNaturalReturn) {
          state.rallyPivotToReturn.push(rallyNaturalReturn);
          state.rallyFound = rallyNaturalReturn;
        };
      };
      // **Último pivo em um rally sec dentro de uma consolidação
      if (pivotRallySec2) {
        const isNewrallySec = !state.rallySec2Found ||
          pivotRallySec2.closePrice !== state.rallySec2Found.closePrice ||
          pivotRallySec2.index !== state.rallySec2Found.index;

        if (isNewrallySec) {
          state.rallyPivotToSec2.push(pivotRallySec2);
          state.rallySec2Found = pivotRallySec2;
        }
      }

      // **Último pivo rally secundário
      if (pivotRetestRallyNaturalToReactSec) {
        const isNewPivoRallySec = !state.ultimoPivoSecFound ||
          pivotRetestRallyNaturalToReactSec.closePrice !== state.ultimoPivoSecFound.closePrice ||
          pivotRetestRallyNaturalToReactSec.index !== state.ultimoPivoSecFound.index;

        if (isNewPivoRallySec) {
          state.penultimopivoRallySec.push(pivotRetestRallyNaturalToReactSec);
          state.ultimoPivoSecFound = pivotRetestRallyNaturalToReactSec;
        }
      }

      // ======================|PEGA OS PONTOS DE PIVÔ|====================== //
      // **Reteste último Pivo em uma tendência 
      let ct = state.currentTrend == 'Tendência Alta';
      let pivo = ct ?
        state.penultimoValor[state.penultimoValor.length - 2] :
        state.penultimoValorFundo[state.penultimoValorFundo.length - 2];

      // **Reteste de pivo para saída
      const TrendPivot = state.penultimoValor[state.penultimoValor.length - 1];

      // **Reteste de pivo de rally sec
      const pivoRallySec2 = state.rallyPivotToSec2[state.rallyPivotToSec2.length - 1];

      // **Reteste de pivo de rally executa normal depois de pivoRally
      const pivoRallyPrimary = state.rallyPivot[state.rallyPivot.length - 1];

      // **Reteste em pivo logo depois de uma reversão
      const pivoRallySecReversion = state.pivoReversion[state.pivoReversion.length - 2];

      // **Reteste de pivo rally secundário para saída
      const pivoRallySecExit = state.rallyPivotSec[state.rallyPivotSec.length - 1];

      // **Rompimento de tendência
      const pivotBreak = state.trendPivotToRetest[state.trendPivotToRetest.length - 1];

      // **Rompimento no rally natural retomada
      const pivotRallyReturn = state.rallyPivotToReturn[state.rallyPivotToReturn.length - 1];

      // **Reteste no penultimo pivô de um rally sec
      const penultimatePivoRallySec = state.penultimopivoRallySec[state.penultimopivoRallySec.length - 2];

      // **Reteste no mais resente pivô de um rally sec
      const lastPivotRallySec = state.penultimopivoRallySec[state.penultimopivoRallySec.length - 1];
      console.log('lastPivotRallySec', lastPivotRallySec);


      // Garante que o rally execute apenas em uma reversão(ENTRY_BUY_RALLY_REVERSE)
      if (state.currentTrend) {
        trendHistoryRef.current.push(state.currentTrend);
        if (trendHistoryRef.current.length > 2) {
          trendHistoryRef.current.shift();
        }
        const changed = trendHistoryRef.current.length === 2 &&
          trendHistoryRef.current[0] !== trendHistoryRef.current[1];
        if (changed) {
          useRallyRef.current = true; // ativa uso do pivoRally
        }
      }

      // **Função auxiliar para gerar id para unica execução 
      function buildEventId(pivo, reaction) {
        if (!pivo || !reaction) return null;
        return `${symbol}-${pivo.closeTime}-${reaction.closeTime}`;
      };

      // ======================|RETESTE DE TENDÊNCIA|====================== //
      if (pivo && naturalReaction && canExecuteReactionRef.current && !state.executeTrendRally) {
        const limite = pivo.limite;
        const tolerance = limite / 3;
        const high = pivo.closePrice + tolerance;
        const low = pivo.closePrice - tolerance;

        const buyPoint = pivo.closePrice + limite / 2.5;
        const sellPoint = pivo.closePrice - limite / 2.5;

        const eventId = buildEventId(pivo, naturalReaction);
        if (eventId && state.lastTrendRetestId !== eventId) {
          state.lastTrendRetestId = eventId;
          // 🟢 RETESTE DE COMPRA
          if (
            ultimoTopoAlta &&
            state.currentTrend === "Tendência Alta" &&
            naturalReaction.closePrice >= low &&
            naturalReaction.closePrice <= high
          ) {
            setRetestPoints([
              { name: "pivot", value: pivo.closePrice },
              { name: "time", value: naturalReaction.closeTime },
              { name: "buy", value: buyPoint },
              { name: "stop", value: sellPoint },
              { name: "type", value: "PIVOT_BUY_TREND" },
              { name: "limite", value: limite },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high },
              { name: "pivotExit", value: TrendPivot?.closePrice },
            ]);
            state.executeTrendRally = true;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
          };

          // 🔴 RETESTE DE VENDA
          if (
            ultimoFundoBaixa &&
            state.currentTrend === "Tendência Baixa" &&
            naturalReaction.closePrice >= low &&
            naturalReaction.closePrice <= high
          ) {
            setRetestPoints([
              { name: "pivot", value: pivo.closePrice },
              { name: "time", value: naturalReaction.closeTime },
              { name: "sell", value: sellPoint },
              { name: "stop", value: buyPoint },
              { name: "type", value: "PIVOT_SELL_TREND" },
              { name: "limite", value: limite },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high },
              { name: "pivotExit", value: TrendPivot?.closePrice },
            ]);
            state.executeTrendRally = true;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
          };
        };
      };

      // ======================|RETEST NO PIVO DE RALLY|====================== //
      if (pivoRallyPrimary && naturalReaction && canExecuteReactionRef.current && !state.executeEntrieRally) {
        const limite = pivoRallyPrimary.limite;
        const tolerance = limite / 3;
        const high = pivoRallyPrimary.closePrice + tolerance;
        const low = pivoRallyPrimary.closePrice - tolerance;

        const buyPoint = pivoRallyPrimary.closePrice + limite / 2.5;
        const sellPoint = pivoRallyPrimary.closePrice - limite / 2.5;

        const eventId = buildEventId(pivoRallyPrimary, naturalReaction);
        if (eventId && state.lastRallyRetestId !== eventId) {
          state.lastRallyRetestId = eventId;
          // 🟢 COMPRAR EM UM RALLY
          if (
            state.currentTrend === "Tendência Alta" &&
            naturalReaction.closePrice >= low &&
            naturalReaction.closePrice <= high
          ) {
            setRetestPoints([
              { name: "pivot", value: pivoRallyPrimary.closePrice },
              { name: "time", value: naturalReaction.closeTime },
              { name: "buy", value: buyPoint },
              { name: "stop", value: sellPoint },
              { name: "type", value: "PIVOT_BUY_RALLY" },
              { name: "limite", value: limite },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high },
              { name: "pivotExit", value: TrendPivot?.closePrice },
            ]);
            state.executeEntrieRally = true;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
          };
          // 🔴 VENDA EM UM RALLY
          if (
            state.currentTrend === "Tendência Baixa" &&
            naturalReaction.closePrice >= low &&
            naturalReaction.closePrice <= high
          ) {
            setRetestPoints([
              { name: "pivot", value: pivoRallyPrimary.closePrice },
              { name: "time", value: naturalReaction.closeTime },
              { name: "sell", value: sellPoint },
              { name: "stop", value: buyPoint },
              { name: "type", value: "PIVOT_SELL_RALLY" },
              { name: "limite", value: limite },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high },
              { name: "pivotExit", value: TrendPivot?.closePrice },
            ]);
            state.executeEntrieRally = true;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
          };
        };
      };

      // ======================|RETEST NO PIVO DE RALLY secundário|====================== //
      if (pivoRallySecReversion && naturalReaction && canExecuteReactionRef.current && useRallyRef.current && !state.executeEntrieRallyReverse) {
        const limite = pivoRallySecReversion.limite;
        const tolerance = limite / 3;
        const high = pivoRallySecReversion.closePrice + tolerance;
        const low = pivoRallySecReversion.closePrice - tolerance;

        const buyPoint = pivoRallySecReversion.closePrice + limite / 2.5;
        const sellPoint = pivoRallySecReversion.closePrice - limite / 2.5;

        const eventId = buildEventId(pivoRallySecReversion, naturalReaction);
        if (eventId && state.lastRallyReverseRetestId !== eventId) {
          state.lastRallyReverseRetestId = eventId;
          // 🟢 COMPRA EM UM RALLY DEPOIS DE UMA REVERSÃO
          if (
            state.currentTrend === "Tendência Alta" &&
            naturalReaction.closePrice >= low &&
            naturalReaction.closePrice <= high
          ) {
            setRetestPoints([
              { name: "pivot", value: pivoRallySecReversion.closePrice },
              { name: "time", value: naturalReaction.closeTime },
              { name: "buy", value: buyPoint },
              { name: "stop", value: sellPoint },
              { name: "type", value: "PIVOT_BUY_RALLY_REVERSE" },
              { name: "limite", value: limite },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high },
              { name: "pivotExit", value: TrendPivot?.closePrice },
            ]);
            useRallyRef.current = false;
            state.executeEntrieRallyReverse = true;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
          };
          // 🔴 VENDA EM UM RALLY DEPOIS DE UMA REVERSÃO
          if (
            state.currentTrend === "Tendência Baixa" &&
            naturalReaction.closePrice >= low &&
            naturalReaction.closePrice <= high

          ) {
            setRetestPoints([
              { name: "pivot", value: pivoRallySecReversion.closePrice },
              { name: "time", value: naturalReaction.closeTime },
              { name: "sell", value: sellPoint },
              { name: "stop", value: buyPoint },
              { name: "type", value: "PIVOT_SELL_RALLY_REVERSE" },
              { name: "limite", value: limite },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high },
              { name: "pivotExit", value: TrendPivot?.closePrice },
            ]);
            useRallyRef.current = false;
            state.executeEntrieRallyReverse = true;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
          };
        };
      };

      // ======================|SAÍDA DE TENDÊNCIA|====================== //
      if (TrendPivot && naturalRally && canExecuteRallyRef.current /**&& state.executeTrendRally || state.executeEntrieRally || state.executeEntrieRallyReverse */) {
        const limite = TrendPivot?.limite;
        const tolerance = limite / 4;
        const high = TrendPivot?.closePrice + tolerance;
        const low = TrendPivot?.closePrice - tolerance;
        const sellExit = TrendPivot?.closePrice - limite / 2;
        const buyExit = TrendPivot?.closePrice + limite / 2;

        const eventId = buildEventId(TrendPivot, naturalRally);
        if (eventId && state.lastTrendExitId !== eventId) {
          state.lastTrendExitId = eventId;
          // 🟢 SAÍDA DE COMPRA EM UMA TENDÊNCIA
          if (
            state.currentTrend === "Tendência Alta" &&
            naturalRally.closePrice >= low &&
            naturalRally.closePrice <= high
          ) {
            setRetestPoints([
              { name: "pivot", value: TrendPivot.closePrice },
              { name: "time", value: naturalRally.closeTime },
              { name: "stop", value: buyExit },
              { name: "type", value: "PIVOT_EXIT_BUY_TREND" },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high }
            ]);
            useRallyRef.current = false;
            state.executeTrendRally = false;
            state.executeEntrieRally = false;
            state.executeEntrieRallyReverse = false;
            state.executeEntrieRallySec = false;
            state.executeEntrieRallySec2 = false;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
            state.executeEntriePenultimatePivoRallySec = false;
          };
          // 🔴 SAÍDA DE VENDA EM UMA TENDÊNCIA
          if (
            state.currentTrend === "Tendência Baixa" &&
            naturalRally.closePrice >= low &&
            naturalRally.closePrice <= high
          ) {
            setRetestPoints([
              { name: "pivot", value: TrendPivot.closePrice },
              { name: "time", value: naturalRally.closeTime },
              { name: "stop", value: sellExit },
              { name: "type", value: "PIVOT_EXIT_SELL_TREND" },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high }
            ]);
            useRallyRef.current = false;
            state.executeTrendRally = false;
            state.executeEntrieRally = false;
            state.executeEntrieRallyReverse = false;
            state.executeEntrieRallySec = false;
            state.executeEntrieRallySec2 = false;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
            state.executeEntriePenultimatePivoRallySec = false;
          };
        };
      };

      // ======================|RETEST NO PIVO DE RALLY EM UMA REAÇÃO SECUNDÁRIA (pullback pós-breakout)|====================== //
      if (pivoRallyPrimary && naturalReactionSec && canExecuteReactionSecRef.current && !state.executeEntrieRallySec) {
        const limite = pivoRallyPrimary.limite;
        const tolerance = limite / 3;
        const high = pivoRallyPrimary.closePrice + tolerance;
        const low = pivoRallyPrimary.closePrice - tolerance;

        const buyPoint = pivoRallyPrimary.closePrice + limite / 2.5;
        const sellPoint = pivoRallyPrimary.closePrice - limite / 2.5;

        const eventId = buildEventId(pivoRallyPrimary, naturalReactionSec);
        if (eventId && state.lastRallySecRetestId !== eventId) {
          state.lastRallySecRetestId = eventId;
          // 🟢 COMPRA RALLY SECUNDÁRIO
          if (
            state.currentTrend === "Tendência Alta" &&
            naturalReactionSec.closePrice <= high &&
            naturalReactionSec.closePrice >= low
          ) {
            setRetestPoints([
              { name: "pivot", value: pivoRallyPrimary.closePrice },
              { name: "time", value: naturalReactionSec.closeTime },
              { name: "buy", value: buyPoint },
              { name: "stop", value: sellPoint },
              { name: "type", value: "PIVOT_BUY_RALLY_SEC" },
              { name: "limite", value: limite },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high },
              { name: "pivotExit", value: pivoRallySecExit?.closePrice }
            ]);
            state.executeEntrieRallySec = true;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
          };
          // 🔴 VENDA RALLY SECUNDÁRIO
          if (
            state.currentTrend === "Tendência Baixa" &&
            naturalReactionSec.closePrice <= high &&
            naturalReactionSec.closePrice >= low
          ) {
            setRetestPoints([
              { name: "pivot", value: pivoRallyPrimary.closePrice },
              { name: "time", value: naturalReactionSec.closeTime },
              { name: "sell", value: sellPoint },
              { name: "stop", value: buyPoint },
              { name: "type", value: "PIVOT_SELL_RALLY_SEC" },
              { name: "limite", value: limite },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high },
              { name: "pivotExit", value: pivoRallySecExit?.closePrice }
            ]);
            state.executeEntrieRallySec = true;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
          };
        };
      };

      // ======================|SAÍDA REAÇÃO SECUNDÁRIA|====================== //
      if (pivoRallySecExit && rallySecundaria && canExecuteRallySecRef.current && state.executeEntrieRallySec) {
        const limite = pivoRallySecExit.limite;
        const tolerance = limite / 3;
        const high = pivoRallySecExit.closePrice + tolerance;
        const low = pivoRallySecExit.closePrice - tolerance;

        const sellExit = pivoRallySecExit.closePrice - limite / 2;
        const buyExit = pivoRallySecExit.closePrice + limite / 2;

        const eventId = buildEventId(pivoRallySecExit, rallySecundaria);
        if (eventId && state.lastSecondaryExitId !== eventId) {
          state.lastSecondaryExitId = eventId;

          // 🟢 SAÍDA DE COMPRA EM UM RALLY SECUNDÁRIO
          if (
            rallySecundaria &&
            state.currentTrend === "Tendência Alta" &&
            rallySecundaria.closePrice <= high &&
            rallySecundaria.closePrice >= low) {
            setRetestPoints([
              { name: "pivot", value: pivoRallySecExit.closePrice },
              { name: "time", value: rallySecundaria.closeTime },
              { name: "stop", value: sellExit },
              { name: "type", value: "PIVOT_EXIT_BUY_SEC" },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high }
            ]);
            state.executeTrendRally = false;
            state.executeEntrieRally = false;
            state.executeEntrieRallyReverse = false;
            state.executeEntrieRallySec = false;
            state.executeEntrieRallySec2 = false;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
            state.executeEntriePenultimatePivoRallySec = false;
          };
          // 🔴 SAÍDA DE VENDA EM UM RALLY SECUNDÁRIO
          if (rallySecundaria &&
            state.currentTrend === "Tendência Baixa" &&
            rallySecundaria.closePrice >= low &&
            rallySecundaria.closePrice <= high) {
            setRetestPoints([
              { name: "pivot", value: pivoRallySecExit.closePrice },
              { name: "time", value: rallySecundaria.closeTime },
              { name: "stop", value: buyExit },
              { name: "type", value: "PIVOT_EXIT_SELL_SEC" },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high }
            ]);
            state.executeTrendRally = false;
            state.executeEntrieRally = false;
            state.executeEntrieRallyReverse = false;
            state.executeEntrieRallySec = false;
            state.executeEntrieRallySec2 = false;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
            state.executeEntriePenultimatePivoRallySec = false;
          };
        };
      };

      // ======================|RETEST NO PIVÔ DE RALLY EM UMA REAÇÃO SECUNDÁRIA EM UMA LATERALIZAÇÃO|====================== //
      if (pivoRallySec2 && naturalReactionSec && canExecuteReactionSecRef.current && !state.executeEntrieRallySec2) {
        const limite = pivoRallySec2?.limite;
        const tolerance = limite / 3;
        const high = pivoRallySec2?.closePrice + tolerance;
        const low = pivoRallySec2?.closePrice - tolerance;

        const buyPoint = pivoRallySec2?.closePrice + limite / 2.5;
        const sellPoint = pivoRallySec2?.closePrice - limite / 2.5;

        // ✅ usar pivoRally em vez de pivoRallyPrimary.closePrice
        const eventId = buildEventId(pivoRallySec2, naturalReactionSec);
        if (eventId && state.lastRallySecRetest2Id !== eventId) {
          state.lastRallySecRetest2Id = eventId;
          // 🟢 Comprar de retest
          if (
            state.currentTrend === "Tendência Alta" &&
            naturalReactionSec.closePrice <= high &&
            naturalReactionSec.closePrice >= low
          ) {
            setRetestPoints([
              { name: "pivot", value: pivoRallySec2?.closePrice },
              { name: "time", value: naturalReactionSec.closeTime },
              { name: "buy", value: buyPoint },
              { name: "stop", value: sellPoint },
              { name: "type", value: "PIVOT_BUY_RALLY_SEC_LATE" },
              { name: "limite", value: limite },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high },
              { name: "pivotExit", value: rallySecExit?.closePrice }
            ]);
            state.executeEntrieRallySec2 = true;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
          };
          // 🔴 Venda de retest
          if (
            state.currentTrend === "Tendência Baixa" &&
            naturalReactionSec.closePrice >= low &&
            naturalReactionSec.closePrice <= high
          ) {
            setRetestPoints([
              { name: "pivot", value: pivoRallySec2?.closePrice },
              { name: "time", value: naturalReactionSec.closeTime },
              { name: "sell", value: sellPoint },
              { name: "stop", value: buyPoint },
              { name: "type", value: "PIVOT_SELL_RALLY_SEC_LATE" },
              { name: "limite", value: limite },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high },
              { name: "pivotExit", value: rallySecExit?.closePrice }
            ]);
            state.executeEntrieRallySec2 = true;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
          };
        };
      };

      // ======================|SAÍDA REAÇÃO SECUNDÁRIA 2 EM UMA LATERALIZAÇÃO| ====================== //
      if (rallySecExit && rallySecundaria && canExecuteRallySecRef.current && state.executeEntrieRallySec2) {
        const limite = rallySecExit?.limite;
        const tolerance = limite / 4;
        const high = rallySecExit?.closePrice + tolerance;
        const low = rallySecExit?.closePrice - tolerance;
        const sellExit = rallySecExit?.closePrice - limite / 2;
        const buyExit = rallySecExit?.closePrice + limite / 2;

        const eventId = buildEventId(rallySecExit, rallySecundaria);
        if (eventId && state.lastRallyExitId !== eventId) {
          state.lastRallyExitId = eventId;
          // 🟢 Saída de compra de retest
          if (
            rallySecundaria &&
            state.currentTrend === "Tendência Alta" &&
            rallySecundaria.closePrice <= high &&
            rallySecundaria.closePrice >= low) {
            setRetestPoints([
              { name: "pivot", value: rallySecExit?.closePrice },
              { name: "time", value: rallySecundaria?.closeTime },
              { name: "stop", value: sellExit },
              { name: "type", value: "PIVOT_EXIT_BUY_SEC" },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high }
            ]);
            state.executeTrendRally = false;
            state.executeEntrieRally = false;
            state.executeEntrieRallyReverse = false;
            state.executeEntrieRallySec = false;
            state.executeEntrieRallySec2 = false;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
            state.executeEntriePenultimatePivoRallySec = false;
          };
          // 🔴 Saída de venda de retest
          if (rallySecundaria &&
            state.currentTrend === "Tendência Baixa" &&
            rallySecundaria.closePrice >= low &&
            rallySecundaria.closePrice <= high) {
            setRetestPoints([
              { name: "pivot", value: rallySecExit.closePrice },
              { name: "time", value: rallySecundaria.closeTime },
              { name: "stop", value: buyExit },
              { name: "type", value: "PIVOT_EXIT_SELL_SEC" },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high }
            ]);
            state.executeTrendRally = false;
            state.executeEntrieRally = false;
            state.executeEntrieRallyReverse = false;
            state.executeEntrieRallySec = false;
            state.executeEntrieRallySec2 = false;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
            state.executeEntriePenultimatePivoRallySec = false;
          };
        };
      };

      // ======================|RETEST NO PIVÔ DE RALLY NATURAL PARA REAÇÃO SECUNDÁRIO (Penultimo pivô)| ====================== //
      if (penultimatePivoRallySec && naturalReactionSec && canExecuteReactionSecRef.current && !state.executeEntriePenultimatePivoRallySec) {
        const limite = penultimatePivoRallySec?.limite;
        const tolerance = limite / 3;
        const high = penultimatePivoRallySec?.closePrice + tolerance;
        const low = penultimatePivoRallySec?.closePrice - tolerance;

        const buyPoint = penultimatePivoRallySec?.closePrice + limite / 2.5;
        const sellPoint = penultimatePivoRallySec?.closePrice - limite / 2.5;

        // ✅ usar pivoRally em vez de pivoRallyPrimary.closePrice
        const eventId = buildEventId(penultimatePivoRallySec, naturalReactionSec);
        if (eventId && state.lastRallyReactSecRetestId !== eventId) {
          state.lastRallyReactSecRetestId = eventId;
          // 🟢 Comprar de retest
          if (
            state.currentTrend === "Tendência Alta" &&
            naturalReactionSec.closePrice <= high &&
            naturalReactionSec.closePrice >= low
          ) {
            setRetestPoints([
              { name: "pivot", value: penultimatePivoRallySec?.closePrice },
              { name: "time", value: naturalReactionSec.closeTime },
              { name: "buy", value: buyPoint },
              { name: "stop", value: sellPoint },
              { name: "type", value: "PIVOT_BUY_RALLY_REACT_SEC" },
              { name: "limite", value: limite },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high },
              { name: "pivotExit", value: rallySecExit?.closePrice }
            ]);
            state.executeEntriePenultimatePivoRallySec = true;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
          };
          // 🔴 Venda de retest
          if (
            state.currentTrend === "Tendência Baixa" &&
            naturalReactionSec.closePrice >= low &&
            naturalReactionSec.closePrice <= high
          ) {
            setRetestPoints([
              { name: "pivot", value: penultimatePivoRallySec?.closePrice },
              { name: "time", value: naturalReactionSec.closeTime },
              { name: "sell", value: sellPoint },
              { name: "stop", value: buyPoint },
              { name: "type", value: "PIVOT_SELL_RALLY_REACT_SEC" },
              { name: "limite", value: limite },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high },
              { name: "pivotExit", value: rallySecExit?.closePrice }
            ]);
            state.executeEntriePenultimatePivoRallySec = true;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
          };
        };
      };


      // ======================|RETEST NO PIVÔ DE RALLY NATURAL PARA REAÇÃO SECUNDÁRIO (último pivô)| ====================== //
      if (lastPivotRallySec && naturalReaction && canExecuteReactionRef.current && !state.executeEntrieLastPivoRallySec) {
        const limite = lastPivotRallySec?.limite;
        const tolerance = limite / 2;
        const high = lastPivotRallySec?.closePrice + tolerance;
        const low = lastPivotRallySec?.closePrice - tolerance;

        const buyPoint = lastPivotRallySec?.closePrice + limite / 2.5;
        const sellPoint = lastPivotRallySec?.closePrice - limite / 2.5;

        // ✅ usar pivoRally em vez de pivoRallyPrimary.closePrice
        const eventId = buildEventId(lastPivotRallySec, naturalReaction);
        if (eventId && state.lastpreviousPivotRallyReactSecRetestId !== eventId) {
          state.lastpreviousPivotRallyReactSecRetestId = eventId;
          // 🟢 Comprar de retest
          if (
            state.currentTrend === "Tendência Alta" &&
            naturalReaction.closePrice <= high &&
            naturalReaction.closePrice >= low
          ) {
            setRetestPoints([
              { name: "pivot", value: lastPivotRallySec?.closePrice },
              { name: "time", value: naturalReaction.closeTime },
              { name: "buy", value: buyPoint },
              { name: "stop", value: sellPoint },
              { name: "type", value: "PIVOT_BUY_RALLY_REACT_SEC" },
              { name: "limite", value: limite },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high },
              { name: "pivotExit", value: rallySecExit?.closePrice }
            ]);
            state.executeEntrieLastPivoRallySec = true;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
          };
          // 🔴 Venda de retest
          if (
            state.currentTrend === "Tendência Baixa" &&
            naturalReaction.closePrice >= low &&
            naturalReaction.closePrice <= high
          ) {
            setRetestPoints([
              { name: "pivot", value: lastPivotRallySec?.closePrice },
              { name: "time", value: naturalReaction.closeTime },
              { name: "sell", value: sellPoint },
              { name: "stop", value: buyPoint },
              { name: "type", value: "PIVOT_SELL_RALLY_REACT_SEC" },
              { name: "limite", value: limite },
              { name: "BandLow", value: low },
              { name: "BandHigh", value: high },
              { name: "pivotExit", value: rallySecExit?.closePrice }
            ]);
            state.executeEntrieLastPivoRallySec = true;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
          };
        };
      };

      // ======================|ROMPIMENTO|====================== //
      if (pivotBreak && !state.executeBreakout) {
        const limite = pivotBreak.limite;
        const pivotId = pivotBreak.closeTime;
        const type = pivotBreak.tipo;

        const pivoBuy = pivotBreak.closePrice - (limite / 2);
        const pivoSell = pivotBreak.closePrice + (limite / 2);

        // stop abaixo(Tendência alta) ou acima(Tendência baixa) do pivot 
        const stopPivotBuy = pivoRallyPrimary?.closePrice - (limite / 2);
        const stopPivotSell = pivoRallyPrimary?.closePrice + (limite / 2);

        if (state.lastBreakoutId !== pivotId) {
          state.lastBreakoutId = pivotId;
          // 🟢 ROMPIMENTO DE PIVÔ DE COMPRA
          if (
            state.currentTrend === "Tendência Alta" &&
            type === "Tendência Alta (compra)") {
            setRetestPoints([
              { name: "pivot", value: pivoBuy },
              { name: "time", value: pivotBreak.closeTime },
              { name: "buy", value: pivotBreak.closePrice },
              { name: "stop", value: stopPivotBuy },
              { name: "type", value: "PIVOT_BREAK_BUY" },
              { name: "limite", value: limite }
            ]);
            state.executeBreakout = true;
            state.executeTrendRally = false;
            state.executeEntrieRally = false;
            state.executeEntrieRallyReverse = false;
            state.executeEntrieRallySec = false;
            state.executeEntrieRallySec2 = false;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
            state.executeEntriePenultimatePivoRallySec = false;
          };
          // 🔴 ROMPIMENTO DE PIVÔ DE COMPRA
          if (
            state.currentTrend === "Tendência Baixa" &&
            type === "Tendência Baixa (venda)") {
            setRetestPoints([
              { name: "pivot", value: pivoSell },
              { name: "time", value: pivotBreak.closeTime },
              { name: "sell", value: pivotBreak.closePrice },
              { name: "stop", value: stopPivotSell },
              { name: "type", value: "PIVOT_BREAK_SELL" },
              { name: "limite", value: limite }
            ]);
            state.executeBreakout = true;
            state.executeTrendRally = false;
            state.executeEntrieRally = false;
            state.executeEntrieRallyReverse = false;
            state.executeEntrieRallySec = false;
            state.executeEntrieRallySec2 = false;
            state.executeBreakout = false;
            state.executeBreakoutToRally = false;
            state.executeEntriePenultimatePivoRallySec = false;
          };
        };
      };

      // ======================|ROMPIMENTO DE PIVO EM UMA RETOMADA RALLY NATURAL|// ======================//
      if (pivotRallyReturn && !state.executeBreakoutToRally) {
        const limite = pivotRallyReturn.limite;
        const pivotId = pivotRallyReturn.closeTime;
        const type = pivotRallyReturn.tipo;

        const pivoBuy = pivotRallyReturn.closePrice - (limite / 2);
        const pivoSell = pivotRallyReturn.closePrice + (limite / 2);

        // stop abaixo(Tendência alta) ou acima(Tendência baixa) do pivot 
        const stopPivotBuy = pivoRallyPrimary?.closePrice - (limite / 2);
        const stopPivotSell = pivoRallyPrimary?.closePrice + (limite / 2);

        if (state.lastBreakoutReturnId !== pivotId) {
          state.lastBreakoutReturnId = pivotId;
          // 🟢 ROMPIMENTO DE PIVÔ EM UMA COMPRA EM UMA RETOMA DE RALLY NATURAL
          if (
            state.currentTrend === "Tendência Alta" &&
            type === "Rally Natural (retorno)") {
            setRetestPoints([
              { name: "pivot", value: pivoBuy },
              { name: "time", value: pivotRallyReturn.closeTime },
              { name: "buy", value: pivotRallyReturn.closePrice },
              { name: "stop", value: stopPivotBuy },
              { name: "type", value: "PIVOT_BREAK_RALLY_BUY" },
              { name: "limite", value: limite }
            ]);
            state.executeBreakoutToRally = true;

          };
          // 🔴 ROMPIMENTO DE PIVÔ EM UMA VENDA EM UMA RETOMA DE RALLY NATURAL
          if (
            state.currentTrend === "Tendência Baixa" &&
            type === "Rally Natural (retorno)") {
            setRetestPoints([
              { name: "pivot", value: pivoSell },
              { name: "time", value: pivotRallyReturn.closeTime },
              { name: "sell", value: pivotRallyReturn.closePrice },
              { name: "stop", value: stopPivotSell },
              { name: "type", value: "PIVOT_BREAK_RALLY-SELL" },
              { name: "limite", value: limite }
            ]);
            state.executeBreakoutToRally = true;
          };
        };
      };
    });
    retestHistoryRef.current = nextRetestHistory;

    // ✅ Garantir ordenação temporal das operações
    // Função para ordenar operações por timestamp
    const sortOperationsByTime = (operations) => {
      return [...operations].sort((a, b) => {
        const timeA = a.operation.find(item => item?.name === "time")?.value;
        const timeB = b.operation.find(item => item?.name === "time")?.value;
        return parseTimestamp(timeA) - parseTimestamp(timeB);
      });
    };

    // Criar array com operações ordenadas por tempo
    const operationsArray = Object.entries(nextRetestHistory)
      .sort(([symbolA], [symbolB]) => symbolA.localeCompare(symbolB)) // Ordenar símbolos alfabeticamente
      .map(([symbol, history]) => ({
        symbol,
        // ✅ Operações ordenadas cronologicamente dentro de cada símbolo
        operations: sortOperationsByTime(history).map(item => item.operation),
      }));

    retestPointsStatePrimaryRef.current = operationsArray

  }, [trendGroups]);

  return { retestPointsStatePrimaryRef };
}
