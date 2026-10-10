from flask import Blueprint, jsonify, request
from controllers.schrodinger_controller import get_schrodinger
from data_service.data_service import data_service

schrodinger_bp = Blueprint('schrodinger', __name__)

@schrodinger_bp.route('/api/schrodinger', methods=['GET', 'POST'])
def schrodinger_route():
    try:
       
       data_schrodinger = data_service.add_Schrodinger()

       return jsonify(data_schrodinger)
    
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 400