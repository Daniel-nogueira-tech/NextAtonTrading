from config_db import conectar
import json 

# Função para salvar dados de 5m
def create_klines_simulation(symbol, klines):
    conn = conectar()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS klines_simulation (
            symbol TEXT PRIMARY KEY,
            klines TEXT
        )
    """)

    # salva direto a lista de candles em JSON
    klines_json = json.dumps(klines, ensure_ascii=False)

    cursor.execute(
        """
        INSERT OR REPLACE INTO klines_simulation (symbol, klines)
        VALUES (?, ?)
        """,
        (symbol, klines_json)
    )
    conn.commit()
    conn.close()

# Função para salvar os dados primários de 1h
def create_klines_simulation_Primary(symbol,klines):
        conn = conectar()
        cursor = conn.cursor()

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS klines_simulation_primary (
               symbol TEXT PRIMARY KEY,
               klines TEXT
            )
            """
        )
        # salva direto a lista de candles em JSON
        klines_json = json.dumps(klines, ensure_ascii=False)

        cursor.execute(
            """
            INSERT OR REPLACE INTO klines_simulation_primary (symbol, klines)
            VALUES (?, ?)
            """,
            (symbol, klines_json)
        )
        conn.commit()
        conn.close()

