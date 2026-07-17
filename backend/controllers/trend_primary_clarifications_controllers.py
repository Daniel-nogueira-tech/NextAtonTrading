from utils.klines import get_klines, format_raw_data
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from controllers.symbols_controller import get_stored_symbols
from controllers.data_to_simulation_controllers import get_klines_data_simulation_primary



# Função para calcular o ATR móvel
def calculate_atr_wilder(symbol, interval="1h", period=182):
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

# Helpers para normalizar retorno dos dados de simulação e tempo real
def _format_candle_for_response(kline):
    if isinstance(kline, dict):
        return {
            "tempo": kline["Tempo"],
            "open": kline["Abertura"],
            "high": kline["Maximo"],
            "low": kline["Minimo"],
            "close": kline["Fechamento"],
            "volume": kline["Volume"],
        }

    return {
        "tempo": datetime.fromtimestamp(kline[0] / 1000).strftime("%Y-%m-%d %H:%M:%S"),
        "open": kline[1],
        "high": kline[2],
        "low": kline[3],
        "close": kline[4],
        "volume": kline[5],
    }

def calculate_atr_wilder_from_data(data, period=182):
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

# Função principal para obter as clarificações de tendência usando ATR
def _trend_clarifications_atr_single(symbol, time, mode , total = 5000):
    print(f"Calculating trend clarifications for {symbol} with time {time} and mode {mode}")
    #  Busca os klines na Binance
    try:
        if mode == "simulation":
            # 🔁 Pega os dados do banco
            try:
                raw_data = get_klines_data_simulation_primary(symbol)
                print(f"✅ Dados baixados com sucesso: {len(raw_data) if raw_data else 0} registros")
            except Exception as download_e:
                raise ValueError(f"Não foi possível baixar dados: {str(download_e)}")
            
            if not raw_data:
                raise ValueError(f"Nenhum dado encontrado para {symbol} {time}")
            
            data = raw_data
            print(f"✅ dados formatados: {len(data)} candles")

        else:
            # 🔁 Pega os dados em tempo real da Binance
            raw_data = get_klines(symbol, time, total)
            data = format_raw_data(raw_data)
            print(f"✅ dados formatados: {len(data)} candles")

        # Garante que a sequência de candles esteja ordenada pelo tempo para manter ATR e classificação sincronizados
        data = sorted(data, key=lambda x: x["Tempo"])   

    except Exception as e:
        print(f"❌ Erro ao buscar klines de {symbol}: {str(e)}")
        raise Exception(f"Erro ao buscar klines de {symbol}: {str(e)}")

    # Extrai preços de fechamento e tempos
    closes = [item["Fechamento"] for item in data]
    timestamps = [item["Tempo"] for item in data]
    
    print(f"✅ closes: {len(closes)}, timestamps: {len(timestamps)}")

    # Calcula o ATR suavizado usando os candles já carregados.
    # Isso evita uma segunda chamada à Binance para o mesmo ativo.
    atrs = calculate_atr_wilder_from_data(data, period=182)
    print(f"✅ ATRs calculados: {len(atrs) if atrs else 0}")
    
    if not atrs:
        raise ValueError("ATR não pôde ser calculado.")

    verify_time_multiply = 5
    atr_period = 182


    # Sincroniza o ATR com cada candle para manter a classificação alinhada à volatilidade
    # A cada iteração, limit e confirmar são recalculados com base no ATR do candle atual.
    base_atr = atrs[0]
    atr = base_atr * verify_time_multiply
    confir = atr / 2
    confir_round = confir
    print(f"✅ ATR inicial: {base_atr}, limite inicial: {atr}, confirmação inicial: {confir_round}")
    

    limit = atr
    confirmar = confir_round

    # Inicializa variáveis de controle
    cont = 0
    movements = []
    candles = []
    state = "inicio"
    top = closes[0]
    bottom = closes[0]
    reference_point = closes[0]
    starting_point = closes[0]
    current_trend = None

    # pivos de tendencia
    last_pivot_high = None
    last_pivot_down = None

    # pivos de reação natural secundária
    last_pivot_reaction_sec_high = None
    last_pivot_reaction_sec_low = None
    last_pivot_reaction_sec_high_temp = None
    last_pivot_reaction_sec_low_temp = None

    # pivos de rally natural
    last_pivot_rally_high = None
    last_pivot_rally_low = None
    last_pivot_rally_high_temp = None
    last_pivot_rally_low_temp = None
    
    # pivos de reação secundária dentro do rally natural
    last_pivot_rally_sec_low = None
    last_pivot_rally_sec_low_temp = None
    last_pivot_rally_sec_high = None
    last_pivot_rally_sec_high_temp = None

    # Primeiro ponto é sempre um Rally Natural Inicial
    movements.append(
        {
            "closeTime": timestamps[0],
            "closePrice": reference_point,
            "tipo": "Rally Natural (inicial)",
            "limite": limit,
        }
    )
    
    # Salvar dados completos antes da classificação
    for r in data:
        candles.append(_format_candle_for_response(r))
    
    # Salva os dados completos em outra tabela antes de classificar

    for i in range(1, len(closes)):
        current_atr = _get_atr_for_candle(atrs, i, atr_period)
        limit = current_atr * verify_time_multiply
        confirmar = limit / 2

        price = closes[i]
        tempo = timestamps[i]
        added_movement = False  # Controle para evitar duplicação
        cont += 1
        price = price
        # === ESTADO INICIAL ===
        # Detecta início de tendência
        if state == "inicio":
            if not added_movement and price >= reference_point + limit:
                # Inicia tendência de alta
                state = "tendencia_alta"
                current_trend = "Alta"
                last_pivot_high = price
                top = price
                reference_point = price
                movements.append(
                    {
                        "closeTime": tempo,
                        "closePrice": price,
                        "tipo": "Tendência Alta (compra)",
                        "limite": limit,
                    }
                )
                added_movement = True
                #print(f"✅ Tendência de Alta iniciada em {price} no tempo {tempo}")

            elif not added_movement and price <= reference_point - limit:
                # Inicia tendência de baixa
                state = "tendencia_baixa"
                current_trend = "Baixa"
                last_pivot_down = price
                bottom = price
                reference_point = price
                movements.append(
                    {
                        "closeTime": tempo,
                        "closePrice": price,
                        "tipo": "Tendência Baixa (venda)",
                        "limite": limit,
                    }
                )
                added_movement = True

        # === TENDÊNCIA DE ALTA ===
        elif not added_movement and state == "tendencia_alta":
            if price > top:
                # Continua tendência de alta
                top = price
                last_pivot_high = price
                reference_point = price
                movements.append(
                    {
                        "closeTime": tempo,
                        "closePrice": price,
                        "tipo": "Tendência Alta (topo)",
                        "limite": limit,
                    }
                )
                added_movement = True
            elif not added_movement and price <= top - limit:
                # Transição para reação natural (correção)
                state = "reacao_natural"
                last_pivot_rally_high_temp = price
                bottom = price
                reference_point = price
                movements.append(
                    {
                        "closeTime": tempo,
                        "closePrice": price,
                        "tipo": "Reação Natural (Alta)",
                        "limite": limit,
                    }
                )
                added_movement = True

        # === TENDÊNCIA DE BAIXA ===
        elif not added_movement and state == "tendencia_baixa":
            if price < bottom:
                # Continua tendência de baixa
                bottom = price
                last_pivot_down = price
                reference_point = price
                movements.append(
                    {
                        "closeTime": tempo,
                        "closePrice": price,
                        "tipo": "Tendência Baixa (fundo)",
                        "limite": limit,
                    }
                )
                added_movement = True
            elif not added_movement and price >= bottom + limit:
                # Transição para reação natural (correção)
                state = "reacao_natural"
                top = price
                last_pivot_rally_low_temp = price
                reference_point = price
                movements.append(
                    {
                        "closeTime": tempo,
                        "closePrice": price,
                        "tipo": "Reação Natural (Baixa)",
                        "limite": limit,
                    }
                )
                added_movement = True

        # === REAÇÃO NATURAL ===
        elif state == "reacao_natural":
            if current_trend == "Alta":
                # Vindo de tendência de alta
                if not added_movement and price < bottom:
                    # Continuação da reação
                    bottom = price
                    last_pivot_rally_high_temp = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Reação Natural (fundo)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_high is not None
                    and price >= bottom + limit
                    and price <= last_pivot_high
                ):
                    # Rally Natural (recuperacao)
                    state = "rally_natural"
                    top = price
                    last_pivot_rally_high = last_pivot_rally_high_temp
                    last_pivot_rally_low = None
                    starting_point = None
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Rally Natural (Alta)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and last_pivot_high is not None
                    and price >= last_pivot_high + confirmar
                ):
                    state = "tendencia_alta"
                    current_trend = "Alta"
                    last_pivot_high = price
                    top = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Alta (compra)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and starting_point is not None
                    and price <= starting_point - confirmar
                ):
                    # Reversão para tendência de baixa
                    state = "tendencia_baixa"
                    current_trend = "Baixa"
                    bottom = price
                    last_pivot_down = price
                    starting_point = None
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Baixa (venda)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and last_pivot_rally_high is not None
                    and price <= last_pivot_rally_high - confirmar
                ):

                    # Reversão para tendência de baixa
                    state = "tendencia_baixa"
                    current_trend = "Baixa"
                    bottom = price
                    last_pivot_down = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Baixa (venda)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_down is not None
                    and price <= last_pivot_down - confirmar
                ):

                    # Reversão para tendência de baixa
                    state = "tendencia_baixa"
                    current_trend = "Baixa"
                    bottom = price
                    last_pivot_down = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Baixa (venda)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

            elif current_trend == "Baixa":
                # Vindo de tendência baixa
                if not added_movement and price > top:
                    # Continuação da reação
                    top = price
                    last_pivot_rally_low_temp = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Reação Natural (topo)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_down is not None
                    and price <= top - limit
                    and price >= last_pivot_down
                ):
                    # Rally Natural (respiro de baixa)
                    state = "rally_natural"
                    bottom = price
                    last_pivot_rally_low = last_pivot_rally_low_temp
                    last_pivot_rally_high = None
                    starting_point = None
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Rally Natural (Baixa)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and last_pivot_down is not None
                    and price <= last_pivot_down - confirmar
                ):
                    # Reversão para tendência de baixa
                    state = "tendencia_baixa"
                    current_trend = "Baixa"
                    bottom = price
                    last_pivot_down = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Baixa (venda)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and starting_point is not None
                    and price >= starting_point + confirmar
                ):
                    # Reversão para tendência de alta
                    state = "tendencia_alta"
                    current_trend = "Alta"
                    top = price
                    last_pivot_high = price
                    starting_point = None
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Alta (compra)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and last_pivot_rally_low is not None
                    and price >= last_pivot_rally_low + confirmar
                ):
                    state = "tendencia_alta"
                    current_trend = "Alta"
                    top = price
                    last_pivot_high = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Alta (compra)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and last_pivot_high is not None
                    and price >= last_pivot_high + confirmar
                ):
                    state = "tendencia_alta"
                    current_trend = "Alta"
                    top = price
                    last_pivot_high = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Alta (compra)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

        # === RALLY NATURAL ===
        elif state == "rally_natural":
            if current_trend == "Alta":
                # Vindo de tendência alta
                if (
                    not added_movement
                    and price > top
                    and price < last_pivot_high
                ):
                    # Continuação do rally
                    top = price
                    last_pivot_reaction_sec_high_temp = price
                    last_pivot_rally_sec_high = last_pivot_rally_sec_high_temp
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Rally Natural (topo)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_high is not None
                    and price >= last_pivot_high + confirmar
                ):
                    # Retomada da tendência de alta
                    state = "tendencia_alta"
                    last_pivot_high = price
                    last_pivot_down = None
                    current_trend = "Alta"
                    top = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Alta (compra)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_rally_high is not None
                    and price <= top - limit
                    and price >= last_pivot_rally_high
                ):
                    state = "reacao_secundaria"
                    bottom = price
                    last_pivot_reaction_sec_high = last_pivot_reaction_sec_high_temp
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Reação secundária (Alta)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_rally_high is not None
                    and price <= last_pivot_rally_high - confirmar
                ):
                    state = "tendencia_baixa"
                    bottom = price
                    current_trend = "Baixa"
                    last_pivot_down = price
                    last_pivot_high = None
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Baixa (venda)",
                            "limite": limit,
                        }
                    )
                added_movement = True

            elif current_trend == "Baixa":
                # Vindo de tendência baixa
                if (
                    not added_movement
                    and price < bottom
                    and price > last_pivot_down
                ):
                    # Continuação do rally
                    bottom = price
                    reference_point = price
                    last_pivot_reaction_sec_low_temp = price
                    last_pivot_rally_sec_low = last_pivot_rally_sec_low_temp
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Rally Natural (fundo)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement and price <= last_pivot_down - confirmar
                ):
                    # Retomada da tendência de baixa
                    bottom = price
                    last_pivot_down = price
                    last_pivot_high = None
                    reference_point = price
                    state = "tendencia_baixa"
                    current_trend = "Baixa"
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Baixa (venda)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_rally_low is not None
                    and price >= bottom + limit
                    and price <= last_pivot_rally_low
                ):
                    state = "reacao_secundaria"
                    top = price
                    last_pivot_reaction_sec_low = last_pivot_reaction_sec_low_temp
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Reação secundária",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_rally_low is not None
                    and price >= last_pivot_rally_low + confirmar
                ):
                    state = "tendencia_alta"
                    top = price
                    current_trend = "Alta"
                    last_pivot_high = price
                    last_pivot_down = None
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Alta (compra)",
                            "limite": limit,
                        }
                    )
                added_movement = True

        # ======== Reação secundária ===========
        elif state == "reacao_secundaria":
            if current_trend == "Alta":
                if not added_movement and price < bottom:
                    last_pivot_rally_sec_high_temp = price
                    bottom = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Reação secundária (Fundo)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and last_pivot_reaction_sec_high is not None
                    and price >= bottom + limit
                    and price <= last_pivot_reaction_sec_high
                ):
                    # rally secundário
                    state = "rally_secundario"
                    top = price
                    last_pivot_rally_sec_high = last_pivot_rally_sec_high_temp
                    last_pivot_reaction_sec_low = None
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Rally secundário (Alta)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and last_pivot_reaction_sec_high is not None
                    and price >= bottom + limit
                    and price >= last_pivot_reaction_sec_high + confirmar
                    and price <= last_pivot_high
                ):
                    #  volta ao rally
                    state = "rally_natural"
                    top = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Rally Natural (retorno)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and last_pivot_high is not None
                    and price >= last_pivot_high + confirmar
                ):
                    state = "tendencia_alta"
                    current_trend = "Alta"
                    last_pivot_high = price
                    top = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Alta (compra)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_rally_high is not None
                    and price <= last_pivot_rally_high - confirmar
                ):
                    state = "tendencia_baixa"
                    current_trend = "Baixa"
                    last_pivot_down = price
                    bottom = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Baixa (venda)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

            elif current_trend == "Baixa":
                # vindo de tendência de baixa
                if not added_movement and price > top:
                    top = price
                    last_pivot_rally_sec_low_temp = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Reação secundária (topo)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_reaction_sec_low is not None
                    and price <= top - limit
                    and price >= last_pivot_reaction_sec_low
                ):
                    #  volta ao rally
                    state = "rally_secundario"
                    bottom = price
                    last_pivot_rally_sec_low = last_pivot_rally_sec_low_temp
                    last_pivot_reaction_sec_high = None
                    current_trend = "Baixa"
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Rally secundário (Baixa)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and last_pivot_reaction_sec_low is not None
                    and price <= top - limit
                    and price <= last_pivot_reaction_sec_low - confirmar
                    and price >= last_pivot_down
                ):
                    #  volta ao rally
                    state = "rally_natural"
                    bottom = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Rally Natural (retorno)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and last_pivot_down is not None
                    and last_pivot_down
                    and price <= last_pivot_down - confirmar
                ):
                    state = "tendencia_baixa"
                    current_trend = "Baixa"
                    last_pivot_down = price
                    bottom = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Baixa (venda)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_rally_low is not None
                    and price >= last_pivot_rally_low + confirmar
                ):
                    state = "tendencia_alta"
                    current_trend = "Alta"
                    last_pivot_high = price
                    top = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Alta (compra)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                    

            # ======== Reação secundária ===========
        elif state == "rally_secundario":
            if current_trend == "Alta":
                if not added_movement and price > top:
                    top = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Rally secundário (Topo)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_reaction_sec_low is not None
                    and price <= top - limit
                    and price >= last_pivot_reaction_sec_high
                ):
                    state = "reacao_secundaria"
                    bottom = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Reação secundária",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                    # retorno do rally secundario para reacao
                elif (
                    not added_movement
                    and last_pivot_reaction_sec_high is not None
                    and price >= last_pivot_reaction_sec_high + confirmar
                    and price <= last_pivot_high
                ):
                    state = "rally_natural"
                    top = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Rally Natural (retorno)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_high is not None
                    and price >= last_pivot_high + confirmar
                ):
                    state = "tendencia_alta"
                    current_trend = "Alta"
                    last_pivot_high = price
                    last_pivot_down = None
                    top = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Alta (compra)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and last_pivot_rally_high is not None
                    and price <= top - limit
                    and price >= last_pivot_rally_high
                ):
                    state = "reacao_secundaria"
                    bottom = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Reação secundária",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and last_pivot_rally_high is not None
                    and price <= last_pivot_rally_high - confirmar
                ):
                    state = "tendencia_baixa"
                    current_trend = "Baixa"
                    bottom = price
                    last_pivot_down = price
                    last_pivot_high = None
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Baixa (venda)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_high is not None
                    and price >= last_pivot_high + confirmar
                ):
                    state = "tendencia_alta"
                    current_trend = "Alta"
                    bottom = price
                    last_pivot_down = price
                    last_pivot_high = None
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Alta (compra)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

            elif current_trend == "Baixa":
                # vindo de tendência de baixa
                if not added_movement and price < bottom:
                    bottom = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Rally secundário (Fundo)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_reaction_sec_low is not None
                    and price >= bottom + limit
                    and price <= last_pivot_reaction_sec_low
                ):
                    state = "reacao_secundaria"
                    top = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Reação secundária (Baixa)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                    # retorno do rally secundario para reacao
                elif (
                    not added_movement
                    and last_pivot_reaction_sec_low is not None
                    and price <= last_pivot_reaction_sec_low - confirmar
                    and price >= last_pivot_down
                ):
                    state = "rally_natural"
                    top = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Rally Natural (retorno)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and last_pivot_reaction_sec_low is not None
                    and price >= last_pivot_down
                    and price <= last_pivot_reaction_sec_low - confirmar
                ):
                    # volta Rally natural
                    state = "rally_natural"
                    bottom = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Rally Natural (Baixa)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

                elif (
                    not added_movement
                    and last_pivot_reaction_sec_low is not None
                    and price >= bottom + limit
                    and price <= last_pivot_rally_low
                ):
                    state = "reacao_secundaria"
                    top = price
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Reação secundária",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                # reverse trendUp
                elif (
                    not added_movement
                    and last_pivot_rally_low is not None
                    and price >= last_pivot_rally_low + confirmar
                ):
                    state = "tendencia_alta"
                    current_trend = "Alta"
                    top = price
                    last_pivot_high = price
                    last_pivot_down = None
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Alta (compra)",
                            "limite": limit,
                        }
                    )
                    added_movement = True
                elif (
                    not added_movement
                    and last_pivot_down is not None
                    and price <= last_pivot_down - confirmar
                ):
                    state = "tendencia_baixa"
                    current_trend = "Baixa"
                    bottom = price
                    last_pivot_down = price
                    last_pivot_high = None
                    reference_point = price
                    movements.append(
                        {
                            "closeTime": tempo,
                            "closePrice": price,
                            "tipo": "Tendência Baixa (venda)",
                            "limite": limit,
                        }
                    )
                    added_movement = True

    # Cria lista de tuplas para bulk insert
    movements_to_save = []

    for p in movements:
        date = p["closeTime"]
        price = p["closePrice"]
        type = p["tipo"]
        atr = p["limite"]

        movements_to_save.append((date, price, type, atr))
        #print(f"✅ Preparando para salvar: {date}, {price}, {type}, ATR: {atr}")
    # Salva todos os dados de uma vez
     
    # devolve também confirmações para o frontend
    return movements 

def trend_clarifications_atr(symbols, time="5m", mode="real"):
    default_symbols = get_stored_symbols()

    if symbols is None or symbols == "":
        symbols_to_process = default_symbols
    elif isinstance(symbols, str):
        symbols_to_process = [
            symbol.strip().upper()
            for symbol in symbols.split(",")
            if symbol.strip()
        ]
    else:
        symbols_to_process = [
            str(symbol).strip().upper()
            for symbol in symbols
            if str(symbol).strip()
        ]

    if not symbols_to_process:
        raise ValueError("Informe pelo menos um símbolo válido.")

    def classify_symbol(index_symbol):
        index, symbol = index_symbol
        movements = _trend_clarifications_atr_single(symbol, time, mode)
        return {
            "index": index,
            "symbol": symbol,
            "movements": movements,
        }

    max_workers = min(len(symbols_to_process), 4)

    if max_workers == 1:
        results = [classify_symbol((0, symbols_to_process[0]))]
    else:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            results = list(executor.map(classify_symbol, enumerate(symbols_to_process)))

    return results