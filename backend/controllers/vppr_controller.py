import pandas as pd
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from utils.klines import get_klines
from controllers.symbols_controller import get_stored_symbols
from controllers.data_to_simulation_controllers import get_klines_data_simulation


# Calcula Vppr
def calculate_vppr(klines):
    vppr_values = []
    vppr_acumulado = 0

    for i, k in enumerate(klines):
        open_price = float(k[1])
        close_price = float(k[4])
        volume = float(k[5])

        delta = close_price - open_price
        vppr_candle = abs(delta) * volume

        if close_price < open_price:
            vppr_candle *= -1

        vppr_acumulado += vppr_candle
        vppr_values.append(vppr_acumulado)

    return vppr_values

def _get_vppr_single(symbol, modo="real", time="1h",total=5000):

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
    vppr_ema = vppr_series.ewm(span=200, adjust=False).mean()

    # formatar datas e price
    result = []
    for i, k in enumerate(klines):
        timestamp = int(k[0])
        date_vppr = datetime.fromtimestamp(timestamp / 1000).strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        result.append(
            {
                "time": date_vppr,
                "vppr": round(vppr_values[i], 2),
                "vppr_ema": round(vppr_ema.iloc[i], 2),
                "open": round(float(k[1]), 2),
                "close": round(float(k[4]), 2),
                "volume": round(float(k[5]), 2),
            }
        )

    return result

def get_vppr(symbols=None, symbol=None, modo="real", time="1h"):
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
