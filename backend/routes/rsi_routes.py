from controllers.rsi_controller import get_rsi
from flask import Blueprint, jsonify, request

rsi_bp = Blueprint('rsi', __name__)

@rsi_bp.route('/api/rsi', methods=['GET', 'POST'])
def rsi_route():
    try:
        symbols = request.args.getlist('symbols')
        if len(symbols) == 1 and ',' in symbols[0]:
            symbols = symbols[0]
        elif not symbols:
            symbols = request.args.get('symbol')

        period = int(request.args.get('period', 14))
        media_period = int(request.args.get('media_period', 6))
        mode = request.args.get('mode', 'real')

        # verificações básicas dos parâmetros
        if symbols is not None and not isinstance(symbols, (str, list)):
            raise ValueError("symbols deve ser uma string ou uma lista válida")
        if not isinstance(period, int) or period <= 0:
            raise ValueError("period deve ser um inteiro positivo")
        if not isinstance(media_period, int) or media_period <= 0:
            raise ValueError("media_period deve ser um inteiro positivo")
        if mode not in ["real", "simulation"]:
            raise ValueError("mode deve ser 'real' ou 'simulation'")    

        rsi_data = get_rsi(
            symbols=symbols,
            period=period,
            media_period=media_period,
            mode=mode,
        )

        return jsonify({
            "status": "success",
            "data": rsi_data,
            "symbols": symbols,
            "period": period,
            "media_period": media_period
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 400
