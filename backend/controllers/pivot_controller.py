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

def pivots_classification(movements):
    if not movements:
        return []

    pivots = []
    prev_cat = categoria(movements[0]['tipo'])
    prev_dir = direcao(movements[0]['tipo'])
    prev_mov = movements[0]

    for i, mov in enumerate(movements[1:], start=1):
        cat = categoria(mov['tipo'])
        dir = direcao(mov['tipo'])

        # Mudança de regime
        if cat != prev_cat:
            # Regra especial: Rally -> Tendência
            if prev_cat == "Rally" and cat == "Tendência":
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
                        "direcao_para": dir
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
                    "direcao_para": dir
                })

        prev_cat = cat
        prev_dir = dir
        prev_mov = mov

    return pivots
