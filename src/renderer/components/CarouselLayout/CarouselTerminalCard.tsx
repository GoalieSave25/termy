import { memo, useRef, useEffect, useState, useCallback } from 'react';
import { useTerminal } from '../../hooks/useTerminal';
import { useLayoutStore } from '../../store/layout-store';
import { useSessionStore } from '../../store/session-store';
import { getTerminalEntry, setTerminalCursorBlink } from '../../lib/terminal-registry';
import { markSessionInteraction } from '../../lib/session-interactions';
import { shellEscapePath } from '../../hooks/useFileDrop';
import { SearchBar } from '../Terminal/SearchBar';
import type { CarouselItem } from '../../types/tab';

interface CarouselTerminalCardProps {
  item: CarouselItem;
  isFocused: boolean;
  isVisible: boolean;
  interactionDisabled?: boolean;
  resizeSuppressed?: boolean;
  onClose: () => void;
  onTap?: () => void;
}

function CarouselTerminalCardInner({
  item,
  isFocused,
  isVisible,
  interactionDisabled,
  resizeSuppressed,
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

  const clearCompleted = useCallback(() => {
    markSessionInteraction(item.sessionId);
    if (useSessionStore.getState().sessions[item.sessionId]?.claudeCompleted) {
      updateSession(item.sessionId, { claudeCompleted: false });
    }
  }, [item.sessionId, updateSession]);

  const handleMouseDown = () => {
    clearCompleted();
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

  // Close search when this terminal loses focus (switched to another terminal)
  // or when the terminal itself gains focus (user clicked into it)
  useEffect(() => {
    if (!isFocused && isSearchOpen) {
      setSearchOpen(null);
    }
  }, [isFocused]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const el = containerRef.current;
    if (!el) return;
    const handleFocusIn = () => {
      setSearchOpen(null);
    };
    el.addEventListener('focusin', handleFocusIn);
    return () => el.removeEventListener('focusin', handleFocusIn);
  }, [isSearchOpen]);

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

  return (
    <div
      className="relative flex flex-col h-full transition-colors duration-300"
      style={{ backgroundColor: isFocused ? '#111111' : '#111111', overflow: 'visible' }}
      onMouseDown={handleMouseDown}
      onKeyDownCapture={clearCompleted}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Border — fades out during transition */}
      <div
        className={`absolute inset-0 pointer-events-none z-10 transition-[border-radius,border-color] duration-300 ${interactionDisabled ? 'rounded' : 'rounded-none'}`}
        style={{
          borderLeft: `1px solid ${interactionDisabled ? 'transparent' : '#181818'}`,
          borderRight: `1px solid ${interactionDisabled ? 'transparent' : '#181818'}`,
        }}
      />
      {/* Claude completion background pulse */}
      {session?.claudeCompleted && (
        <div
          className={`absolute inset-0 pointer-events-none z-10 ${interactionDisabled ? 'rounded' : 'rounded-none'}`}
          style={{
            background: '#2DA1FD',
            animation: 'claude-bg-pulse 2s ease-in-out infinite',
          }}
        />
      )}
      {/* Header — always visible, bg and close button fade during transition */}
      <div
        className={`flex items-center select-none shrink-0 font-medium ${interactionDisabled ? 'rounded-t' : 'rounded-none'}`}
        style={{
          height: 'var(--card-header-height, 30px)',
          fontSize: 'var(--card-header-font-size, 12px)',
          paddingLeft: 'var(--card-header-padding-x, 8px)',
          paddingRight: 'var(--card-header-padding-x, 8px)',
          background: 'linear-gradient(to bottom, rgba(24,24,24,var(--card-header-bg-alpha,1)), transparent)',
          boxShadow: '0 1px 0 rgba(255,255,255,var(--card-header-shadow-alpha,0.03))',
          color: `rgba(255, 255, 255, ${isFocused && !interactionDisabled ? 0.6 : 0.35})`,
          transition: 'background 300ms, color 300ms',
        }}
        onDoubleClick={!interactionDisabled ? () => {
          useLayoutStore.getState().toggleMaximized();
        } : undefined}
      >
        <div className="flex-1 truncate">
          <span>{displayText}</span>
        </div>
        <button
          className={`w-[40px] h-full flex items-center justify-center
            transition-colors duration-150 cursor-pointer select-none
            ${interactionDisabled ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          style={{ color: 'rgba(255,255,255,0.35)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; e.currentTarget.style.background = '#181818'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.background = 'transparent'; }}
          title="Maximize (⌘⇧F)"
          onClick={(e) => {
            e.stopPropagation();
            useLayoutStore.getState().toggleMaximized();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            const el = e.currentTarget;
            el.style.transition = 'scale 250ms ease, color 150ms, background-color 150ms';
            el.style.scale = '0.92';
            const handleUp = () => {
              el.style.transition = 'scale 400ms cubic-bezier(0.2, 0, 0, 1), color 150ms, background-color 150ms';
              el.style.scale = '1';
              setTimeout(() => { el.style.transition = ''; el.style.scale = ''; }, 400);
              window.removeEventListener('mouseup', handleUp);
            };
            window.addEventListener('mouseup', handleUp);
          }}
        >
          <svg width="10" height="10" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 3V1h2M5 1h2v2M7 5v2H5M3 7H1V5" />
          </svg>
        </button>
        <button
          className={`w-[30px] h-full flex items-center justify-center
            transition-colors duration-150 cursor-pointer select-none
            ${interactionDisabled ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          style={{ color: 'rgba(255,255,255,0.35)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(239,68,68,0.8)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.background = 'transparent'; }}
          title="Close (⌘W)"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            const el = e.currentTarget;
            el.style.transition = 'scale 250ms ease, color 150ms, background-color 150ms';
            el.style.scale = '0.92';
            const handleUp = () => {
              el.style.transition = 'scale 400ms cubic-bezier(0.2, 0, 0, 1), color 150ms, background-color 150ms';
              el.style.scale = '1';
              setTimeout(() => { el.style.transition = ''; el.style.scale = ''; }, 400);
              window.removeEventListener('mouseup', handleUp);
            };
            window.addEventListener('mouseup', handleUp);
          }}
        >
          <svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
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
        className={`relative flex-1 min-h-0 caret-transparent ${interactionDisabled ? 'pointer-events-none' : ''}`}
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

export const CarouselTerminalCard = memo(
  CarouselTerminalCardInner,
  (prev, next) => (
    prev.item.id === next.item.id &&
    prev.item.sessionId === next.item.sessionId &&
    prev.isFocused === next.isFocused &&
    prev.isVisible === next.isVisible &&
    prev.interactionDisabled === next.interactionDisabled &&
    prev.resizeSuppressed === next.resizeSuppressed
  ),
);

export function formatCwd(cwd: string): string {
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
