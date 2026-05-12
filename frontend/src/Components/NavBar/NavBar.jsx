// NavBar.jsx
import React, { useState, useEffect, useRef, useContext } from 'react'
import './NavBar.css'
import { mockSymbols, searchSymbols, addMockSymbol } from './mockSymbols'
import { ContextGraphics } from '../../ContextGraphics/ContextGraphics'

const NavBar = () => {
    const { addSymbols, tabs, setTabs, removeSymbol, setActiveSymbol,updateSymbolStatus } = React.useContext(ContextGraphics)


    const [searchTerm, setSearchTerm] = useState('')
    const [searchResults, setSearchResults] = useState([])
    const [showDropdown, setShowDropdown] = useState(false)
    const [isAddingNew, setIsAddingNew] = useState(false)
    const [newSymbolName, setNewSymbolName] = useState('')
    const searchRef = useRef(null)
    const inputRef = useRef(null)

    // Filtra símbolos baseado no termo de busca
    useEffect(() => {
        if (searchTerm.length > 0) {
            const results = searchSymbols(searchTerm)
            // Filtra símbolos que já estão nas abas
            const filteredResults = results.filter(
                result => !tabs.some(tab => tab.symbol === result.symbol)
            )
            setSearchResults(filteredResults)
            setShowDropdown(true)
        } else {
            setSearchResults([])
            setShowDropdown(false)
        }

    }, [searchTerm, tabs])

    // Fecha dropdown ao clicar fora
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowDropdown(false)
                setIsAddingNew(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Adicionar nova aba
    const addTab = (symbol, name) => {
        const newId = Date.now().toString()
        const newTab = {
            id: newId,
            symbol: symbol,
            name: name,
            active: true
        }
        addSymbols(newTab) // Atualiza o símbolo no contexto

        // Desativa todas as outras abas
        const updatedTabs = tabs.map(tab => ({ ...tab, active: false }))
        setTabs([...updatedTabs, newTab])
        setActiveSymbol(newTab.symbol)
        setSearchTerm('')
        setShowDropdown(false)
        setIsAddingNew(false)
    }

    // Fechar aba
    const closeTab = (tabId, e) => {
        e.stopPropagation()
        const tabToClose = tabs.find(tab => tab.id === tabId)
        if (tabs.length === 1) {
            alert('Mantenha pelo menos uma aba aberta!')
            return
        }
        const newTabs = tabs.filter(tab => tab.id !== tabId)
        // Remove o símbolo do backend
        if (tabId) {
            if (!confirm('Are you sure you want to remove this symbol?')) {
                return
            }
            removeSymbol(tabId)
        }
        // Se a aba fechada era a ativa, ativa a primeira disponível
        if (tabToClose.active) {
            newTabs[0].active = true
        }
        setTabs(newTabs)
    }


    // Mudar aba ativa
    const changeTab = (tabId) => {
        const updatedTabs = tabs.map(tab => ({
            ...tab,
            active: tab.id === tabId
        }))
        // pega o primeiro ativo
        const activeTab = updatedTabs.find(tab => tab.active)

        // Atualiza o status do símbolo no backend;
        updateSymbolStatus(activeTab.symbol) 
        // Atualiza as abas no frontend
        setTabs(updatedTabs)
    }

    // Adicionar novo símbolo customizado
    const handleAddCustomSymbol = () => {
        if (searchTerm && newSymbolName) {
            const newSymbol = addMockSymbol(searchTerm, newSymbolName)
            addTab(newSymbol.symbol, newSymbol.name)
            setNewSymbolName('')
        }
    }

    // Selecionar símbolo dos resultados
    const selectSymbol = (symbol) => {
        addTab(symbol.symbol, symbol.name)
    }

    return (
        <div className="navbar">
            {/* Barra superior */}
            <div className="navbar__header">
                <div className="navbar__logo">
                    <div className="navbar__logo-icon">📊</div>
                    <h3 className="navbar__logo-text">NextAton<span>Trading</span></h3>
                    <span className="navbar__badge">PRO</span>
                </div>

                {/* Input de pesquisa */}
                <div className="navbar__search-container" ref={searchRef}>
                    <div className="navbar__search">

                        {
                            tabs.length < 4 ?
                                <span className="navbar__search-icon">🔍</span>
                                : <span className="navbar__search-icon">🚫</span>
                        }

                        <input
                            disabled={tabs.length >= 4}
                            ref={inputRef}
                            type="text"
                            placeholder={tabs.length >= 4 ? "Maximum of 4 open assets!" : "Search symbol... (ex: BTC, ETH)"}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                            className="navbar__search-input"
                        />
                        {searchTerm && (
                            <button
                                className="navbar__search-clear"
                                onClick={() => setSearchTerm('')}
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Dropdown de resultados */}
                    {showDropdown && (
                        <div className="navbar__dropdown">
                            {searchResults.length > 0 ? (
                                <>
                                    {searchResults.map((result) => (
                                        <div
                                            key={result.id}
                                            className="navbar__dropdown-item"
                                            onClick={() => selectSymbol(result)}
                                        >
                                            <div className="navbar__dropdown-symbol">
                                                <span className="navbar__dropdown-symbol-name">{result.symbol}</span>
                                                <span className="navbar__dropdown-symbol-full">{result.name}</span>
                                            </div>
                                            <div className="navbar__dropdown-price">
                                                <span>${result.price.toFixed(2)}</span>
                                                <span className={result.change >= 0 ? 'positive' : 'negative'}>
                                                    {result.change >= 0 ? '+' : ''}{result.change}%
                                                </span>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Opção para adicionar novo símbolo */}
                                    {!searchResults.some(r => r.symbol === searchTerm) && searchTerm.length > 0 && (
                                        <div className="navbar__dropdown-divider"></div>
                                    )}
                                </>
                            ) : null}

                            {/* Adicionar novo símbolo customizado */}
                            {searchTerm.length > 0 && !searchResults.some(r => r.symbol === searchTerm) && (
                                <div className="navbar__dropdown-add">
                                    <div className="navbar__dropdown-add-header">
                                        <span>➕ Adicionar novo símbolo</span>
                                        <span className="navbar__dropdown-add-badge">Custom</span>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Nome do ativo (ex: Bitcoin)"
                                        value={newSymbolName}
                                        onChange={(e) => setNewSymbolName(e.target.value)}
                                        className="navbar__dropdown-add-input"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <button
                                        className="navbar__dropdown-add-btn"
                                        onClick={handleAddCustomSymbol}
                                        disabled={!newSymbolName}
                                    >
                                        Adicionar {searchTerm}
                                    </button>
                                </div>
                            )}

                            {searchResults.length === 0 && searchTerm && (
                                <div className="navbar__dropdown-empty">
                                    Nenhum símbolo encontrado
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Info do usuário */}
                <div className="navbar__user">
                    <div className="navbar__user-avatar">👤</div>
                    <div className="navbar__user-info">
                        <span className="navbar__user-name">Trader Pro</span>
                        <span className="navbar__user-status">Online</span>
                    </div>
                </div>
            </div>

            {/* Abas */}
            <div className="navbar__tabs">
                <div className="navbar__tabs-container">
                    {tabs.map((tab) => (
                        <div
                            key={tab.id}
                            className={`navbar__tab ${tab.active ? 'navbar__tab--active' : ''}`}
                            onClick={() => changeTab(tab.id)}
                        >
                            <div className="navbar__tab-content">
                                <div className="navbar__tab-icon">
                                    {tab.symbol.charAt(0)}
                                </div>
                                <div className="navbar__tab-info">
                                    <span className="navbar__tab-symbol">{tab.symbol}</span>
                                    <span className="navbar__tab-name">{tab.name}</span>
                                </div>
                                <button
                                    className="navbar__tab-close"
                                    onClick={(e) => closeTab(tab.id, e)}
                                    title="Fechar aba"
                                >
                                    ✕
                                </button>
                            </div>
                            {tab.active && <div className="navbar__tab-indicator" />}
                        </div>
                    ))}

                    {/* Indicador de mais abas */}
                    {tabs.length > 4 && (
                        <div className="navbar__tabs-more">
                            <span>📌</span>
                            <span className="navbar__tabs-count">+{tabs.length - 4}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default NavBar