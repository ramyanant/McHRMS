"""
McHR&TA v2 Application Factory
Creates and configures the Flask application.
"""
import os
from flask import Flask, jsonify, send_from_directory, make_response
from .config import get_config
from .extensions import get_pg_conn


def create_app(config_override=None):
    """Application factory — creates a configured Flask app."""
    
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    STATIC_DIR = os.path.join(BASE_DIR, 'static')
    
    app = Flask(__name__, static_folder=STATIC_DIR)
    
    # Load config
    cfg = config_override or get_config()
    app.config.from_object(cfg)
    
    # ── Register blueprints ──────────────────────────────────────
    from .blueprints.auth.routes import auth_bp
    app.register_blueprint(auth_bp)
    
    # More blueprints registered here as they're built
    # from .blueprints.organisation.routes import org_bp
    # app.register_blueprint(org_bp)
    # etc.
    
    # ── CORS ────────────────────────────────────────────────────
    @app.after_request
    def cors(response):
        response.headers['Access-Control-Allow-Origin']  = '*'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,X-Auth-Token'
        response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
        return response
    
    @app.route('/api/options', methods=['OPTIONS'])
    @app.route('/api/v1/options', methods=['OPTIONS'])
    def options(): return '', 204
    
    # ── Health check ─────────────────────────────────────────────
    @app.route('/api/v1/health')
    def health():
        try:
            conn = get_pg_conn()
            cur  = conn.cursor()
            cur.execute("SELECT 1")
            conn.close()
            db_ok = True
        except Exception as e:
            db_ok = False
        
        return jsonify({
            "status":  "healthy" if db_ok else "degraded",
            "version": "2.0.0",
            "db":      "connected" if db_ok else "error",
        })
    
    # ── Static file serving with no-cache headers ────────────────
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def catch_all(path):
        if path.startswith('api/'):
            return jsonify({"success": False, "message": "Not found"}), 404
        resp = make_response(send_from_directory(STATIC_DIR, 'index.html'))
        resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        resp.headers['Pragma']  = 'no-cache'
        resp.headers['Expires'] = '0'
        return resp
    
    # ── Global error handlers ────────────────────────────────────
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"success": False, "message": "Not found"}), 404
    
    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"success": False, "message": "Internal server error"}), 500
    
    @app.errorhandler(Exception)
    def handle_exception(e):
        print(f"[ERROR] Unhandled exception: {e}", flush=True)
        import traceback; traceback.print_exc()
        return jsonify({"success": False, "message": str(e)}), 500
    
    return app
