import requests
import datetime
from flask import jsonify
from models.cripto_news_models import create_cripto_news_recent
from datetime import datetime, timedelta


BASE_URL = "https://cryptocurrency.cv"


# Função auxiliar para normalizar símbolos
def normalize_symbol(symbol: str) -> str:
    # Remove sufixos comuns de pares (USDT, USD, BUSD, etc.)
    for suffix in ["USDT", "USD", "BUSD", "USDC"]:
        if symbol.upper().endswith(suffix):
            return symbol.upper().replace(suffix, "")
    return symbol.upper()


# Função para buscar notícias filtradas por um ativo específico
def get_news_by_coin(symbol, limit: int = 20, lang: str = "en") -> dict:
    """Busca notícias filtradas por um ativo específico nos últimos 100 dias."""
    coin = normalize_symbol(symbol)

    # Data final = hoje
    end_date = datetime.today()
    start_date = end_date - timedelta(days=10)

    url = "https://cryptocurrency.cv/api/archive"

    params = {
        "ticker": coin,
        "start": start_date.strftime("%Y-%m-%d"),   # <- 'start', não 'start_date'
        "end": end_date.strftime("%Y-%m-%d"),       # <- 'end', não 'end_date'
        "limit": limit
    }

    response = requests.get(url, params=params)

    criptoNews = response.json()

    create_cripto_news_recent(symbol, criptoNews)

    return response.json()

# Exemplo: últimas 100 dias de BTC
data = get_news_by_coin("BTCUSDT", limit=10)

print(f"Total de artigos: {data.get('totalCount', 0)}")
for artigo in data.get("articles", [])[:10]:
    print(f"{artigo.get('published_at', '')} | {artigo.get('title', '')}")