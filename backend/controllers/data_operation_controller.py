
# Função para buscar dados de operações
from config_db import conectar
import json
import ast
import re


def _parse_operations(raw_data):
    """Parse JSON or Python-repr data stored in the operations column."""
    if isinstance(raw_data, bytes):
        raw_data = raw_data.decode("utf-8-sig")

    raw_data = str(raw_data).lstrip("\ufeff").strip()
    raw_data = re.sub(r"^\d+\|", "", raw_data).strip()

    # Some existing rows contain a JSON-encoded string around the payload.
    try:
        decoded_data = json.loads(raw_data)
        if isinstance(decoded_data, str):
            raw_data = decoded_data
        else:
            return decoded_data
    except json.JSONDecodeError:
        pass

    try:
        return json.loads(raw_data)
    except json.JSONDecodeError:
        return ast.literal_eval(raw_data)

def get_operations():
    conn = conectar()
    cursor = conn.cursor()

    cursor.execute("SELECT operations FROM operations WHERE id = ?", (1,))

    result = cursor.fetchone()
    conn.close()

    if result and result[0]:
        try:
            data = _parse_operations(result[0])
            return {
                "signalsBySymbolState": data.get("signalsBySymbolState", {}),
                "resultOperations": data.get("resultOperations", {})
            }
        except (ValueError, SyntaxError, TypeError) as error:
            print(f"Erro ao interpretar operações: {error}")
            return None
    
    return None



