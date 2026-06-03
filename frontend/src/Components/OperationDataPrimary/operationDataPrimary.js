import { useEffect, useMemo, useRef, useState } from 'react'

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
// Estado para armazenar o último topo anterior
export const useOperatingDataPrymary = (trendPrimary) => {
  const [retestPointsStatePrimary , setRetestPointsStatePrimary] = useState([]);

  // variaveis para evitar reprocessamento
  const lastTrendRetestIdRef = useRef(null);
  const lastTrendExitIdRef = useRef(null);
  const lastRallyRetestIdRef = useRef(null);
  const lastRallyRetestIdPrimaryRef = useRef(null);
  const lastRallyExitIdRef = useRef(null);
  const lastSecondaryExitIdRef = useRef(null);
  const lastBreakoutIdRef = useRef(null);
  const canExecuteRallyRef = useRef(false);
  const canExecuteReactionRef = useRef(false);
  const canExecuteReactionSecRef = useRef(false);
  const canExecuteRallySecRef = useRef(false);
  const retestHistoryRef = useRef({});

  const symbolStateRef = useRef({}); // estado isolado por símbolo

  // Normaliza os dados de tendência para garantir um formato consistente
  const trendGroups = useMemo(() => normalizeTrendGroups(trendPrimary), [trendPrimary]);


  useEffect(() => {
    // dados de classificação simulados 
    if (!trendGroups || trendGroups.length === 0) return;

    const nextRetestHistory = { ...retestHistoryRef.current };

    trendGroups.forEach(({ symbol, movements }) => {
      if (!movements || movements.length === 0) return;

      // ====================== ESTADO ISOLADO POR SÍMBOLO ======================
      if (!symbolStateRef.current[symbol]) {
        symbolStateRef.current[symbol] = {
          ultimoTopoAnterior: null,
          ultimoPivoAnterior: null,
          ultimoPivoAnteriorRally: null,
          ultimoPivoAnteriorRallySec: null,
          ultimoPivoSec: null,
          trendFound: null,
          enteringTheTrendUpdate: null,
          rallySecExitUpdate: null,

          lastTrendRetestId: null,
          lastTrendExitId: null,
          lastRallyRetestId: null,
          lastRallyRetestIdPrimary: null,
          lastSecondaryExitId: null,
          lastRallyExitId: null,
          lastBreakoutId: null,

          penultimoValor: [],
          rallyPivot: [],
          rallyPivotSec: [],
          trendPivotToRetest: [],

          currentTrend: "",
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

        // Função de normalização melhorada com arredondamento a 4 casas decimais (não 8)
        // para evitar problemas de precisão
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
        // Isso garante que a mesma operação no mesmo tempo não seja duplicada
        const operationId = [
          symbol,
          operationType?.value,
          operationSide?.name,
          normalizeOperationValue(operationSide?.value),
          normalizeOperationValue(operationStop?.value),
          operationTime?.value, // Incluir tempo para garantir unicidade
        ].join("|");

        const symbolHistory = nextRetestHistory[symbol] || [];
        
        // Verificação melhorada: checa se já existe uma operação praticamente idêntica
        const alreadyExists = symbolHistory.some(item => {
          // Comparar IDs exatos para evitar duplicatas perfeitas
          if (item.id === operationId) return true;
          
          // Comparação secundária: mesmo tipo, lado, e valores aproximados
          const existingOp = item.operation;
          const existingType = existingOp.find(i => i?.name === "type");
          const existingSide = existingOp.find(i => i?.name === "buy" || i?.name === "sell");
          const existingEntry = existingOp.find(i => i?.name === "buy" || i?.name === "sell");
          const existingStop = existingOp.find(i => i?.name === "stop");
          
          const isSameType = existingType?.value === operationType?.value;
          const isSameSide = existingSide?.name === operationSide?.name;
          const isSameEntry = normalizeOperationValue(existingEntry?.value) === normalizeOperationValue(operationSide?.value);
          const isSameStop = normalizeOperationValue(existingStop?.value) === normalizeOperationValue(operationStop?.value);
          
          return isSameType && isSameSide && isSameEntry && isSameStop;
        });

        if (!alreadyExists) {
          nextRetestHistory[symbol] = [
            ...symbolHistory,
            {
              id: operationId,
              operation,
            },
          ];
          // Debug: log de nova operação adicionada
          console.log(`✅ Operação adicionada [${symbol}]: ${operationType?.value} - ${operationSide?.name} @ ${normalizeOperationValue(operationSide?.value)}`);
        } else {
          // Debug: log de duplicata evitada
          console.log(`🚫 Duplicata evitada [${symbol}]: ${operationType?.value} - ${operationSide?.name} @ ${normalizeOperationValue(operationSide?.value)}`);
        }
      };

      // variaveis e constantes de controle
      let naturalReaction = null;
      let naturalReactionSec = null;
      let rallySecundaria = null;

      //1 identificar o ultimo topo de alta que deu origem a um movimento reação natural 
      const identifyHighTop = (movements) => {
        let ultimoTopoAlta = null;
        let ultimoFundoBaixa = null;
        let encontrouReacaoNatural = false;

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
        return { ultimoTopoAlta, ultimoFundoBaixa };
      };


      /**----------------------------------------------------------------------
       *                    Encontra o pivô rally Reteste
       ------------------------------------------------------------------------*/
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
        // percorre de trás para frente
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
        }
        return { naturalRally, ultimoPivoRally, ultimoPivoRallySec, rallySecundarioOrigem };
      }
      /**--------------------------------------------------------------------------------
      * ///////////////////////////////////////////////////////////////////////////////
       ----------------------------------------------------------------------------------*/


      /**---------------------------------------------------------------------------------
       *          Encontra o rompimento de pivô histórico de tendência
       -----------------------------------------------------------------------------------*/
      const identifyBreakoutTrend = (movements) => {
        let enteringTheTrend = [];

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
        }
        return { enteringTheTrend };
      };
      /**-----------------------------------------------------------------------------------
       * //////////////////////////////////////////////////////////////////////////////////
       -------------------------------------------------------------------------------------*/

      // Passas os objetos encontrados
      const { ultimoTopoAlta, ultimoFundoBaixa } = identifyHighTop(movements);
      let { naturalRally, ultimoPivoRally, ultimoPivoRallySec, rallySecundarioOrigem } = identifyRetestRally(movements);
      const { enteringTheTrend } = identifyBreakoutTrend(movements);


      /**---------------------------------------------------
       *  Verifica se o valor existe e passa para variável 
       -----------------------------------------------------*/
      let ultimoTopo = ultimoTopoAlta || ultimoFundoBaixa || null;
      let rally = naturalRally || null;
      let rallyPivo = ultimoPivoRally || null;
      let rallySec = ultimoPivoRallySec || null;
      let trend = enteringTheTrend || null;
      let rallySecExit = rallySecundarioOrigem || null;
      /**---------------------------------------------------
       * //////////////////////////////////////////////////
       -----------------------------------------------------*/

      /**----------------------------------------------------
       * Verificar se é um novo topo (diferente do anterior)
       ------------------------------------------------------*/
      if (ultimoTopo) {
        const isNovoTopo = !state.ultimoTopoAnterior ||
          ultimoTopo.closePrice !== state.ultimoTopoAnterior.closePrice ||
          ultimoTopo.index !== state.ultimoTopoAnterior.index;
        if (isNovoTopo) {
          // Atualiza array de penúltimos valores, acumulando
          state.penultimoValor.push(ultimoTopo);
          state.ultimoTopoAnterior = ultimoTopo;
        } else {
          console.log('Topo ignorando repetição');
        }
      } else {
        console.log('Nenhum topo de alta antecedendo reação natural foi encontrado');
      };
      /**----------------------------------------------------
       * ///////////////////////////////////////////////////
       ------------------------------------------------------*/

      /**------------------------------------------------------------------------
       * Verificar se é um novo pivo que deu origem rally(diferente do anterior)
       --------------------------------------------------------------------------*/
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
      /**------------------------------------------------------------------------
       * ///////////////////////////////////////////////////////////////////////
       --------------------------------------------------------------------------*/

      /**----------------------------------------------------------------------------
       * Verificar se é um novo pivo que deu origem reação sec(diferente do anterior)
       -------------------------------------------------------------------------------*/
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
      /**----------------------------------------------------------------------------
       * ///////////////////////////////////////////////////////////////////////////
       -------------------------------------------------------------------------------*/
      /**-----------------------------------------------------------------------
       *               Verificar se é novo pivô de tendência
       -------------------------------------------------------------------------*/
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
      /**-----------------------------------------------------------------------
       * /////////////////////////////////////////////////////////////////////
       -------------------------------------------------------------------------*/


      /**--------------------------------------------------------------------------
       *                            Pega os pivôs
       ----------------------------------------------------------------------------*/
      // reteste de pivo para saída
      const TrendPivot = state.penultimoValor[state.penultimoValor.length - 1];

      //2 fazer a lógica de reteste proximo ao pivo anterior ao atual pivô ...[anterior,atual]
      const pivo = state.penultimoValor[state.penultimoValor.length - 2];

      // reteste de pivo de rally
      const pivoRally = state.rallyPivot[state.rallyPivot.length - 2];

      const pivoRallyPrimary = state.rallyPivot[state.rallyPivot.length - 1];

      // reteste de pivo rally secundário
      const pivoRallySec = state.rallyPivotSec[state.rallyPivotSec.length - 1];

      // rompimento de tendência
      let pivotBreak = state.trendPivotToRetest[state.trendPivotToRetest.length - 1];
      /**---------------------------------------------------------------------------------
       * ////////////////////////////////////////////////////////////////////////////////
       ------------------------------------------------------------------------------------*/

 
      /**-------------------------------------------------------------------------------
       *           Verifica se o pivô é repetido e iguinora se for repetido
       ---------------------------------------------------------------------------------*/
      if (pivo) {
        const isNovoPivo = !state.ultimoPivoAnterior ||
          pivo.closePrice !== state.ultimoPivoAnterior.closePrice ||
          pivo.index !== state.ultimoPivoAnterior.index;
        if (isNovoPivo) {
          state.ultimoPivoAnterior = pivo; // atualiza trava
        } else {
          console.log("ultimoPivoAnterior-ignorando repetição");
        };
      };

      if (TrendPivot) {
        const isNovoPivo = !state.ultimoPivoAtual ||
          TrendPivot.closePrice !== state.ultimoPivoAtual.closePrice ||
          TrendPivot.index !== state.ultimoPivoAtual.index;
        if (isNovoPivo) {
          state.ultimoPivoAtual = TrendPivot;
        } else {
          console.log("TrendPivot-ignorando repetição");
        };
      };

      if (pivoRallySec) {
        const isNovoPivoSec = !state.ultimoPivoSec ||
          pivoRallySec.closePrice !== state.ultimoPivoSec.closePrice ||
          pivoRallySec.index !== state.ultimoPivoSec.index;
        if (isNovoPivoSec) {
          state.ultimoPivoSec = pivoRallySec;
        }
        else {
          console.log("ultimoPivoSec-ignorando repetição");
        };
      };

      if (pivotBreak) {
        const isNewTrend = !state.enteringTheTrendUpdate ||
          pivotBreak.closePrice !== state.enteringTheTrendUpdate.closePrice ||
          pivotBreak.index !== state.enteringTheTrendUpdate.index;
        if (isNewTrend) {
          state.enteringTheTrendUpdate =pivotBreak;
        } else {
          console.log("enteringTheTrendUpdate-ignorando repetição");
        };
      };

      if (rallySecExit) {
        const isNewRallysec = !state.rallySecExitUpdate ||
          rallySecExit.closePrice !== state.rallySecExitUpdate.closePrice ||
          rallySecExit.index !== state.rallySecExitUpdate.index;
        if (isNewRallysec) {
          state.rallySecExitUpdate = rallySecExit;
        } else {
          console.log("rallySecExit-ignorando repetição");
        };
      };
      /**----------------------------------------------------------------------------------
       * /////////////////////////////////////////////////////////////////////////////////
       ------------------------------------------------------------------------------------*/


      /**Função auxiliar para gerar id para unica execução */
      function buildEventId(pivo, reaction) {
        if (!pivo || !reaction) return null;
        return `${symbol}-${pivo.closeTime}-${reaction.closeTime}`;
      };

      // ===============================
      //  RETESTE DE TENDÊNCIA
      // ===============================
      if (pivo && naturalReaction && canExecuteReactionRef.current) {
        const limite = pivo.limite;
        const tolerance = limite / 3;
        const high = pivo.closePrice + tolerance;
        const low = pivo.closePrice - tolerance;
        const lowBuy = pivo.closePrice - (tolerance * 2);
        const highBuy = pivo.closePrice + (tolerance * 2);

        const buyPoint = pivo.closePrice + limite / 2;
        const sellPoint = pivo.closePrice - limite / 2;

        const eventId = buildEventId(pivo, naturalReaction);
        if (eventId && state.lastTrendRetestId !== eventId) {
          state.lastTrendRetestId = eventId;
          // 🟢 RETESTE DE COMPRA
          if (
            ultimoTopoAlta &&
            state.currentTrend === "Tendência Alta" &&
            naturalReaction.closePrice >= lowBuy &&
            naturalReaction.closePrice <= high
          ) {
            setRetestPoints([
              { name: "pivot", value: pivo.closePrice },
              { name: "time", value: naturalReaction.closeTime },
              { name: "buy", value: buyPoint },
              { name: "stop", value: sellPoint },
              { name: "type", value: "ENTRY_BUY_TREND" }
            ]);
          };

          // 🔴 RETESTE DE VENDA
          if (
            ultimoFundoBaixa &&
            state.currentTrend === "Tendência Baixa" &&
            naturalReaction.closePrice >= low &&
            naturalReaction.closePrice <= highBuy
          ) {
            setRetestPoints([
              { name: "pivot", value: pivo.closePrice },
              { name: "time", value: naturalReaction.closeTime },
              { name: "sell", value: sellPoint },
              { name: "stop", value: buyPoint },
              { name: "type", value: "ENTRY_SELL_TREND" }
            ]);
          };
        };
      };

      // ===============================
      // SAÍDA DE TENDÊNCIA
      // ===============================
      if (TrendPivot && naturalRally && canExecuteRallyRef.current) {
        const limite = TrendPivot.limite;
        const tolerance = limite / 3;
        const high = TrendPivot.closePrice + tolerance;
        const low = TrendPivot.closePrice - tolerance;
        const sellExit = TrendPivot.closePrice - limite / 2;
        const buyExit = TrendPivot.closePrice + limite / 2;

        const eventId = buildEventId(TrendPivot, naturalRally);
        if (eventId && state.lastTrendExitId !== eventId) {
          state.lastTrendExitId = eventId;
          // 🟢 SAÍDA DE COMPRA
          if (
            state.currentTrend === "Tendência Alta" &&
            naturalRally.closePrice >= low &&
            naturalRally.closePrice <= high
          ) {
            setRetestPoints([
              { name: "pivot", value: TrendPivot.closePrice },
              { name: "time", value: naturalRally.closeTime },
              { name: "stop", value: buyExit },
              { name: "type", value: "EXIT_BUY_TREND" }
            ]);
          };
          // 🔴 SAÍDA DE VENDA
          if (
            state.currentTrend === "Tendência Baixa" &&
            naturalRally.closePrice >= low &&
            naturalRally.closePrice <= high
          ) {
            setRetestPoints([
              { name: "pivot", value: TrendPivot.closePrice },
              { name: "time", value: naturalRally.closeTime },
              { name: "stop", value: sellExit },
              { name: "type", value: "EXIT_SELL_TREND" }
            ]);
          };
        };
      };

      // ======================================================================
      // RETEST NO PIVO DE RALLY EM UMA REAÇÃO NATURAL (pullback pós-breakout)
      // ======================================================================

      if (pivoRallyPrimary && naturalReaction && canExecuteReactionRef.current) {
        const limite = pivoRallyPrimary.limite;
        const tolerance = limite / 3;
        const high = pivoRallyPrimary.closePrice + tolerance;
        const low = pivoRallyPrimary.closePrice - tolerance;
        const buyPoint = pivoRallyPrimary.closePrice + limite / 2;
        const sellPoint = pivoRallyPrimary.closePrice - limite / 2;


        const eventId = buildEventId(pivoRallyPrimary, naturalReaction);
        if (eventId && state.lastRallyRetestId !== eventId) {
          state.lastRallyRetestId = eventId;
          // 🟢 Compra rally
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
              { name: "type", value: "ENTRY_BUY_RALLY" }
            ]);
          };
          // 🔴 Venda rally
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
              { name: "type", value: "ENTRY_SELL_RALLY" }
            ]);
          };
        };
      };

      // ======================================================================
      // RETEST NO PIVO DE RALLY EM UMA REAÇÃO SECUNDÁRIA (pullback pós-breakout)
      // ======================================================================
      if (pivoRallyPrimary && naturalReactionSec && canExecuteReactionSecRef.current) {
        const limite = pivoRallyPrimary.limite;
        const tolerance = limite / 3;
        const high = pivoRallyPrimary.closePrice + tolerance;
        const low = pivoRallyPrimary.closePrice - tolerance;
        const buyPoint = pivoRallyPrimary.closePrice + limite / 2;
        const sellPoint = pivoRallyPrimary.closePrice - limite / 2;

        const eventId = buildEventId(pivoRallyPrimary, naturalReactionSec);
        if (eventId && state.lastRallyRetestId !== eventId) {
          state.lastRallyRetestId = eventId;
          // 🟢 Compra rally
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
              { name: "type", value: "ENTRY_BUY_RALLY_SEC" }
            ]);
          };
          // 🔴 Venda rally
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
              { name: "type", value: "ENTRY_SELL_RALLY_SEC" }
            ]);
          };
        };
      };

      // ===============================
      // RETEST NO PIVO DE RALLY EM UMA 
      // REAÇÃO SECUNDÁRIA
      // ===============================

      if (pivoRally && naturalReactionSec && canExecuteReactionSecRef.current) {
        const limite = pivoRally.limite;
        const tolerance = limite / 3;
        const high = pivoRally.closePrice + tolerance;
        const low = pivoRally.closePrice - tolerance;
        const buyPoint = pivoRally.closePrice + limite / 2;
        const sellPoint = pivoRally.closePrice - limite / 2;

        const eventId = buildEventId(pivoRallyPrimary.closePrice, naturalReactionSec);
        if (eventId && state.lastRallyRetestIdPrimary !== eventId) {
          state.lastRallyRetestIdPrimary = eventId;
          // 🟢 Comprar de retest
          if (
            state.currentTrend === "Tendência Alta" &&
            naturalReactionSec.closePrice <= high &&
            naturalReactionSec.closePrice >= low
          ) {
            setRetestPoints([
              { name: "pivot", value: pivoRally.closePrice },
              { name: "time", value: naturalReactionSec.closeTime },
              { name: "buy", value: buyPoint },
              { name: "stop", value: sellPoint },
              { name: "type", value: "ENTRY_BUY_RALLY_SEC" }
            ]);
          };
          // 🔴 Venda de retest
          if (
            state.currentTrend === "Tendência Baixa" &&
            naturalReactionSec.closePrice >= low &&
            naturalReactionSec.closePrice <= high
          ) {
            setRetestPoints([
              { name: "pivot", value: pivoRally.closePrice },
              { name: "time", value: naturalReactionSec.closeTime },
              { name: "sell", value: sellPoint },
              { name: "stop", value: buyPoint },
              { name: "type", value: "ENTRY_SELL_RALLY_SEC" }
            ]);
          };
        };
      };

      // ===============================
      // SAÍDA REAÇÃO SECUNDÁRIA
      // ===============================
      if (pivoRallySec && rallySecundaria && canExecuteRallySecRef.current) {
        const limite = pivoRallySec.limite;
        const tolerance = limite / 3;
        const highExit = pivoRallySec.closePrice + tolerance;
        const lowExit = pivoRallySec.closePrice - tolerance;
        const sellExit = pivoRallySec.closePrice - limite / 2;
        const buyExit = pivoRallySec.closePrice + limite / 2;


        const eventId = buildEventId(pivoRallySec, rallySecundaria);
        if (eventId && state.lastSecondaryExitId !== eventId) {
          state.lastSecondaryExitId = eventId;

          // 🟢
          if (
            rallySecundaria &&
            state.currentTrend === "Tendência Alta" &&
            rallySecundaria.closePrice <= highExit &&
            rallySecundaria.closePrice >= lowExit) {
            setRetestPoints([
              { name: "pivot", value: pivoRallySec.closePrice },
              { name: "time", value: rallySecundaria.closeTime },
              { name: "stop", value: sellExit },
              { name: "type", value: "EXIT_BUY_SEC" }
            ]);
          };
          // 🔴
          if (rallySecundaria &&
            state.currentTrend === "Tendência Baixa" &&
            rallySecundaria.closePrice >= lowExit &&
            rallySecundaria.closePrice <= highExit) {
            setRetestPoints([
              { name: "pivot", value: pivoRallySec.closePrice },
              { name: "time", value: rallySecundaria.closeTime },
              { name: "stop", value: buyExit },
              { name: "type", value: "EXIT_SELL_SEC" }
            ]);
          };
        };
      };

      if (rallySecExit && rallySecundaria && canExecuteRallySecRef.current) {
        const limite = rallySecExit.limite;
        const tolerance = limite / 3;
        const highExit = rallySecExit.closePrice + tolerance;
        const lowExit = rallySecExit.closePrice - tolerance;
        const sellExit = rallySecExit.closePrice - limite / 2;
        const buyExit = rallySecExit.closePrice + limite / 2;


        const eventId = buildEventId(rallySecExit, rallySecundaria);
        if (eventId && state.lastRallyExitId !== eventId) {
          state.lastRallyExitId = eventId;
          // 🟢 Saída de compra de retest
          if (
            rallySecundaria &&
            state.currentTrend === "Tendência Alta" &&
            rallySecundaria.closePrice <= highExit &&
            rallySecundaria.closePrice >= lowExit) {
            setRetestPoints([
              { name: "pivot", value: rallySecExit.closePrice },
              { name: "time", value: rallySecundaria.closeTime },
              { name: "stop", value: sellExit },
              { name: "type", value: "EXIT_BUY_SEC" }
            ]);
          };
          // 🔴 Saída de venda de retest
          if (rallySecundaria &&
            state.currentTrend === "Tendência Baixa" &&
            rallySecundaria.closePrice >= lowExit &&
            rallySecundaria.closePrice <= highExit) {
            setRetestPoints([
              { name: "pivot", value: rallySecExit.closePrice },
              { name: "time", value: rallySecundaria.closeTime },
              { name: "stop", value: buyExit },
              { name: "type", value: "EXIT_SELL_SEC" }
            ]);
          };
        };
      };

      // ===============================
      //          ROMPIMENTO 
      // ===============================
      if (pivotBreak) {
        const limite = pivotBreak.limite;
        const pivotId = pivotBreak.closeTime;
        const type = pivotBreak.tipo;
        const sellExit = pivotBreak.closePrice - limite / 2;
        const buyExit = pivotBreak.closePrice + limite / 2;

        const pivoBuy = pivotBreak.closePrice - (limite / 2);
        const pivoSell = pivotBreak.closePrice + (limite / 2);

        if (state.lastBreakoutId !== pivotId) {
          state.lastBreakoutId = pivotId;
          // 🟢 Rompimento de pivo compra
          if (
            state.currentTrend === "Tendência Alta" &&
            type === "Tendência Alta (compra)") {
            setRetestPoints([
              { name: "pivot", value: pivoBuy },
              { name: "time", value: pivotBreak.closeTime },
              { name: "buy", value: pivotBreak.closePrice },
              { name: "stop", value: sellExit },
              { name: "type", value: "pivotBreak-buy" }
            ]);
          };
          // 🔴 Rompimento de pivo venda
          if (
            state.currentTrend === "Tendência Baixa" &&
            type === "Tendência Baixa (venda)") {
            setRetestPoints([
              { name: "pivot", value: pivoSell },
              { name: "time", value: pivotBreak.closeTime },
              { name: "sell", value: pivotBreak.closePrice },
              { name: "stop", value: buyExit },
              { name: "type", value: "pivotBreak-sell" }
            ]);
          };
        };
      };
    });
    retestHistoryRef.current = nextRetestHistory;
    
    // Log detalhado de operações para debug
    const operationsArray = Object.entries(nextRetestHistory).map(([symbol, history]) => ({
      symbol,
      operations: history.map(item => item.operation),
    }));
    
    setRetestPointsStatePrimary(operationsArray);
  },
    [trendGroups]);
  console.log("📊 Operações por símbolo primary:",retestPointsStatePrimary);
  return { retestPointsStatePrimary  };
}
