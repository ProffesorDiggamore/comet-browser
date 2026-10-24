#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
#  Flux — liquid-glass modular browser.  Double-click to run.
#  First run installs Electron (one dependency). After that it just opens.
# ─────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1

# Homebrew PATH fixup (Finder launches have a bare PATH)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "Node isn't installed. Get it from https://nodejs.org (LTS) and try again."
  read -r -p "Press return to close." _
  exit 1
fi

if [ ! -d "node_modules/electron" ]; then
  echo "First run — installing dependencies…"
  npm install --ignore-scripts=false --foreground-scripts || npm install || {
    echo "npm install failed. Check your connection and try again."
    read -r -p "Press return to close." _
    exit 1
  }
fi

# Electron's own extractor breaks on this project path ("&" in the folder
# name), so ensure the binary is really there before launching.
if [ ! -f "node_modules/electron/path.txt" ]; then
  echo "Setting up the Electron runtime…"
  node scripts/setup-electron.mjs || {
    echo "Could not set up Electron. See scripts/setup-electron.mjs output above."
    read -r -p "Press return to close." _
    exit 1
  }
fi

echo "Launching Flux…"
exec npm start
