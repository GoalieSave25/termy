import { useEffect, useRef } from 'react';
import { useLayoutStore } from '../store/layout-store';
import { useSessionStore } from '../store/session-store';
import { serializeAllBuffers } from '../lib/terminal-registry';

const SAVE_INTERVAL_MS = 30_000; // Save every 30 seconds
const DEBOUNCE_MS = 2_000; // Debounce store changes by 2 seconds
export const BUFFERS_STORAGE_KEY = 'termy-buffers';

function captureBuffers(): Record<string, string> {
  return serializeAllBuffers();
}

function buildStatePayload(buffers: Record<string, string>): string {
  const layoutState = useLayoutStore.getState();
  const sessions = useSessionStore.getState().sessions;

  return JSON.stringify({
    version: 1,
    timestamp: Date.now(),
    layout: {
      tabs: layoutState.tabs,
      activeTabId: layoutState.activeTabId,
      fontSize: layoutState.fontSize,
      uiZoom: layoutState.uiZoom,
      visibleCount: layoutState.visibleCount,
    },
    sessions,
    buffers,
  });
}

function saveBuffersToSessionStorage(buffers: Record<string, string>): void {
  try {
    sessionStorage.setItem(BUFFERS_STORAGE_KEY, JSON.stringify(buffers));
  } catch { /* ignore — quota exceeded, etc. */ }
}

async function saveAll(): Promise<void> {
  try {
    const buffers = captureBuffers();
    // Synchronous sessionStorage save — survives Cmd+R reload
    saveBuffersToSessionStorage(buffers);
    // Async disk save — survives app quit/crash
    const data = buildStatePayload(buffers);
    await window.termyApi.persistence.save(data);
  } catch (err) {
    console.error('[PERSIST] Failed to save state:', err);
  }
}

/**
 * Periodically persists terminal state (layout, sessions, buffer content)
 * to disk via the main process, and buffers to sessionStorage for fast reload.
 */
export function useStatePersistence(): void {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Debounced save on store changes
    function scheduleSave() {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        saveAll();
      }, DEBOUNCE_MS);
    }

    const unsubLayout = useLayoutStore.subscribe(scheduleSave);
    const unsubSession = useSessionStore.subscribe(scheduleSave);

    // Periodic save (captures buffer content which changes without store updates)
    const interval = setInterval(saveAll, SAVE_INTERVAL_MS);

    // Save on close/reload — sessionStorage is synchronous so it always completes
    function onBeforeUnload() {
      try {
        const buffers = captureBuffers();
        saveBuffersToSessionStorage(buffers);
        // Fire-and-forget disk save — may not complete but we have periodic backup
        const data = buildStatePayload(buffers);
        window.termyApi.persistence.save(data);
      } catch {
        // Best effort
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      unsubLayout();
      unsubSession();
      clearInterval(interval);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);
}
