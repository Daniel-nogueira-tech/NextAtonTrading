
from config_db import conectar
import uuid

# Função para adcionar um símbolo à tabela de símbolos
def save_symbols(symbol, name=None, active=True):
    conn = conectar()
    cursor = conn.cursor()

    symbol_id = str(uuid.uuid4())

    cursor.execute("""
        INSERT INTO symbols (id, symbol, name, active)
        VALUES (?, ?, ?, ?)
    """, (symbol_id, symbol, name, active))

    conn.commit()
    conn.close()

# Função para obter todos os símbolos da tabela de símbolos
def get_all_symbols():
    conn = conectar()
    cursor = conn.cursor()
    cursor.execute("SELECT id, symbol, name, active FROM symbols")
    rows = cursor.fetchall()

    if not rows:
        raise ValueError("No symbols found in the database.")
    
    conn.close()

    # transforma cada linha em dicionário
    symbols = [
        {
            "id": row[0],
            "symbol": row[1],
            "name": row[2],
            "active": bool(row[3])  # converte 0/1 para True/False
        }
        for row in rows
    ]
    return symbols

# Função para obter apenas símbolos armazenados
def get_stored_symbols():
    conn = conectar()
    cursor = conn.cursor()
    cursor.execute("SELECT symbol FROM symbols")
    rows = cursor.fetchall()

    if not rows:
        raise ValueError("No active symbols found in the database.")

    conn.close()

    return [row[0] for row in rows]

# Função para remover um símbolo da tabela de símbolos
def delete_symbol(id):
    conn = conectar()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM symbols WHERE id = ?", (id,))
    conn.commit()
    conn.close()

# Função para atualizar o status desativando todos os símbolos e ativando apenas o símbolo escolhido
def set_disabled_symbol(symbol):
    conn = conectar()
    cursor = conn.cursor()

    # Desativa todos
    cursor.execute("UPDATE symbols SET active = 0")

    # Ativa apenas o símbolo escolhido
    cursor.execute("UPDATE symbols SET active = 1 WHERE symbol = ?", (symbol.upper(),))

    conn.commit()
    conn.close()

