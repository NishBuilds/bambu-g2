#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${BAMBU_G2_REPO_URL:-https://github.com/NishBuilds/bambu-g2.git}"
INSTALL_DIR="${BAMBU_G2_DIR:-$HOME/bambu-g2}"

echo "Bambu G2 bridge bootstrap"
echo "Install directory: $INSTALL_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required. Install git, then rerun this command."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required. Install Python 3, then rerun this command."
  exit 1
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  echo "Updating existing checkout..."
  git -C "$INSTALL_DIR" pull --ff-only
elif [[ -e "$INSTALL_DIR" ]]; then
  echo "$INSTALL_DIR already exists but is not a git checkout."
  echo "Set BAMBU_G2_DIR to another directory or move the existing path."
  exit 1
else
  echo "Cloning Bambu G2..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
scripts/install-linux.sh
