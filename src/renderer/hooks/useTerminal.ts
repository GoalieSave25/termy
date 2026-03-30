import { useEffect, useRef } from 'react';
import { attachTerminal, activateTerminal, fitTerminal, resizePty, onCwdChange } from '../lib/terminal-registry';
import { USE_GHOSTTY } from '../lib/terminal-backend';

/**
 * Composite all xterm canvas layers into a frozen snapshot overlay.
 * Must be called synchronously before fit() so WebGL's backbuffer is still intact.
 * Returns a canvas element styled to cover the container, or null if unavailable.
 */
function snapshotTerminalCanvas(container: HTMLElement): HTMLCanvasElement | null {
  const canvases = Array.from(container.querySelectorAll<HTMLCanvasElement>('canvas'));
  if (canvases.length === 0) return null;
  const first = canvases[0];
  const w = first.width;
  const h = first.height;
  if (w === 0 || h === 0) return null;
  const snap = document.createElement('canvas');
  snap.width = w;
  snap.height = h;
  const ctx = snap.getContext('2d');
  if (!ctx) return null;
  for (const c of canvases) {
    try { ctx.drawImage(c, 0, 0); } catch { /* skip tainted layers */ }
  }
  snap.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:100;';
  return snap;
}

interface UseTerminalOptions {
  sessionId: string;
  isVisible?: boolean;
  /** When true, suppress resize observer (e.g. during overview transition) */
  resizeSuppressed?: boolean;
  onResize?: (cols: number, rows: number) => void;
  onCwdChange?: (cwd: string) => void;
}

export function useTerminal(containerRef: React.RefObject<HTMLDivElement | null>, options: UseTerminalOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const terminalRef = useRef<any>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const prevVisibleRef = useRef(options.isVisible);
  const resizeSuppressedRef = useRef(options.resizeSuppressed ?? false);
  // Track last dimensions sent to PTY to avoid redundant resizes (which cause flashes)
  const lastSentRef = useRef<{ cols: number; rows: number } | null>(null);

  // Keep suppression ref in sync
  resizeSuppressedRef.current = options.resizeSuppressed ?? false;

  // Attach terminal to container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const entry = attachTerminal(options.sessionId, container);
    terminalRef.current = entry.terminal;

    // Fallback: ensure activation happens even if the ResizeObserver debounce
    // is repeatedly reset by width animation frames. activateTerminal() is a
    // no-op once already called, so this is safe as a safety net.
    const fallbackTimer = setTimeout(() => {
      if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
      if (resizeSuppressedRef.current) return;
      try {
        entry.fitAddon.fit();
        const { cols, rows } = entry.terminal;
        const last = lastSentRef.current;
        if (!last || last.cols !== cols || last.rows !== rows) {
          lastSentRef.current = { cols, rows };
          console.log(`[PTY_RESIZE] session=${options.sessionId} cols=${cols} rows=${rows} (fallback)`);
          resizePty(options.sessionId, cols, rows);
          options.onResize?.(cols, rows);
        }
      } catch { /* ignore */ }
      activateTerminal(options.sessionId);
    }, 500);

    // ResizeObserver per mount — watches this specific container.
    // Both fit() and pty.resize() are debounced together so the terminal
    // reflow and the shell's SIGWINCH redraw happen in sync. During card
    // width animations the canvas gets clipped briefly, then snaps correct.
    // New terminals hold back output (via activateTerminal) until the first
    // debounced resize so the prompt renders at the correct width.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      // Skip if container has no dimensions (hidden tab or mid-remount)
      if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
      // Skip during overview transition — terminals are CSS-scaled, not reflowed
      if (resizeSuppressedRef.current) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        // Debounced observer fired — cancel the fallback safety-net timer
        clearTimeout(fallbackTimer);
        // Re-check suppression after debounce delay
        if (resizeSuppressedRef.current) return;
        let snapshot: HTMLCanvasElement | null = null;
        try {
          // Snapshot the current canvas contents before fit() clears the WebGL
          // backbuffer. This keeps the old frame visible as an overlay while the
          // shell processes SIGWINCH and redraws, eliminating the blank flash.
          if (entry.ready) {
            snapshot = snapshotTerminalCanvas(container);
            if (snapshot) container.appendChild(snapshot);
          }

          entry.fitAddon.fit();
          let { cols, rows } = entry.terminal;
          // Ghostty's FitAddon has a 50ms _isResizing cooldown that can silently
          // drop a fit(). If proposeDimensions() disagrees with the terminal's
          // current size, bypass the cooldown and resize directly.
          // Skip for xterm.js: its patched fit() intentionally adds +1 row for
          // smooth scroll headroom; proposeDimensions() returns the natural size
          // (without headroom) which would undo it and cause redundant resizes.
          if (USE_GHOSTTY) {
            const proposed = entry.fitAddon.proposeDimensions?.();
            if (proposed && (proposed.cols !== cols || proposed.rows !== rows)) {
              entry.terminal.resize?.(proposed.cols, proposed.rows);
              cols = proposed.cols;
              rows = proposed.rows;
            }
          }
          // Skip if dimensions haven't changed since last PTY resize
          const last = lastSentRef.current;
          if (last && last.cols === cols && last.rows === rows) {
            snapshot?.remove();
            return;
          }
          lastSentRef.current = { cols, rows };
          console.log(`[PTY_RESIZE] session=${options.sessionId} cols=${cols} rows=${rows} (debounced)`);
          resizePty(options.sessionId, cols, rows);
          options.onResize?.(cols, rows);
          // New terminals: start receiving live output now
          activateTerminal(options.sessionId);

          // Remove overlay once the shell's SIGWINCH redraw has been parsed and
          // rendered. onWriteParsed fires after xterm processes the new data;
          // one rAF after that ensures the canvas is actually painted.
          if (snapshot) {
            const snap = snapshot;
            let removed = false;
            const remove = () => {
              if (removed) return;
              removed = true;
              requestAnimationFrame(() => snap.remove());
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const term = entry.terminal as any;
            if (typeof term.onWriteParsed === 'function') {
              const unsub = term.onWriteParsed(() => { unsub.dispose(); remove(); });
            }
            setTimeout(remove, 300); // fallback if onWriteParsed doesn't fire
          }
        } catch {
          snapshot?.remove();
        }
      }, 150);
    });
    resizeObserver.observe(container);
    observerRef.current = resizeObserver;

    const unsubCwd = options.onCwdChange
      ? onCwdChange(options.sessionId, options.onCwdChange)
      : undefined;

    return () => {
      resizeObserver.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      clearTimeout(fallbackTimer);
      observerRef.current = null;
      unsubCwd?.();
      // Do NOT dispose — terminal stays in registry
    };
  }, [options.sessionId]);

  // Re-fit when becoming visible (tab switch only, not phase remounts)
  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = options.isVisible;
    // Only refit on actual false→true transition (tab switch), not on mount
    if (!options.isVisible || wasVisible) return;
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container || container.offsetWidth === 0) return;
      const entry = terminalRef.current;
      if (!entry) return;
      const prevCols = entry.cols;
      const prevRows = entry.rows;
      fitTerminal(options.sessionId);
      activateTerminal(options.sessionId);
      const { cols, rows } = entry;
      const last = lastSentRef.current;
      if (last && last.cols === cols && last.rows === rows) return;
      if (cols !== prevCols || rows !== prevRows) {
        lastSentRef.current = { cols, rows };
        console.log(`[PTY_RESIZE] session=${options.sessionId} ${prevCols}x${prevRows} → ${cols}x${rows} (visibility)`);
        resizePty(options.sessionId, cols, rows);
        options.onResize?.(cols, rows);
      }
    });
  }, [options.isVisible]);

  // Re-fit when resize suppression ends (returning from overview to carousel)
  const prevSuppressedRef = useRef(options.resizeSuppressed);
  useEffect(() => {
    const wasSuppressed = prevSuppressedRef.current;
    prevSuppressedRef.current = options.resizeSuppressed;
    if (!wasSuppressed || options.resizeSuppressed) return;
    // Suppression just lifted — do a single fit
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container || container.offsetWidth === 0) return;
      fitTerminal(options.sessionId);
      activateTerminal(options.sessionId);
      const entry = terminalRef.current;
      if (!entry) return;
      const { cols, rows } = entry;
      const last = lastSentRef.current;
      if (last && last.cols === cols && last.rows === rows) return;
      lastSentRef.current = { cols, rows };
      console.log(`[PTY_RESIZE] session=${options.sessionId} cols=${cols} rows=${rows} (unsuppressed)`);
      resizePty(options.sessionId, cols, rows);
      options.onResize?.(cols, rows);
    });
  }, [options.resizeSuppressed]);

  return { terminalRef };
}
