from flask import Blueprint, jsonify, request
from controllers.vppr_controller import get_vppr

vppr_bp = Blueprint("vppr", __name__)

@vppr_bp.route("/api/vppr", methods=["GET", "POST"])
def get_vppr_route():
    try:
        symbols = request.args.getlist("symbols")
        if len(symbols) == 1 and "," in symbols[0]:
            symbols = symbols[0]
        elif not symbols:
            symbols = request.args.get("symbol")

        time = request.args.get("time", "15m")
        modo = request.args.get("modo") or request.args.get("mode", "real")
        accumulation_period = request.args.get("accumulation_period", "month") # "week", "month"

        if symbols is not None and not isinstance(symbols, (str, list)):
            raise ValueError("symbols deve ser uma string ou uma lista válida")
        if not time or not isinstance(time, str) or time[-1] not in ["m", "h", "d"]:
            raise ValueError("time deve ser um intervalo válido")
        if modo not in ["real", "simulation"]:
            raise ValueError("modo deve ser 'real' ou 'simulation'")
        if accumulation_period not in ["week", "month"]:
            raise ValueError("accumulation_period deve ser 'week' ou 'month'")

        vppr_data = get_vppr(
            symbols=symbols,
            time=time,
            modo=modo,
            accumulation_period=accumulation_period,
        )

        return jsonify({
            "status": "success",
            "data": vppr_data,
            "symbols": symbols,
            "time": time,
            "modo": modo,
            "accumulation_period": accumulation_period,
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e),
        }), 400
