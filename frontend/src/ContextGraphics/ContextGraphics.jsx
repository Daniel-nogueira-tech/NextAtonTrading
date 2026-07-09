import React from 'react';
import axios from 'axios';
import { useIncrementalMarketEngine } from '../hooks/useIncrementalMarketEngine.js';
import { useNavigate, useLocation } from 'react-router-dom';

export const ContextGraphics = React.createContext(null);

// Helper para calcular o delay até o próximo limite de 5 minutos
const getNextFiveMinuteBoundaryDelay = () => {
    const now = new Date();
    const nextBoundary = new Date(now);

    nextBoundary.setSeconds(0, 0);
    nextBoundary.setMinutes(Math.floor(now.getMinutes() / 5) * 5 + 5);

    return Math.max(1000, nextBoundary.getTime() - now.getTime());
}


export const ContextGraphicsProvider = ({ children }) => {
    const urlBackend = import.meta.env.VITE_BACKEND_URL;
    const urlBackendSite = import.meta.env.VITE_BACKEND_URL_SITE;
    const navigate = useNavigate();
    const pathname = useLocation().pathname;

    const [tabs, setTabs] = React.useState([]);
    const [activeSymbol, setActiveSymbol] = React.useState(() => { return localStorage.getItem('symbol') || 'BTCUSDT' });
    const [mode, setMode] = React.useState(() => { return localStorage.getItem('mode') || 'real' });
    const [download, setDownload] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [movementTables, setMovementTables] = React.useState(false);
    const [fullSources, setFullSources] = React.useState(null);

    // Indicadores para operações
    const [vpprData, setVpprData] = React.useState([]);
    const [retestPointsStatePrimary, setRetestPointsStatePrimary] = React.useState([]);
    const [retestPointsState, setRetestPointsState] = React.useState([]);
    const [amrsiData, setAmrsiData] = React.useState([]);

    // Dados do usuário
    const [userData, setUserData] = React.useState(null);
    const [isAuthenticated, setIsAuthenticated] = React.useState(false);

    // PopUpConfirm
    const [showPopUp, setShowPopUp] = React.useState(false)
    const [actionType, setActionType] = React.useState('')


    const incrementalEngine = useIncrementalMarketEngine({
        initialSpeed: mode === 'simulation' ? 500 : 50,
        maxSnapshotPoints: 1200,
    });
    const {
        snapshot,
        status: engineStatus,
        cursor: engineCursor,
        maxCursor: engineMaxCursor,
        speed: engineSpeed,
        loadSources,
        updateSources,
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
            setDownload(false);
            setLoading(true)
            await marketData()
        } catch (error) {
            console.error('Error fetching Simulation:', error)
        }
    };


    // Pega os dados de preço e indicadores
    const marketData = async ({ preserveEngine = false } = {}) => {
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

            setFullSources(nextSources);

            if (preserveEngine) {
                updateSources(nextSources, {
                    autoContinue: mode === 'real',
                    followLatest: mode === 'real',
                });
            } else {
                loadSources(nextSources, { autoStart: mode === 'real' });
            }
        } catch (error) {
            console.error("Erro ao carregar dados", error)
        }
    };


    // Função para atualizar os dados a cada 5 minutos no modo real
    const refreshMarketData = async ({ preserveEngine = false } = {}) => {
        if (mode !== 'real') return

        try {
            await Promise.all([
                getSymbols(),
                marketData({ preserveEngine })
            ])
        } catch (error) {
            console.error('Error refreshing data:', error)
        }
    }


    //=================================//Usuário//=================================//
    // envia credenciais de login
    const loginUser = async (email, password) => {
        if (!email || !password) return;

        const payload = {
            email: email,
            password: password
        }

        try {
            const response = await axios.post(`${urlBackendSite}/api/auth/login`, payload, {
                withCredentials: true,
            });
            if (response.data.success) {
                setTimeout(() => {
                    navigate('/');
                }, 1000);
                setIsAuthenticated(true);
            }
        } catch (error) {
            console.error('Error logging in:', error)
        }
    };

    // Função para buscar os dados do usuário
    const UserData = async () => {
        try {
            const response = await axios.get(`${urlBackendSite}/api/user/data`, {
                withCredentials: true,
            });
            setUserData(response.data);
        } catch (error) {
            console.error('Error fetching user data:', error);
            throw error;
        }
    };


    // Função para verificar a autenticação do usuário
    const privateRoutes = ["/OperatingPanel", "/", "/Login"];
    const checkAuthentication = async () => {
        if (!privateRoutes.includes(pathname)) {
            return;
        };
        try {
            const { data } = await axios.get(`${urlBackendSite}/api/auth/is-auth`, {
                withCredentials: true,
            });

            if (!data.success) {
                setIsAuthenticated(false);
                navigate("/Login");
            } else {
                setIsAuthenticated(true);
                UserData();
            }

            console.log("Authentication check:", data.success);
        } catch (error) {
            console.error("Error checking authentication:", error);
            setIsAuthenticated(false);
            navigate("/Login");
        }
    };

    // Função para abrir o PopUpConfirm de logout
    const openLogoutConfirm = () => {
        setActionType('logout')
        setShowPopUp(true)
    }
    // Função para deslogar o usuário
    const logoutUser = async () => {
        try {
            const { data } = await axios.post(`${urlBackendSite}/api/auth/logout`, {}, {
                withCredentials: true,
            });

            if (data.success) {
                setIsAuthenticated(false);
                setUserData(false);
                navigate('/Login');
            }
        } catch (error) {
            console.error('Error logging out:', error);
        }
    }


    // Carrega os dados quando o componente é montado
    React.useEffect(() => {
        async function loadData() {
            try {
                await Promise.all([
                    getSymbols(),
                    marketData(), 
                ])
            } catch (error) {
                console.error('Error loading data:', error)
            }
        }
        loadData()
    }, []);

// checkAuthentication é chamado quando o componente é montado e quando a rota muda
    React.useEffect(() => {
        try {
            checkAuthentication();
        } catch (error) {
            console.error('Error checking authentication:', error);
        }
    },[navigate, pathname]);


    // Configura o refresh automático dos dados a cada 5 minutos no modo real
    React.useEffect(() => {
        if (mode !== 'real') return undefined;
        if (incrementalEngine.status === 'loading') return undefined; // Evita configurar o refresh enquanto os dados estão carregando

        let refreshTimeout = null;
        let cancelled = false;

        const scheduleNextRefresh = () => {
            refreshTimeout = setTimeout(async () => {
                if (cancelled) return;

                await refreshMarketData({ preserveEngine: true });
                scheduleNextRefresh();
            }, getNextFiveMinuteBoundaryDelay());
        }

        scheduleNextRefresh();

        return () => {
            cancelled = true;
            clearTimeout(refreshTimeout);
        }
    }, [mode]);


    //Define o valor do contexto a ser fornecido aos componentes filhos
    const contextValue = {
        // usuário
        loginUser,
        userData,
        logoutUser,
        showPopUp,
        setShowPopUp,
        actionType,
        setActionType,
        openLogoutConfirm,

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

        // Indicadores simulação
        trend,
        fullTrend: fullSources?.trend ?? trend,
        trendPrimary,
        fullTrendPrimary: fullSources?.trendPrimary ?? trendPrimary,
        fullPrice,
        fullPriceComplete: fullSources?.fullPrice ?? fullPrice,
        vppr,
        fullVppr: fullSources?.vppr ?? vppr,
        rsi,
        fullRsi: fullSources?.rsi ?? rsi,
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
            updateSources,
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
        setMovementTables,

        // Indicadores para operações
        // vppr
        vpprData,
        setVpprData,
        // Classificação primária
        retestPointsStatePrimary,
        setRetestPointsStatePrimary,
        // classificação secundaria
        retestPointsState,
        setRetestPointsState,
        // Amrsi
        amrsiData,
        setAmrsiData
    }

    return (
        <>
            <ContextGraphics.Provider value={contextValue}>
                {children}
            </ContextGraphics.Provider>
        </>
    )
}
