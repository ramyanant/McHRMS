#!/usr/bin/env python3
"""McHR&TA v2 Entry Point"""
import sys, os

# Insert project root (/app) at front of path
# __file__ = /app/api/run.py → dirname(dirname) = /app
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

# Now 'api' is importable as a package from /app
from api.v2 import create_app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', sys.argv[1] if len(sys.argv) > 1 else 5000))
    print(f"[startup] McHR&TA v2.0 on port {port} | root={ROOT}", flush=True)
    app.run(debug=False, port=port, host='0.0.0.0')
