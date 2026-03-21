import { useRef, useEffect, useState, useCallback } from 'react';
import { useTerminal } from '../../hooks/useTerminal';
import { useLayoutStore } from '../../store/layout-store';
import { useSessionStore } from '../../store/session-store';
import { getTerminalEntry, setTerminalCursorBlink } from '../../lib/terminal-registry';
import { shellEscapePath } from '../../hooks/useFileDrop';
import { SearchBar } from '../Terminal/SearchBar';
import type { CarouselItem } from '../../types/tab';

interface CarouselTerminalCardProps {
  item: CarouselItem;
  isFocused: boolean;
  isVisible: boolean;
  interactionDisabled?: boolean;
  resizeSuppressed?: boolean;
  overviewProgress?: number;
  cardScale?: number;
  onClose: () => void;
  onTap?: () => void;
}

export function CarouselTerminalCard({
  item,
  isFocused,
  isVisible,
  interactionDisabled,
  resizeSuppressed,
  overviewProgress = 0,
  cardScale = 1,
  onClose,
  onTap,
}: CarouselTerminalCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const carouselFocusItem = useLayoutStore((s) => s.carouselFocusItem);
  const updateSession = useSessionStore((s) => s.updateSession);
  const searchOpenPaneId = useLayoutStore((s) => s.searchOpenPaneId);
  const setSearchOpen = useLayoutStore((s) => s.setSearchOpen);
  const session = useSessionStore((s) => s.sessions[item.sessionId]);

  const isSearchOpen = searchOpenPaneId === item.id;

  const { terminalRef } = useTerminal(containerRef, {
    sessionId: item.sessionId,
    isVisible,
    resizeSuppressed: resizeSuppressed,
    onResize: (cols, rows) => {
      updateSession(item.sessionId, { cols, rows });
    },
    onCwdChange: (cwd) => {
      updateSession(item.sessionId, { cwd });
    },
  });

  useEffect(() => {
    const focused = isFocused && isVisible && !interactionDisabled;
    setTerminalCursorBlink(item.sessionId, focused);
    if (focused && terminalRef.current) {
      requestAnimationFrame(() => {
        terminalRef.current?.focus();
      });
    } else if (interactionDisabled && terminalRef.current) {
      terminalRef.current?.blur();
    }
  }, [isFocused, isVisible, interactionDisabled]);

  const handleMouseDown = () => {
    if (interactionDisabled) {
      onTap?.();
      return;
    }
    carouselFocusItem(item.id);
    const entry = getTerminalEntry(item.sessionId);
    if (entry) {
      setTimeout(() => entry.terminal.focus(), 0);
    }
  };

  // --- File drag-and-drop ---
  const [isDropTarget, setIsDropTarget] = useState(false);
  const dragCountRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCountRef.current++;
    setIsDropTarget(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCountRef.current--;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setIsDropTarget(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current = 0;
    setIsDropTarget(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const paths = files
      .map((f) => shellEscapePath(window.termyApi.getPathForFile(f)))
      .join(' ');
    if (paths) {
      window.termyApi.pty.sendInput(item.sessionId, paths);
    }
  }, [item.sessionId]);

  const displayCwd = formatCwd(session?.cwd ?? '~');
  const displayText = session?.summary || displayCwd;

  // Scale header to remain readable in window mode.
  // The card is rendered at full resolution then scaled down by cardScale,
  // so we inflate dimensions by 1/cardScale to hit the target visual size.
  const sc = Math.max(cardScale, 0.1);
  const headerHeight = 24 + (30 / sc - 24) * overviewProgress;
  const headerFontSize = 11 + (13 / sc - 11) * overviewProgress;
  const headerPx = 8 + (10 / sc - 8) * overviewProgress;

  return (
    <div
      className="relative flex flex-col h-full transition-colors duration-300"
      style={{ backgroundColor: isFocused ? '#111111' : '#111111' }}
      onMouseDown={handleMouseDown}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Border — fades out during transition */}
      <div className={`absolute inset-0 pointer-events-none border z-10 rounded transition-all duration-300
        ${interactionDisabled ? 'opacity-0' : 'opacity-100'}
        ${isFocused ? 'border-gray-600/25' : 'border-gray-600/10'}`} />
      {/* Header — always visible, bg and close button fade during transition */}
      <div
        className={`
          flex items-center select-none shrink-0
          font-medium
          border-b border-white/5 rounded-t
        `}
        style={{
          height: headerHeight,
          fontSize: headerFontSize,
          paddingLeft: headerPx,
          paddingRight: headerPx,
          backgroundColor: interactionDisabled ? 'transparent' : isFocused ? '#151515' : '#111111',
          color: `rgba(255, 255, 255, ${isFocused && !interactionDisabled
            ? 0.6 + 0.4 * overviewProgress
            : 0.4 + 0.6 * overviewProgress})`,
          transition: 'background-color 300ms, color 300ms',
        }}
      >
        <div className="flex-1 truncate">
          <span style={{ opacity: 0.7 + 0.3 * overviewProgress }}>{displayText}</span>
        </div>
        <button
          className={`w-5 h-5 flex items-center justify-center rounded-full
            text-gray-600 hover:text-white hover:bg-red-500/80
            active:scale-90 active:bg-red-600 active:text-white
            transition-all duration-300 ease-out cursor-pointer select-none
            ${interactionDisabled ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          title="Close (⌘W)"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <svg width="7" height="7" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
          </svg>
        </button>
      </div>
      {/* Search */}
      {isSearchOpen && !interactionDisabled && (
        <SearchBar
          sessionId={item.sessionId}
          onClose={() => setSearchOpen(null)}
        />
      )}
      {/* Terminal */}
      <div
        ref={containerRef}
        className={`flex-1 min-h-0 caret-transparent ${interactionDisabled ? 'pointer-events-none' : ''}`}
      />
      {/* Interaction blocker for window mode */}
      {interactionDisabled && (
        <div className="absolute inset-0 cursor-pointer" onClick={onTap} />
      )}
      {/* File drop overlay */}
      {isDropTarget && (
        <div className="absolute inset-0 z-20 flex items-center justify-center
          bg-blue-500/10 border-2 border-dashed border-blue-400/50 rounded
          pointer-events-none">
          <span className="text-blue-300 text-sm font-medium px-3 py-1.5 rounded-md bg-black/50 backdrop-blur-sm">
            Drop to paste path
          </span>
        </div>
      )}
    </div>
  );
}

function formatCwd(cwd: string): string {
  if (!cwd || cwd === '~') return '~';
  const homeMatch = cwd.match(/^\/Users\/[^/]+/);
  if (homeMatch) {
    cwd = '~' + cwd.slice(homeMatch[0].length);
  }
  const parts = cwd.split('/');
  if (parts.length > 4) {
    return '…/' + parts.slice(-2).join('/');
  }
  return cwd;
}
