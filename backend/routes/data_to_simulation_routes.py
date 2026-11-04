from utils.klines_download_simulation import download_and_save_klines
from flask import Blueprint, request,jsonify

data_simulation_bp = Blueprint('data_simulation', __name__)

@data_simulation_bp.route('/api/simulation', methods=['POST'])
def data_to_simulation():
    data = request.get_json()
    symbol = str(data.get("symbol","")).strip().upper()
    date_start = data.get("dateStart","").strip().upper()
    date_end = data.get("dateEnd","").strip()
    days = data.get("days", "").strip()
    time = data.get("time", "1h").strip()


    if not symbol:
        return jsonify({"Error": "The parameters symbol, dateStart, and dateEnd are required."}),400
    
    days = int(days) if days.isdigit() else None

    try:
        download_and_save_klines(
            symbol,
            time,
            date_start,
            date_end,
            days
        )
        download_and_save_klines(
            symbol,
            time,
            date_start,
            date_end,
            days
        )
        return jsonify({"mensagem": f"Data from {symbol} saved successfully!"})
    except Exception as e:
        print(f"❌ Erro ao baixar/salvar klines: {str(e)}")
        return jsonify({"erro": str(e)}), 500



