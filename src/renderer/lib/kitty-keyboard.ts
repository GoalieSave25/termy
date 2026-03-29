export const KITTY_FLAG_DISAMBIGUATE = 1;
export const KITTY_FLAG_REPORT_EVENTS = 2;
export const KITTY_FLAG_REPORT_ALTERNATE = 4;
export const KITTY_FLAG_REPORT_ALL_AS_ESC = 8;
export const KITTY_FLAG_REPORT_TEXT = 16;

export class KittyKeyboardState {
  private stack: number[] = [];

  push(flags: number): void {
    this.stack.push(flags);
  }

  pop(count: number): void {
    const toRemove = Math.min(count, this.stack.length);
    this.stack.length = Math.max(0, this.stack.length - toRemove);
  }

  get activeFlags(): number {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : 0;
  }

  reset(): void {
    this.stack = [];
  }
}

function modifierCode(ev: KeyboardEvent): number {
  return (
    1 +
    (ev.shiftKey ? 1 : 0) +
    (ev.altKey ? 2 : 0) +
    (ev.ctrlKey ? 4 : 0) +
    (ev.metaKey ? 8 : 0)
  );
}

function hasModifier(ev: KeyboardEvent): boolean {
  return ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey;
}

function hasCtrlOrMeta(ev: KeyboardEvent): boolean {
  return ev.ctrlKey || ev.metaKey;
}

/**
 * Encode a keyboard event using the Kitty keyboard protocol (CSI u format).
 * Returns the encoded escape sequence, or null if xterm.js should handle the key normally.
 */
export function encodeKittyKey(event: KeyboardEvent, flags: number): string | null {
  if (!(flags & KITTY_FLAG_DISAMBIGUATE)) return null;

  // On macOS, Cmd (metaKey) combos are reserved for the terminal emulator
  // (copy, paste, new tab, etc.) — never encode them as Kitty sequences.
  if (event.metaKey) return null;

  const key = event.key;
  const mod = modifierCode(event);

  // Special keys — only encode when modifiers are present
  if (hasModifier(event)) {
    switch (key) {
      case 'Enter':
        return `\x1b[13;${mod}u`;
      case 'Tab':
        return `\x1b[9;${mod}u`;
      case 'Backspace':
        return `\x1b[127;${mod}u`;
      case 'Escape':
        return `\x1b[27;${mod}u`;
      case ' ':
        return `\x1b[32;${mod}u`;
    }
  }

  // Letters a-z — only when ctrl or meta is held
  if (key.length === 1 && key >= 'a' && key <= 'z' && hasCtrlOrMeta(event)) {
    return `\x1b[${key.charCodeAt(0)};${mod}u`;
  }

  // Capital letters with ctrl or meta
  if (key.length === 1 && key >= 'A' && key <= 'Z' && hasCtrlOrMeta(event)) {
    const codepoint = key.toLowerCase().charCodeAt(0);
    return `\x1b[${codepoint};${mod}u`;
  }

  // Numbers 0-9 — only when ctrl or meta is held
  if (key.length === 1 && key >= '0' && key <= '9' && hasCtrlOrMeta(event)) {
    return `\x1b[${key.charCodeAt(0)};${mod}u`;
  }

  // F1-F12, arrows, Home, End, PageUp, PageDown — let xterm.js handle
  return null;
}
