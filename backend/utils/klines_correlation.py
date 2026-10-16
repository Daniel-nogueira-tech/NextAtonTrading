import io
import time
import zipfile

import pandas as pd
import requests


REQUEST_TIMEOUT = (5, 30)
MAX_RETRIES = 3
session = requests.Session()

def get_binance_data(symbol, interval="1h", year=2020, month="01"):
    url = f"https://data.binance.vision/data/spot/monthly/klines/{symbol}/{interval}/{symbol}-{interval}-{year}-{month}.zip"
    for attempt in range(MAX_RETRIES + 1):
        response = session.get(url, timeout=REQUEST_TIMEOUT)
        if response.status_code == 404:
            return None
        if response.status_code in (418, 429):
            if attempt == MAX_RETRIES:
                response.raise_for_status()
            retry_after = response.headers.get("Retry-After")
            try:
                delay = float(retry_after)
            except (TypeError, ValueError):
                delay = min(2 ** attempt, 30)
            time.sleep(max(delay, 0))
            continue
        if response.status_code >= 500 and attempt < MAX_RETRIES:
            time.sleep(min(2 ** attempt, 30))
            continue

        response.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            csv_file = archive.namelist()[0]
            df = pd.read_csv(archive.open(csv_file), header=None)
        df.columns = [
            "open_time", "open", "high", "low", "close", "volume",
            "close_time", "quote_volume", "trades", "taker_base",
            "taker_quote", "ignore",
        ]
        return df


def get_binance_range(symbol, interval="1h", start="2020-01", end="2020-12"):
    start_year, start_month = map(int, start.split("-"))
    end_year, end_month = map(int, end.split("-"))
    if not 1 <= start_month <= 12 or not 1 <= end_month <= 12:
        raise ValueError("Mês inválido; use o formato YYYY-MM.")
    if (start_year, start_month) > (end_year, end_month):
        raise ValueError("A data inicial deve ser anterior ou igual à data final.")
    
    dfs = []
    y, m = start_year, start_month
    while (y, m) <= (end_year, end_month):
        month_str = f"{m:02d}"
        df = get_binance_data(symbol, interval, y, month_str)
        if df is not None:
            dfs.append(df)
        m += 1
        if m > 12:
            m = 1
            y += 1
    
    return pd.concat(dfs, ignore_index=True) if dfs else None
