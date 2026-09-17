from config_db import conectar
import json 


# Salva dados recente
def create_cripto_news_recent(symbol,criptoNews):
    conn = conectar()
    cursor = conn.cursor()

    cursor.execute("""
            CREATE TABLE IF NOT EXISTS criptoNews_recent (
            symbol TEXT PRIMARY KEY,
            criptoNews TEXT
        )
    """)

    criptoNews_json = json.dumps(criptoNews, ensure_ascii=False)

    cursor.execute(
        """
        INSERT OR REPLACE INTO criptoNews_recent (symbol, criptoNews)
        VALUES (?, ?)
        """,
        (symbol, criptoNews_json)
    )
    conn.commit()
    conn.close()