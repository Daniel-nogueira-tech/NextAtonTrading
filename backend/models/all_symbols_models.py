from config_db import conectar
import json

def salve_all_symbols(data):
    conn = conectar()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS all_Symbols (
            id INTEGER PRIMARY KEY,
            all_Symbols TEXT
        )
    """)
    # salva direto a lista de candles em JSON
    symbols_json = json.dumps(data, ensure_ascii=False)

    cursor.execute(
        """
    INSERT OR REPLACE INTO all_Symbols (id, all_Symbols)
    VALUES (?, ?)
    """,
    (1, symbols_json)
    )
    conn.commit()
    conn.close()