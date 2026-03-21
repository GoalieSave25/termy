/**
 * Terminal backend toggle.
 * Set to true to use ghostty-web (WASM-based), false for xterm.js (default).
 *
 * ghostty-web trade-offs vs xterm.js:
 * - Better VT parsing (Ghostty's native Zig parser compiled to WASM)
 * - Better Unicode/grapheme handling
 * - Canvas-only rendering (no WebGL)
 * - No search addon (SearchBar will be disabled)
 * - No custom OSC handlers (OSC 7 CWD tracking, OSC 133 prompt markers, OSC 7701 Claude status unavailable)
 * - Kitty keyboard protocol handled natively by Ghostty's key encoder
 */
export const USE_GHOSTTY = false;

/**
 * Initialize the terminal backend. Must be called before creating terminals.
 * For xterm.js this is a no-op. For ghostty-web this loads the WASM module.
 */
export async function initTerminalBackend(): Promise<void> {
  if (USE_GHOSTTY) {
    const ghostty = await import('ghostty-web');
    await ghostty.init();
  }
}
