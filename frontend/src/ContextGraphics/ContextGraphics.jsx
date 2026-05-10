import React from 'react'
import axios from 'axios'

export const ContextGraphics = React.createContext(null);


export const ContextGraphicsProvider = ({ children }) => {
    const urlBackend = import.meta.env.VITE_BACKEND_URL;
    const [trend, setTrend] = React.useState(null);
    const [tabs, setTabs] = React.useState([]);
    const [activeSymbol, setActiveSymbol] = React.useState('');


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
            setTabs(symbols)
            console.log('Symbols fetched successfully:', response.data)
        } catch (error) {
            console.error('Error fetching symbols:', error)
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



    // Pega a classificação de tendência do backend
    const trendClassification = async () => {
        try {
            const response = await axios.get(`${urlBackend}/api/trend`)
            setTrend(response.data)
        } catch (error) {
            console.error('Error fetching trend classification:', error)
        }

    };

    console.log(activeSymbol);
    
    // Carrega os dados quando o componente é montado
    React.useEffect(() => {
        async function loadData() {
            try {
                await Promise.all([
                    trendClassification(),
                    getSymbols()
                ])
            } catch (error) {
                console.error('Error loading data:', error)
            }
        }
        loadData()
    }, [])



    //Define o valor do contexto a ser fornecido aos componentes filhos
    const contextValue = {
        trend,
        setTrend,
        tabs,
        activeSymbol,
        setActiveSymbol,
        setTabs,
        addSymbols,
        removeSymbol
    }

    return (
        <>
            <ContextGraphics.Provider value={contextValue}>
                {children}
            </ContextGraphics.Provider>
        </>
    )
}