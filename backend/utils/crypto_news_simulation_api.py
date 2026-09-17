from flask import jsonify
from models.cripto_news_simulation_models import create_cripto_news_simulation
import requests
import datetime



# Função auxiliar para normalizar símbolos
def normalize_symbol(symbol: str) -> str:
    # Remove sufixos comuns de pares (USDT, USD, BUSD, etc.)
    for suffix in ["USDT", "USD", "BUSD", "USDC"]:
        if symbol.upper().endswith(suffix):
            return symbol.upper().replace(suffix, "")
    return symbol.upper()


# Função para buscar notícias históricas de um ativo em um intervalo de datas para simular
def query_archive_simulation(symbol, start_date, end_date, limit=200):

    if not symbol or not start_date or not end_date:
        return jsonify({"Error": "The parameters symbol, dateStart, and dateEnd are required."}),400
    
    coin = normalize_symbol(symbol)

    """Busca notícias históricas de um ativo em um intervalo de datas."""
    url = "https://cryptocurrency.cv/api/archive"
    params = {
        "coin": coin.upper(),
        "start": start_date,   # formato YYYY-MM-DD
        "end": end_date,
        "limit": limit
    }
    response = requests.get(url, params=params)
    create_cripto_news_simulation(symbol,response)
    return response.json()

