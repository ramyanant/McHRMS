#!/usr/bin/env python3
"""
McHR&TA v2 Entry Point
Railway runs this as: python api/run.py $PORT
Working directory is /app, so api/ is a package.
"""
import sys, os

# Ensure /app is on the path so 'api' package is importable
app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if app_dir not in sys.path:
    sys.path.insert(0, app_dir)

from api.v2 import create_app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', sys.argv[1] if len(sys.argv) > 1 else 5000))
    print(f"McHR&TA v2.0 starting on port {port}", flush=True)
    app.run(debug=False, port=port, host='0.0.0.0')
