#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
#  install-app.sh — builds Comet.app from this folder and installs it in
#  /Applications, so Spotlight, Launchpad and the Dock open it like any
#  Mac app.  Re-run (npm run install-app) after changing the code.
#  The browser was called Flux before v0.8: the bundle id keeps that name so
#  macOS permissions carry over, and an old Flux.app in the same place is
#  replaced.  The data folder (~/Library/Application Support/Comet) is shared
#  with `npm start`, so profiles, tabs and logins carry over.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
VERSION="$(node -p "require('./package.json').version")"
ELECTRON="$ROOT/node_modules/electron/dist/Electron.app"

[ -d "$ELECTRON" ] || node scripts/setup-electron.mjs
[ -f build/comet.icns ] || "$ELECTRON/Contents/MacOS/Electron" scripts/make-icon.js

DEST="${FLUX_DEST:-/Applications}"
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }

# swapping the bundle under a running copy breaks its next tab (helpers vanish mid-run)
if pgrep -f "$DEST/(Comet|Flux).app/Contents/MacOS/" >/dev/null; then
  echo "Comet is open. Quit it (⌘Q, your tabs are saved), then run this again."
  exit 1
fi

# build outside ~/Documents: iCloud re-adds FinderInfo mid-build and breaks codesign
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/comet-build.XXXXXX")"
APP="$STAGE/Comet.app"
echo "Building Comet $VERSION…"
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
     --output-format human-readable-text --errors --output-partial-info-plist "$STAGE/icon.plist" \
     --app-icon AppIcon --include-all-app-icons --enable-on-demand-resources NO --development-region en \
     --target-device mac --minimum-deployment-target 13.0 --platform macosx >/dev/null 2>"$STAGE/actool.log"; then
  LAYERED_ICON=1
else
  echo "  (layered icon skipped: actool unavailable, using build/comet.icns)"
fi

PL="$APP/Contents/Info.plist"
plutil -replace CFBundleName -string "Comet" "$PL"
plutil -replace CFBundleDisplayName -string "Comet" "$PL"
plutil -replace CFBundleIdentifier -string "com.whoslandon.flux" "$PL"   # permanent: macOS permissions hang off it
plutil -replace CFBundleIconFile -string "comet.icns" "$PL"
[ "$LAYERED_ICON" = 1 ] && plutil -replace CFBundleIconName -string "AppIcon" "$PL"
plutil -replace CFBundleShortVersionString -string "$VERSION" "$PL"
plutil -replace CFBundleVersion -string "$VERSION" "$PL"
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

LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
# a previous install goes to the Trash (recoverable), never rm -rf
for prev in "$DEST/Comet.app" "$DEST/Flux.app"; do if [ -e "$prev" ]; then trash "$prev"; fi; done
ditto "$APP" "$DEST/Comet.app"
rm -rf "$STAGE"
# Launch Services follows the old copy into the Trash and keeps listing it, so
# Spotlight shows two copies (one with the old icon).  Forget the trashed ones.
for old in "$HOME"/.Trash/Flux*.app "$HOME"/.Trash/Comet*.app; do [ -e "$old" ] && "$LSREGISTER" -u "$old" 2>/dev/null || true; done

# tell Launch Services + Spotlight about it now, not at the next index pass
touch "$DEST/Comet.app"
"$LSREGISTER" -f "$DEST/Comet.app"
mdimport "$DEST/Comet.app" 2>/dev/null || true
echo "Installed $DEST/Comet.app — open it from Spotlight (⌘Space, “Comet”)."
