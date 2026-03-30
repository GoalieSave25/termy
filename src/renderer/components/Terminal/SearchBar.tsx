import { useEffect, useRef, useState } from 'react';
import { searchTerminal, clearSearch, clearSearchDecorations, subscribeSearchResults } from '../../lib/terminal-registry';
import type { ISearchOptions } from '../../lib/terminal-registry';

interface SearchBarProps {
  sessionId: string;
  onClose: () => void;
}

const MATCH_DECORATIONS: ISearchOptions['decorations'] = {
  matchBackground: '#3a3a00',
  matchBorder: '#5a5a00',
  matchOverviewRuler: '#ffd43b',
  activeMatchBackground: '#665200',
  activeMatchBorder: '#ffd43b',
  activeMatchColorOverviewRuler: '#ffd43b',
};

export function SearchBar({ sessionId, onClose }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [resultIndex, setResultIndex] = useState(-1);
  const [resultCount, setResultCount] = useState(0);

  // Smart case: auto case-sensitive when query has uppercase
  const effectiveCaseSensitive = caseSensitive || /[A-Z]/.test(query);

  const buildOptions = (incremental: boolean): ISearchOptions => ({
    caseSensitive: effectiveCaseSensitive,
    regex: useRegex,
    incremental,
    decorations: MATCH_DECORATIONS,
  });

  // Auto-focus on mount; clear decorations on unmount
  useEffect(() => {
    inputRef.current?.focus();
    return () => clearSearchDecorations(sessionId);
  }, []);

  // Subscribe to search result changes
  useEffect(() => {
    const disposable = subscribeSearchResults(sessionId, (event) => {
      setResultIndex(event.resultIndex);
      setResultCount(event.resultCount);
    });
    return () => disposable.dispose();
  }, [sessionId]);

  // Re-search when toggles change
  useEffect(() => {
    if (!query) return;
    clearSearch(sessionId);
    searchTerminal(sessionId, query, 'next', buildOptions(true));
  }, [caseSensitive, useRegex]);

  const handleChange = (value: string) => {
    setQuery(value);
    if (value) {
      searchTerminal(sessionId, value, 'next', buildOptions(true));
    } else {
      clearSearch(sessionId);
      setResultIndex(-1);
      setResultCount(0);
    }
  };

  const search = (direction: 'next' | 'previous') => {
    if (query) searchTerminal(sessionId, query, direction, buildOptions(false));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      clearSearch(sessionId);
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      search(e.shiftKey ? 'previous' : 'next');
    }
  };

  const resultText = () => {
    if (!query) return null;
    if (resultCount === 0) return 'No results';
    if (resultIndex === -1) return `${resultCount}+ matches`;
    return `${resultIndex + 1} of ${resultCount}`;
  };

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 36,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
      }}
    >
      <div
        className="flex items-center gap-1.5"
        style={{
          width: 420,
          padding: '8px 12px',
          background: 'rgba(26, 26, 26, 0.45)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 12px 50px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.5)',
          animation: 'search-panel-in 180ms cubic-bezier(0.32, 1.28, 0.54, 1)',
        }}
      >
        {/* Top edge highlight */}
        <div
          className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.06) 70%, transparent 100%)',
            borderRadius: '12px 12px 0 0',
          }}
        />

        {/* Search icon */}
        <svg
          className="shrink-0"
          width="14" height="14" viewBox="0 0 16 16" fill="none"
          stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round"
        >
          <circle cx="6.5" cy="6.5" r="5" />
          <line x1="10" y1="10" x2="14.5" y2="14.5" />
        </svg>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Find..."
          spellCheck={false}
          autoComplete="off"
          className="bg-transparent outline-none flex-1 min-w-0"
          style={{
            color: '#e4e4e7',
            fontSize: 14,
            fontWeight: 400,
            letterSpacing: '-0.01em',
            caretColor: '#a78bfa',
          }}
        />

        {/* Result count */}
        {resultText() && (
          <span
            className="shrink-0 select-none"
            style={{
              fontSize: 11,
              color: resultCount === 0 && query ? 'rgba(248,113,113,0.6)' : 'rgba(255,255,255,0.35)',
              whiteSpace: 'nowrap',
            }}
          >
            {resultText()}
          </span>
        )}

        {/* Separator */}
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        {/* Case sensitivity toggle */}
        <button
          onClick={() => setCaseSensitive(!caseSensitive)}
          className="shrink-0 cursor-pointer"
          style={{
            padding: '2px 5px',
            borderRadius: 5,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'monospace',
            color: effectiveCaseSensitive ? '#e4e4e7' : 'rgba(255,255,255,0.3)',
            background: effectiveCaseSensitive ? 'rgba(255,255,255,0.12)' : 'transparent',
            border: effectiveCaseSensitive ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
            transition: 'all 80ms ease',
            lineHeight: 1.3,
          }}
          title={effectiveCaseSensitive && !caseSensitive ? 'Match Case (auto: uppercase detected)' : 'Match Case'}
        >
          Aa
        </button>

        {/* Regex toggle */}
        <button
          onClick={() => setUseRegex(!useRegex)}
          className="shrink-0 cursor-pointer"
          style={{
            padding: '2px 5px',
            borderRadius: 5,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'monospace',
            color: useRegex ? '#e4e4e7' : 'rgba(255,255,255,0.3)',
            background: useRegex ? 'rgba(255,255,255,0.12)' : 'transparent',
            border: useRegex ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
            transition: 'all 80ms ease',
            lineHeight: 1.3,
          }}
          title="Use Regular Expression"
        >
          .*
        </button>

        {/* Separator */}
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        {/* Previous */}
        <button
          onClick={() => search('previous')}
          className="shrink-0 cursor-pointer"
          style={{
            padding: '2px 4px',
            borderRadius: 5,
            color: 'rgba(255,255,255,0.4)',
            background: 'transparent',
            border: 'none',
            transition: 'color 80ms ease',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Previous (Shift+Enter)"
          onMouseEnter={(e) => { e.currentTarget.style.color = '#e4e4e7'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4,10 8,5 12,10" />
          </svg>
        </button>

        {/* Next */}
        <button
          onClick={() => search('next')}
          className="shrink-0 cursor-pointer"
          style={{
            padding: '2px 4px',
            borderRadius: 5,
            color: 'rgba(255,255,255,0.4)',
            background: 'transparent',
            border: 'none',
            transition: 'color 80ms ease',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Next (Enter)"
          onMouseEnter={(e) => { e.currentTarget.style.color = '#e4e4e7'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4,6 8,11 12,6" />
          </svg>
        </button>

        {/* Esc badge */}
        <kbd
          className="shrink-0 select-none cursor-pointer"
          onClick={() => { clearSearch(sessionId); onClose(); }}
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.3)',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 5,
            padding: '2px 6px',
            fontFamily: '-apple-system, monospace',
          }}
        >
          esc
        </kbd>
      </div>
    </div>
  );
}
