import axios from 'axios';

const symbolInfoCache = new Map();

// ==============================|Função para calcular tamanho do lote e risco da operação|============================== //
export const getSymbolInfo = async (lastSignal) => {
    const symbol = String(lastSignal?.symbol || '').trim().toUpperCase();
    if (!symbol) return null;

    const cachedInfo = symbolInfoCache.get(symbol);
    if (cachedInfo) return cachedInfo;

    //  Passando o parâmetro diretamente na URL (mais simples)
    const url = `https://api.binance.com/api/v3/exchangeInfo?symbol=${symbol}`;

    const infoPromise = axios.get(url)
        .then(response => {
            const symbolInfo = response.data?.symbols?.find(item => item.symbol === symbol);
            if (!symbolInfo) throw new Error(`Simbol ${symbol} not found`);

            return {
                symbol,
                minQty: parseFloat(symbolInfo.filters.find(filter => filter.filterType === 'LOT_SIZE')?.minQty || 0),
                maxQty: parseFloat(symbolInfo.filters.find(filter => filter.filterType === 'LOT_SIZE')?.maxQty || 0),
                stepSize: parseFloat(symbolInfo.filters.find(filter => filter.filterType === 'LOT_SIZE')?.stepSize || 0),
                tickSize: parseFloat(symbolInfo.filters.find(filter => filter.filterType === 'PRICE_FILTER')?.tickSize || 0),
                minNotional: parseFloat(symbolInfo.filters.find(filter => filter.filterType === 'MIN_NOTIONAL')?.minNotional || 0)
            };
        })
        .catch(error => {
            symbolInfoCache.delete(symbol);
            console.error('Erro ao buscar dados da Binance:', error.message);
            return null;
        });

    symbolInfoCache.set(symbol, infoPromise);
    return infoPromise;
}
