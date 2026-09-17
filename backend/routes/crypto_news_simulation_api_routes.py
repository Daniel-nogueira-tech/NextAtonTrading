from utils.crypto_news_simulation_api import query_archive_simulation
from flask import Blueprint, request,jsonify


data_crypto_news_simulation_bp = Blueprint('data_crypto_news_simulation_bp', __name__)

@data_crypto_news_simulation_bp.route('/api/crypto_news_simulation', methods=['POST'])
def data_simulation_crypto_news():
    data = request.get_json()

    symbol = str(data.get("symbol","")).strip().upper()
    date_start = data.get("dateStart","").strip().upper()
    date_end = data.get("dateEnd","").strip()


    if not symbol:
        return jsonify({"Error": "The parameters symbol, dateStart, and dateEnd are required."}),400

    try:
        query_archive_simulation(
            symbol,
            date_start,
            date_end,
            limit=200
        )
        return jsonify({"mensagem": f"Data from {symbol} saved successfully!"})
    except Exception as e:
        print(f"❌ Erro ao baixar/salvar klines: {str(e)}")
        return jsonify({"erro": str(e)}), 500