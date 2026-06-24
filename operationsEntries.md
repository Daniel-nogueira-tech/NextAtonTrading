### 1. Normalização
Os dados dos indicadores recebidos pelo contexto devem ser tratados pela função `normalizeCollection`, garantindo que cada conjunto seja padronizado antes de ser usado na lógica de operações.

### 2. Identificação de Reteste Primário
Primeiro, é essencial identificar os pontos de **reteste primário**.  
A variável de estado `retestPointsStatePrimary` deve ser verificada para os seguintes tipos:
- **Tendência de alta:** `ENTRY_BUY_TREND`, `ENTRY_BUY_RALLY`, `ENTRY_BUY_RALLY_SEC`
- **Tendência de baixa:** `ENTRY_SELL_TREND`, `ENTRY_SELL_RALLY`, `ENTRY_SELL_RALLY_SEC`

### 3. Identificação de Reteste Secundário
Em seguida, verificar os pontos de **reteste secundário** na variável de estado `retestPointsState`.  
Os tipos válidos são os mesmos:
- **Tendência de alta:** `ENTRY_BUY_TREND`, `ENTRY_BUY_RALLY`, `ENTRY_BUY_RALLY_SEC`
- **Tendência de baixa:** `ENTRY_SELL_TREND`, `ENTRY_SELL_RALLY`, `ENTRY_SELL_RALLY_SEC`

### 4. Indicador VPPR
Após confirmar o reteste, validar o indicador **VPPR**:
- Se o `retestPointsState` indicar tendência de alta, o VPPR deve retornar `Trend Buy` para autorizar a compra.
- Se indicar tendência de baixa, o VPPR deve retornar `Trend Sell` para autorizar a venda.

### 5. Ponto de Entrada
O ponto de entrada só é confirmado quando há alinhamento entre reteste e VPPR.  
As condições são:
- Para compra: o preço em `fullPrice` deve ser **maior** que o valor `buy` de `retestPointsState`.
- Para venda: o preço em `fullPrice` deve ser **menor** que o valor `sell` de `retestPointsState`.

### 6. Ponto de Saída
A saída da operação ocorre quando:
- Em uma **tendência de alta**, `retestPointsState` retorna o tipo `pivotBreak-sell`.
- Em uma **tendência de baixa**, `retestPointsState` retorna o tipo `pivotBreak-buy`.

### 7. Cálculo de Lucro e Prejuízo
O cálculo de resultado da operação é feito comparando o preço de entrada (item 5) com o preço de saída (item 6):
- **Lucro:**  
  - Em operações de compra, ocorre quando o preço de saída é **maior** que o preço de entrada.  
  - Em operações de venda, ocorre quando o preço de saída é **menor** que o preço de entrada.  
- **Prejuízo:**  
  - Em operações de compra, ocorre quando o preço de saída é **menor** que o preço de entrada.  
  - Em operações de venda, ocorre quando o preço de saída é **maior** que o preço de entrada.  

A diferença entre preço de saída e preço de entrada determina o valor absoluto do lucro ou prejuízo.
