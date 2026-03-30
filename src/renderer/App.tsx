import { useEffect, useRef } from 'react';
import { TabBar } from './components/TabBar/TabBar';
import { CarouselLayout } from './components/CarouselLayout/CarouselLayout';
import { StatusBar } from './components/StatusBar/StatusBar';
import { useLayoutStore } from './store/layout-store';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useImagePaste } from './hooks/useImagePaste';
import { useFileDrop } from './hooks/useFileDrop';
import { usePaneSummaries } from './hooks/usePaneSummaries';
import { useClaudeDetector } from './hooks/useClaudeDetector';
import { useStatePersistence } from './hooks/useStatePersistence';
import { FuzzyFinder } from './components/FuzzyFinder/FuzzyFinder';
import { Settings } from './components/Settings/Settings';
import { useSessionStore } from './store/session-store';
import { useSettingsStore } from './store/settings-store';
import { rebuildWebgl, applyTerminalSettings } from './lib/terminal-registry';

export function App() {
  const tabs = useLayoutStore((s) => s.tabs);
  const activeTabId = useLayoutStore((s) => s.activeTabId);
  const initFirstTab = useLayoutStore((s) => s.initFirstTab);

  useKeyboardShortcuts();
  useImagePaste();
  useFileDrop();
  usePaneSummaries();
  useClaudeDetector();
  useStatePersistence();

  // Init settings before first tab so terminal options are ready
  useEffect(() => {
    useSettingsStore.getState().init();

    let prevTerminal = useSettingsStore.getState().terminal;
    let prevAppearance = useSettingsStore.getState().appearance;

    const unsub = useSettingsStore.subscribe((state) => {
      // Apply terminal settings when they change
      if (state.terminal !== prevTerminal) {
        prevTerminal = state.terminal;
        applyTerminalSettings();
      }

      // Apply appearance settings when they change
      if (state.appearance !== prevAppearance) {
        prevAppearance = state.appearance;
        const layoutStore = useLayoutStore.getState();
        if (state.appearance.uiZoom !== layoutStore.uiZoom) {
          window.termyApi.zoom.setFactor(state.appearance.uiZoom);
          useLayoutStore.setState({ uiZoom: state.appearance.uiZoom });
        }
        if (state.appearance.visibleCount !== layoutStore.visibleCount) {
          useLayoutStore.setState({ visibleCount: state.appearance.visibleCount });
        }
        document.documentElement.style.opacity = String(state.appearance.windowOpacity);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    initFirstTab();

    const unsubExit = window.termyApi.pty.onExit((msg) => {
      useSessionStore.getState().updateSession(msg.sessionId, { alive: false });
    });

    // Rebuild WebGL renderers after sleep/wake — GPU textures get corrupted
    // on resume but no webglcontextlost event fires.
    const unsubResume = window.termyApi.system.onResume(() => {
      console.log('[app] System resume detected, rebuilding WebGL renderers');
      rebuildWebgl();
    });

    const unsubSettings = window.termyApi.system.onOpenSettings(() => {
      useLayoutStore.getState().setSettingsOpen(true);
    });

    return () => { unsubExit(); unsubResume(); unsubSettings(); };
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
      <FuzzyFinder />
      <Settings />
    </div>
  );
}
