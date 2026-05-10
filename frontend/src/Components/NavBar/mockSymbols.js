// mockSymbols.js
export const mockSymbols = [
  { id: 1, symbol: 'BTCUSDT', name: 'Bitcoin', price: 43250.00, change: 2.5 },
  { id: 2, symbol: 'ETHUSDT', name: 'Ethereum', price: 2250.00, change: -1.2 },
  { id: 3, symbol: 'SOLUSDT', name: 'Solana', price: 98.50, change: 5.8 },
  { id: 4, symbol: 'XRPUSDT', name: 'Ripple', price: 0.62, change: 0.3 },
  { id: 5, symbol: 'ADAUSDT', name: 'Cardano', price: 0.48, change: -2.1 },
  { id: 6, symbol: 'DOGEUSDT', name: 'Dogecoin', price: 0.082, change: 1.5 },
  { id: 7, symbol: 'DOTUSDT', name: 'Polkadot', price: 7.20, change: -0.8 },
  { id: 8, symbol: 'LINKUSDT', name: 'Chainlink', price: 14.50, change: 3.2 },
  { id: 9, symbol: 'MATICUSDT', name: 'Polygon', price: 0.85, change: -1.5 },
  { id: 10, symbol: 'LTCUSDT', name: 'Litecoin', price: 68.30, change: 0.7 }
]

// Função para buscar símbolos por termo de pesquisa
export const searchSymbols = (searchTerm) => {
  if (!searchTerm) return mockSymbols
  const term = searchTerm.toLowerCase()
  return mockSymbols.filter(s => 
    s.symbol.toLowerCase().includes(term) || 
    s.name.toLowerCase().includes(term)
  )
}

// Função para adicionar novo símbolo
export const addMockSymbol = (symbol, name) => {
  const newId = mockSymbols.length + 1
  const newSymbol = {
    id: newId,
    symbol: symbol.toUpperCase(),
    name: name,
    price: 0,
    change: 0
  }
  mockSymbols.push(newSymbol)
  return newSymbol
}