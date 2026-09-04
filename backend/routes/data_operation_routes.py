from flask import Blueprint, request,jsonify
from models.data_operations_models import create_operations
from controllers.data_operation_controller import get_operations


data_operation_bp = Blueprint('data_operation', __name__)

@data_operation_bp.route('/api/operations', methods=['POST'])
def data_operation():
    data = request.get_json()
    payloadOperation = str(data.get("operation","")).strip()

    if not payloadOperation:
        return jsonify({"Error": "The parameters operation are required."}),400
    
    try:
        # Salva a operação
        create_operations(payloadOperation)
        return jsonify({"mensagem": f"Operation saved successfully!"})
    except Exception as e:
        print(f"❌ Error saving operation: {str(e)}")
        return jsonify({"erro": str(e)}), 500


@data_operation_bp.route('/api/get-operations', methods=['GET'])
def get_data_operation():
    try:
        operations = get_operations()
        if operations not in [None, {}]:
            return jsonify(operations), 200
    except Exception as e:
        print(f"❌ Error retrieving operations: {str(e)}")
        return jsonify({"erro": str(e)}), 500