# TODO

## Claude Code Completion Indicators

- [x] **Blue pulsing icon on completed Claude terminals** — When Claude Code finishes in a terminal (transitions from active/idle to process exit or Claude session ends), show a pulsing blue dot/icon on that terminal's header/card. Should be visible in both tab mode and window mode.

- [x] **Codex completion detection** — Extend the Claude completion indicator to also work with OpenAI Codex CLI. Codex uses braille spinner characters for loading (same as Claude Code) but does not have a distinct finished icon. Detect Codex completion by the spinner stopping / prompt returning, and show the same blue pulsing dot.

- [ ] **Off-screen completion arrows** — When a terminal with a Claude completion indicator is off-screen (scrolled out of view in tab mode), show a left or right arrow at the edge of the viewport with a blue dot. Clicking the arrow navigates to that terminal. If multiple completed terminals are off-screen in the same direction, show a count or stack the dots.

## Terminal Focus

- [x] **Click-through focus** — When clicking the app from another application, the first click should pass through and focus the specific terminal clicked on, not just activate the window. No second click needed.

## Terminal Titles

- [x] **Update titles for background tabs** — Terminal titles don't update when the terminal is in a non-active tab. Title change events from xterm should be captured and applied regardless of which tab is currently visible.

## Terminal Navigation

- [ ] **Carousel dot hover menu** — Hovering over the carousel pagination dots should reveal a vertical list/popup of all terminals in the tab. The list should be scrollable with vertical scroll for mouse-friendly navigation. Clicking an item navigates to that terminal.

## Terminal Preview

- [x] **Show end of terminal output in previews** — In both the carousel dot hover menu and window mode, terminal thumbnails/previews should be scrolled to the bottom to show the most recent output, not the middle or top of the buffer.

## Terminal Navigation (cont.)

- [x] **Fuzzy finder (Cmd+P)** — Popup that searches across terminal titles, cwd, and recent buffer content. Selecting a result navigates to that terminal and switches tabs if needed.

- [x] **Drag terminals to reorder** — Drag terminal cards in window mode to reorder them. New order persists in tab mode.

- [ ] **Drag terminals between tabs** — Grab a terminal card and drop it onto a different tab in the tab bar to move it there.

- [ ] **Pin terminals** — Pin important terminals to the left of the carousel so they don't get buried. Pinned terminals stay put regardless of scroll position or reordering.

## Layout

- [x] **Maximize single terminal** — Shortcut or double-click terminal header to blow it up to the full window, hiding the carousel. Same shortcut or Escape to return to the previous layout.

## File Links

- [ ] **Click local file paths to open Monaco editor** — When a terminal displays a clickable link to a local file (e.g. `src/foo.ts:42`), clicking it opens a fullscreen Monaco editor overlay with full editing capabilities (save, syntax highlighting, search/replace, minimap, etc.) — essentially VS Code minus LSP. Should support line number navigation from the link. Dismiss with Escape or a close button to return to the terminal.

## Window Mode

- [ ] **Retry shader on WebGL context loss** — If the background shader in window mode loses its WebGL context, detect the loss and automatically retry/reinitialize the shader instead of leaving a blank or broken background.

## Vertical Splits

- [ ] **Vertical row splitting within a tab** — A tab can have multiple vertical rows, each with its own independent carousel and split count. For example: top row has 2 terminals (backend + frontend), bottom row has 4 Claude instances. Each row has its own carousel dots/navigation and visible count. Rows are resizable by dragging the divider between them.
