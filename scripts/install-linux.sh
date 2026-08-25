#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi

.venv/bin/python -m pip install -r bridge/requirements.txt

if [[ ! -f dist/index.html ]]; then
  if command -v npm >/dev/null 2>&1; then
    npm install
    npm run build
  else
    echo "dist/index.html is missing and npm is not installed."
    echo "Install from a release bundle that includes dist/, or install Node.js and rerun this script."
    exit 1
  fi
fi

.venv/bin/python bridge/bambu_g2_bridge.py setup
.venv/bin/python bridge/install_service.py
