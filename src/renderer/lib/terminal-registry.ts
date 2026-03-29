import { Terminal as XtermTerminal } from '@xterm/xterm';
import { FitAddon as XtermFitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal as GhosttyTerminal, FitAddon as GhosttyFitAddon } from 'ghostty-web';
import { DARK_THEME } from './theme';
import { KittyKeyboardState, encodeKittyKey } from './kitty-keyboard';
import { type PromptTracker, createPromptTracker } from './prompt-markers';
import { USE_GHOSTTY } from './terminal-backend';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTerminal = any;
type AnyFitAddon = { fit(): void; dispose?(): void; proposeDimensions?(): { cols: number; rows: number } | undefined };

interface TerminalEntry {
  terminal: AnyTerminal;
  fitAddon: AnyFitAddon;
  searchAddon: SearchAddon | null;
  serializeAddon: SerializeAddon | null;
  opened: boolean;
  /** Hold back output until the first resize so the shell prompt renders at the correct width */
  ready: boolean;
  /** The DOM element to reparent when moving terminals between containers */
  reparentEl?: HTMLElement;
  /** Extra rows rendered for smooth scroll headroom (subtracted from PTY resize) */
  smoothScrollRows: number;
}

const registry = new Map<string, TerminalEntry>();
const cwdCallbacks = new Map<string, Set<(cwd: string) => void>>();
const titleCallbacks = new Map<string, Set<(title: string) => void>>();
const claudeStatusCallbacks = new Map<string, Set<(data: unknown) => void>>();
const kittyStates = new Map<string, KittyKeyboardState>();
const promptTrackers = new Map<string, PromptTracker>();
let currentFontSize = 13;

// Buffer for output that arrives before a terminal is attached to the registry
const pendingOutput = new Map<string, string[]>();
const pendingExits = new Set<string>();

// Queued restored buffer content to replay when a terminal activates
const restoredContent = new Map<string, string>();

// Regex to match Kitty keyboard protocol CSI sequences in PTY output:
//   CSI > flags u  (push)    CSI < count u  (pop)    CSI ? u  (query)
const KITTY_CSI_RE = /\x1b\[([>?<])(\d*)u/g;

/**
 * Scan PTY output for Kitty keyboard protocol sequences and update state.
 * ghostty-web processes these internally but doesn't expose the state to its
 * KeyEncoder, so we track it ourselves for the custom key event handler.
 */
function scanKittySequences(data: string, state: KittyKeyboardState, sessionId: string): void {
  KITTY_CSI_RE.lastIndex = 0;
  let match;
  while ((match = KITTY_CSI_RE.exec(data)) !== null) {
    const prefix = match[1];
    const param = match[2] ? parseInt(match[2], 10) : 0;
    switch (prefix) {
      case '>':
        state.push(param);
        break;
      case '<':
        state.pop(param || 1);
        break;
      case '?':
        window.termyApi.pty.sendInput(sessionId, `\x1b[?${state.activeFlags}u`);
        break;
    }
  }
}

// Global IPC dispatchers — registered once, route by sessionId via registry Map
let globalListenersRegistered = false;
function registerGlobalListeners() {
  if (globalListenersRegistered) return;
  globalListenersRegistered = true;

  window.termyApi.pty.onOutput((msg) => {
    // Track Kitty keyboard protocol state for ghostty-web sessions
    const kittyState = kittyStates.get(msg.sessionId);
    if (kittyState) scanKittySequences(msg.data, kittyState, msg.sessionId);

    const entry = registry.get(msg.sessionId);
    if (entry && entry.ready) {
      entry.terminal.write(msg.data);
    } else {
      // Terminal not ready or not attached yet — buffer for replay
      let buf = pendingOutput.get(msg.sessionId);
      if (!buf) { buf = []; pendingOutput.set(msg.sessionId, buf); }
      buf.push(msg.data);
    }
  });

  window.termyApi.pty.onExit((msg) => {
    console.error(`[PTY_EXIT] session=${msg.sessionId} exitCode=${msg.exitCode} signal=${msg.signal ?? 'none'} inRegistry=${registry.has(msg.sessionId)}`);
    const entry = registry.get(msg.sessionId);
    if (entry) {
      entry.terminal.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
    } else {
      pendingExits.add(msg.sessionId);
    }
  });
}

/**
 * Get or create a Terminal for a given sessionId.
 * If the terminal already exists, reparents its DOM element into the container.
 * If it doesn't exist, creates a new one and opens it in the container.
 */
export function attachTerminal(sessionId: string, container: HTMLDivElement): TerminalEntry {
  registerGlobalListeners();
  let entry = registry.get(sessionId);

  if (entry) {
    // Terminal already exists — reparent its DOM element into new container.
    // xterm.js: terminal.element is a child wrapper div — reparent it directly.
    // ghostty-web: terminal.element may point to the container itself, so we
    //   use the inner wrapper div stored in reparentEl instead.
    const el = entry.reparentEl ?? entry.terminal.element;
    if (el && el.parentElement !== container) {
      while (container.firstChild) container.removeChild(container.firstChild);
      container.appendChild(el);
    }
    // Re-fit after reparenting
    requestAnimationFrame(() => {
      try {
        entry!.fitAddon.fit();
      } catch {
        // ignore
      }
    });
    return entry;
  }

  // Create terminal and addons based on active backend
  let terminal: AnyTerminal;
  let fitAddon: AnyFitAddon;
  let searchAddon: SearchAddon | null = null;
  let serializeAddon: SerializeAddon | null = null;
  let reparentEl: HTMLElement | undefined;

  if (USE_GHOSTTY) {
    // --- ghostty-web backend ---
    try {
      terminal = new GhosttyTerminal({
        theme: DARK_THEME,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: currentFontSize,
        cursorBlink: true,
        cursorStyle: 'bar',
      });

      fitAddon = new GhosttyFitAddon();
      terminal.loadAddon(fitAddon);

      // ghostty-web's WASM VT parser handles Kitty keyboard protocol internally
      // but never propagates the state to its KeyEncoder. Track it ourselves
      // by scanning PTY output (see scanKittySequences) so the custom key
      // handler can encode modified keys correctly.
      const kittyState = new KittyKeyboardState();
      kittyStates.set(sessionId, kittyState);

      // ghostty-web fires onTitleChange for OSC 0/2 natively
      terminal.onTitleChange((title: string) => {
        const cbs = titleCallbacks.get(sessionId);
        if (cbs) for (const cb of cbs) cb(title);
      });

      // Note: OSC 7 (CWD), OSC 133 (prompt markers), OSC 7701 (Claude status)
      // are not available with ghostty-web — it doesn't expose custom OSC handlers

      // Wrap in an inner div so we can reparent it later
      // (ghostty-web sets terminal.element = the container passed to open())
      const inner = document.createElement('div');
      inner.style.width = '100%';
      inner.style.height = '100%';
      inner.style.overflow = 'hidden';
      container.appendChild(inner);

      reparentEl = inner;
      terminal.open(inner);
      // Don't fit() here — container may not have final dimensions yet.
      // The ResizeObserver in useTerminal will do the first fit after layout settles.

      // URL click handler — ghostty-web has no WebLinksAddon, so detect URLs
      // in the terminal buffer when the user clicks and open them.
      let mouseDownPos: { x: number; y: number } | null = null;
      inner.addEventListener('mousedown', (e: MouseEvent) => {
        mouseDownPos = { x: e.clientX, y: e.clientY };
      }, true);
      inner.addEventListener('click', (e: MouseEvent) => {
        // Only treat as a click if the mouse didn't move (not a drag/selection)
        if (!mouseDownPos) return;
        const dx = e.clientX - mouseDownPos.x;
        const dy = e.clientY - mouseDownPos.y;
        if (dx * dx + dy * dy > 9) return; // moved more than 3px = drag

        const rect = inner.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const cellWidth = rect.width / terminal.cols;
        const cellHeight = rect.height / terminal.rows;
        const col = Math.floor(x / cellWidth);
        const row = Math.floor(y / cellHeight);

        const buffer = terminal.buffer.active;
        const bufferRow = buffer.viewportY + row;
        const line = buffer.getLine(bufferRow);
        if (!line) return;
        const text = line.translateToString(false);

        // Find URL at clicked column
        const urlRe = /https?:\/\/[^\s<>"'`),;}\]]+/g;
        let match;
        while ((match = urlRe.exec(text)) !== null) {
          if (col >= match.index && col < match.index + match[0].length) {
            window.termyApi.shell.openExternal(match[0]);
            return;
          }
        }
      }, true);

      // Patch focus() to prevent browser auto-scrolling ancestor elements.
      // ghostty-web calls this.element.focus() without { preventScroll: true },
      // which causes the browser to scroll the carousel container.
      const origFocus = terminal.focus.bind(terminal);
      terminal.focus = () => {
        origFocus();
        // Reset any ancestor scroll that the browser applied
        let el: HTMLElement | null = inner;
        while (el) {
          if (el.scrollLeft !== 0) el.scrollLeft = 0;
          if (el.scrollTop !== 0) el.scrollTop = 0;
          el = el.parentElement;
        }
      };

      // ghostty-web doesn't check e.defaultPrevented, so app shortcuts
      // (Cmd+J/L etc.) leak into the terminal. Block already-handled keys.
      // ghostty convention: return true = "I handled it, stop processing"
      terminal.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
        if (ev.defaultPrevented) return true;
        if (ev.type !== 'keydown') return false;

        // When Kitty keyboard protocol is active, encode modified keys
        // using CSI u format. ghostty-web's fast-path sends wrong sequences
        // for Shift+key combos (e.g. \t instead of \x1b[9;2u for Shift+Tab).
        if (kittyState.activeFlags !== 0) {
          const encoded = encodeKittyKey(ev, kittyState.activeFlags);
          if (encoded !== null) {
            window.termyApi.pty.sendInput(sessionId, encoded);
            return true;
          }
        }

        // Without Kitty: ghostty-web sends plain \t for Shift+Tab instead
        // of the standard reverse-tab sequence \x1b[Z — fix it.
        if (ev.key === 'Tab' && ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
          window.termyApi.pty.sendInput(sessionId, '\x1b[Z');
          return true;
        }

        return false;
      });

      // Wire up IPC input — output/exit handled by global dispatcher
      // Also reset cursor blink on input so cursor stays solid while typing
      const renderer = terminal.renderer;
      terminal.onData((data: string) => {
        window.termyApi.pty.sendInput(sessionId, data);
        if (renderer?.cursorBlink) {
          renderer.stopCursorBlink();
          renderer.startCursorBlink();
        }
      });
    } catch (err) {
      console.error(`[GHOSTTY] failed to create terminal session=${sessionId}:`, err);
      throw err;
    }
  } else {
    // --- xterm.js backend ---
    terminal = new XtermTerminal({
      theme: DARK_THEME,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: currentFontSize,
      lineHeight: 1.2,
      scrollback: 10_000,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
      macOptionIsMeta: true,
      linkHandler: {
        activate(_event: MouseEvent, text: string) {
          window.termyApi.shell.openExternal(text);
        },
      },
    });

    const xtermFit = new XtermFitAddon();
    searchAddon = new SearchAddon();
    serializeAddon = new SerializeAddon();
    fitAddon = xtermFit;
    terminal.loadAddon(xtermFit);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(serializeAddon);
    terminal.loadAddon(new WebLinksAddon((_event, uri) => {
      window.termyApi.shell.openExternal(uri);
    }));

    // Kitty keyboard protocol support
    // xterm.js tracks state via registerCsiHandler (not the global scanner),
    // so we keep kittyState local — no kittyStates.set() to avoid double-processing.
    const kittyState = new KittyKeyboardState();

    terminal.parser.registerCsiHandler(
      { prefix: '>', final: 'u' },
      (params: number[]) => {
        const flags = params.length > 0 ? (params[0] as number) : 0;
        kittyState.push(flags);
        return true;
      }
    );

    terminal.parser.registerCsiHandler(
      { prefix: '<', final: 'u' },
      (params: number[]) => {
        const count = params.length > 0 ? (params[0] as number) : 1;
        kittyState.pop(count || 1);
        return true;
      }
    );

    terminal.parser.registerCsiHandler(
      { prefix: '?', final: 'u' },
      () => {
        const response = `\x1b[?${kittyState.activeFlags}u`;
        window.termyApi.pty.sendInput(sessionId, response);
        return true;
      }
    );

    terminal.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      if (kittyState.activeFlags === 0) return true;
      if (ev.type !== 'keydown') return true;

      const encoded = encodeKittyKey(ev, kittyState.activeFlags);
      if (encoded !== null) {
        window.termyApi.pty.sendInput(sessionId, encoded);
        return false;
      }
      return true;
    });

    // Register OSC 7 handler for CWD tracking
    terminal.parser.registerOscHandler(7, (data: string) => {
      try {
        const url = new URL(data);
        const cbs = cwdCallbacks.get(sessionId);
        if (cbs) for (const cb of cbs) cb(decodeURIComponent(url.pathname));
      } catch {
        if (data.startsWith('/')) {
          const cbs = cwdCallbacks.get(sessionId);
          if (cbs) for (const cb of cbs) cb(data);
        }
      }
      return true;
    });

    // OSC 7701 — Termy custom: Claude Code status line data
    terminal.parser.registerOscHandler(7701, (data: string) => {
      try {
        const status = JSON.parse(data);
        const cbs = claudeStatusCallbacks.get(sessionId);
        if (cbs) for (const cb of cbs) cb(status);
      } catch {
        // ignore malformed data
      }
      return true;
    });

    // Listen for OSC 0/2 title changes (set by Claude Code, vim, ssh, etc.)
    terminal.onTitleChange((title: string) => {
      const cbs = titleCallbacks.get(sessionId);
      if (cbs) for (const cb of cbs) cb(title);
    });

    // OSC 133 — semantic prompt markers (shell integration)
    const promptTracker = createPromptTracker();
    promptTrackers.set(sessionId, promptTracker);

    terminal.parser.registerOscHandler(133, (data: string) => {
      const parts = data.split(';');
      const cmd = parts[0];

      if (cmd === 'A') {
        const marker = terminal.registerMarker(0);
        if (marker) {
          promptTracker.current = { promptStart: marker, commandStart: null, outputEnd: null };
        }
      } else if (cmd === 'C') {
        if (promptTracker.current) {
          const marker = terminal.registerMarker(0);
          if (marker) {
            promptTracker.current.commandStart = marker;
          }
        }
      } else if (cmd === 'D') {
        if (promptTracker.current) {
          const marker = terminal.registerMarker(0);
          if (marker) {
            promptTracker.current.outputEnd = marker;
            if (parts.length > 1) {
              const code = parseInt(parts[1], 10);
              if (!isNaN(code)) promptTracker.current.exitCode = code;
            }
            promptTracker.regions.push(promptTracker.current);
            promptTracker.current = null;
          }
        }
      }
      return true;
    });

    terminal.open(container);

    // Try WebGL renderer
    try {
      terminal.loadAddon(new WebglAddon());
    } catch {
      // Canvas fallback is fine
    }

    // Sub-pixel smooth scrolling setup: render N+1 rows so the trailing
    // edge has content to reveal during fractional-line CSS transforms.
    // The scroll region is pinned to the first N rows so the shell cursor
    // never lands on the headroom row. The PTY is told N rows via resizePty.
    container.style.overflow = 'hidden';

    function getCellHeight(): number {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (terminal as any)._core._renderService.dimensions.css.cell.height;
      } catch {
        return currentFontSize * 1.2;
      }
    }

    function pinScrollRegion(): void {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const buffer = (terminal as any)._core._bufferService.buffer;
        // Restrict scroll region to first N rows (0-indexed: 0 to rows-2).
        // Row rows-1 is headroom only — the shell never scrolls into it.
        buffer.scrollBottom = terminal.rows - 2;
      } catch {
        // Internal API unavailable — degrade gracefully
      }
    }

    // Patch fit to render 1 extra row for smooth scroll headroom
    const origFit = xtermFit.fit.bind(xtermFit);
    xtermFit.fit = () => {
      // Skip if the final dimensions (with headroom) would be unchanged.
      // Without this guard, origFit() always sees N+1 rows vs proposed N rows
      // and triggers a clear() + resize(N) → resize(N+1) bounce that can
      // flash the WebGL canvas blank for one compositing frame.
      const proposed = xtermFit.proposeDimensions?.();
      if (proposed && proposed.cols === terminal.cols && proposed.rows + 1 === terminal.rows) {
        return;
      }
      (terminal.element as HTMLElement).style.height = '';
      origFit();
      const ch = getCellHeight();
      (terminal.element as HTMLElement).style.height =
        `${(terminal.element as HTMLElement).offsetHeight + ch}px`;
      terminal.resize(terminal.cols, terminal.rows + 1);
      pinScrollRegion();
    };

    fitAddon.fit();

    {
      const screen = (terminal.element as HTMLElement)?.querySelector('.xterm-screen') as HTMLElement | null;
      if (screen) {
        let accum = 0;
        let pendingScrollLines = false;
        let lastWheelTime = 0;

        screen.style.willChange = 'transform';

        (terminal.element as HTMLElement).addEventListener('wheel', (e: WheelEvent) => {
          e.preventDefault();
          e.stopPropagation();

          lastWheelTime = Date.now();
          const cellHeight = getCellHeight();

          // Normalize deltaY to pixels
          let dy = e.deltaY;
          if (e.deltaMode === 1) dy *= cellHeight;
          else if (e.deltaMode === 2) dy *= cellHeight * terminal.rows;

          const buf = terminal.buffer.active;

          // At the top boundary scrolling up: block
          if (dy < 0 && buf.viewportY === 0 && accum <= 0) {
            accum = 0;
            pendingScrollLines = false;
            screen.style.transform = '';
            return;
          }
          // At the bottom boundary scrolling down: block
          if (dy > 0 && buf.viewportY >= buf.baseY) {
            accum = 0;
            pendingScrollLines = false;
            screen.style.transform = '';
            return;
          }

          accum += dy;

          // Scroll whole lines
          const lines = Math.trunc(accum / cellHeight);
          if (lines !== 0) {
            const viewportBefore = buf.viewportY;
            terminal.scrollLines(lines);
            const viewportAfter = terminal.buffer.active.viewportY;
            const scrolledLines = viewportAfter - viewportBefore;
            accum -= scrolledLines * cellHeight;
            if (scrolledLines !== lines) {
              accum = 0;
            }
            // Freeze CSS — the old canvas + old CSS are consistent.
            // onRender will sync once the canvas catches up.
            pendingScrollLines = true;
          }

          // Clamp at boundaries
          if (terminal.buffer.active.viewportY === 0) {
            accum = Math.max(accum, 0);
          }

          // Only update CSS when no scrollLines is pending — sub-line
          // movements are safe since the canvas hasn't changed.
          if (!pendingScrollLines) {
            screen.style.transform = accum !== 0 ? `translateY(${-accum}px)` : '';
          }
        }, { passive: false, capture: true });

        // After canvas paints, sync CSS with the new viewport.
        terminal.onRender(() => {
          if (!pendingScrollLines) return;
          pendingScrollLines = false;
          screen.style.transform = accum !== 0 ? `translateY(${-accum}px)` : '';
        });

        // Reset transform on programmatic scrolls (new output, scrollToBottom, etc.)
        terminal.onScroll(() => {
          if (Date.now() - lastWheelTime < 150) return;
          if (accum !== 0 || pendingScrollLines) {
            accum = 0;
            pendingScrollLines = false;
            screen.style.transform = '';
          }
        });

        // Failsafe: after wheel activity settles, ensure no residual transform remains
        // when the viewport is at the bottom.
        (terminal.element as HTMLElement).addEventListener('wheel', () => {
          setTimeout(() => {
            const b = terminal.buffer.active;
            if (b.viewportY >= b.baseY && accum !== 0) {
              accum = 0;
              pendingScrollLines = false;
              screen.style.transform = '';
            }
          }, 200);
        }, { passive: true });
      }
    }

    // Wire up IPC input — output/exit handled by global dispatcher
    terminal.onData((data: string) => {
      window.termyApi.pty.sendInput(sessionId, data);
    });
  }

  entry = { terminal, fitAddon, searchAddon, serializeAddon, opened: true, ready: false, reparentEl, smoothScrollRows: USE_GHOSTTY ? 0 : 1 };
  registry.set(sessionId, entry);

  // Don't replay pending output here — wait for activateTerminal() after
  // the first resize so the shell prompt renders at the correct dimensions.

  return entry;
}

/**
 * Mark a terminal as ready for live output.
 * Discards any output buffered before the first resize — it was rendered at
 * the default 80x24 dimensions (e.g. zsh PROMPT_SP spaces that would wrap at
 * the actual width). The shell redraws its prompt after the SIGWINCH triggered
 * by the pty.resize() that accompanies activation.
 */
export function activateTerminal(sessionId: string): void {
  const entry = registry.get(sessionId);
  if (!entry || entry.ready) return;
  entry.ready = true;

  // Write restored buffer content before any new output
  const restored = restoredContent.get(sessionId);
  if (restored) {
    entry.terminal.write(restored);
    restoredContent.delete(sessionId);
  }

  // Drop stale output drawn at wrong dimensions
  pendingOutput.delete(sessionId);

  if (pendingExits.has(sessionId)) {
    entry.terminal.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
    pendingExits.delete(sessionId);
  }
}

/**
 * Dispose a terminal and clean up all resources.
 * Only call when the session is being permanently destroyed.
 */
export function disposeTerminal(sessionId: string): void {
  const entry = registry.get(sessionId);
  if (!entry) return;
  entry.terminal.dispose();
  registry.delete(sessionId);
  kittyStates.delete(sessionId);
  cwdCallbacks.delete(sessionId);
  titleCallbacks.delete(sessionId);
  claudeStatusCallbacks.delete(sessionId);
  promptTrackers.delete(sessionId);
  pendingOutput.delete(sessionId);
  pendingExits.delete(sessionId);
  searchCursors.delete(sessionId);
}


/**
 * Resize the PTY for a session, subtracting smooth scroll headroom rows
 * so the shell sees the correct terminal size.
 */
export function resizePty(sessionId: string, cols: number, rows: number): Promise<void> {
  const entry = registry.get(sessionId);
  const extra = entry?.smoothScrollRows ?? 0;
  return window.termyApi.pty.resize({ sessionId, cols, rows: rows - extra });
}

/**
 * Fit a terminal to its container. No-op if terminal doesn't exist.
 */
export function fitTerminal(sessionId: string): void {
  const entry = registry.get(sessionId);
  if (!entry) return;
  try {
    const prevCols = entry.terminal.cols;
    const prevRows = entry.terminal.rows;
    entry.fitAddon.fit();
    const { cols, rows } = entry.terminal;
    if (cols !== prevCols || rows !== prevRows) {
      console.trace(`[RESIZE] fitTerminal: ${prevCols}x${prevRows} → ${cols}x${rows} (session=${sessionId})`);
    }
  } catch {
    // ignore
  }
}

/**
 * Get the Terminal instance for a session.
 */
export function getTerminalEntry(sessionId: string): TerminalEntry | undefined {
  return registry.get(sessionId);
}

/**
 * Enable or disable cursor blinking for a terminal.
 * Only the focused terminal should blink; unfocused terminals show a static cursor.
 */
export function setTerminalCursorBlink(sessionId: string, focused: boolean): void {
  const entry = registry.get(sessionId);
  if (!entry) return;
  if (USE_GHOSTTY) {
    const renderer = entry.terminal.renderer;
    if (!renderer) return;
    if (focused) {
      renderer.cursorVisible = true;
      renderer.setCursorBlink(true);
    } else {
      renderer.stopCursorBlink();
      renderer.cursorVisible = false;
    }
    // ghostty-web doesn't send focus reporting sequences (DEC 1004).
    // Programs like Claude Code use these to show/hide their TUI cursor.
    if (entry.terminal.hasFocusEvents?.()) {
      window.termyApi.pty.sendInput(sessionId, focused ? '\x1b[I' : '\x1b[O');
    }
  } else {
    entry.terminal.options.cursorBlink = focused;
    if (!focused) {
      entry.terminal.options.cursorStyle = 'bar';
      entry.terminal.options.cursorInactiveStyle = 'none';
    } else {
      entry.terminal.options.cursorStyle = 'bar';
      entry.terminal.options.cursorInactiveStyle = 'bar';
    }
  }
}

// Per-session search cursor for buffer-based find
const searchCursors = new Map<string, { line: number; col: number }>();

/**
 * Search terminal buffer for a query string.
 * Uses xterm SearchAddon when available, falls back to buffer scanning + select().
 * Returns true if a match was found.
 */
export function searchTerminal(sessionId: string, query: string, direction: 'next' | 'previous'): boolean {
  const entry = registry.get(sessionId);
  if (!entry || !query) return false;

  // Use xterm SearchAddon if available
  if (entry.searchAddon) {
    if (direction === 'next') {
      return entry.searchAddon.findNext(query);
    } else {
      return entry.searchAddon.findPrevious(query);
    }
  }

  // Buffer-based search fallback (works with any backend)
  const terminal = entry.terminal;
  const buffer = terminal.buffer.active;
  const totalLines = buffer.length;
  const cursor = searchCursors.get(sessionId) ?? { line: buffer.baseY + buffer.cursorY, col: 0 };
  const lowerQuery = query.toLowerCase();

  const step = direction === 'next' ? 1 : -1;
  let startLine = cursor.line;
  let startCol = direction === 'next' ? cursor.col + 1 : cursor.col - 1;

  for (let i = 0; i < totalLines; i++) {
    const lineIdx = ((startLine + i * step) % totalLines + totalLines) % totalLines;
    const bufLine = buffer.getLine(lineIdx);
    if (!bufLine) continue;
    const text = bufLine.translateToString(false).toLowerCase();

    let searchFrom = (i === 0) ? startCol : (direction === 'next' ? 0 : text.length - 1);
    let matchIdx: number;
    if (direction === 'next') {
      matchIdx = text.indexOf(lowerQuery, Math.max(0, searchFrom));
    } else {
      matchIdx = text.lastIndexOf(lowerQuery, searchFrom);
    }

    if (matchIdx !== -1) {
      terminal.scrollToLine(Math.max(0, lineIdx - Math.floor(terminal.rows / 2)));
      terminal.select(matchIdx, lineIdx, query.length);
      searchCursors.set(sessionId, { line: lineIdx, col: matchIdx });
      return true;
    }
  }
  return false;
}

/**
 * Clear search state for a session.
 */
export function clearSearch(sessionId: string): void {
  const entry = registry.get(sessionId);
  if (!entry) return;
  searchCursors.delete(sessionId);
  if (entry.searchAddon) {
    entry.searchAddon.clearDecorations();
  }
  entry.terminal.clearSelection();
}

/**
 * Read recent lines from the terminal buffer.
 */
export function getBufferText(sessionId: string, lineCount = 50): string {
  const entry = registry.get(sessionId);
  if (!entry) return '';
  const buffer = entry.terminal.buffer.active;
  const end = buffer.cursorY + buffer.baseY;
  const start = Math.max(0, end - lineCount);
  const lines: string[] = [];
  for (let i = start; i <= end; i++) {
    const line = buffer.getLine(i);
    if (line) lines.push(line.translateToString(true));
  }
  return lines.join('\n');
}

/**
 * Re-fit all terminals to their containers.
 */
export function fitAllTerminals(): void {
  for (const [sessionId, entry] of registry.entries()) {
    try {
      const prevCols = entry.terminal.cols;
      const prevRows = entry.terminal.rows;
      entry.fitAddon.fit();
      const { cols, rows } = entry.terminal;
      if (cols !== prevCols || rows !== prevRows) {
        console.trace(`[RESIZE] fitAllTerminals: ${prevCols}x${prevRows} → ${cols}x${rows} (session=${sessionId})`);
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Update font size for all terminals.
 */
export function setAllFontSize(size: number): void {
  currentFontSize = size;
  for (const entry of registry.values()) {
    entry.terminal.options.fontSize = size;
    try {
      entry.fitAddon.fit();
    } catch {
      // ignore
    }
  }
}

/**
 * Get the current global font size.
 */
export function getFontSize(): number {
  return currentFontSize;
}

/**
 * Register a callback for CWD changes (via OSC 7) for a session.
 */
export function onCwdChange(sessionId: string, callback: (cwd: string) => void): () => void {
  let set = cwdCallbacks.get(sessionId);
  if (!set) {
    set = new Set();
    cwdCallbacks.set(sessionId, set);
  }
  set.add(callback);
  return () => {
    set.delete(callback);
    if (set.size === 0) cwdCallbacks.delete(sessionId);
  };
}

/**
 * Register a callback for Claude Code status line data (via OSC 7701) for a session.
 */
export function onClaudeStatus(sessionId: string, callback: (data: unknown) => void): () => void {
  let set = claudeStatusCallbacks.get(sessionId);
  if (!set) {
    set = new Set();
    claudeStatusCallbacks.set(sessionId, set);
  }
  set.add(callback);
  return () => {
    set.delete(callback);
    if (set.size === 0) claudeStatusCallbacks.delete(sessionId);
  };
}

/**
 * Register a callback for terminal title changes (via OSC 0/2) for a session.
 * Many programs set these: Claude Code, vim, ssh, htop, etc.
 */
export function onTitleChange(sessionId: string, callback: (title: string) => void): () => void {
  let set = titleCallbacks.get(sessionId);
  if (!set) {
    set = new Set();
    titleCallbacks.set(sessionId, set);
  }
  set.add(callback);
  return () => {
    set.delete(callback);
    if (set.size === 0) titleCallbacks.delete(sessionId);
  };
}

/**
 * Get all prompt regions for a session (for OSC 133 shell integration).
 */
export function getPromptRegions(sessionId: string): import('./prompt-markers').PromptRegion[] {
  return promptTrackers.get(sessionId)?.regions ?? [];
}

/**
 * Jump to the previous or next prompt in the terminal scrollback.
 */
export function jumpToPrompt(sessionId: string, direction: 'prev' | 'next'): void {
  const entry = registry.get(sessionId);
  const tracker = promptTrackers.get(sessionId);
  if (!entry || !tracker || tracker.regions.length === 0) return;

  const buffer = entry.terminal.buffer.active;
  const viewportTop = buffer.viewportY;
  const regions = tracker.regions;

  if (direction === 'prev') {
    for (let i = regions.length - 1; i >= 0; i--) {
      if (regions[i].promptStart.line < viewportTop) {
        entry.terminal.scrollToLine(regions[i].promptStart.line);
        return;
      }
    }
  } else {
    for (const region of regions) {
      if (region.promptStart.line > viewportTop) {
        entry.terminal.scrollToLine(region.promptStart.line);
        return;
      }
    }
  }
}

/**
 * Serialize the buffer content of a terminal (with ANSI formatting).
 * Uses the SerializeAddon for xterm, falls back to plain text for ghostty.
 */
export function serializeBuffer(sessionId: string, scrollback = 200): string {
  const entry = registry.get(sessionId);
  if (!entry) return '';
  if (entry.serializeAddon) {
    try {
      return entry.serializeAddon.serialize({ scrollback });
    } catch {
      // fall through to plain text
    }
  }
  return getBufferText(sessionId, scrollback);
}

/**
 * Serialize buffer content for all active terminals.
 */
export function serializeAllBuffers(scrollback = 200): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [sessionId, entry] of registry.entries()) {
    if (!entry.ready) continue;
    if (entry.serializeAddon) {
      try {
        result[sessionId] = entry.serializeAddon.serialize({ scrollback });
        continue;
      } catch {
        // fall through
      }
    }
    result[sessionId] = getBufferText(sessionId, scrollback);
  }
  return result;
}

/**
 * Queue restored buffer content for a session.
 * It will be written to the terminal when activateTerminal() is called.
 */
export function setRestoredContent(sessionId: string, content: string): void {
  restoredContent.set(sessionId, content);
}
