from config_db import conectar
import json 


# Salva dados Historicos de meses passados
def create_cripto_news_simulation(symbol,criptoNews):
    conn = conectar()
    cursor = conn.cursor()

    cursor.execute("""
            CREATE TABLE IF NOT EXISTS criptoNews_simulation (
            symbol TEXT PRIMARY KEY,
            criptoNews TEXT
        )
    """)

    criptoNews_json = json.dumps(criptoNews, ensure_ascii=False)

    cursor.execute(
        """
        INSERT OR REPLACE INTO criptoNews_simulation (symbol, criptoNews)
        VALUES (?, ?)
        """,
        (symbol, criptoNews_json)
    )
    conn.commit()
    conn.close()
