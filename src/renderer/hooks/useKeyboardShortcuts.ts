import { useEffect } from 'react';
import { useLayoutStore } from '../store/layout-store';
import { getTerminalEntry, jumpToPrompt } from '../lib/terminal-registry';
import { animatedRemoveTerminal } from '../lib/carousel-actions';

// Set when window mode is entered via Cmd+I/K hold; CarouselLayout reads this
// to know it should exit on Meta release.
export let _zoomEnteredViaHold = false;
export function clearZoomHold() { _zoomEnteredViaHold = false; }

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;
      const ctrl = e.ctrlKey;
      const key = e.key.toLowerCase();

      if (!meta) return;

      // Cmd+Space → no-op (prevent double-space leak into terminal)
      if (key === ' ' && !shift && !alt && !ctrl) {
        e.preventDefault();
        return;
      }

      const store = useLayoutStore.getState();
      const tab = store.getActiveTab();
      if (!tab) return;

      // Cmd+D → add terminal
      if (key === 'd' && !shift && !alt && !ctrl) {
        e.preventDefault();
        store.carouselAddTerminal();
        return;
      }

      // Cmd+W → close terminal
      if (key === 'w' && !shift && !alt && !ctrl) {
        e.preventDefault();
        animatedRemoveTerminal(tab.carouselFocusedItemId);
        return;
      }

      // Cmd+Shift+W → close tab
      if (key === 'w' && shift && !alt && !ctrl) {
        e.preventDefault();
        store.closeTab(tab.id);
        return;
      }

      // Cmd+T → new terminal in current tab
      if (key === 't' && !shift && !alt && !ctrl) {
        e.preventDefault();
        store.carouselAddTerminal();
        return;
      }

      // Cmd+Shift+Enter or Cmd+P → toggle overview
      if ((key === 'enter' && shift && !alt && !ctrl) ||
          (key === 'p' && !shift && !alt && !ctrl)) {
        e.preventDefault();
        store.toggleZoom();
        return;
      }

      // Cmd+Shift+K → clear terminal
      if (key === 'k' && shift && !alt && !ctrl) {
        e.preventDefault();
        const focusedItem = tab.carouselItems.find((c) => c.id === tab.carouselFocusedItemId);
        if (focusedItem) {
          const entry = getTerminalEntry(focusedItem.sessionId);
          if (entry) entry.terminal.clear();
        }
        return;
      }

      // Cmd+Up → jump to previous prompt
      if (key === 'arrowup' && !shift && !alt && !ctrl) {
        e.preventDefault();
        const focusedItem = tab.carouselItems.find((c) => c.id === tab.carouselFocusedItemId);
        if (focusedItem) jumpToPrompt(focusedItem.sessionId, 'prev');
        return;
      }

      // Cmd+Down → jump to next prompt
      if (key === 'arrowdown' && !shift && !alt && !ctrl) {
        e.preventDefault();
        const focusedItem = tab.carouselItems.find((c) => c.id === tab.carouselFocusedItemId);
        if (focusedItem) jumpToPrompt(focusedItem.sessionId, 'next');
        return;
      }

      // Cmd+F → search
      if (key === 'f' && !shift && !alt && !ctrl) {
        e.preventDefault();
        const paneId = tab.carouselFocusedItemId;
        if (store.searchOpenPaneId === paneId) {
          store.setSearchOpen(null);
        } else {
          store.setSearchOpen(paneId);
        }
        return;
      }

      // Cmd+= → zoom in
      if (key === '=' && !shift && !alt && !ctrl) {
        e.preventDefault();
        store.changeUiZoom(0.1);
        return;
      }

      // Cmd+- → zoom out
      if (key === '-' && !shift && !alt && !ctrl) {
        e.preventDefault();
        store.changeUiZoom(-0.1);
        return;
      }

      // Cmd+0 → reset zoom
      if (key === '0' && !shift && !alt && !ctrl) {
        e.preventDefault();
        store.resetUiZoom();
        return;
      }

      // Cmd+I/K → enter window mode (only from tab mode; in window mode, CarouselLayout handles grid nav)
      if ((key === 'i' || key === 'k') && !shift && !alt && !ctrl && !store.carouselZoomedOut) {
        e.preventDefault();
        store.toggleZoom();
        _zoomEnteredViaHold = true;
        return;
      }

      // Cmd+J/L → navigate left/right
      if (!shift && !alt && !ctrl) {
        const dirMap: Record<string, 'left' | 'right'> = { j: 'left', l: 'right' };
        const dir = dirMap[key];
        if (dir) {
          e.preventDefault();
          store.focusDirection(dir);
          return;
        }
      }

      // Cmd+Alt+Arrow → navigate
      if (alt && !shift && !ctrl) {
        const dirMap: Record<string, 'left' | 'right'> = {
          arrowleft: 'left',
          arrowright: 'right',
        };
        const dir = dirMap[key];
        if (dir) {
          e.preventDefault();
          store.focusDirection(dir);
          return;
        }
      }

      // Cmd+] → focus next, Cmd+[ → focus previous
      if (key === ']' && !shift && !alt && !ctrl) {
        e.preventDefault();
        store.focusNext();
        return;
      }
      if (key === '[' && !shift && !alt && !ctrl) {
        e.preventDefault();
        store.focusPrevious();
        return;
      }

      // Cmd+Shift+] / Cmd+O → next tab, Cmd+Shift+[ / Cmd+U → previous tab
      if ((key === ']' && shift && !alt && !ctrl) ||
          (key === 'o' && !shift && !alt && !ctrl)) {
        e.preventDefault();
        const idx = store.tabs.findIndex((t) => t.id === store.activeTabId);
        const next = store.tabs[(idx + 1) % store.tabs.length];
        if (next) store.setActiveTab(next.id);
        return;
      }
      if ((key === '[' && shift && !alt && !ctrl) ||
          (key === 'u' && !shift && !alt && !ctrl)) {
        e.preventDefault();
        const idx = store.tabs.findIndex((t) => t.id === store.activeTabId);
        const prev = store.tabs[(idx - 1 + store.tabs.length) % store.tabs.length];
        if (prev) store.setActiveTab(prev.id);
        return;
      }

      // Cmd+1-9 → jump to tab
      const tabNum = parseInt(key);
      if (tabNum >= 1 && tabNum <= 9 && !shift && !alt && !ctrl) {
        e.preventDefault();
        const targetTab = store.tabs[tabNum - 1];
        if (targetTab) store.setActiveTab(targetTab.id);
        return;
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
}
