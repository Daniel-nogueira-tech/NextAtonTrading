from controllers.trend_clarifications_controllers import trend_clarifications_atr
from flask import Blueprint, jsonify, request

trend_bp = Blueprint('trend', __name__)

@trend_bp.route('/api/trend', methods=['GET','POST'])
def get_trend():

    try:
        symbols = request.args.getlist('symbols')

        if len(symbols) == 1 and ',' in symbols[0]:
            symbols = symbols[0]
        elif not symbols:
            symbols = request.args.get('symbol')

        time = request.args.get('time', '5m')
        mode = request.args.get('mode', 'real')

        # Validações básicas dos parâmetros
        if symbols is not None and not isinstance(symbols, (str, list)):
           return jsonify({"error": "symbols deve ser uma string ou uma lista válida"}), 400
        if not time or not isinstance(time, str) or time[-1] not in ['m', 'h', 'd']:
           return jsonify({"error": "time deve ser um intervalo válido (ex: '1h', '15m', etc.)"}), 400
        if mode not in ["real", "simulation"]:
          return jsonify({"error": "mode deve ser 'real' ou 'simulation'"}), 400

       # Chama a função principal do controller para obter as clarificações de tendência
        result = trend_clarifications_atr(symbols, time, mode)

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500
