import { useEffect, useRef } from 'react';
import { useLayoutStore } from '../store/layout-store';
import { getBufferText } from '../lib/terminal-registry';
import { generateTitle } from '../lib/auto-title';

export function useAutoTitles() {
  const lastTitles = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const interval = setInterval(async () => {
      const state = useLayoutStore.getState();

      // Only generate titles for the active tab to avoid unnecessary work
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!tab || tab.manualLabel) return;

      const focusedItem = tab.carouselItems.find((c) => c.id === tab.carouselFocusedItemId) ?? tab.carouselItems[0];
      const sessionId = focusedItem?.sessionId;
      if (!sessionId) return;

      const text = getBufferText(sessionId, 30);
      if (!text.trim()) return;

      const textKey = text.slice(-200);
      if (lastTitles.current.get(tab.id) === textKey) return;

      const title = await generateTitle(text);
      if (title && title !== tab.label) {
        useLayoutStore.getState().renameTab(tab.id, title);
        lastTitles.current.set(tab.id, textKey);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);
}
