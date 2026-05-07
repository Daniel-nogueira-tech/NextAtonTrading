import React from 'react'
import axios from 'axios'

export const ContextGraphics = React.createContext(null);


export const ContextGraphicsProvider = ({ children }) => {
    const urlBackend = import.meta.env.VITE_BACKEND_URL
    console.log(urlBackend);
    const [trend, setTrend] = React.useState(null)


    // Pega a classificação de tendência do backend
    const trendClassification = async () => {
        try {
            const response = await axios.get(`${urlBackend}/api/trend`)
            setTrend(response.data)
        } catch (error) {
            console.error('Error fetching trend classification:', error)
        }

    };
    console.log(trend);





    // Carrega os dados quando o componente é montado
    React.useEffect(() => {
        async function loadData() {
            try {
                await Promise.all([
                    trendClassification(),
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
    }

    return (
        <>
            <ContextGraphics.Provider value={contextValue}>
                {children}
            </ContextGraphics.Provider>
        </>
    )
}