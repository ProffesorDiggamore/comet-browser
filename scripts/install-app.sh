#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
#  install-app.sh — builds Flux.app from this folder and installs it in
#  /Applications, so Spotlight, Launchpad and the Dock open it like any
#  Mac app.  Re-run (npm run install-app) after changing the code.
#  Your data in ~/Library/Application Support/Flux is shared with
#  `npm start`, so profiles, tabs and logins carry over.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
VERSION="$(node -p "require('./package.json').version")"
ELECTRON="$ROOT/node_modules/electron/dist/Electron.app"

[ -d "$ELECTRON" ] || node scripts/setup-electron.mjs
[ -f build/flux.icns ] || "$ELECTRON/Contents/MacOS/Electron" scripts/make-icon.js

DEST="${FLUX_DEST:-/Applications}"
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }

# build outside ~/Documents: iCloud re-adds FinderInfo mid-build and breaks codesign
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/flux-build.XXXXXX")"
APP="$STAGE/Flux.app"
echo "Building Flux $VERSION…"
ditto "$ELECTRON" "$APP"

RES="$APP/Contents/Resources"
rm -f "$RES/default_app.asar" "$RES/electron.icns"
ditto src "$RES/app/src"
cp package.json "$RES/app/package.json"
# production dependencies only (Electron itself is the app shell)
npm ls --omit=dev --parseable --all 2>/dev/null | tail -n +2 | while read -r dep; do
  ditto "$dep" "$RES/app/${dep#"$ROOT"/}"
done
cp build/flux.icns "$RES/flux.icns"

PL="$APP/Contents/Info.plist"
plutil -replace CFBundleName -string "Flux" "$PL"
plutil -replace CFBundleDisplayName -string "Flux" "$PL"
plutil -replace CFBundleIdentifier -string "com.whoslandon.flux" "$PL"   # permanent: macOS permissions hang off it
plutil -replace CFBundleIconFile -string "flux.icns" "$PL"
plutil -replace CFBundleShortVersionString -string "$VERSION" "$PL"
plutil -replace CFBundleVersion -string "$VERSION" "$PL"
plutil -replace NSCameraUsageDescription -string "Websites you allow can use your camera." "$PL"
plutil -replace NSMicrophoneUsageDescription -string "Websites you allow, and voice input, can use your microphone." "$PL"

xattr -cr "$APP"
codesign --force --deep --sign - "$APP" 2>/dev/null
codesign --verify --deep "$APP"

# a previous install goes to the Trash (recoverable), never rm -rf
if [ -e "$DEST/Flux.app" ]; then trash "$DEST/Flux.app"; fi
ditto "$APP" "$DEST/Flux.app"
rm -rf "$STAGE"

# tell Launch Services + Spotlight about it now, not at the next index pass
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$DEST/Flux.app"
mdimport "$DEST/Flux.app" 2>/dev/null || true
echo "Installed $DEST/Flux.app — open it from Spotlight (⌘Space, “Flux”)."
