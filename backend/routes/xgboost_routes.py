from flask import Blueprint, jsonify
from controllers.xgBoost_controller import normalize_data


xgboost_bp = Blueprint("xgboost", __name__)


@xgboost_bp.route("/api/xgboost/data", methods=["GET"])
def get_xgboost_data():
    data = normalize_data()
    return jsonify({
        "status": "success",
        "columns": data.columns.tolist(),
        "data": data.to_dict(orient="records"),
    })
