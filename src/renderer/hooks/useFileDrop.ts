import { useEffect } from 'react';

/**
 * Prevents Electron's default file-drop behavior (navigating to the file).
 * Actual per-terminal drop handling is in CarouselTerminalCard.
 */
export function useFileDrop() {
  useEffect(() => {
    const preventNav = (e: DragEvent) => {
      e.preventDefault();
    };
    document.addEventListener('dragover', preventNav);
    document.addEventListener('drop', preventNav);
    return () => {
      document.removeEventListener('dragover', preventNav);
      document.removeEventListener('drop', preventNav);
    };
  }, []);
}

/**
 * Shell-escape a file path for pasting into a terminal.
 * Wraps in single quotes, escaping any embedded single quotes.
 */
export function shellEscapePath(path: string): string {
  // If the path has no special characters, return as-is
  if (/^[a-zA-Z0-9_./~@:-]+$/.test(path)) {
    return path;
  }
  // Wrap in single quotes, escape any single quotes: ' → '\''
  return "'" + path.replace(/'/g, "'\\''") + "'";
}
