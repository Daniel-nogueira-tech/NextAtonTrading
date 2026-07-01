from config_db import conectar
import json
from utils.klines import format_raw_data


# Funcao para pegar os dados salvos para simulacao
def get_klines_data_simulation(symbol):
    conn = None
    try:
        conn = conectar()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT klines
            FROM klines_simulation
            WHERE symbol = ?
            """,
            (symbol,),
        )
        row = cursor.fetchone()

        if not row:
            return []

        # Os dados sao salvos como JSON.
        kline_data = json.loads(row[0])

        # No fluxo atual, os dados ja sao salvos formatados por format_raw_data.
        if kline_data and isinstance(kline_data[0], dict):
            return kline_data

        # Mantem compatibilidade caso exista algum registro antigo no formato bruto.
        return format_raw_data(kline_data)

    except Exception as erro:
        print(f"Erro ao buscar dados: {str(erro)}")
        return []
    finally:
        if conn:
            conn.close()


# Funcao para pegar os dados salvos para simulacão
def get_klines_data_simulation_primary(symbol):
    conn = None
    try:
        conn = conectar()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT klines
            FROM klines_simulation_primary
            WHERE symbol = ?
            """,
            (symbol,),
        )
        row = cursor.fetchone()

        if not row:
            return []

        # Os dados sao salvos como JSON.
        kline_data = json.loads(row[0])

        # No fluxo atual, os dados ja sao salvos formatados por format_raw_data.
        if kline_data and isinstance(kline_data[0], dict):
            return kline_data

        # Mantem compatibilidade caso exista algum registro antigo no formato bruto.
        return format_raw_data(kline_data)

    except Exception as erro:
        print(f"Erro ao buscar dados: {str(erro)}")
        return []
    finally:
        if conn:
            conn.close()


# Funcao para remover dados de simulacao
def delete_klines_data_simulation():
    conn = None
    try:
        conn = conectar()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM klines_simulation")
        conn.commit()
    except Exception as erro:
        print(f"Erro ao deletar klines: {erro}")
        raise
    finally:
        if conn:
            conn.close()

# Funcao para remover dados de simulacao
def delete_klines_data_simulation_primary():
    conn = None
    try:
        conn = conectar()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM klines_simulation_primary")
        conn.commit()
    except Exception as erro:
        print(f"Erro ao deletar klines primary: {erro}")
        raise
    finally:
        if conn:
            conn.close()
