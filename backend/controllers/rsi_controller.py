from turtle import pd
import pandas as pd
from datetime import datetime
from utils.klines import get_klines, format_raw_data


# Função para calcular o RSI
def calculate_rsi(closes, period=14):
    series = pd.Series(closes)
    delta = series.diff()
    gains = delta.clip(lower=0)
    losses = -delta.clip(upper=0)

    avg_gain = gains.ewm(span=period, adjust=False).mean()
    avg_loss = losses.ewm(span=period, adjust=False).mean()
    rs = avg_gain / avg_loss

    rsi = 100 - (100 / (1 + rs))
    return rsi

# Função principal para obter o RSI
def get_rsi(symbol ="BTCUSDT", period=14, media_period=6, mode="real"):
    if period is None or period <= 0:
        raise ValueError("period deve ser um número inteiro positivo")
    if symbol is None or not isinstance(symbol, str):
        raise ValueError("symbol deve ser uma string válida")
    if media_period is None or media_period <= 0:
        raise ValueError("media_period deve ser um número inteiro positivo")
    if mode not in ["real", "simulation"]:
        raise ValueError("mode deve ser 'real' ou 'simulation'")
    
    time = "1h"

    try:
        if mode == "simulation":
            klines = get_klines(symbol, time)
        else:
            klines = get_klines(symbol, time)
    except Exception as e:
        print(f"❌ Erro ao buscar dados: {str(e)}")
        return []

    if not klines:
        return []

    closes = [float(k[4]) for k in klines]
    rsi_values = calculate_rsi(closes, period)
    rsi_ma = rsi_values.rolling(window=media_period).mean()

    result = []

    for k, rsi, ma in zip(klines, rsi_values, rsi_ma):
        timestamp = k[0] if isinstance(k[0], int) else int(k["open_time"])
        date_str = datetime.fromtimestamp(timestamp / 1000).strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        result.append(
            {
                "time": date_str,
                "rsi": round(rsi, 2) if not pd.isna(rsi) else None,
                "rsi_ma": round(ma, 2) if not pd.isna(ma) else None,
            }
        )

    return result

#print("RSI:", get_rsi(symbol="BTCUSDT", period=14, media_period=6, mode=None, offset=None, limit=None))