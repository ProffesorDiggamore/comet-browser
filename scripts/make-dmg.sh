#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
#  make-dmg.sh — builds Comet.app and wraps it in a drag-to-install disk
#  image: dist/Comet-macOS-<arch>.dmg (+ a .sha256 next to it).
#  Run with: npm run dist
#  Needs Python 3 (for dmgbuild, installed once into a private venv).
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
ARCH="$(file node_modules/electron/dist/Electron.app/Contents/MacOS/Electron 2>/dev/null | grep -q arm64 && echo arm64 || echo x64)"
ELECTRON="$ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
# stable name, so github.com/…/releases/latest/download/Comet-macOS-arm64.dmg always works
OUT="$ROOT/dist/Comet-macOS-${ARCH}.dmg"

# dmgbuild lays out the Finder window without AppleScript; keep it in a private venv
VENV="${COMET_DMG_VENV:-$HOME/Library/Caches/comet-dmgbuild}"
if ! "$VENV/bin/python" -c "import dmgbuild" 2>/dev/null; then
  echo "Installing dmgbuild (one time)…"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q dmgbuild
fi

[ -f build/dmg-background.tiff ] || "$ELECTRON" scripts/make-dmg-bg.js

# build outside ~/Documents: iCloud re-adds FinderInfo mid-build and breaks codesign
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/comet-dmg.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
APP="$(bash scripts/build-app.sh "$STAGE" | tail -n 1)"

mkdir -p dist
rm -f "$OUT" "$OUT.sha256"
echo "Packing $(basename "$OUT")…"
"$VENV/bin/dmgbuild" -s scripts/dmg-settings.py -D app="$APP" -D bg="$ROOT/build/dmg-background.tiff" "Comet" "$OUT"
(cd dist && shasum -a 256 "$(basename "$OUT")" > "$(basename "$OUT").sha256")
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
