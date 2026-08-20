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


def _get_datetime(kline):
    if isinstance(kline, dict):
        value = kline.get("Tempo") or kline.get("time") or kline.get("open_time")
    else:
        value = kline[0]

    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000)

    for date_format in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(str(value), date_format)
        except ValueError:
            continue

    raise ValueError(f"Formato de tempo inválido para VPPR: {value}")


def _get_accumulation_period_key(kline, accumulation_period):
    candle_datetime = _get_datetime(kline)
    if accumulation_period == "week":
        iso_calendar = candle_datetime.isocalendar()
        return iso_calendar.year, iso_calendar.week
    return candle_datetime.year, candle_datetime.month


# Calcula Vppr
def calculate_vppr(klines, accumulation_period="week"):
    if accumulation_period not in ("week", "month"):
        raise ValueError("accumulation_period deve ser 'week' ou 'month'")

    vppr_values = []
    vppr_acumulado = 0
    current_period = None

    for i, k in enumerate(klines):
        candle_period = _get_accumulation_period_key(k, accumulation_period)
        if candle_period != current_period:
            vppr_acumulado = 0
            current_period = candle_period

        open_price = _get_open(k)
        close_price = _get_close(k)
        volume = _get_volume(k)

        delta = close_price - open_price
        vppr_candle = abs(delta) * volume

        if close_price < open_price:
            vppr_candle *= -1

        vppr_acumulado += (vppr_candle / 1000)
        vppr_values.append(vppr_acumulado)

    return vppr_values

def _get_vppr_single(symbol, modo="real", time="15m", total=5000, accumulation_period="week"):

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

    vppr_values = calculate_vppr(klines, accumulation_period=accumulation_period)

    # transforma em Series
    vppr_series = pd.Series(vppr_values)
    # EMA do VPPR
    vppr_ema = vppr_series.ewm(span=200, adjust=False).mean() # calcula média móvel exponencial com período de 96 (1 dia para gráficos de 15m)

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

def get_vppr(symbols=None, symbol=None, modo="real", time="15m", accumulation_period="week"):
    default_symbols = get_stored_symbols()

    if modo not in ["real", "simulation"]:
        raise ValueError("modo deve ser 'real' ou 'simulation'")
    if accumulation_period not in ("week", "month"):
        raise ValueError("accumulation_period deve ser 'week' ou 'month'")

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
            accumulation_period=accumulation_period,
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
