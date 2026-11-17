#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
#  install-app.sh — builds Comet.app from this folder and installs it in
#  /Applications, so Spotlight, Launchpad and the Dock open it like any
#  Mac app.  Re-run (npm run install-app) after changing the code.
#  The browser was called Flux before v0.8: the bundle id keeps that name so
#  macOS permissions carry over, and an old Flux.app in the same place is
#  replaced.  The data folder (~/Library/Application Support/Comet) is shared
#  with `npm start`, so profiles, tabs and logins carry over.
#  To make a drag-to-install disk image instead: npm run dist.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="${FLUX_DEST:-/Applications}"
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }

# swapping the bundle under a running copy breaks its next tab (helpers vanish mid-run)
if pgrep -f "$DEST/(Comet|Flux).app/Contents/MacOS/" >/dev/null; then
  echo "Comet is open. Quit it (⌘Q, your tabs are saved), then run this again."
  exit 1
fi

# build outside ~/Documents: iCloud re-adds FinderInfo mid-build and breaks codesign
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/comet-build.XXXXXX")"
APP="$(bash scripts/build-app.sh "$STAGE" | tail -n 1)"

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
