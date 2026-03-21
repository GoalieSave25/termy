import { useEffect, useRef, useState } from 'react';
import { searchTerminal, clearSearch } from '../../lib/terminal-registry';

interface SearchBarProps {
  sessionId: string;
  onClose: () => void;
}

export function SearchBar({ sessionId, onClose }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const search = (direction: 'next' | 'previous') => {
    if (query) searchTerminal(sessionId, query, direction);
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

  const handleChange = (value: string) => {
    setQuery(value);
    if (value) {
      searchTerminal(sessionId, value, 'next');
    } else {
      clearSearch(sessionId);
    }
  };

  return (
    <div className="absolute top-6 right-0 z-20 flex items-center gap-1 p-1 m-1 bg-[#2a2a2a] rounded border border-white/10 shadow-lg">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search..."
        className="w-48 px-2 py-0.5 text-xs bg-[#111111] text-white rounded border border-white/10 outline-none focus:border-gray-500"
      />
      <button
        onClick={() => search('previous')}
        className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded"
        title="Previous (Shift+Enter)"
      >
        ↑
      </button>
      <button
        onClick={() => search('next')}
        className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded"
        title="Next (Enter)"
      >
        ↓
      </button>
      <button
        onClick={() => {
          clearSearch(sessionId);
          onClose();
        }}
        className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded"
        title="Close (Esc)"
      >
        ×
      </button>
    </div>
  );
}
