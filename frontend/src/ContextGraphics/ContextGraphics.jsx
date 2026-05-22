import React from 'react'
import axios from 'axios'

export const ContextGraphics = React.createContext(null);


export const ContextGraphicsProvider = ({ children }) => {
    const urlBackend = import.meta.env.VITE_BACKEND_URL;
    const [tabs, setTabs] = React.useState([]);
    const [activeSymbol, setActiveSymbol] = React.useState(() => { return localStorage.getItem('symbol') || 'BTCUSDT' });
    const [mode, setMode] = React.useState(() => { return localStorage.getItem('mode') || 'real' });
    const [download, setDownload] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [movementTables, setMovementTables] = React.useState(false);

    const [fullPrice, setFullPrice] = React.useState(null);
    const [trendPrimary, setTrendPrimary] = React.useState(null);
    const [trend, setTrend] = React.useState(null);
    const [vppr, setVppr] = React.useState(null);
    const [rsi, setRsi] = React.useState(null);

    // Salva dados no localStorage
    React.useEffect(() => {
        if (activeSymbol) {
            localStorage.setItem('symbol', activeSymbol);
        };
        if (mode) {
            localStorage.setItem('mode', mode)
        };
    }, [activeSymbol, mode]);


    // Função para enviar os símbolos para o backend
    const addSymbols = async (data) => {
        if (!data.symbol) {
            console.error('Symbol is required to add a new symbol.')
            return
        }
        try {
            const symbol = data.symbol
            const name = data.name
            const active = data.active

            const response = await axios.post(`${urlBackend}/api/add-symbol`, {
                symbol,
                name,
                active
            })
            marketData()
            console.log('Symbol added successfully:', response.data)
        } catch (error) {
            console.error('Error adding symbol:', error)
        }
    };

    // Função para buscar os símbolos do backend
    const getSymbols = async () => {
        try {
            const response = await axios.get(`${urlBackend}/api/get-symbols`)
            const symbols = response.data.data

            // Pega todos os símbolos para tabs
            setTabs(symbols)

            // pegar apenas os símbolos ativos para a barra de navegação
            const activeSymbols = symbols.filter(s => s.active).map(s => s.symbol)
            setActiveSymbol(...activeSymbols);
            console.log('Symbols fetched successfully:', response.data)
        } catch (error) {
            console.error('Error fetching symbols:', error)
        }
    };

    // Função para atualizar o status de um símbolo no backend
    const updateSymbolStatus = async (symbol) => {
        try {
            setActiveSymbol(symbol)
            const response = await axios.post(`${urlBackend}/api/activate-symbol`, { symbol: symbol })
            getSymbols() // Atualiza a lista de símbolos após a atualização do status
            console.log('Symbol status updated successfully:', response.data)
        } catch (error) {
            console.error('Error updating symbol status:', error)
        }
    };

    // Função para remover um símbolo do backend
    const removeSymbol = async (id) => {
        try {
            const response = await axios.post(`${urlBackend}/api/remove-symbol`, { id: id })
            getSymbols() // Atualiza a lista de símbolos após a remoção
        } catch (error) {
            console.error('Error removing symbol:', error)
        }
    };

    // Envia as datas para baixar dados para simular
    const dateToSimulation = async (dates) => {
        if (mode !== 'simulation' || !dates) {
            return
        };
        const dateStart = dates.dateStart;
        const dateEnd = dates.dateEnd;
        try {
            const response = await axios.post(`${urlBackend}/api/simulation`, {
                "symbol": activeSymbol,
                "dateStart": dateStart,
                "dateEnd": dateEnd
            })
            console.log(response.data.mensagem);
            setDownload(false);
            setLoading(true)
        } catch (error) {
            console.error('Error fetching Simulation:', error)
        }
    };


    // Pega os dados de preço e indicadores
    const marketData = async () => {

        try {
            if (mode === 'real') {
                // Preço completo
                const responsePrice = await axios.get(`${urlBackend}/api/price_data?mode=${mode}`)
                setFullPrice(responsePrice.data)
                // Classificação Primária
                const responseTrendPri = await axios.get(`${urlBackend}/api/trend-primary?mode=${mode}`)
                setTrendPrimary(responseTrendPri.data)
                // Classificação Secundária
                const responseTrend = await axios.get(`${urlBackend}/api/trend?mode=${mode}`)
                setTrend(responseTrend.data)
                // Indicador Vppr
                const responseVppr = await axios.get(`${urlBackend}/api/vppr?mode=${mode}`)
                setVppr(responseVppr.data)
                // Indicador Rsi
                const responseRsi = await axios.get(`${urlBackend}/api/rsi?mode=${mode}`)
                setRsi(responseRsi.data)
            } else {
                // Preço completo para simular
                const responsePrice = await axios.get(`${urlBackend}/api/price_data?mode=${mode}&symbol=${activeSymbol}`)
                setFullPrice(responsePrice.data)
                // Classificação Primária para simular
                const responseTrendPri = await axios.get(`${urlBackend}/api/trend-primary?mode=${mode}&symbol=${activeSymbol}`)
                setTrendPrimary(responseTrendPri.data)
                // Classificação Secundária para simular
                const responseTrend = await axios.get(`${urlBackend}/api/trend?mode=${mode}&symbol=${activeSymbol}`)
                setTrend(responseTrend.data)
                // Indicador Vppr para simular
                const responseVppr = await axios.get(`${urlBackend}/api/vppr?mode=${mode}&symbol=${activeSymbol}`)
                setVppr(responseVppr.data)
                // Indicador Rsi para simular
                const responseRsi = await axios.get(`${urlBackend}/api/rsi?mode=${mode}&symbol=${activeSymbol}`)
                setRsi(responseRsi.data)
            }
        } catch (error) {
            console("Erro ao carregar dados", error)
        }
    };

    // Motor incremental
    let i = 0;
    const interval = setInterval(()=>{
        if (i >= trend.length) return clearInterval(interval);

        marketDataIncremental(trend[i]);
        i++;
    },100);



    // Carrega os dados quando o componente é montado
    React.useEffect(() => {
        async function loadData() {
            try {
                await Promise.all([
                    getSymbols(),
                    marketData()
                ])
            } catch (error) {
                console.error('Error loading data:', error)
            }
        }
        loadData()
    }, []);


    //Define o valor do contexto a ser fornecido aos componentes filhos
    const contextValue = {
        setMode,
        mode,
        tabs,
        setTabs,
        // Seleção de símbolos
        activeSymbol,
        setActiveSymbol,
        addSymbols,
        removeSymbol,
        updateSymbolStatus,
        // Indicadores 
        trend,
        setTrend,
        vppr,
        rsi,
        // Simulação
        dateToSimulation,
        // Carregamento
        download,
        setDownload,
        loading,
        marketData,
        // tables de movimento
        movementTables,
        setMovementTables
    }

    return (
        <>
            <ContextGraphics.Provider value={contextValue}>
                {children}
            </ContextGraphics.Provider>
        </>
    )
}
