import { useEffect } from 'react';
import { useLayoutStore } from '../store/layout-store';

const FRAME_BUDGET_MS = 20;
const LOG_COOLDOWN_MS = 250;

export function useFrameBudgetLogger() {
  useEffect(() => {
    let rafId = 0;
    let lastFrameTime = performance.now();
    let lastLogTime = 0;

    const resetClock = () => {
      lastFrameTime = performance.now();
    };

    const tick = (now: number) => {
      const frameDuration = now - lastFrameTime;
      lastFrameTime = now;

      if (
        document.visibilityState === 'visible' &&
        frameDuration > FRAME_BUDGET_MS &&
        now - lastLogTime >= LOG_COOLDOWN_MS
      ) {
        const state = useLayoutStore.getState();
        console.warn('[perf] frame over budget', {
          frameMs: Number(frameDuration.toFixed(1)),
          budgetMs: FRAME_BUDGET_MS,
          activeTabId: state.activeTabId,
          carouselProgress: Number(state.carouselProgress.toFixed(3)),
          carouselZoomedOut: state.carouselZoomedOut,
          isMaximized: state.isMaximized,
          fuzzyFinderOpen: state.fuzzyFinderOpen,
          settingsOpen: state.settingsOpen,
        });
        lastLogTime = now;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame((now) => {
      lastFrameTime = now;
      rafId = requestAnimationFrame(tick);
    });

    document.addEventListener('visibilitychange', resetClock);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', resetClock);
    };
  }, []);
}
