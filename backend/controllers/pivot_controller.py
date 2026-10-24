## encontra pivos
def categoria(tipo: str) -> str:
    if "Tendência" in tipo:
        return "Tendência"
    elif "Reação" in tipo:
        return "Reação"
    elif "Rally" in tipo:
        return "Rally"
    else:
        return "Outro"

def direcao(tipo: str) -> str:
    if "Alta" in tipo or "topo" in tipo:
        return "Alta"
    elif "Baixa" in tipo or "fundo" in tipo:
        return "Baixa"
    else:
        return "Indef"

def calcular_trade(pivot, direcao, limite):
    if direcao == "Alta":
        return {
            "entry": pivot['closePrice'] + (limite / 2),
            "stop": pivot['closePrice'] - (limite / 2),
            "pivot": pivot['closePrice'],
            "type": 'buy'
        }
    elif direcao == "Baixa":
        return {
            "entry": pivot['closePrice'] - (limite / 2),
            "stop": pivot['closePrice'] + (limite / 2),
            "pivot": pivot['closePrice'],
            "type": 'sell'
        }
    else:
        return None
    
def pivots_classification(movements):
    if not movements:
        return []

    pivots = []
    prev_cat = categoria(movements[0]['tipo'])
    prev_dir = direcao(movements[0]['tipo'])
    prev_mov = movements[0]
    limit = movements[0]['limite']

    for i, mov in enumerate(movements[1:], start=1):
        cat = categoria(mov['tipo'])
        dir = direcao(mov['tipo'])

        # Mudança de regime
        if cat != prev_cat:
            trade = calcular_trade(prev_mov, dir, limit)
            # Regra especial: Rally -> Tendência
            if (prev_cat in ["Rally", "Reação"]) and cat == "Tendência":
                pass
                # Só marca se direção mudar
                if prev_dir != dir:
                    pivots.append({
                        "pivot_tipo": prev_mov['tipo'],
                        "pivot_closePrice": prev_mov['closePrice'],
                        "pivot_closeTime": prev_mov['closeTime'],
                        "index": i-1,
                        "from": prev_cat,
                        "to": cat,
                        "direcao_de": prev_dir,
                        "direcao_para": dir,
                         "trade": trade
                    })
            else:
                # Outras mudanças sempre são pivô
                pivots.append({
                    "pivot_tipo": prev_mov['tipo'],
                    "pivot_closePrice": prev_mov['closePrice'],
                    "pivot_closeTime": prev_mov['closeTime'],
                    "index": i-1,
                    "from": prev_cat,
                    "to": cat,
                    "direcao_de": prev_dir,
                    "direcao_para": dir,
                     "trade": trade,
                })

        prev_cat = cat
        prev_dir = dir
        prev_mov = mov

    return pivots
