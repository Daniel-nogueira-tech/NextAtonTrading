from flask import Blueprint, jsonify, request
from controllers.symbols_controller import get_all_symbols, save_symbols, delete_symbol

symbols_bp = Blueprint("symbols", __name__)

# Rota para obter os símbolos salvos
@symbols_bp.route("/api/get-symbols", methods=["GET"])
def get_symbols_route():
    try:
        symbols = get_all_symbols()
        return jsonify({
            "status": "success",
            "data": symbols,
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e),
        }), 500

# Rota para adicionar um símbolo
@symbols_bp.route("/api/add-symbol", methods=["POST"])
def add_symbol_route():
    try:
        data = request.get_json()

        symbol = data.get("symbol")
        name = data.get("name")
        active = data.get("active", True)

        if not symbol:
            raise ValueError("The 'symbol' field is required.")

        save_symbols(
            symbol=symbol,
            name=name,
            active=active
        )

        return jsonify({
            "status": "success",
            "message": f"Symbol '{symbol}' added successfully.",
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e),
        }), 40
    

# Rota para remover um símbolo
@symbols_bp.route("/api/remove-symbol", methods=["POST"])
def remove_symbol_route():
    try:
        data = request.get_json()
        id = data.get("id")
        print(f"Received request to remove symbol with id: {id}")
        if not id:
            raise ValueError("The 'id' field is required.")
        # Lógica para remover o símbolo usando a função delete_symbol
        delete_symbol(id)

        return jsonify({
            "status": "success",
            "message": f"Symbol '{id}' removed successfully.",
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e),
        }), 400