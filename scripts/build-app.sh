#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
#  build-app.sh OUT_DIR — builds Comet.app into OUT_DIR from this folder.
#  Shared by install-app.sh (copies it to /Applications) and make-dmg.sh
#  (wraps it in a drag-to-install disk image).  Prints the app's path last.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
OUT="${1:?usage: build-app.sh OUT_DIR}"
VERSION="$(node -p "require('./package.json').version")"
ELECTRON="$ROOT/node_modules/electron/dist/Electron.app"

[ -d "$ELECTRON" ] || node scripts/setup-electron.mjs
[ -f build/comet.icns ] || "$ELECTRON/Contents/MacOS/Electron" scripts/make-icon.js

mkdir -p "$OUT"
APP="$OUT/Comet.app"
rm -rf "$APP"
echo "Building Comet ${VERSION}…" >&2
ditto "$ELECTRON" "$APP"

RES="$APP/Contents/Resources"
rm -f "$RES/default_app.asar" "$RES/electron.icns"
ditto src "$RES/app/src"
cp package.json "$RES/app/package.json"
# production dependencies only (Electron itself is the app shell)
npm ls --omit=dev --parseable --all 2>/dev/null | tail -n +2 | while read -r dep; do
  ditto "$dep" "$RES/app/${dep#"$ROOT"/}"
done
cp build/comet.icns "$RES/comet.icns"
# Icon: build/AppIcon.icon is an Icon Composer file.  actool (ships with Xcode)
# compiles it to Assets.car, so macOS 26+ draws Comet in the same glass / tinted /
# clear styles as every other app.  No Xcode → the flat comet.icns above is used.
LAYERED_ICON=0
if xcrun --find actool >/dev/null 2>&1 && xcrun actool build/AppIcon.icon --compile "$RES" \
     --output-format human-readable-text --errors --output-partial-info-plist "$OUT/icon.plist" \
     --app-icon AppIcon --include-all-app-icons --enable-on-demand-resources NO --development-region en \
     --target-device mac --minimum-deployment-target 13.0 --platform macosx >/dev/null 2>"$OUT/actool.log"; then
  LAYERED_ICON=1
else
  echo "  (layered icon skipped: actool unavailable, using build/comet.icns)" >&2
fi
rm -f "$OUT/icon.plist" "$OUT/actool.log"

PL="$APP/Contents/Info.plist"
plutil -replace CFBundleName -string "Comet" "$PL"
plutil -replace CFBundleDisplayName -string "Comet" "$PL"
plutil -replace CFBundleIdentifier -string "com.whoslandon.flux" "$PL"   # permanent: macOS permissions hang off it
plutil -replace CFBundleIconFile -string "comet.icns" "$PL"
[ "$LAYERED_ICON" = 1 ] && plutil -replace CFBundleIconName -string "AppIcon" "$PL"
plutil -replace CFBundleShortVersionString -string "$VERSION" "$PL"
plutil -replace CFBundleVersion -string "$VERSION" "$PL"
plutil -replace LSMinimumSystemVersion -string "13.0" "$PL"
# lets macOS offer Comet as the default browser and send it links from other apps
plutil -replace CFBundleURLTypes -json '[{"CFBundleURLName":"Web site URL","CFBundleTypeRole":"Viewer","CFBundleURLSchemes":["http","https"]}]' "$PL"
plutil -replace NSCameraUsageDescription -string "Websites you allow can use your camera." "$PL"
plutil -replace NSMicrophoneUsageDescription -string "Websites you allow, and voice input, can use your microphone." "$PL"

xattr -cr "$APP"
codesign --force --deep --sign - "$APP" 2>/dev/null
# The keychain item holding the cookie / password key ("Flux Safe Storage")
# remembers which app may read it by the app's designated requirement.  An
# ad-hoc signature's default one is the exact code hash, so every rebuild
# looked like a new app and macOS asked for the login password again.
# Pin it to the bundle id: after one "Always Allow", rebuilds keep access.
codesign --force --sign - -i com.whoslandon.flux -r='designated => identifier "com.whoslandon.flux"' "$APP"
codesign --verify --deep "$APP"
echo "$APP"
