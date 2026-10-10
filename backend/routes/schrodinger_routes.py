from flask import Blueprint, jsonify, request
from controllers.schrodinger_controller import get_schrodinger
from data_service.data_service import data_service

schrodinger_bp = Blueprint('schrodinger', __name__)

@schrodinger_bp.route('/api/schrodinger', methods=['GET', 'POST'])
def schrodinger_route():
    try:
        symbols = request.args.getlist("symbols")
        if len(symbols) == 1 and "," in symbols[0]:
            symbols = symbols[0]
        elif not symbols:
            symbols = request.args.get("symbol")

        time = request.args.get("time", "15m")
        modo = request.args.get("modo") or request.args.get("mode", "")
        accumulation_period = request.args.get("accumulation_period", "month") # "week", "month", "all"

        if symbols is not None and not isinstance(symbols, (str, list)):
            raise ValueError("symbols deve ser uma string ou uma lista válida")
        if not time or not isinstance(time, str) or time[-1] not in ["m", "h", "d"]:
            raise ValueError("time deve ser um intervalo válido")
        if modo not in ["real", "simulation"]:
            raise ValueError("modo deve ser 'real' ou 'simulation'")
        if accumulation_period not in ["week", "month", "all"]:
            raise ValueError("accumulation_period deve ser 'week', 'month' ou 'all'")

      
        data_schrodinger = data_service.add_Schrodinger(
            symbols=symbols,
            time=time,
            modo=modo,
            accumulation_period=accumulation_period,
        )

        return jsonify(data_schrodinger)
     
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 400