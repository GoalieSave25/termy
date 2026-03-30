#!/bin/bash
# Replace the default Electron icon and name for dev mode.
# Runs as a postinstall hook — re-applies automatically after npm install.

ICON_SRC="$(dirname "$0")/../assets/icon.icns"
DIST_DIR="$(dirname "$0")/../node_modules/electron/dist"
ELECTRON_APP="$DIST_DIR/Electron.app"
RENAMED_APP="$DIST_DIR/Termy Dev.app"
PATH_TXT="$(dirname "$0")/../node_modules/electron/path.txt"

# Use whichever exists (fresh install vs already patched)
if [ -d "$RENAMED_APP" ]; then
  APP="$RENAMED_APP"
elif [ -d "$ELECTRON_APP" ]; then
  APP="$ELECTRON_APP"
else
  exit 0
fi

if [ ! -f "$ICON_SRC" ]; then
  exit 0
fi

cp "$ICON_SRC" "$APP/Contents/Resources/electron.icns"

# Set the app name in the menu bar
/usr/libexec/PlistBuddy -c "Set :CFBundleName 'Termy Dev'" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'Termy Dev'" "$APP/Contents/Info.plist"

# Rename the .app bundle so the Dock shows "Termy Dev"
if [ "$APP" != "$RENAMED_APP" ]; then
  mv "$APP" "$RENAMED_APP"
fi

# Update path.txt so electron-forge can find the renamed binary (no trailing newline)
printf 'Termy Dev.app/Contents/MacOS/Electron' > "$PATH_TXT"

touch "$RENAMED_APP"

# Flush the Launch Services cache
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -x "$LSREGISTER" ]; then
  "$LSREGISTER" -f "$RENAMED_APP" 2>/dev/null
fi
