# Ajustes na Lógica Operacional

## 1. Stop Loss não está funcionando

Atualmente, o stop não está sendo executado corretamente. Em diversas situações, o preço atinge ou ultrapassa o nível de stop definido, mas nenhuma ação de saída é disparada e a operação permanece aberta.

É necessário revisar toda a lógica de monitoramento e execução do stop para garantir que:

- O preço seja validado continuamente contra o stop ativo.
- A saída seja executada imediatamente quando a condição de stop for atendida.
- O estado da operação seja atualizado corretamente após a execução do stop.
- Não existam conflitos entre a lógica de stop, take profit e demais condições de saída.

---

## 2. Entradas por Rally não estão persistentes

A lógica de entradas baseada na variável `trend` não está sendo executada de forma contínua.

Atualmente, algumas entradas são executadas, porém, mesmo com a continuidade do movimento, novas entradas deixam de ser geradas.

### Comportamento esperado

As entradas devem ser executadas continuamente enquanto a classificação atual do movimento permanecer em uma das seguintes condições:

- `Rally`
- `Tendência Alta`
- `Tendência Baixa`

Respeitando sempre a direção da operação:

- Em `Rally` ou `Tendência Alta`, executar entradas de compra.
- Em `Rally` ou `Tendência Baixa`, executar entradas de venda.

A lógica não deve interromper a geração de entradas enquanto a classificação da `trend` continuar válida para a direção da operação.

O fluxo esperado é:

1. Surge uma nova tendência.
2. O primeiro Rally válido é identificado.
3. A primeira entrada é executada.
4. Enquanto a classificação permanecer em Rally ou Tendência na mesma direção, novas entradas poderão ser executadas.
5. As entradas só devem parar quando ocorrer uma condição válida de encerramento da operação ou mudança estrutural da tendência.

---

## 3. Utilizar o stop do Pivot na primeira entrada

Na variável `trend`, existe o objeto:

```js
trend.movements.pivot.trade
```

Dentro dele existe a propriedade:

```js
trend.movements.pivot.trade.stop
```

Esse valor deve ser utilizado exclusivamente como stop inicial da primeira entrada da operação.

### Regras

- Toda operação deve iniciar no primeiro Rally válido da tendência.
- Na primeira entrada, o stop inicial deve vir de:

```js
trend.movements.pivot.trade.stop
```

- Após a abertura da operação, o gerenciamento de stop continua utilizando a lógica atual do sistema.
- Conforme novos níveis de stop forem gerados, o stop poderá ser atualizado normalmente.
- O valor de `pivot.trade.stop` serve apenas como referência inicial e não deve sobrescrever os stops posteriores.

---

## 4. Toda operação deve começar no primeiro Rally

Uma nova operação somente pode ser iniciada a partir do primeiro Rally identificado após o surgimento de uma nova tendência.

### Fluxo esperado

1. Surge uma nova Tendência Alta ou Tendência Baixa.
2. O sistema aguarda o primeiro Rally válido.
3. A primeira entrada é executada.
4. O stop inicial é definido através de:

```js
trend.movements.pivot.trade.stop
```

5. Entradas adicionais podem ocorrer enquanto a classificação continuar compatível com a direção da operação.
6. A operação permanece aberta até que uma condição de saída válida seja atingida.
7. Após o encerramento, o ciclo só poderá reiniciar em uma nova tendência seguida de seu primeiro Rally.

O objetivo é evitar entradas tardias em Rallys intermediários quando não existir uma operação ativa.

---

## 5. Remoção manual de Stop e Take Profit no gráfico

Adicionar a possibilidade de remover visualmente os níveis de Stop Loss e Take Profit diretamente no gráfico.

### Requisitos

- Exibir um botão de fechar (`X`) junto aos elementos gráficos de Stop e Take Profit.
- Permitir remover individualmente o Stop ou o Take Profit.
- Atualizar imediatamente o estado da operação após a remoção.
- Remover também a linha visual correspondente do gráfico.
- Garantir que a lógica interna pare de considerar o nível removido.
- O botão deve ficar visível ao selecionar ou passar o mouse sobre o nível correspondente.

### Comportamento esperado

- Clicar no `X` do Stop remove apenas o Stop.
- Clicar no `X` do Take Profit remove apenas o Take Profit.
- A remoção deve refletir tanto na interface quanto na lógica de monitoramento da operação.
- O usuário deve poder adicionar novos níveis posteriormente através das ferramentas de gerenciamento da operação.
```**```**