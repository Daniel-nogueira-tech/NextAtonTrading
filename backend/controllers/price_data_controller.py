from utils.klines import get_klines,format_raw_data
from controllers.symbols_controller import get_stored_symbols
from concurrent.futures import ThreadPoolExecutor
from controllers.data_to_simulation_controllers import get_klines_data_simulation



# Função para pegar os dados de preço de um ativo, formatar e retornar
def _get_price_data_single(symbol, mode, time="5m", total=5000):
    try:
        if mode == "simulation":
            klines = get_klines_data_simulation(symbol)
        else:
            klines = get_klines(symbol=symbol, interval=time, total=total)
    except Exception as e:
        print(f"❌ Erro ao buscar dados: {str(e)}")
        return []

    if not klines:
        return []
    
    formatted_data = []
   # Retorna os dados formatados
    if mode == "simulation":
       formatted_data = klines
    else:
       formatted_data = format_raw_data(klines)

    return formatted_data
    

# Função para pegar os dados de preço dos ativos, formatar e retornar
def get_price_data(symbol=None, time="5m", mode="real", total=5000):
    default_symbols = get_stored_symbols()

    if mode not in ["real", "simulation"]:
        raise ValueError("mode deve ser 'real' ou 'simulation'")

    symbols_input = symbol if symbol is not None else symbol

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

    max_workers = min(len(symbols_to_process), 4)

    if max_workers == 1:
        result = _get_price_data_single(
            symbol=symbols_to_process[0],
            mode=mode,
            time=time,
            total=total
        )
        return [{"index": 0, "symbol": symbols_to_process[0], "result": result}]

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = list(executor.map(lambda index_symbol: _get_price_data_single(
            symbol=index_symbol[1],
            mode=mode,
            time=time,
            total=total
        ), enumerate(symbols_to_process)))
    return [{"index": index, "symbol": symbol, "prices": result} for (index, symbol), result in zip(enumerate(symbols_to_process), results)]


