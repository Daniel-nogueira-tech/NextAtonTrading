from utils.crypto_news_api import get_news_by_coin
from flask import Blueprint, request,jsonify


data_crypto_news_bp = Blueprint('data_crypto_news', __name__)


@data_crypto_news_bp.route('/api/crypto_news_recent', methods=['POST'])
def data_crypto_news():
    data = request.get_json()
    symbol = str(data.get("symbol","")).strip().upper()

    try:
      get_news_by_coin(symbol,limit=10)
    except Exception as e:
        print(f"❌ Erro ao baixar/salvar klines: {str(e)}")
        return jsonify({"erro": str(e)}), 500