from flask import Blueprint, jsonify, request
from controllers.data_correlations_controller import index_correlated

data_correlations_bp = Blueprint('correlations', __name__)

@data_correlations_bp.route('/api/data_correlations', methods=['POST','GET'])
def get_data_correlations():
    time = request.args.get('time','15m')
    mode = request.args.get('mode', 'simulation')
    start = request.args.get('start','2022-01')
    end = request.args.get('end','2022-12')

    correlated_indices = index_correlated(
        time=time,
        mode=mode,
        total=10000,
        start=start,
        end=end,
    )

    return jsonify(correlated_indices)
