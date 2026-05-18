from binance.client import Client
from datetime import datetime, timedelta

client = Client()

# Função para obter os dados de klines (candlesticks) da Binance
def get_klines(symbol, interval, total=5000):
    all_klines = []
    limit = 1500
    end_time = None

    while len(all_klines) < total:
        klines = client.get_klines(
            symbol=symbol, interval=interval, limit=limit, endTime=end_time
        )

        if not klines:
            print("Não é possivel baixar os dados da Binance")
            break

        # evita duplicar candles
        if all_klines and klines[-1][0] >= all_klines[0][0]:
            break

        all_klines = klines + all_klines

        # anda para trás no tempo
        end_time = klines[0][0] - 1
        # segurança contra loop infinito
        if len(klines) == 0:
            break
    return all_klines[-total:]

# Formata os dados brutos para um formato mais legível
def format_raw_data(raw_data):
    formatted_data = []

    for k in raw_data:
        data = {
            "Tempo": datetime.fromtimestamp(k[0] / 1000).strftime("%Y-%m-%d %H:%M:%S"),
            "Abertura": float(k[1]),
            "Maximo": float(k[2]),
            "Minimo": float(k[3]),
            "Fechamento": float(k[4]),
            "Volume": float(k[5]),
        }
        formatted_data.append(data)

    return formatted_data
