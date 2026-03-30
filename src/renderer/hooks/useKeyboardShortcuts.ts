import { useEffect } from 'react';
import { useLayoutStore } from '../store/layout-store';
import { useSettingsStore } from '../store/settings-store';
import { getTerminalEntry, jumpToPrompt } from '../lib/terminal-registry';
import { animatedRemoveTerminal } from '../lib/carousel-actions';
import { eventMatchesCombo } from '../lib/default-keybindings';
import type { KeybindingAction } from '../types/settings';

// Set when window mode is entered via Cmd+I/K hold; CarouselLayout reads this
// to know it should exit on Meta release.
export let _zoomEnteredViaHold = false;
export function clearZoomHold() { _zoomEnteredViaHold = false; }

function findAction(e: KeyboardEvent, keybindings: Record<KeybindingAction, import('../types/settings').KeyCombo>): KeybindingAction | null {
  for (const [action, combo] of Object.entries(keybindings) as [KeybindingAction, import('../types/settings').KeyCombo][]) {
    if (eventMatchesCombo(e, combo)) return action;
  }
  return null;
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey;
      const key = e.key.toLowerCase();

      // Cmd+Space → no-op (prevent double-space leak into terminal)
      if (meta && key === ' ' && !e.shiftKey && !e.altKey && !e.ctrlKey) {
        e.preventDefault();
        return;
      }

      if (!meta && !e.ctrlKey) return;

      const store = useLayoutStore.getState();
      const tab = store.getActiveTab();
      if (!tab) return;

      const keybindings = useSettingsStore.getState().keybindings;
      const action = findAction(e, keybindings);
      if (!action) return;

      e.preventDefault();

      // Special guard: enterWindowMode only from tab mode, skip if overlays open
      if ((action === 'enterWindowModeI' || action === 'enterWindowModeK') &&
          (store.carouselZoomedOut || store.fuzzyFinderOpen || store.settingsOpen)) {
        return;
      }

      // Execute the action
      switch (action) {
        case 'addTerminal':
          store.carouselAddTerminal();
          break;

        case 'closeTerminal':
          animatedRemoveTerminal(tab.carouselFocusedItemId);
          break;

        case 'closeTab':
          store.closeTab(tab.id);
          break;

        case 'toggleSearch': {
          const paneId = tab.carouselFocusedItemId;
          store.setSearchOpen(store.searchOpenPaneId === paneId ? null : paneId);
          break;
        }

        case 'clearTerminal': {
          const focusedItem = tab.carouselItems.find((c) => c.id === tab.carouselFocusedItemId);
          if (focusedItem) {
            const entry = getTerminalEntry(focusedItem.sessionId);
            if (entry) entry.terminal.clear();
          }
          break;
        }

        case 'toggleWindowMode':
          store.toggleZoom();
          break;

        case 'enterWindowModeI':
        case 'enterWindowModeK':
          store.toggleZoom();
          _zoomEnteredViaHold = true;
          break;

        case 'fuzzyFinder':
          store.setFuzzyFinderOpen(!store.fuzzyFinderOpen);
          break;

        case 'openSettings':
          store.setSettingsOpen(!store.settingsOpen);
          break;

        case 'focusLeft':
        case 'altFocusLeft':
          store.focusDirection('left');
          break;

        case 'focusRight':
        case 'altFocusRight':
          store.focusDirection('right');
          break;

        case 'focusNext':
          store.focusNext();
          break;

        case 'focusPrevious':
          store.focusPrevious();
          break;

        case 'nextTab':
        case 'altNextTab': {
          const idx = store.tabs.findIndex((t) => t.id === store.activeTabId);
          const next = store.tabs[(idx + 1) % store.tabs.length];
          if (next) store.setActiveTab(next.id);
          break;
        }

        case 'prevTab':
        case 'altPrevTab': {
          const idx = store.tabs.findIndex((t) => t.id === store.activeTabId);
          const prev = store.tabs[(idx - 1 + store.tabs.length) % store.tabs.length];
          if (prev) store.setActiveTab(prev.id);
          break;
        }

        case 'jumpToTab1': case 'jumpToTab2': case 'jumpToTab3':
        case 'jumpToTab4': case 'jumpToTab5': case 'jumpToTab6':
        case 'jumpToTab7': case 'jumpToTab8': case 'jumpToTab9': {
          const num = parseInt(action.replace('jumpToTab', ''));
          const targetTab = store.tabs[num - 1];
          if (targetTab) store.setActiveTab(targetTab.id);
          break;
        }

        case 'zoomIn':
          store.changeUiZoom(0.1);
          break;

        case 'zoomOut':
          store.changeUiZoom(-0.1);
          break;

        case 'zoomReset':
          store.resetUiZoom();
          break;

        case 'promptUp': {
          const fi = tab.carouselItems.find((c) => c.id === tab.carouselFocusedItemId);
          if (fi) jumpToPrompt(fi.sessionId, 'prev');
          break;
        }

        case 'promptDown': {
          const fi = tab.carouselItems.find((c) => c.id === tab.carouselFocusedItemId);
          if (fi) jumpToPrompt(fi.sessionId, 'next');
          break;
        }

        case 'toggleMaximize':
          store.toggleMaximized();
          break;
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
}
