import pandas as pd
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from utils.klines import get_klines
from controllers.symbols_controller import get_stored_symbols


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

# Função principal para obter o RSI de um ativo
def _get_rsi_single(symbol="BTCUSDT", period=14, media_period=6, mode="real"):
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


def get_rsi(symbols=None, symbol=None, period=14, media_period=6, mode="real"):
    default_symbols = get_stored_symbols()

    if period is None or period <= 0:
        raise ValueError("period deve ser um número inteiro positivo")
    if media_period is None or media_period <= 0:
        raise ValueError("media_period deve ser um número inteiro positivo")
    if mode not in ["real", "simulation"]:
        raise ValueError("mode deve ser 'real' ou 'simulation'")

    symbols_input = symbols if symbols is not None else symbol

    if symbols_input is None or symbols_input == "":
        symbols_to_process = default_symbols
    elif isinstance(symbols_input, str):
        symbols_to_process = [
            item.strip().upper()
            for item in symbols_input.split(",")
            if item.strip()
        ]
    else:
        symbols_to_process = [
            str(item).strip().upper()
            for item in symbols_input
            if str(item).strip()
        ]

    if not symbols_to_process:
        raise ValueError("Informe pelo menos um símbolo válido.")

    def calculate_symbol(index_symbol):
        index, current_symbol = index_symbol
        result = _get_rsi_single(
            symbol=current_symbol,
            period=period,
            media_period=media_period,
            mode=mode,
        )
        return {
            "index": index,
            "symbol": current_symbol,
            "result": result,
        }

    max_workers = min(len(symbols_to_process), 4)

    if max_workers == 1:
        return [calculate_symbol((0, symbols_to_process[0]))]

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        return list(executor.map(calculate_symbol, enumerate(symbols_to_process)))

#print("RSI:", get_rsi(symbol="BTCUSDT", period=14, media_period=6, mode=None, offset=None, limit=None))
