from flask import Blueprint, jsonify, request
from controllers.vppr_controller import get_vppr

vppr_bp = Blueprint("vppr", __name__)

@vppr_bp.route("/api/vppr", methods=["GET", "POST"])
def get_vppr_route():
    symbol = request.args.get("symbol ", "BTCUSDT")
    time = request.args.get("time ", "1h")
    modo = request.args.get("modo   ", "real")
    vppr_data = get_vppr(symbol=symbol,time=time, modo=modo)
    return jsonify(vppr_data)   