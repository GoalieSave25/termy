import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { TerminalSession } from '../types/session';
import { disposeTerminal } from '../lib/terminal-registry';

const SESSION_STORAGE_KEY = 'termy-sessions';

function saveToStorage(sessions: Record<string, TerminalSession>) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
  } catch { /* ignore */ }
}

export function loadSessionsFromStorage(): Record<string, TerminalSession> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

interface SessionState {
  sessions: Record<string, TerminalSession>;
  createSession: (cols?: number, rows?: number, cwd?: string) => Promise<TerminalSession>;
  destroySession: (sessionId: string) => void;
  updateSession: (sessionId: string, updates: Partial<TerminalSession>) => void;
  restoreSession: (sessionId: string, session: TerminalSession) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: {},

  createSession: async (cols = 80, rows = 24, cwd?: string) => {
    const sessionId = nanoid();
    const result = await window.termyApi.pty.create({
      sessionId,
      cols,
      rows,
      ...(cwd ? { cwd } : {}),
    });

    const session: TerminalSession = {
      id: sessionId,
      pid: result.pid,
      shell: result.shell,
      cwd: '~',
      cols,
      rows,
      alive: true,
      isClaudeSession: false,
      claudeState: 'inactive',
    };

    set((state) => ({
      sessions: { ...state.sessions, [sessionId]: session },
    }));

    return session;
  },

  destroySession: (sessionId: string) => {
    disposeTerminal(sessionId);
    window.termyApi.pty.destroy(sessionId);
    set((state) => {
      const { [sessionId]: _, ...rest } = state.sessions;
      return { sessions: rest };
    });
  },

  updateSession: (sessionId: string, updates: Partial<TerminalSession>) => {
    set((state) => {
      const existing = state.sessions[sessionId];
      if (!existing) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...existing, ...updates },
        },
      };
    });
  },

  restoreSession: (sessionId: string, session: TerminalSession) => {
    set((state) => ({
      sessions: { ...state.sessions, [sessionId]: { ...session, alive: true } },
    }));
  },
}));

// Persist sessions to sessionStorage — debounced to avoid thrashing during rapid updates
let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
useSessionStore.subscribe(() => {
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(() => {
    saveToStorage(useSessionStore.getState().sessions);
    sessionSaveTimer = null;
  }, 500);
});
// Flush pending save on page unload so Cmd+R doesn't lose state
window.addEventListener('beforeunload', () => {
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
    saveToStorage(useSessionStore.getState().sessions);
  }
});
