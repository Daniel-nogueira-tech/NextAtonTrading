from config_db import conectar
import json

def get_all_symbols():
    conn = conectar()
    cursor = conn.cursor()

    cursor.execute("SELECT all_Symbols FROM all_Symbols WHERE id = ?", (1,))
    result = cursor.fetchone()

    if not result:
        return []
    conn.close()

    symbols = json.loads(result[0])
    return symbols 

  