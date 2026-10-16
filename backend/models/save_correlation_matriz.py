import json
from config_db import conectar

def save_corr_matrix(corr_matrix):
    conn = conectar()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS correlation_matrix (
            id INTEGER PRIMARY KEY,
            matrix_json TEXT
        )
    """)

    matrix_json = corr_matrix.to_json()

    cursor.execute("""
        INSERT OR REPLACE INTO correlation_matrix (id, matrix_json)
        VALUES (?, ?)
    """, (1, matrix_json))

    conn.commit()
    conn.close()


def save_correlated_assets(correlated_assets):
    conn = conectar()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS correlated_assets (
            symbol TEXT PRIMARY KEY,
            assets_json TEXT
        )
    """)

    for sym, series in correlated_assets.items():
        assets_json = series.to_json()  # pandas Series → JSON
        cursor.execute("""
            INSERT OR REPLACE INTO correlated_assets (symbol, assets_json)
            VALUES (?, ?)
        """, (sym, assets_json))

    conn.commit()
    conn.close()


import json
from config_db import conectar

def save_correlated_index(correlation_index):
    conn = conectar()
    cursor = conn.cursor()

    # Cria tabela se não existir
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS correlated_index (
            symbol TEXT PRIMARY KEY,
            index_json TEXT
        )
    """)

    # Percorre todos os símbolos e salva o índice
    for symbol, index_data in correlation_index.items():
        index_json = json.dumps(index_data, ensure_ascii=False)
        cursor.execute("""
            INSERT OR REPLACE INTO correlated_index (symbol, index_json)
            VALUES (?, ?)
        """, (symbol, index_json))

    conn.commit()
    conn.close()

