from config_db import conectar

def create_table_symbols():
    conn = conectar()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS symbols (
            id TEXT PRIMARY KEY,
            symbol TEXT UNIQUE NOT NULL,
            name TEXT,
            active BOOLEAN
        )
        """
    )
    conn.commit()
    conn.close()
