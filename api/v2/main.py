"""
McHR&TA v2 Entry Point
Railway runs: python api/v2/main.py $PORT
"""
import os, sys

# Add project root to path so 'api' is importable as a package
# __file__ = /app/api/v2/main.py → dirname×2 = /app
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from api.v2 import create_app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', sys.argv[1] if len(sys.argv) > 1 else 5000))
    print(f"McHR&TA v2.0 on port {port} | root={ROOT}", flush=True)
    app.run(debug=False, port=port, host='0.0.0.0')
