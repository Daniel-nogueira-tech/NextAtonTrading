from flask import Flask, jsonify, request
from flask_cors import CORS
from routes.trend_clarifications_routes import trend_bp
from routes.rsi_routes import rsi_bp
from routes.vppr_routes import vppr_bp
from models.symbols_models import create_table_symbols
from routes.symbols_routes import symbols_bp

app = Flask(__name__)
CORS(app)  # libera acesso do frontend

create_table_symbols()  # cria a tabela de símbolos no banco de dados, se ainda não existir

# registra as rotas
app.register_blueprint(trend_bp)
app.register_blueprint(rsi_bp)
app.register_blueprint(vppr_bp)
app.register_blueprint(symbols_bp)


@app.route('/')
def home():
    return jsonify({"message": "Backend Flask rodando!"})

@app.route('/api/data')
def get_data():
    return jsonify({
        "price": 123.45,
        "status": "ok"
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)