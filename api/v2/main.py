"""
McHR&TA v2 Entry Point
Run with: python api/v2/main.py $PORT
"""
import os, sys

# Bootstrap database on first run
DATABASE_URL = os.environ.get('DATABASE_URL', '')
if DATABASE_URL:
    try:
        from api.v2.models.bootstrap import bootstrap
        bootstrap(DATABASE_URL)
    except Exception as e:
        print(f"[bootstrap] {e}", flush=True)

from api.v2 import create_app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', sys.argv[1] if len(sys.argv) > 1 else 5000))
    print(f"McHR&TA v2.0 starting on port {port}", flush=True)
    app.run(debug=False, port=port, host='0.0.0.0')
