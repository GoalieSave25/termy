import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLayoutStore } from '../../store/layout-store';
import { useSessionStore } from '../../store/session-store';
import { searchBuffer } from '../../lib/terminal-registry';
import type { Tab } from '../../types/tab';

interface SearchResult {
  tabId: string;
  tabLabel: string;
  itemId: string;
  itemIndex: number;
  sessionId: string;
  title: string;
  cwd: string;
  matchType: 'title' | 'cwd' | 'buffer';
  bufferContext?: {
    matchLine: string;
    contextBefore: string[];
    contextAfter: string[];
  };
}

function highlightMatch(text: string, query: string): React.ReactNode {
  query = query.trim();
  if (!query) return text;

  // Build a whitespace-normalized version for matching, keeping a map back to original indices
  let norm = '';
  const origIdx: number[] = []; // origIdx[i] = index in original text for normalized char i
  let inWs = false;
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) {
      if (!inWs) { norm += ' '; origIdx.push(i); inWs = true; }
    } else {
      norm += text[i]; origIdx.push(i); inWs = false;
    }
  }

  const idx = norm.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;

  const matchStart = origIdx[idx];
  const matchEnd = (idx + query.length < origIdx.length ? origIdx[idx + query.length] : text.length);

  return (
    <>
      {text.slice(0, matchStart)}
      <span className="font-semibold" style={{ color: '#f4f4f5' }}>{text.slice(matchStart, matchEnd)}</span>
      {text.slice(matchEnd)}
    </>
  );
}

function formatCwd(cwd: string): string {
  if (!cwd || cwd === '~') return '~';
  const homeMatch = cwd.match(/^\/Users\/[^/]+/);
  if (homeMatch) cwd = '~' + cwd.slice(homeMatch[0].length);
  const parts = cwd.split('/');
  if (parts.length > 4) return '…/' + parts.slice(-2).join('/');
  return cwd;
}

function searchAllTerminals(query: string, tabs: Tab[]): SearchResult[] {
  const sessions = useSessionStore.getState().sessions;
  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  for (const tab of tabs) {
    for (let i = 0; i < tab.carouselItems.length; i++) {
      const item = tab.carouselItems[i];
      const session = sessions[item.sessionId];
      if (!session) continue;

      const title = session.summary || formatCwd(session.cwd);
      const cwd = session.cwd ?? '';
      const base = { tabId: tab.id, tabLabel: tab.label, itemId: item.id, itemIndex: i, sessionId: item.sessionId, title, cwd };

      // Title/cwd are instant — check first
      const titleMatch = title.toLowerCase().includes(lowerQuery);
      const cwdMatch = cwd.toLowerCase().includes(lowerQuery);

      console.log('[fuzzy] query=%o title=%o titleMatch=%o cwdMatch=%o', query, title, titleMatch, cwdMatch);

      // Buffer search is expensive — only run if title/cwd didn't match
      // and query is long enough to be meaningful (>= 2 chars)
      if (!titleMatch && !cwdMatch && query.length >= 2) {
        const bufMatch = searchBuffer(item.sessionId, query, 1);
        console.log('[fuzzy] bufferSearch result=%o', bufMatch);
        if (bufMatch) {
          results.push({
            ...base, matchType: 'buffer',
            bufferContext: {
              matchLine: bufMatch.matchLine,
              contextBefore: bufMatch.contextBefore,
              contextAfter: bufMatch.contextAfter,
            },
          });
          continue;
        }
      }

      if (titleMatch) {
        results.push({ ...base, matchType: 'title' });
      } else if (cwdMatch) {
        results.push({ ...base, matchType: 'cwd' });
      }
    }
  }

  // Sort: buffer > title > cwd
  const order = { buffer: 0, title: 1, cwd: 2 };
  results.sort((a, b) => order[a.matchType] - order[b.matchType]);
  return results;
}

export function FuzzyFinder() {
  const open = useLayoutStore((s) => s.fuzzyFinderOpen);
  const setOpen = useLayoutStore((s) => s.setFuzzyFinderOpen);
  const tabs = useLayoutStore((s) => s.tabs);

  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const resultsRef = useRef<HTMLDivElement>(null);
  const lastSearchRef = useRef(0);

  // Focus on open; reset state on close so next open starts clean
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery('');
      setSelectedIdx(0);
      setResults([]);
    }
  }, [open]);

  // Throttled search (50ms)
  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setResults([]);
      setSelectedIdx(0);
      return;
    }
    const now = Date.now();
    const elapsed = now - lastSearchRef.current;
    const delay = Math.max(0, 50 - elapsed);
    const timer = setTimeout(() => {
      lastSearchRef.current = Date.now();
      const r = searchAllTerminals(query.trim(), tabs);
      setResults(prev => {
        // Preserve selection if the same item is still in results
        const prevSelected = prev[selectedIdx];
        if (prevSelected) {
          const newIdx = r.findIndex(x => x.itemId === prevSelected.itemId);
          if (newIdx !== -1) {
            setSelectedIdx(newIdx);
            return r;
          }
        }
        setSelectedIdx(0);
        return r;
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [query, open, tabs]);

  const displayResults = useMemo(() => {
    if (!query.trim()) return [];
    return results;
  }, [query, results]);

  const navigate = useCallback((result: SearchResult) => {
    const store = useLayoutStore.getState();
    store.setActiveTab(result.tabId);
    store.carouselFocusItem(result.itemId);
    store.carouselScrollTo(result.itemIndex);
    store.setCarouselZoomedOut(false);
    store.setFuzzyFinderOpen(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown' || (e.key === 'k' && e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      setSelectedIdx(i => Math.min(i + 1, displayResults.length - 1));
      return;
    }
    if (e.key === 'ArrowUp' || (e.key === 'i' && e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      setSelectedIdx(i => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && displayResults[selectedIdx]) {
      e.preventDefault();
      navigate(displayResults[selectedIdx]);
      return;
    }
  }, [displayResults, selectedIdx, navigate, setOpen]);

  // Scroll selected item into view
  useEffect(() => {
    const container = resultsRef.current;
    if (!container) return;
    const el = container.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop — fades in */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(0, 0, 0, 0.5)',
          animation: 'fuzzy-overlay-in 150ms ease-out',
        }}
        onClick={() => setOpen(false)}
      />

      {/* Panel — scales in with easeOutBack */}
      <div
        className="relative w-[680px] max-h-[65vh] overflow-hidden flex flex-col"
        style={{
          background: 'rgba(26, 26, 26, 0.3)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 16px 70px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
          animation: 'fuzzy-panel-in 220ms cubic-bezier(0.32, 1.28, 0.54, 1)',
        }}
      >
        {/* Top edge highlight */}
        <div
          className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.06) 70%, transparent 100%)',
          }}
        />

        {/* Search input */}
        <div
          className="flex items-center gap-3 shrink-0"
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <svg
            className="shrink-0"
            width="20" height="20" viewBox="0 0 16 16" fill="none"
            stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round"
          >
            <circle cx="6.5" cy="6.5" r="5" />
            <line x1="10" y1="10" x2="14.5" y2="14.5" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terminals…"
            className="flex-1 bg-transparent outline-none"
            style={{
              color: '#e4e4e7',
              fontSize: 20,
              fontWeight: 400,
              letterSpacing: '-0.01em',
              caretColor: '#a78bfa',
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd
            className="shrink-0 select-none"
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 5,
              padding: '3px 8px',
              fontFamily: '-apple-system, monospace',
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={resultsRef}
          className="overflow-y-auto"
          style={{
            maxHeight: 'calc(65vh - 60px)',
            padding: displayResults.length > 0 ? 8 : 0,
          }}
        >
          {displayResults.length === 0 && query.trim() && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 15 }}>
              No results
            </div>
          )}
          {displayResults.map((result, idx) => (
            <button
              key={`${result.tabId}-${result.itemId}`}
              className="w-full text-left cursor-pointer"
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                color: idx === selectedIdx ? '#f4f4f5' : 'rgba(255,255,255,0.7)',
                background: idx === selectedIdx ? 'rgba(255,255,255,0.09)' : 'transparent',
                transition: 'background 80ms ease, color 80ms ease',
                fontSize: 15,
              }}
              onClick={() => navigate(result)}
              onMouseMove={(e) => {
                if (e.clientX === lastMousePos.current.x && e.clientY === lastMousePos.current.y) return;
                lastMousePos.current = { x: e.clientX, y: e.clientY };
                if (idx !== selectedIdx) setSelectedIdx(idx);
              }}
            >
              <div className="flex items-center gap-2">
                {/* Terminal icon */}
                <svg
                  className="shrink-0"
                  width="16" height="16" viewBox="0 0 16 16" fill="none"
                  stroke={idx === selectedIdx ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)'}
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transition: 'stroke 80ms ease' }}
                >
                  <rect x="1" y="2" width="14" height="12" rx="2" />
                  <path d="M4 6l2.5 2L4 10" />
                  <line x1="8.5" y1="10" x2="12" y2="10" />
                </svg>
                {tabs.length > 1 && (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }} className="shrink-0">
                    {result.tabLabel}
                  </span>
                )}
                <span className="truncate" style={{ fontSize: 15 }}>
                  {query.trim() && result.matchType === 'title'
                    ? highlightMatch(result.title, query)
                    : result.title}
                </span>
                {result.matchType === 'cwd' && query.trim() && (
                  <span className="truncate ml-auto" style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
                    {highlightMatch(formatCwd(result.cwd), query)}
                  </span>
                )}
              </div>
              {result.bufferContext && query.trim() && (
                <div
                  className="overflow-hidden font-mono"
                  style={{
                    marginTop: 6,
                    marginLeft: 24,
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    color: 'rgba(255,255,255,0.35)',
                    maxHeight: 52,
                  }}
                >
                  {result.bufferContext.contextBefore.map((line, i) => (
                    <div key={`b${i}`} className="truncate">{line}</div>
                  ))}
                  <div style={{ whiteSpace: 'pre-line', overflow: 'hidden' }}>
                    {highlightMatch(result.bufferContext.matchLine, query)}
                  </div>
                  {result.bufferContext.contextAfter.map((line, i) => (
                    <div key={`a${i}`} className="truncate">{line}</div>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
