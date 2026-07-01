import pandas as pd
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from utils.klines import get_klines
from controllers.symbols_controller import get_stored_symbols
from controllers.data_to_simulation_controllers import get_klines_data_simulation


def _get_open(kline):
    if isinstance(kline, dict):
        return float(kline["Abertura"])
    return float(kline[1])


def _get_close(kline):
    if isinstance(kline, dict):
        return float(kline["Fechamento"])
    return float(kline[4])


def _get_volume(kline):
    if isinstance(kline, dict):
        return float(kline["Volume"])
    return float(kline[5])


def _get_time(kline):
    if isinstance(kline, dict):
        if "Tempo" in kline:
            return kline["Tempo"]
        timestamp = int(kline["open_time"])
    else:
        timestamp = int(kline[0])

    return datetime.fromtimestamp(timestamp / 1000).strftime("%Y-%m-%d %H:%M:%S")


# Calcula Vppr
def calculate_vppr(klines):
    vppr_values = []
    vppr_acumulado = 0

    for i, k in enumerate(klines):
        open_price = _get_open(k)
        close_price = _get_close(k)
        volume = _get_volume(k)

        delta = close_price - open_price
        vppr_candle = abs(delta) * volume

        if close_price < open_price:
            vppr_candle *= -1

        vppr_acumulado += vppr_candle
        vppr_values.append(vppr_acumulado)

    return vppr_values

def _get_vppr_single(symbol, modo="real", time="5m",total=5000):

    try:
        if modo == "simulation":
            klines = get_klines_data_simulation(symbol)
        else:
            klines = get_klines(symbol=symbol, interval=time, total=total)
    except Exception as e:
        print(f"❌ Erro ao buscar dados: {str(e)}")
        return []

    if not klines:
        return []

    vppr_values = calculate_vppr(klines)

    # transforma em Series
    vppr_series = pd.Series(vppr_values)
    # EMA do VPPR
    vppr_ema = vppr_series.ewm(span=200, adjust=False).mean() # calcula média móvel exponencial com período de 288 (1 dia para gráficos de 5m)

    # formatar datas e price
    result = []
    for i, k in enumerate(klines):
        result.append(
            {
                "time": _get_time(k),
                "vppr": round(vppr_values[i], 2),
                "vppr_ema": round(vppr_ema.iloc[i], 2),
                "open": round(_get_open(k), 2),
                "close": round(_get_close(k), 2),
                "volume": round(_get_volume(k), 2),
            }
        )

    return result

def get_vppr(symbols=None, symbol=None, modo="real", time="5m"):
    default_symbols = get_stored_symbols()

    if modo not in ["real", "simulation"]:
        raise ValueError("modo deve ser 'real' ou 'simulation'")

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
        result = _get_vppr_single(
            symbol=current_symbol,
            modo=modo,
            time=time,
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
