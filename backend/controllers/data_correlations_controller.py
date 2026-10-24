from controllers.symbols_controller import get_stored_symbols
from utils.klines_correlation import get_binance_data
from controllers.all_symbols_controller import get_all_symbols
from utils.klines import get_klines, format_raw_data
from utils.klines_correlation import get_binance_range
from models.save_correlation_matriz import save_correlated_assets, save_corr_matrix, save_correlated_index
import pandas as pd
from config_db import conectar
import json
from io import StringIO
from concurrent.futures import ThreadPoolExecutor
from utils.klines_correlation import MAX_DOWNLOAD_WORKERS


def data_correlations():
    correlated_assets = {}
    # =========================================================================== #
    # ====|Pegar dados de Binance Info para correlação com os symbols salvos|==== #
    # =========================================================================== #
    symbols_user = get_stored_symbols()   # símbolos preferidos do usuário
    all_symbols = get_all_symbols()       # todos os símbolos salvos no banco

    filtered_symbols = list(dict.fromkeys(
        symbol for symbol in all_symbols if symbol.endswith("USDT")
    ))
    # Garante que os símbolos do usuário também entrem no cálculo, mesmo que
    # não estejam entre os primeiros 20 símbolos retornados pela Binance.
    symbols_to_download = list(dict.fromkeys(
        filtered_symbols[:20] + [
            symbol for symbol in symbols_user if symbol.endswith("USDT")
        ]
    ))


    def download_symbol(symbol):
        try:
            df = get_binance_data(symbol, "1h", 2019, "01")
            return symbol, df
        except Exception as e:
            print(f"Erro ao baixar {symbol}: {e}")
            return symbol, None

    with ThreadPoolExecutor(
        max_workers=max(1, min(MAX_DOWNLOAD_WORKERS, len(symbols_to_download)))
    ) as executor:
        data = {
            symbol: df["close"].astype(float)
            for symbol, df in executor.map(download_symbol, symbols_to_download)
            if df is not None
        }

    # ======================================= #
    # ====|Calcular correlação de pearson|=== #
    # ======================================= #
    # Criar DataFrame com todos os ativos
    df_all = pd.DataFrame(data)

    # Calcular matriz de correlação
    corr_matrix = df_all.corr(method="pearson")

    #salvar matrix de correlação no banco -pendente-
    save_corr_matrix(corr_matrix)

    # ============================================================================= #
    # ====|Pegar os principais ativos que se correlacionam com ativos do usuário|=== #
    # ============================================================================= #
    # Para cada símbolo do usuário, pegar os mais correlacionados
    for sym in symbols_user:
        if sym in corr_matrix.columns:
            # Usa somente ativos diferentes do símbolo e com correlação positiva.
            sorted_corr = corr_matrix[sym].drop(labels=[sym], errors="ignore")
            correlated_assets[sym] = (
                sorted_corr[sorted_corr > 0]
                .sort_values(ascending=False)
                .head(10)
            )
        else:
            correlated_assets[sym] = pd.Series(dtype=float)

    #salvar símbolos de correlação no banco -pendente- 
    save_correlated_assets(correlated_assets)
    return correlated_assets


def _get_index_data(symbol, time, mode, total, start, end):
    if mode == "real":
        raw_data = get_klines(symbol=symbol, interval=time, total=total)
        if not raw_data:
            return None
        return pd.DataFrame(
            raw_data,
            columns=[
                "open_time", "open", "high", "low", "close", "volume",
                "close_time", "quote_volume", "trades", "taker_base",
                "taker_quote", "ignore",
            ],
        )[["open_time", "open", "high", "low", "close", "volume"]]

    if mode == "simulation":
        return get_binance_range(symbol, time, start=start, end=end)

    raise ValueError("mode deve ser 'real' ou 'simulation'")


# RETORNA O INDICE
def index_correlated(time, mode, total=10000, start=None, end=None):
    correlated_assets = get_all_correlated_assets()

    selected_assets = {
        symbol: assets[assets > 0].sort_values(ascending=False).head(10)
        for symbol, assets in correlated_assets.items()
    }
    correlation_index = {symbol: [] for symbol in selected_assets}
    asset_symbols = list(dict.fromkeys(
        asset
        for assets in selected_assets.values()
        for asset in assets.index
    ))
    def download_asset(asset):
        try:
            return asset, _get_index_data(
                asset, time, mode, total, start, end
            )
        except Exception as error:
            print(f"Erro ao baixar dados para o índice de {asset}: {error}")

    with ThreadPoolExecutor(
        max_workers=max(1, min(MAX_DOWNLOAD_WORKERS, len(asset_symbols)))
    ) as executor:
        asset_data = dict(
            result for result in executor.map(download_asset, asset_symbols)
            if result is not None
        )

    prepared_asset_data = {}
    required_columns = {
        "open_time", "open", "high", "low", "close", "volume"
    }
    for asset, df in asset_data.items():
        if df is None or df.empty:
            continue
        if not required_columns.issubset(df.columns):
            raise ValueError(f"Dados incompletos para o ativo {asset}")

        asset_df = df[
            ["open_time", "open", "high", "low", "close", "volume"]
        ].copy()
        asset_df.loc[:, "open_time"] = pd.to_numeric(
            asset_df["open_time"], errors="coerce"
        )
        for column in ["open", "high", "low", "close", "volume"]:
            asset_df.loc[:, column] = pd.to_numeric(
                asset_df[column], errors="coerce"
            )
        asset_df = asset_df.dropna().set_index("open_time")
        prepared_asset_data[asset] = asset_df.add_suffix(f"_{asset}")

    for symbol, assets in selected_assets.items():
        aligned_data = [
            prepared_asset_data[asset]
            for asset in assets.index
            if asset in prepared_asset_data
        ]

        if aligned_data:
            # Usa somente candles existentes para todos os componentes do índice.
            index_data = pd.concat(aligned_data, axis=1, join="inner").dropna()
            open_prices = index_data.filter(regex=r"^open_").sum(axis=1)
            high_prices = index_data.filter(regex=r"^high_").sum(axis=1)
            low_prices = index_data.filter(regex=r"^low_").sum(axis=1)
            close_prices = index_data.filter(regex=r"^close_").sum(axis=1)
            volumes = index_data.filter(regex=r"^volume_").sum(axis=1)
            raw_index_data = zip(
                index_data.index,
                open_prices,
                high_prices,
                low_prices,
                close_prices,
                volumes,
            )
            correlation_index[symbol] = format_raw_data(raw_index_data)

    delete_correlated_index_table()
    save_correlated_index(correlation_index)
    return correlation_index

# pega assets de correlação
def get_all_correlated_assets():
    conn = conectar()
    cursor = conn.cursor()
    cursor.execute("SELECT symbol, assets_json FROM correlated_assets")
    results = cursor.fetchall()
    conn.close()

    if not results:
        return None

    # Monta um dicionário {symbol: Series}
    correlated_assets = {}
    for symbol, assets_json in results:
        correlated_assets[symbol] = pd.read_json(StringIO(assets_json), typ="series")
    
    return correlated_assets

# RECUPERA O INDECE
def get_correlated_index(symbol=None):
    conn = conectar()
    cursor = conn.cursor()

    try:
        if symbol:
            cursor.execute("SELECT index_json FROM correlated_index WHERE symbol = ?", (symbol,))
            result = cursor.fetchone()
            return json.loads(result[0]) if result else None
        else:
            cursor.execute("SELECT symbol, index_json FROM correlated_index")
            results = cursor.fetchall()
            return {sym: json.loads(idx) for sym, idx in results}
    finally:
        conn.close()

# DELETA OS INDICES
def delete_correlated_index_table():
    conn = conectar()
    cursor = conn.cursor()

    # Apaga a tabela se existir
    cursor.execute("DELETE FROM correlated_index")

    conn.commit()
    conn.close()

    print(" 'correlated_index' deletada com sucesso.")