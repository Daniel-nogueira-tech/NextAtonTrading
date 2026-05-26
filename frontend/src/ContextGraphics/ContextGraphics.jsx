import React from 'react'
import axios from 'axios'
import { useIncrementalMarketEngine } from '../hooks/useIncrementalMarketEngine.js'

export const ContextGraphics = React.createContext(null);


export const ContextGraphicsProvider = ({ children }) => {
    const urlBackend = import.meta.env.VITE_BACKEND_URL;
    const [tabs, setTabs] = React.useState([]);
    const [activeSymbol, setActiveSymbol] = React.useState(() => { return localStorage.getItem('symbol') || 'BTCUSDT' });
    const [mode, setMode] = React.useState(() => { return localStorage.getItem('mode') || 'real' });
    const [download, setDownload] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [movementTables, setMovementTables] = React.useState(false);

    const incrementalEngine = useIncrementalMarketEngine(mode === 'simulation' ? { initialSpeed: 500 } : { initialSpeed: 10 });
    const {
        snapshot,
        status: engineStatus,
        cursor: engineCursor,
        maxCursor: engineMaxCursor,
        speed: engineSpeed,
        loadSources,
        play,
        pause,
        continue: continueEngine,
        reset,
        setSpeed,
        isRunning,
    } = incrementalEngine;

    const fullPrice = snapshot.fullPrice;
    const trendPrimary = snapshot.trendPrimary;
    const trend = snapshot.trend;
    const vppr = snapshot.vppr;
    const rsi = snapshot.rsi;

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
        if (!symbol) {
            console.error('Symbol is required to update symbol status.')
            return
        }
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
            await marketData()
        } catch (error) {
            console.error('Error fetching Simulation:', error)
        }
    };


    // Pega os dados de preço e indicadores
    const marketData = async () => {
        const requestFeed = async (name, url) => {
            try {
                const response = await axios.get(url)
                return response.data
            } catch (error) {
                console.error(`Erro ao carregar ${name}`, error)
                return null
            }
        }

        try {
            let nextSources = null

            if (mode === 'real') {
                const [
                    fullPriceData,
                    trendPrimaryData,
                    trendData,
                    vpprData,
                    rsiData,
                ] = await Promise.all([
                    requestFeed('price_data', `${urlBackend}/api/price_data?mode=${mode}`),
                    requestFeed('trend-primary', `${urlBackend}/api/trend-primary?mode=${mode}`),
                    requestFeed('trend', `${urlBackend}/api/trend?mode=${mode}`),
                    requestFeed('vppr', `${urlBackend}/api/vppr?mode=${mode}`),
                    requestFeed('rsi', `${urlBackend}/api/rsi?mode=${mode}`),
                ]);

                nextSources = {
                    fullPrice: fullPriceData,
                    trendPrimary: trendPrimaryData,
                    trend: trendData,
                    vppr: vpprData,
                    rsi: rsiData,
                }
            } else {
                const [
                    fullPriceData,
                    trendPrimaryData,
                    trendData,
                    vpprData,
                    rsiData,
                ] = await Promise.all([
                    requestFeed('price_data', `${urlBackend}/api/price_data?mode=${mode}&symbol=${activeSymbol}`),
                    requestFeed('trend-primary', `${urlBackend}/api/trend-primary?mode=${mode}&symbol=${activeSymbol}`),
                    requestFeed('trend', `${urlBackend}/api/trend?mode=${mode}&symbol=${activeSymbol}`),
                    requestFeed('vppr', `${urlBackend}/api/vppr?mode=${mode}&symbol=${activeSymbol}`),
                    requestFeed('rsi', `${urlBackend}/api/rsi?mode=${mode}&symbol=${activeSymbol}`),
                ]);

                nextSources = {
                    fullPrice: fullPriceData,
                    trendPrimary: trendPrimaryData,
                    trend: trendData,
                    vppr: vpprData,
                    rsi: rsiData,
                }
            }

            if (!nextSources?.fullPrice) {
                throw new Error('price_data não carregou; o motor incremental precisa do fullPrice como relógio principal.')
            }

            loadSources(nextSources, { autoStart: mode === 'real' });
        } catch (error) {
            console.error("Erro ao carregar dados", error)
        }
    };


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
        trendPrimary,
        fullPrice,
        vppr,
        rsi,
        incrementalEngine: {
            status: engineStatus,
            cursor: engineCursor,
            maxCursor: engineMaxCursor,
            speed: engineSpeed,
            isRunning,
            play,
            pause,
            continue: continueEngine,
            reset,
            setSpeed,
        },
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
