#!/bin/bash
set -euo pipefail

REPO_DIR="$1"
APP_PID="$2"

ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then OUT_ARCH="arm64"; else OUT_ARCH="x64"; fi
APP_PATH="$REPO_DIR/out/Termy-darwin-$OUT_ARCH/Termy.app"

LOG_DIR="$HOME/Library/Application Support/Termy"
LOG_FILE="$LOG_DIR/update.log"
mkdir -p "$LOG_DIR"

exec > "$LOG_FILE" 2>&1

echo "$(date): Update started"
echo "Repo: $REPO_DIR"
echo "Waiting for PID $APP_PID to exit..."

# Wait for the running app to quit (poll every 0.5s, timeout after 30s)
WAITED=0
while kill -0 "$APP_PID" 2>/dev/null; do
  sleep 0.5
  WAITED=$((WAITED + 1))
  if [ "$WAITED" -ge 60 ]; then
    echo "Error: App did not quit within 30 seconds. Aborting update."
    exit 1
  fi
done

echo "App exited. Pulling latest changes..."

cd "$REPO_DIR"
git pull origin main

echo "Installing dependencies..."
npm install

echo "Building Termy.app..."
npm run package

INSTALL_PATH="/Applications/Termy.app"

# Copy to /Applications
if [ -d "$INSTALL_PATH" ]; then
  rm -rf "$INSTALL_PATH"
fi
cp -R "$APP_PATH" "$INSTALL_PATH"

# Clear quarantine attribute
xattr -rd com.apple.quarantine "$INSTALL_PATH" 2>/dev/null || true

echo "Build complete. Relaunching..."
open "$INSTALL_PATH"

echo "$(date): Update complete"
