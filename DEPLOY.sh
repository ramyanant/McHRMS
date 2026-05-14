#!/bin/bash
# Run this script from inside your McHRMS repo to deploy all fixes
set -e
echo "Fetching Claude's branch..."
git fetch origin mcraan
echo "Current branch: $(git branch --show-current)"
echo "Resetting to Claude's version..."
git checkout mcraan
git reset --hard origin/mcraan 2>/dev/null || true

# Copy the two fixed files
cp "$(dirname "$0")/api/app.py" api/app.py
cp "$(dirname "$0")/static/index.html" static/index.html

git add api/app.py static/index.html
git commit -m "Deploy all fixes - login, portal, onboarding, projects" --allow-empty
git push origin mcraan
echo "✅ Pushed! Railway will deploy in ~60 seconds."
