#!/bin/bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="$HOME/Library/Application Support/Termy"
SOURCE_DIR_FILE="$CONFIG_DIR/source-dir"

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "Error: Git is required."; exit 1; }

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  OUT_ARCH="arm64"
elif [ "$ARCH" = "x86_64" ]; then
  OUT_ARCH="x64"
else
  echo "Unsupported architecture: $ARCH"
  exit 1
fi

APP_PATH="$REPO_DIR/out/Termy-darwin-$OUT_ARCH/Termy.app"
SYMLINK_PATH="/Applications/Termy.app"

echo "Installing Termy from $REPO_DIR..."

# Install dependencies
cd "$REPO_DIR"
echo "Installing dependencies..."
npm install

# Package the app
echo "Building Termy.app..."
npm run package

# Verify the .app was created
if [ ! -d "$APP_PATH" ]; then
  echo "Error: Build failed — $APP_PATH not found"
  exit 1
fi

# Create /Applications symlink
if [ -L "$SYMLINK_PATH" ]; then
  rm "$SYMLINK_PATH"
elif [ -d "$SYMLINK_PATH" ]; then
  echo "Warning: $SYMLINK_PATH exists and is not a symlink. Remove it manually to use the symlink."
fi

if [ ! -e "$SYMLINK_PATH" ]; then
  ln -s "$APP_PATH" "$SYMLINK_PATH"
  echo "Linked $SYMLINK_PATH → $APP_PATH"
fi

# Write source directory breadcrumb for auto-updater
mkdir -p "$CONFIG_DIR"
echo "$REPO_DIR" > "$SOURCE_DIR_FILE"

# Clear quarantine attribute
xattr -rd com.apple.quarantine "$APP_PATH" 2>/dev/null || true

echo ""
echo "Termy installed successfully!"
echo "Open it from Spotlight (Cmd+Space → Termy) or run: open /Applications/Termy.app"
