import pandas as pd
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from utils.klines import get_klines
from controllers.symbols_controller import get_stored_symbols
from controllers.data_to_simulation_controllers import get_klines_data_simulation


# Funcao para calcular o RSI
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

# Helpers para normalizar retorno dos dados de simulação e tempo real
def _get_close(kline):
    if isinstance(kline, dict):
        return float(kline["Fechamento"])
    return float(kline[4])
def _get_time(kline):
    if isinstance(kline, dict):
        if "Tempo" in kline:
            return kline["Tempo"]
        timestamp = int(kline["open_time"])
    else:
        timestamp = int(kline[0])

    return datetime.fromtimestamp(timestamp / 1000).strftime("%Y-%m-%d %H:%M:%S")


# Funcao principal para obter o RSI de um ativo
def _get_rsi_single(symbol="BTCUSDT", period=14, media_period=6, mode="", time="5m"):
    if period is None or period <= 0:
        raise ValueError("period deve ser um numero inteiro positivo")
    if symbol is None or not isinstance(symbol, str):
        raise ValueError("symbol deve ser uma string valida")
    if media_period is None or media_period <= 0:
        raise ValueError("media_period deve ser um numero inteiro positivo")
    if mode not in ["real", "simulation"]:
        raise ValueError("mode deve ser 'real' ou 'simulation'")

    try:
        if mode == "simulation":
            klines = get_klines_data_simulation(symbol)
        else:
            klines = get_klines(symbol, time)
    except Exception as e:
        print(f"Erro ao buscar dados: {str(e)}")
        return []

    if not klines:
        return []

    closes = [_get_close(k) for k in klines]
    rsi_values = calculate_rsi(closes, period).fillna(0)
    rsi_ma = rsi_values.rolling(window=media_period).mean().fillna(0)

    result = []

    for k, rsi, ma in zip(klines, rsi_values, rsi_ma):
        result.append(
            {
                "time": _get_time(k),
                "rsi": round(rsi, 2) if not pd.isna(rsi) else None,
                "rsi_ma": round(ma, 2) if not pd.isna(ma) else None,
            }
        )

    return result


def get_rsi(symbols=None, symbol=None, period=15, media_period=15, mode=""):
    default_symbols = get_stored_symbols()

    if period is None or period <= 0:
        raise ValueError("period deve ser um numero inteiro positivo")
    if media_period is None or media_period <= 0:
        raise ValueError("media_period deve ser um numero inteiro positivo")
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
        raise ValueError("Informe pelo menos um simbolo valido.")

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


# print("RSI:", get_rsi(symbol="BTCUSDT", period=14, media_period=6, mode=None))
