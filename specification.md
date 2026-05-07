📌 Visão Geral
Este componente é responsável pela visualização de dados de cotação em tempo real para suporte a algoritmos de trading. A visualização utiliza a biblioteca lightweight-charts, adaptada para exibir um comportamento similar ao Gráfico de Renko, onde o movimento do preço define a formação dos blocos (bricks), ignorando variações temporais irrelevantes.

#🛠 Stack Tecnológica
Framework: React (Vite)
Biblioteca de Gráficos: lightweight-charts (TradingView)
Estilização: CSS Modules com foco em Glassmorphism e Dark Mode.

#🧮 Lógica de Negócio (Simulação Renko)
Como a lightweight-charts é baseada em tempo, a lógica para gerar os "tijolos" deve seguir estes critérios:

Input de Dados na variavel de estado trend: O componente consome o objeto:
{
  closePrice: 71593.19,
  closeTime: "2026-04-12 00:00:00",
  limite: 2018,
  tipo: "Reação Natural (fundo)"
}

#Cálculo do Bloco:
O open do bloco atual é sempre o close do bloco anterior.
Alta: Se closePrice atual > anterior. Cor: #8A2BE2.
Baixa: Se closePrice atual < anterior. Cor: #2D004B.
Filtragem: O gráfico deve atualizar apenas quando houver mudança no closePrice que justifique um novo movimento ou conforme a atualização do algoritmo.

#📂 Estrutura de Arquivos
GraphicsRenko.jsx
Deve conter a referência ao container (chartContainerRef).
Configuração do createChart com layout, grid e crosshair customizados para o tema escuro.
Uso de candlestickSeries para desenhar os blocos.
GraphicsRenko.css
Definição das variáveis de ambiente (--primary-purple, --glass-bg).
Keyframes para a animação fadeInUp.
Estilização da tooltip customizada.

#⚠️ Observações de Implementação
Certifique-se de realizar o chart.remove() dentro do retorno do useEffect para evitar vazamento de memória.
A escala de preços deve ser ajustada automaticamente (priceScale: { autoScale: true }).
Para manter a fluidez, utilize requestAnimationFrame se as atualizações de cotação forem em alta frequência.

🏗️ Regras de Código
Criar pastas individuais: src/components/Home/, src/components/GraphicsRenko/, etc.
O arquivo App.jsx deve conter o gerenciamento de rotas.

🎨 Design System
Tema: Dark Mode profundo.
Cores: Degradê de roxo (#2D004B para #8A2BE2).
Efeitos: Glassmorphism (blur de fundo e bordas translúcidas) em containers e cards.
Animações: Fade-in up e Stagger effects ao scrollar.
