from flask import Blueprint, jsonify
from data_service.data_service import data_service
#from controllers.xgBoost_controller import normalize_data


xgboost_bp = Blueprint("xgboost", __name__)


def normalize_data():
    data_service.add_trend_primary(symbols="ETHUSDT", time="15m", mode="simulation")
    data_service.add_trend(symbols="ETHUSDT", time="15m", mode="simulation")
    data_service.add_vppr(  modo="simulation", symbols="ETHUSDT",time="15m",accumulation_period="month")
    data_service.add_rsi(mode="simulation", symbols="ETHUSDT", period=2, media_period=20)
    data_service.add_price(mode="simulation", symbol="ETHUSDT", time="15m")
    return data_service.indicators_dataframe()


@xgboost_bp.route("/api/xgboost/data", methods=["GET"])
def get_xgboost_data():
    try:
        data = normalize_data()
    except ValueError as error:
        return jsonify({"status": "error", "message": str(error)}), 503

    if data is None or data.empty:
        return jsonify({
            "status": "error",
            "message": "Nenhum dado de simulação disponível. Importe os klines antes de solicitar os dados XGBoost.",
        }), 503

    return jsonify({
        "status": "success",
        "columns": data.columns.tolist(),
        "data": data.to_dict(orient="records"),
    })