from config_db import conectar
import json 


# Função para salvar dados de operações
def create_operations(payloadOperation):
    conn = conectar()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS operations (
            id INTEGER PRIMARY KEY,
            operations TEXT
        )
    """)

    # salva direto a lista de operações em JSON
    operations_json = json.dumps(payloadOperation, ensure_ascii=False)

    cursor.execute(
        """
        INSERT OR REPLACE INTO operations (id, operations)
        VALUES (?, ?)
        """,
        (1, operations_json)
    )
    conn.commit()
    conn.close()
