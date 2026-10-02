# Calcula EMA e MACD usando os fechamentos dos candles.
def calculate_macd_ema(
    closes,
    fast_period=12,
    slow_period=26,
    signal_period= 9,
    ema_period=20,
):
    """
    Calcula EMA, MACD, linha de sinal e histograma.

    Usa seed em SMA dos primeiros `period` valores (compatível com
    TradingView / TA-Lib), ao invés de seed em values[0].

    Retorna uma lista de dicionários, um por candle. Os primeiros
    candles (warmup) terão valores None onde a EMA ainda não existe.
    """

    # ---------- Validação ----------
    periods = {
        "fast_period": fast_period,
        "slow_period": slow_period,
        "signal_period": signal_period,
        "ema_period": ema_period,
    }
    if any(p is None or p <= 0 for p in periods.values()):
        raise ValueError("Os períodos de EMA e MACD devem ser positivos")

    if fast_period >= slow_period:
        raise ValueError("fast_period deve ser menor que slow_period")

    prices = [float(c) for c in closes]
    n = len(prices)

    if n == 0:
        return []

    # ---------- EMA com seed em SMA ----------
    def calculate_ema(values, period):
        """
        Retorna uma lista do mesmo tamanho de `values`.
        Os primeiros (period - 1) elementos são None (warmup).
        O elemento no índice (period - 1) é a SMA dos primeiros `period`.
        """
        if period <= 0:
            raise ValueError("period deve ser positivo")

        length = len(values)
        ema = [None] * length

        if length < period:
            return ema  # não há dados suficientes

        multiplier = 2 / (period + 1)

        # Seed: SMA dos primeiros `period` valores
        seed = sum(values[:period]) / period
        ema[period - 1] = seed

        for i in range(period, length):
            ema[i] = (values[i] - ema[i - 1]) * multiplier + ema[i - 1]

        return ema

    # ---------- Cálculo das EMAs ----------
    fast_ema = calculate_ema(prices, fast_period)
    slow_ema = calculate_ema(prices, slow_period)
    ema = calculate_ema(prices, ema_period)

    # ---------- MACD ----------
    # MACD só existe onde ambas as EMAs existem
    macd = [
        (fast_ema[i] - slow_ema[i])
        if (fast_ema[i] is not None and slow_ema[i] is not None)
        else None
        for i in range(n)
    ]

    # ---------- Linha de sinal (EMA do MACD) ----------
    # Primeiro índice onde o MACD é válido
    first_macd_idx = next((i for i, v in enumerate(macd) if v is not None), None)

    signal = [None] * n
    if first_macd_idx is not None:
        # Extrai a parte válida do MACD
        macd_valid = macd[first_macd_idx:]
        signal_valid = calculate_ema(macd_valid, signal_period)

        # Reinsere no array final, deslocando pelo offset
        for j, val in enumerate(signal_valid):
            signal[first_macd_idx + j] = val

    # ---------- Histograma ----------
    histogram = [
        (macd[i] - signal[i])
        if (macd[i] is not None and signal[i] is not None)
        else None
        for i in range(n)
    ]

    # ---------- Montagem do resultado ----------
    return [
        {
            "ema": ema[i],
            "ema_fast": fast_ema[i],
            "ema_slow": slow_ema[i],
            "macd": macd[i],
            "macd_signal": signal[i],
            "macd_histogram": histogram[i],
        }
        for i in range(n)
    ]



