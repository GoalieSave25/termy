import { useEffect } from 'react';
import { useLayoutStore } from '../store/layout-store';

export function useImagePaste() {
  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      if (!e.clipboardData?.types.includes('image/png') &&
          !e.clipboardData?.types.includes('image/jpeg')) {
        return;
      }

      const store = useLayoutStore.getState();
      const tab = store.getActiveTab();
      if (!tab) return;

      const focusedItem = tab.carouselItems.find((c) => c.id === tab.carouselFocusedItemId);
      if (!focusedItem) return;

      e.preventDefault();

      const result = await window.termyApi.clipboard.readImage();
      if (result.filePath) {
        window.termyApi.pty.sendInput(focusedItem.sessionId, result.filePath);
      }
    };

    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, []);
}
