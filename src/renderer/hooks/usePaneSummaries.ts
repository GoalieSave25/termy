import { useEffect, useRef } from 'react';
import { useLayoutStore } from '../store/layout-store';
import { useSessionStore } from '../store/session-store';
import { getBufferText, onTitleChange } from '../lib/terminal-registry';
import { generateHeuristic } from '../lib/auto-title';

export function usePaneSummaries() {
  const lastBuffers = useRef<Map<string, string>>(new Map());
  const titleUnsubs = useRef<Map<string, () => void>>(new Map());
  const trackedSessions = useRef<Set<string>>(new Set());

  useEffect(() => {
    const interval = setInterval(() => {
      const layoutState = useLayoutStore.getState();
      const activeTab = layoutState.tabs.find((t) => t.id === layoutState.activeTabId);
      if (!activeTab) return;

      const sessionIds = new Set(activeTab.carouselItems.map((c) => c.sessionId));

      // Clean up title watchers for sessions no longer in the active tab
      for (const sessionId of trackedSessions.current) {
        if (!sessionIds.has(sessionId)) {
          titleUnsubs.current.get(sessionId)?.();
          titleUnsubs.current.delete(sessionId);
          trackedSessions.current.delete(sessionId);
          lastBuffers.current.delete(sessionId);
        }
      }

      for (const sessionId of sessionIds) {
        if (!trackedSessions.current.has(sessionId)) {
          trackedSessions.current.add(sessionId);
          const unsub = onTitleChange(sessionId, (title) => {
            if (title.trim()) {
              useSessionStore.getState().updateSession(sessionId, { summary: title });
            }
          });
          titleUnsubs.current.set(sessionId, unsub);
        }

        const session = useSessionStore.getState().sessions[sessionId];
        if (session?.summary) continue;

        const text = getBufferText(sessionId, 20);
        if (!text.trim()) continue;

        const textKey = text.slice(-200);
        if (lastBuffers.current.get(sessionId) === textKey) continue;
        lastBuffers.current.set(sessionId, textKey);

        const summary = generateHeuristic(text);
        if (summary) {
          useSessionStore.getState().updateSession(sessionId, { summary });
        }
      }
    }, 4000);

    return () => {
      clearInterval(interval);
      for (const unsub of titleUnsubs.current.values()) unsub();
      titleUnsubs.current.clear();
      trackedSessions.current.clear();
    };
  }, []);
}
