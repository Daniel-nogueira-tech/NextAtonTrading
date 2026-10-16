import requests
from models.all_symbols_models import salve_all_symbols

def get_binance_symbols():
    url = "https://api.binance.com/api/v3/exchangeInfo"
    response = requests.get(url)

    if response.status_code == 200:
        data = response.json()
        # extrair apenas o símbolo
        symbols = [s['symbol'] for s in data['symbols']]
        salve_all_symbols(symbols)
    else:
        print("Error accessing API:",response.status_code)
        return []

# 