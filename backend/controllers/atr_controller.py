from utils.klines import get_klines, format_raw_data

#  Função para calcular o ATR móvel
def calculate_atr_wilder(symbol, interval="15m", period=14):
    if period is None or period <= 0:
        raise ValueError("period deve ser um número inteiro positivo")
    
    raw_data = get_klines(symbol, interval, 5000)
    data = sorted(format_raw_data(raw_data), key=lambda x: x["Tempo"])

    trs = []

    for i in range(1, len(data)):
        high = float(data[i]["Maximo"])
        low = float(data[i]["Minimo"])
        prev_close = float(data[i - 1]["Fechamento"])

        tr = max(
            high - low,
            abs(high - prev_close),
            abs(low - prev_close)
        )
        trs.append(tr)

    # Primeiro ATR = média simples
    atrs = []
    first_atr = sum(trs[:period]) / period
    atrs.append(first_atr)

    # Wilder smoothing
    for i in range(period, len(trs)):
        atr = (atrs[-1] * (period - 1) + trs[i]) / period

        atrs.append(atr)    
    return atrs



def calculate_atr_wilder_from_data(data, period=14):
    if period is None or period <= 0:
        raise ValueError("period deve ser um número inteiro positivo")

    sorted_data = sorted(data, key=lambda x: x["Tempo"])

    if len(sorted_data) <= period:
        raise ValueError("Dados insuficientes para calcular ATR.")

    trs = []

    for i in range(1, len(sorted_data)):
        high = float(sorted_data[i]["Maximo"])
        low = float(sorted_data[i]["Minimo"])
        prev_close = float(sorted_data[i - 1]["Fechamento"])

        tr = max(
            high - low,
            abs(high - prev_close),
            abs(low - prev_close)
        )
        trs.append(tr)

    atrs = []
    first_atr = sum(trs[:period]) / period
    atrs.append(first_atr)

    for i in range(period, len(trs)):
        atr = (atrs[-1] * (period - 1) + trs[i]) / period
        atrs.append(atr)

    return atrs


# Função para obter o ATR correspondente a um candle específico
def _get_atr_for_candle(atrs, candle_index, period):
    if candle_index < period:
        return atrs[0]

    atr_index = candle_index - period
    if atr_index >= len(atrs):
        return atrs[-1]
    return atrs[atr_index]


