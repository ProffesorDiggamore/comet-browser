# dmgbuild settings for the Comet disk image.  Used by scripts/make-dmg.sh:
#   dmgbuild -s scripts/dmg-settings.py -D app=…/Comet.app -D bg=…/dmg-background.tiff "Comet" out.dmg
# dmgbuild writes the Finder layout (.DS_Store) itself, so no AppleScript /
# Finder automation is needed and the build runs headless.
import os.path

app = defines["app"]  # noqa: F821  (dmgbuild injects `defines`)
background = defines["bg"]  # noqa: F821

format = "ULFO"            # LZFSE: smallest, needs macOS 10.11+
filesystem = "APFS"
files = [app]
symlinks = {"Applications": "/Applications"}
icon_locations = {os.path.basename(app): (170, 190), "Applications": (490, 190)}
badge_icon = None

window_rect = ((200, 160), (660, 400))
default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
icon_size = 112
text_size = 13
arrange_by = None
hide_extensions = [os.path.basename(app)]
