import { useEffect, useRef } from 'react';
import { TabBar } from './components/TabBar/TabBar';
import { CarouselLayout } from './components/CarouselLayout/CarouselLayout';
import { StatusBar } from './components/StatusBar/StatusBar';
import { useLayoutStore } from './store/layout-store';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useImagePaste } from './hooks/useImagePaste';
import { useFileDrop } from './hooks/useFileDrop';
import { useAutoTitles } from './hooks/useAutoTitles';
import { usePaneSummaries } from './hooks/usePaneSummaries';
import { useStatePersistence } from './hooks/useStatePersistence';
import { useSessionStore } from './store/session-store';

export function App() {
  const tabs = useLayoutStore((s) => s.tabs);
  const activeTabId = useLayoutStore((s) => s.activeTabId);
  const initFirstTab = useLayoutStore((s) => s.initFirstTab);

  useKeyboardShortcuts();
  useImagePaste();
  useFileDrop();
  useAutoTitles();
  usePaneSummaries();
  useStatePersistence();

  useEffect(() => {
    initFirstTab();

    const unsub = window.termyApi.pty.onExit((msg) => {
      useSessionStore.getState().updateSession(msg.sessionId, { alive: false });
    });
    return unsub;
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#111111] text-white overflow-hidden">
      <TabBar />
      <div className="flex-1 min-h-0 relative">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className="absolute inset-0"
              style={{ display: isActive ? 'block' : 'none' }}
            >
              <CarouselLayout tab={tab} isVisible={isActive} />
            </div>
          );
        })}
      </div>
      <StatusBar />
    </div>
  );
}
