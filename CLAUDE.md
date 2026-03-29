# Termy

Electron terminal app using React, Tailwind CSS v4, and xterm.js.

## Layout terminology

The carousel layout has two modes (the old name "overview" is **not used anymore**):

- **Tab mode** (`carousel` phase) — full-size terminals displayed side-by-side in a horizontal scroll track. One terminal is focused at a time.
- **Window mode** (`overview` phase) — zoomed-out grid view showing all terminals as thumbnails. Users can click a terminal to zoom back to tab mode.

Transition between modes uses a pinch gesture (Ctrl+Scroll) or keyboard shortcut (Cmd+Shift+Enter).

## UI Zoom

Cmd+=/-/0 scales the entire application via CSS zoom. Window mode card heights are kept constant (grid constants scale inversely with zoom).

## Building & Installing

Run `./scripts/install.sh` to build, package, sign, and install to `/Applications`. Signing is handled automatically by `osxSign` in `forge.config.ts`.
