from binance.client import Client
from models.data_to_simulation_models import create_klines_simulation,create_klines_simulation_Primary
from controllers.data_to_simulation_controllers import delete_klines_data_simulation
from datetime import datetime, timedelta, timezone
import time
import requests
import zipfile
import io
import csv
from utils.klines import format_raw_data


client = Client()


# --------------------------------------------------
# 📊 1️⃣  Baixar múltiplos anos do ativo primario
# --------------------------------------------------
def download_historical_klines(
    symbol, intervalo, start_year, end_year, date_start=None, date_end=None
):
    all_klines = []
    base_url = "https://data.binance.vision/data/spot/monthly/klines"

    for year in range(start_year, end_year + 1):
        for month in range(1, 13):
            file_name = f"{symbol}-{intervalo}-{year}-{month:02d}.zip"
            url = f"{base_url}/{symbol}/{intervalo}/{file_name}"

            try:
                response = requests.get(url)
                if response.status_code == 200:
                    with zipfile.ZipFile(io.BytesIO(response.content)) as z:
                        csv_name = file_name.replace(".zip", ".csv")
                        with z.open(csv_name) as f:
                            reader = csv.reader(io.TextIOWrapper(f))
                            next(reader, None)  # Pula cabeçalho, se houver
                            klines = [row for row in reader if row]
                            all_klines.extend(klines)
                else:
                    print(f"Arquivo não encontrado: {url}")
            except Exception as e:
                print(f"Erro ao baixar {url}: {e}")
                continue

    # Filtrar por datas, se fornecidas
    if date_start and date_end:
        start_ms = int(
            datetime.strptime(date_start, "%Y-%m-%d")
            .replace(tzinfo=timezone.utc)
            .timestamp()
            * 1000
        )
        end_ms = int(
            datetime.strptime(date_end, "%Y-%m-%d")
            .replace(tzinfo=timezone.utc)
            .timestamp()
            * 1000
        )
        all_klines = [k for k in all_klines if start_ms <= int(k[0]) <= end_ms]

    # Formatar para o mesmo formato da API (11 colunas)
    klines_formatados = [tuple(k[:11]) for k in all_klines if k]
    return klines_formatados

# --------------------------------------------------
# 📊 1️⃣  Guarda no banco de dados do ativo primario
# --------------------------------------------------
def download_and_save_klines(
    symbol, intervalo, date_start=None, date_end=None, days=None, clean_before=True
):
    
    if clean_before:
        if intervalo == "5m":
           delete_klines_data_simulation()
           print("DELETANDO klines",intervalo)
        elif intervalo == "1h":
           print("DELETANDO klines",intervalo)

    all_klines = []

    # Definir período
    if date_start and date_end:
        start_dt = datetime.strptime(date_start, "%Y-%m-%d")
        end_dt = datetime.strptime(date_end, "%Y-%m-%d")
        start_ms = int(start_dt.replace(tzinfo=timezone.utc).timestamp() * 1000)
        end_ms = int(end_dt.replace(tzinfo=timezone.utc).timestamp() * 1000)

        # Se período for longo (> 1 ano), usar dados históricos
        if (end_dt - start_dt).days > 365:
            start_year = start_dt.year
            end_year = end_dt.year
            all_klines = download_historical_klines(
                symbol, intervalo, start_year, end_year, date_start, date_end
            )
            # Complementar com API para dados após o último arquivo mensal
            last_kline_ms = int(all_klines[-1][0]) if all_klines else start_ms
            if last_kline_ms < end_ms:
                while last_kline_ms < end_ms:
                    params = {
                        "symbol": symbol,
                        "interval": intervalo,
                        "startTime": last_kline_ms + 1,
                        "limit": 1000,  # Limite padrão da API é 1000
                    }
                    if end_ms:
                        params["endTime"] = end_ms

                    batch = client.get_klines(**params)
                    if not batch:
                        break
                    all_klines.extend(batch)
                    last_kline_ms = batch[-1][0]
                    time.sleep(0.3)  # Evitar rate limit
        else:
            # Período curto, usar apenas API
            while True:
                params = {
                    "symbol": symbol,
                    "interval": intervalo,
                    "startTime": start_ms,
                    "limit": 1000,
                }
                if end_ms:
                    params["endTime"] = end_ms

                batch = client.get_klines(**params)
                if not batch:
                    break
                all_klines.extend(batch)
                if end_ms and batch[-1][0] >= end_ms:
                    break
                start_ms = batch[-1][0] + 1
                time.sleep(0.3)
    elif days:
        # Lógica para days (usar API)
        start_ms = int(
            (datetime.now(timezone.utc) - timedelta(days=int(days))).timestamp() * 1000
        )
        end_ms = None
        while True:
            params = {
                "symbol": symbol,
                "interval": intervalo,
                "startTime": start_ms,
                "limit": 1000,
            }
            batch = client.get_klines(**params)
            if not batch:
                break
            all_klines.extend(batch)
            start_ms = batch[-1][0] + 1
            time.sleep(0.3)
    else:
        raise ValueError("Você deve passar dias ou date_start/date_end")
    
    # formata os dados
    format_klines = format_raw_data(all_klines)
    #salva os dados
    if intervalo == "5m":
        create_klines_simulation(symbol, format_klines)
    elif intervalo == "1h":
        create_klines_simulation_Primary(symbol, format_klines)