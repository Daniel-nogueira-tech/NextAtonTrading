from controllers.price_data_controller import get_price_data
from flask import Blueprint, jsonify, request

price_data_bp = Blueprint('price_data', __name__)

@price_data_bp.route('/api/price_data', methods=['GET'])
def get_price_data_route():
    mode = request.args.get('mode', '')
    symbol = request.args.get('symbol', '').upper()
    time = request.args.get('time', '5m')
    mode = request.args.get('mode', 'real')

    print("recebido mode:",mode)

    price_data = get_price_data(mode=mode, symbol=symbol, time=time)
    return jsonify(price_data)