# Termy

Electron terminal app using React, Tailwind CSS v4, and xterm.js.

## Layout terminology

The carousel layout has two modes (the old name "overview" is **not used anymore**):

- **Tab mode** (`carousel` phase) — full-size terminals displayed side-by-side in a horizontal scroll track. One terminal is focused at a time.
- **Window mode** (`overview` phase) — zoomed-out grid view showing all terminals as thumbnails. Users can click a terminal to zoom back to tab mode.

Transition between modes uses a pinch gesture (Ctrl+Scroll) or keyboard shortcut (Cmd+Shift+Enter).

## UI Zoom

Cmd+=/-/0 scales the entire application via CSS zoom. Window mode card heights are kept constant (grid constants scale inversely with zoom).

## Color system

All text uses white at varying opacities — never Tailwind gray classes (`text-gray-400` etc.) which have a blue tint.

| Tier | Value | Usage |
|------|-------|-------|
| Primary | `rgba(255,255,255, 0.9)` | Active tab, focused elements, selected items |
| Secondary | `rgba(255,255,255, 0.6)` | Focused terminal header, hover states |
| Tertiary | `rgba(255,255,255, 0.35)` | Inactive tabs, terminal headers, status bar, hints |
| Muted | `rgba(255,255,255, 0.2)` | Icons at rest, borders, dividers, close buttons |

Borders and dividers use `rgba(255,255,255, 0.03–0.06)` instead of `border-white/5`.

Background separation uses subtle gradients instead of hard borders:
- Tab bar: `linear-gradient(to bottom, #151515, #111111)` with `box-shadow: 0 1px 0 rgba(255,255,255,0.03)`
- Status bar: `linear-gradient(to top, #151515, #111111)` with `box-shadow: 0 -1px 0 rgba(255,255,255,0.03)`
- Terminal header: `linear-gradient(to bottom, rgba(255,255,255,0.02), transparent)`

Accent colors: `#2DA1FD` for Claude completion indicators, `rgba(217,158,60,0.7)` for model name.

## Building & Installing

Run `./scripts/install.sh` to build, package, sign, and install to `/Applications`. Signing is handled automatically by `osxSign` in `forge.config.ts`.
