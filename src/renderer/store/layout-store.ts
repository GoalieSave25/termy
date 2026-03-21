import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Tab, TabId, CarouselItem } from '../types/tab';
import { useSessionStore, loadSessionsFromStorage } from './session-store';
import { setAllFontSize, fitAllTerminals, setRestoredContent } from '../lib/terminal-registry';
import { BUFFERS_STORAGE_KEY } from '../hooks/useStatePersistence';
import type { TerminalSession } from '../types/session';

const DEFAULT_FONT_SIZE = 13;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;

const DEFAULT_UI_ZOOM = 1.0;
const MIN_UI_ZOOM = 0.5;
const MAX_UI_ZOOM = 3.0;
const UI_ZOOM_STEP = 0.1;

const LAYOUT_STORAGE_KEY = 'termy-layout';

interface SavedLayout {
  tabs: Tab[];
  activeTabId: TabId;
  fontSize: number;
  uiZoom: number;
  visibleCount: number;
}

function saveLayoutToStorage(state: { tabs: Tab[]; activeTabId: TabId; fontSize: number; uiZoom: number; visibleCount: number }) {
  try {
    const saved: SavedLayout = {
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      fontSize: state.fontSize,
      uiZoom: state.uiZoom,
      visibleCount: state.visibleCount,
    };
    sessionStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(saved));
  } catch { /* ignore */ }
}

function loadLayoutFromStorage(): SavedLayout | null {
  try {
    const raw = sessionStorage.getItem(LAYOUT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function makeDefaultTab(tabId: string, itemId: string, sessionId: string, label: string): Tab {
  return {
    id: tabId,
    label,
    carouselItems: [{ id: itemId, sessionId }],
    carouselFocusedIndex: 0,
    carouselFocusedItemId: itemId,
  };
}

interface PersistedData {
  version: number;
  layout: SavedLayout;
  sessions: Record<string, TerminalSession>;
  buffers: Record<string, string>;
}

/**
 * Restore layout from a persisted disk state.
 * Creates new PTY sessions at saved cwds and queues buffer content for replay.
 */
async function restoreFromDisk(
  parsed: PersistedData,
): Promise<{ tabs: Tab[]; layout: SavedLayout } | null> {
  const sessionStore = useSessionStore.getState();
  const idMap = new Map<string, string>(); // oldSessionId -> newSessionId

  // Collect all session IDs referenced by the layout
  const referencedIds = new Set<string>();
  for (const tab of parsed.layout.tabs) {
    for (const item of tab.carouselItems) {
      referencedIds.add(item.sessionId);
    }
  }

  // Recreate each session at its saved cwd
  for (const oldSessionId of referencedIds) {
    const saved = parsed.sessions[oldSessionId];
    const cwd = saved?.cwd && saved.cwd !== '~' ? saved.cwd : undefined;
    const newSession = await sessionStore.createSession(
      saved?.cols, saved?.rows, cwd,
    );
    idMap.set(oldSessionId, newSession.id);

    // Queue saved buffer content for replay when the terminal activates
    const buffer = parsed.buffers?.[oldSessionId];
    if (buffer) {
      setRestoredContent(newSession.id, buffer);
    }
  }

  // Remap session IDs in the layout
  const tabs = parsed.layout.tabs.map(tab => ({
    ...tab,
    carouselItems: tab.carouselItems.map(item => {
      const newId = idMap.get(item.sessionId);
      return newId ? { ...item, sessionId: newId } : item;
    }),
  }));

  return { tabs, layout: parsed.layout };
}

interface LayoutState {
  tabs: Tab[];
  activeTabId: TabId;
  fontSize: number;
  uiZoom: number;
  isDraggingTab: boolean;
  searchOpenPaneId: string | null;
  carouselZoomedOut: boolean;
  visibleCount: number;

  // Tab actions
  createTab: () => Promise<void>;
  closeTab: (tabId: TabId) => void;
  setActiveTab: (tabId: TabId) => void;
  renameTab: (tabId: TabId, label: string, manual?: boolean) => void;
  reorderTab: (fromTabId: TabId, toTabId: TabId) => void;
  setDraggingTab: (dragging: boolean) => void;

  // Navigation
  toggleZoom: () => void;
  focusDirection: (direction: 'left' | 'right' | 'up' | 'down') => void;
  focusNext: () => void;
  focusPrevious: () => void;

  // Font size
  changeFontSize: (delta: number) => void;
  resetFontSize: () => void;

  // UI zoom
  changeUiZoom: (delta: number) => void;
  resetUiZoom: () => void;

  // Search
  setSearchOpen: (paneId: string | null) => void;

  // Init
  initFirstTab: () => Promise<void>;

  // Carousel actions
  setCarouselZoomedOut: (zoomed: boolean) => void;
  carouselAddTerminal: () => Promise<string>;
  carouselRemoveTerminal: (itemId: string) => void;
  carouselReorder: (fromIndex: number, toIndex: number) => void;
  carouselScrollTo: (index: number) => void;
  carouselFocusItem: (itemId: string) => void;

  // Visible count
  setVisibleCount: (n: number) => void;

  // Helpers
  getActiveTab: () => Tab | undefined;
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  tabs: [],
  activeTabId: '',
  fontSize: DEFAULT_FONT_SIZE,
  uiZoom: DEFAULT_UI_ZOOM,
  isDraggingTab: false,
  searchOpenPaneId: null,
  carouselZoomedOut: false,
  visibleCount: 2,

  initFirstTab: async () => {
    // Try to restore from a previous renderer reload (HMR or full refresh)
    const savedLayout = loadLayoutFromStorage();
    const savedSessions = loadSessionsFromStorage();

    if (savedLayout?.tabs?.length && savedSessions) {
      try {
        // Ask the main process which PTY sessions are still alive.
        // Wrap in try/catch so a missing handler (main process hasn't restarted
        // yet to pick up the new IPC) gracefully treats all PTYs as dead.
        let alivePtyList: string[] = [];
        try { alivePtyList = await window.termyApi.pty.list(); } catch { /* no handler yet */ }
        const alivePtyIds = new Set(alivePtyList);
        const sessionStore = useSessionStore.getState();
        const idMap = new Map<string, string>(); // oldSessionId -> newSessionId

        // Collect all session IDs referenced by the saved layout
        const referencedIds = new Set<string>();
        for (const tab of savedLayout.tabs) {
          for (const item of tab.carouselItems) {
            referencedIds.add(item.sessionId);
          }
        }

        // Restore surviving PTYs or recreate dead ones at the same cwd
        for (const sessionId of referencedIds) {
          const saved = savedSessions[sessionId];
          if (alivePtyIds.has(sessionId) && saved) {
            // PTY survived the reload — restore session metadata
            sessionStore.restoreSession(sessionId, saved);
          } else {
            // PTY died (main process restarted) — recreate at same cwd
            const newSession = await sessionStore.createSession(
              saved?.cols, saved?.rows, saved?.cwd,
            );
            idMap.set(sessionId, newSession.id);
          }
        }

        // Remap any replaced session IDs in the layout
        const tabs = savedLayout.tabs.map(tab => ({
          ...tab,
          carouselItems: tab.carouselItems.map(item => {
            const newId = idMap.get(item.sessionId);
            return newId ? { ...item, sessionId: newId } : item;
          }),
        }));

        // Restore saved buffer content for all sessions
        try {
          const buffersRaw = sessionStorage.getItem(BUFFERS_STORAGE_KEY);
          if (buffersRaw) {
            const buffers = JSON.parse(buffersRaw) as Record<string, string>;
            for (const [oldId, content] of Object.entries(buffers)) {
              if (!content) continue;
              const newId = idMap.get(oldId) ?? oldId;
              setRestoredContent(newId, content);
            }
          }
        } catch { /* ignore */ }

        set({
          tabs,
          activeTabId: savedLayout.activeTabId,
          fontSize: savedLayout.fontSize ?? DEFAULT_FONT_SIZE,
          uiZoom: savedLayout.uiZoom ?? DEFAULT_UI_ZOOM,
          visibleCount: savedLayout.visibleCount ?? 2,
        });

        // Apply restored settings
        setAllFontSize(savedLayout.fontSize ?? DEFAULT_FONT_SIZE);
        const zoom = savedLayout.uiZoom ?? DEFAULT_UI_ZOOM;
        if (zoom !== DEFAULT_UI_ZOOM) {
          window.termyApi.zoom.setFactor(zoom);
        }

        return;
      } catch (err) {
        console.error('[RESTORE] failed to restore sessions, starting fresh:', err);
        // Fall through to fresh start
      }
    }

    // Try to restore from disk (app restart / crash recovery)
    try {
      const diskState = await window.termyApi.persistence.load();
      if (diskState) {
        const parsed = JSON.parse(diskState);
        if (parsed.version === 1 && parsed.layout?.tabs?.length) {
          const restored = await restoreFromDisk(parsed);
          if (restored) {
            const { tabs, layout } = restored;
            set({
              tabs,
              activeTabId: layout.activeTabId,
              fontSize: layout.fontSize ?? DEFAULT_FONT_SIZE,
              uiZoom: layout.uiZoom ?? DEFAULT_UI_ZOOM,
              visibleCount: layout.visibleCount ?? 2,
            });
            setAllFontSize(layout.fontSize ?? DEFAULT_FONT_SIZE);
            const zoom = layout.uiZoom ?? DEFAULT_UI_ZOOM;
            if (zoom !== DEFAULT_UI_ZOOM) {
              window.termyApi.zoom.setFactor(zoom);
            }
            return;
          }
        }
      }
    } catch (err) {
      console.error('[RESTORE] failed to restore from disk, starting fresh:', err);
    }

    // Fresh start — no saved state or restore failed
    const sessionStore = useSessionStore.getState();
    const session1 = await sessionStore.createSession();
    const session2 = await sessionStore.createSession();
    const item1: CarouselItem = { id: nanoid(), sessionId: session1.id };
    const item2: CarouselItem = { id: nanoid(), sessionId: session2.id };
    const tabId = nanoid();
    const tab: Tab = {
      id: tabId,
      label: 'Group',
      carouselItems: [item1, item2],
      carouselFocusedIndex: 0,
      carouselFocusedItemId: item1.id,
    };
    set({ tabs: [tab], activeTabId: tabId });
  },

  createTab: async () => {
    const session = await useSessionStore.getState().createSession();
    const itemId = nanoid();
    const tabId = nanoid();
    const tab = makeDefaultTab(tabId, itemId, session.id, `Group ${get().tabs.length + 1}`);
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tabId,
      carouselZoomedOut: false,
    }));
  },

  closeTab: (tabId: TabId) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    for (const item of tab.carouselItems) {
      useSessionStore.getState().destroySession(item.sessionId);
    }

    const remaining = state.tabs.filter((t) => t.id !== tabId);
    if (remaining.length === 0) {
      get().createTab();
      set((s) => ({ tabs: s.tabs.filter((t) => t.id !== tabId) }));
      return;
    }

    const newActiveId = state.activeTabId === tabId
      ? remaining[Math.max(0, state.tabs.findIndex((t) => t.id === tabId) - 1)].id
      : state.activeTabId;

    set({ tabs: remaining, activeTabId: newActiveId, carouselZoomedOut: false });
  },

  setActiveTab: (tabId: TabId) => {
    set({ activeTabId: tabId, carouselZoomedOut: false });
  },

  renameTab: (tabId: TabId, label: string, manual?: boolean) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, label, ...(manual ? { manualLabel: true } : {}) } : t)),
    }));
  },

  toggleZoom: () => {
    const state = get();
    set({ carouselZoomedOut: !state.carouselZoomedOut });
  },

  focusDirection: (direction) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    if (!tab) return;

    if (direction === 'left' || direction === 'right') {
      const delta = direction === 'left' ? -1 : 1;
      const newIndex = Math.max(0, Math.min(tab.carouselItems.length - 1, tab.carouselFocusedIndex + delta));
      get().carouselScrollTo(newIndex);
    }
  },

  focusNext: () => {
    const tab = get().getActiveTab();
    if (!tab) return;
    const newIndex = (tab.carouselFocusedIndex + 1) % tab.carouselItems.length;
    get().carouselScrollTo(newIndex);
  },

  focusPrevious: () => {
    const tab = get().getActiveTab();
    if (!tab) return;
    const newIndex = (tab.carouselFocusedIndex - 1 + tab.carouselItems.length) % tab.carouselItems.length;
    get().carouselScrollTo(newIndex);
  },

  // Font size
  changeFontSize: (delta: number) => {
    const newSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, get().fontSize + delta));
    setAllFontSize(newSize);
    set({ fontSize: newSize });
  },

  resetFontSize: () => {
    setAllFontSize(DEFAULT_FONT_SIZE);
    set({ fontSize: DEFAULT_FONT_SIZE });
  },

  // UI zoom (scales entire app via Electron webFrame)
  changeUiZoom: (delta: number) => {
    const raw = get().uiZoom + delta;
    const rounded = Math.round(raw * 10) / 10;
    const newZoom = Math.min(MAX_UI_ZOOM, Math.max(MIN_UI_ZOOM, rounded));
    window.termyApi.zoom.setFactor(newZoom);
    set({ uiZoom: newZoom });
    // Re-fit all terminals after zoom to avoid blank lines
    requestAnimationFrame(() => fitAllTerminals());
  },

  resetUiZoom: () => {
    window.termyApi.zoom.setFactor(DEFAULT_UI_ZOOM);
    set({ uiZoom: DEFAULT_UI_ZOOM });
    requestAnimationFrame(() => fitAllTerminals());
  },

  // Search
  setSearchOpen: (paneId: string | null) => {
    set({ searchOpenPaneId: paneId });
  },

  // Drag and drop
  setDraggingTab: (dragging: boolean) => {
    set({ isDraggingTab: dragging });
  },

  reorderTab: (fromTabId: TabId, toTabId: TabId) => {
    set((state) => {
      const tabs = [...state.tabs];
      const fromIdx = tabs.findIndex((t) => t.id === fromTabId);
      const toIdx = tabs.findIndex((t) => t.id === toTabId);
      if (fromIdx === -1 || toIdx === -1) return state;
      const [moved] = tabs.splice(fromIdx, 1);
      tabs.splice(toIdx, 0, moved);
      return { tabs };
    });
  },

  // Carousel actions
  setCarouselZoomedOut: (zoomed: boolean) => {
    set({ carouselZoomedOut: zoomed });
  },

  carouselAddTerminal: async () => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    if (!tab) return '';

    const focusedItem = tab.carouselItems.find((c) => c.id === tab.carouselFocusedItemId);
    const sourceCwd = focusedItem ? useSessionStore.getState().sessions[focusedItem.sessionId]?.cwd : undefined;
    const session = await useSessionStore.getState().createSession(undefined, undefined, sourceCwd);
    const newItem: CarouselItem = { id: nanoid(), sessionId: session.id };

    set((s) => {
      const t = s.tabs.find((t) => t.id === s.activeTabId);
      if (!t) return s;
      const newItems = [...t.carouselItems, newItem];
      const newIndex = newItems.length - 1;
      return {
        carouselZoomedOut: false,
        tabs: s.tabs.map((tab) => {
          if (tab.id !== s.activeTabId) return tab;
          return {
            ...tab,
            carouselItems: newItems,
            carouselFocusedIndex: newIndex,
            carouselFocusedItemId: newItem.id,
          };
        }),
      };
    });

    return newItem.id;
  },

  carouselRemoveTerminal: (itemId: string) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    if (!tab) return;

    const item = tab.carouselItems.find((c) => c.id === itemId);
    if (!item) return;

    if (tab.carouselItems.length === 1) {
      get().closeTab(tab.id);
      return;
    }

    useSessionStore.getState().destroySession(item.sessionId);
    const newItems = tab.carouselItems.filter((c) => c.id !== itemId);
    const oldIdx = tab.carouselItems.findIndex((c) => c.id === itemId);
    const newIndex = Math.min(oldIdx, newItems.length - 1);

    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== s.activeTabId) return t;
        return {
          ...t,
          carouselItems: newItems,
          carouselFocusedIndex: newIndex,
          carouselFocusedItemId: newItems[newIndex]?.id ?? '',
        };
      }),
    }));
  },

  carouselReorder: (fromIndex: number, toIndex: number) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== state.activeTabId) return tab;
        const items = [...tab.carouselItems];
        const [moved] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, moved);
        return {
          ...tab,
          carouselItems: items,
          carouselFocusedIndex: toIndex,
          carouselFocusedItemId: moved.id,
        };
      }),
    }));
  },

  carouselScrollTo: (index: number) => {
    set((state) => {
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!tab) return state;
      const clampedIndex = Math.max(0, Math.min(tab.carouselItems.length - 1, index));
      return {
        tabs: state.tabs.map((t) => {
          if (t.id !== state.activeTabId) return t;
          return {
            ...t,
            carouselFocusedIndex: clampedIndex,
            carouselFocusedItemId: t.carouselItems[clampedIndex]?.id ?? '',
          };
        }),
      };
    });
  },

  carouselFocusItem: (itemId: string) => {
    set((state) => {
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!tab) return state;
      const idx = tab.carouselItems.findIndex((c) => c.id === itemId);
      if (idx === -1) return state;
      return {
        tabs: state.tabs.map((t) => {
          if (t.id !== state.activeTabId) return t;
          return {
            ...t,
            carouselFocusedIndex: idx,
            carouselFocusedItemId: itemId,
          };
        }),
      };
    });
  },

  // Visible count
  setVisibleCount: (n: number) => {
    set({ visibleCount: Math.max(1, n) });
  },

  getActiveTab: () => {
    const state = get();
    return state.tabs.find((t) => t.id === state.activeTabId);
  },
}));

// Persist layout to sessionStorage — debounced to avoid thrashing during animations
let layoutSaveTimer: ReturnType<typeof setTimeout> | null = null;
useLayoutStore.subscribe(() => {
  if (layoutSaveTimer) clearTimeout(layoutSaveTimer);
  layoutSaveTimer = setTimeout(() => {
    saveLayoutToStorage(useLayoutStore.getState());
    layoutSaveTimer = null;
  }, 500);
});
// Flush pending save on page unload so Cmd+R doesn't lose state
window.addEventListener('beforeunload', () => {
  if (layoutSaveTimer) {
    clearTimeout(layoutSaveTimer);
    saveLayoutToStorage(useLayoutStore.getState());
  }
});
