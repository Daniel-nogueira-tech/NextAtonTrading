from flask import Flask, jsonify, request
from flask_cors import CORS
from routes.trend_clarifications_routes import trend_bp
from routes.rsi_routes import rsi_bp
from routes.vppr_routes import vppr_bp
from models.symbols_models import create_table_symbols
from routes.symbols_routes import symbols_bp
from routes.trend_primary_clarifications_routes import trend_pri_bp
from routes.price_data import price_data_bp
from routes.data_to_simulation_routes import data_simulation_bp

app = Flask(__name__)
CORS(app)  # libera acesso do frontend

#Cria tabelas no banco de dados
create_table_symbols() 

# registra as rotas
app.register_blueprint(trend_bp)
app.register_blueprint(rsi_bp)
app.register_blueprint(vppr_bp)
app.register_blueprint(symbols_bp)
app.register_blueprint(trend_pri_bp)
app.register_blueprint(price_data_bp)
app.register_blueprint(data_simulation_bp)


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