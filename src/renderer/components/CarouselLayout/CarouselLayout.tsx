import { useRef, useEffect, useLayoutEffect, useCallback, useState, useMemo } from 'react';
import { useLayoutStore } from '../../store/layout-store';
import { CarouselTerminalCard } from './CarouselTerminalCard';
import { BackgroundShader } from './BackgroundShader';
import { setAnimatedRemove } from '../../lib/carousel-actions';
import { _zoomEnteredViaHold, clearZoomHold } from '../../hooks/useKeyboardShortcuts';
import type { Tab, CarouselItem } from '../../types/tab';

interface CarouselLayoutProps {
  tab: Tab;
  isVisible: boolean;
}

/** carousel = Tab mode (full-size terminals side-by-side), overview = Window mode (zoomed-out grid) */
type Phase = 'carousel' | 'transitioning' | 'overview';

const PINCH_RANGE = 80;
const COMMIT_THRESHOLD = 1 / 3;
const GRID_PADDING = 24;
const GRID_GAP = 16;
const GRID_MIN_CARD_WIDTH = 280;


function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }

interface CardPos { x: number; y: number; scale: number; }

function computeCarouselPositions(
  count: number, scrollOffset: number, containerWidth: number, visibleCount: number,
): CardPos[] {
  const cardWidth = containerWidth / visibleCount;
  return Array.from({ length: count }, (_, i) => ({
    x: i * cardWidth - scrollOffset,
    y: 0,
    scale: 1,
  }));
}

function computeOverviewPositions(
  count: number, containerWidth: number, realCardWidth: number, realCardHeight: number,
  padding = GRID_PADDING, gap = GRID_GAP, minCardWidth = GRID_MIN_CARD_WIDTH,
): (CardPos & { clippedH: number })[] {
  const cols = Math.max(1, Math.floor(
    (containerWidth - 2 * padding + gap) / (minCardWidth + gap)
  ));
  const visualW = (containerWidth - 2 * padding - (cols - 1) * gap) / cols;
  const scale = visualW / realCardWidth;
  const fullH = realCardHeight * scale;
  const clippedH = Math.min(visualW, fullH); // cap to square
  return Array.from({ length: count }, (_, i) => ({
    x: padding + (i % cols) * (visualW + gap),
    y: padding + Math.floor(i / cols) * (clippedH + gap),
    scale,
    clippedH,
  }));
}

function getAddButtonRect(
  count: number, containerWidth: number, realCardWidth: number, realCardHeight: number,
  padding = GRID_PADDING, gap = GRID_GAP, minCardWidth = GRID_MIN_CARD_WIDTH,
) {
  const cols = Math.max(1, Math.floor(
    (containerWidth - 2 * padding + gap) / (minCardWidth + gap)
  ));
  const w = (containerWidth - 2 * padding - (cols - 1) * gap) / cols;
  const scale = w / realCardWidth;
  const fullH = realCardHeight * scale;
  const h = Math.min(w, fullH);
  return {
    x: padding + (count % cols) * (w + gap),
    y: padding + Math.floor(count / cols) * (h + gap),
    width: w, height: h,
  };
}

export function CarouselLayout({ tab, isVisible }: CarouselLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const persistentLayerRef = useRef<HTMLDivElement>(null);

  // Transition state
  const [phase, setPhase] = useState<Phase>('carousel');
  const [progress, setProgress] = useState(0);
  const phaseRef = useRef<Phase>('carousel');
  const progressRef = useRef(0);
  const gestureAccumRef = useRef(0);
  const gestureStartRef = useRef<'carousel' | 'overview'>('carousel');
  const gestureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrameRef = useRef(0);
  const gestureRafRef = useRef(0);

  // Scroll state — direct offset management (no ghost track)
  const scrollOffsetRef = useRef(0);
  const scrollAnimRef = useRef(0);
  const snapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  // Window mode highlight for keyboard/mouse navigation
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  // How window mode was entered: 'keyboard' (Cmd+I/K) or 'touch' (pinch gesture)
  const overviewEntryRef = useRef<'keyboard' | 'touch' | null>(null);

  // Terminal enter/exit animations
  const cardRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const prevItemCountRef = useRef(0);
  const isEnterAnimating = useRef(false);
  const isExitAnimating = useRef(false);
  // FLIP animation: old screen positions recorded before store removal
  const flipPositionsRef = useRef<Map<string, number> | null>(null);

  const carouselZoomedOut = useLayoutStore((s) => s.carouselZoomedOut);
  const setCarouselZoomedOut = useLayoutStore((s) => s.setCarouselZoomedOut);
  const carouselScrollTo = useLayoutStore((s) => s.carouselScrollTo);
  const carouselRemoveTerminal = useLayoutStore((s) => s.carouselRemoveTerminal);
  const carouselAddTerminal = useLayoutStore((s) => s.carouselAddTerminal);
  const carouselFocusItem = useLayoutStore((s) => s.carouselFocusItem);
  const carouselReorder = useLayoutStore((s) => s.carouselReorder);
  const visibleCount = useLayoutStore((s) => s.visibleCount);
  const uiZoom = useLayoutStore((s) => s.uiZoom);

  const { carouselItems, carouselFocusedIndex, carouselFocusedItemId } = tab;

  // visibleCount is a max — actual visible is capped by terminal count
  // Subtract removingIds.size so the width animation starts in parallel with the clip-path exit
  const effectiveVisible = Math.min(visibleCount, Math.max(1, carouselItems.length - removingIds.size));

  // Animate card width when effectiveVisible changes (e.g. adding a terminal)
  const [animatedVisible, setAnimatedVisible] = useState(effectiveVisible);
  const animatedVisibleRef = useRef(effectiveVisible);
  const widthAnimRef = useRef(0);

  useEffect(() => {
    if (effectiveVisible === animatedVisibleRef.current) return;
    cancelAnimationFrame(widthAnimRef.current);
    const from = animatedVisibleRef.current;
    const to = effectiveVisible;
    const t0 = performance.now();
    const dur = 250;
    function tick(now: number) {
      const t = Math.min(1, (now - t0) / dur);
      const eased = t < 1 ? t * (2 - t) : 1; // ease-out quad
      const v = from + (to - from) * eased;
      animatedVisibleRef.current = v;
      setAnimatedVisible(v);
      if (t < 1) widthAnimRef.current = requestAnimationFrame(tick);
    }
    widthAnimRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(widthAnimRef.current);
  }, [effectiveVisible]);

  const realCardWidth = containerSize.width / animatedVisible;
  const realCardHeight = containerSize.height;

  // Keep refs in sync
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useLayoutEffect(() => {
    phaseRef.current = phase;
    // Sync persistent layer transform before paint so there's no 1-frame gap
    // between the card position mode switch (lerped → absolute) and the
    // translateX that provides the scroll offset in carousel mode.
    if (persistentLayerRef.current) {
      if (phase === 'carousel') {
        persistentLayerRef.current.style.transform = `translateX(-${scrollOffsetRef.current}px)`;
      } else {
        persistentLayerRef.current.style.transform = '';
      }
    }
  }, [phase]);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0) setContainerSize({ width: r.width, height: r.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // --- Scroll management ---

  const syncPersistentLayer = useCallback(() => {
    if (!persistentLayerRef.current) return;
    if (phaseRef.current === 'carousel') {
      persistentLayerRef.current.style.transform = `translateX(-${scrollOffsetRef.current}px)`;
    } else {
      persistentLayerRef.current.style.transform = '';
    }
  }, []);

  const animateScrollTo = useCallback((target: number, duration = 250) => {
    cancelAnimationFrame(scrollAnimRef.current);
    const start = scrollOffsetRef.current;
    if (Math.abs(target - start) < 1) {
      scrollOffsetRef.current = target;
      syncPersistentLayer();
      return;
    }
    const t0 = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - t0) / duration);
      const eased = t < 1 ? t * (2 - t) : 1; // ease-out quad
      scrollOffsetRef.current = start + (target - start) * eased;
      syncPersistentLayer();
      if (t < 1) scrollAnimRef.current = requestAnimationFrame(tick);
    }
    scrollAnimRef.current = requestAnimationFrame(tick);
  }, [syncPersistentLayer]);

  // Animate progress toward a target (for zoom transitions)
  function animateTo(target: number, onComplete: () => void) {
    cancelAnimationFrame(animFrameRef.current);
    const start = progressRef.current;
    const t0 = performance.now();
    const dur = Math.max(80, 280 * Math.abs(target - start));
    function tick(now: number) {
      const t = Math.min(1, (now - t0) / dur);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const v = start + (target - start) * eased;
      progressRef.current = v;
      setProgress(v);
      if (t < 1) animFrameRef.current = requestAnimationFrame(tick);
      else { progressRef.current = target; setProgress(target); onComplete(); }
    }
    animFrameRef.current = requestAnimationFrame(tick);
  }

  // Sync with store's carouselZoomedOut (for keyboard-initiated transitions)
  const lastSyncedRef = useRef(carouselZoomedOut);
  useEffect(() => {
    if (carouselZoomedOut === lastSyncedRef.current) return;
    lastSyncedRef.current = carouselZoomedOut;
    if (carouselZoomedOut && progressRef.current < 1) {
      overviewEntryRef.current = _zoomEnteredViaHold ? 'keyboard' : 'touch';
      phaseRef.current = 'transitioning';
      setPhase('transitioning');
      animateTo(1, () => { phaseRef.current = 'overview'; setPhase('overview'); });
    } else if (!carouselZoomedOut && progressRef.current > 0) {
      phaseRef.current = 'transitioning';
      setPhase('transitioning');
      animateTo(0, () => { phaseRef.current = 'carousel'; setPhase('carousel'); });
    }
  }, [carouselZoomedOut]);

  // Initialize highlight when entering window mode
  const justEnteredOverviewRef = useRef(false);
  const scrollToHighlightRef = useRef(false);
  useLayoutEffect(() => {
    if (phase === 'overview' && scrollRef.current) {
      // Set scroll to match where cards were positioned during the transition
      // (they were offset by -overviewScrollOffset). This keeps everything in place.
      scrollRef.current.scrollTop = overviewScrollOffset;
    }
  }, [phase]);
  useEffect(() => {
    if (phase === 'overview') {
      // Don't trigger scroll-into-view — the useLayoutEffect above already
      // set scrollTop to the correct position matching the transition.
      justEnteredOverviewRef.current = false;
      setHighlightedItemId(tab.carouselFocusedItemId);
    } else if (phase === 'carousel') {
      setHighlightedItemId(null);
      overviewEntryRef.current = null;
    }
  }, [phase]);

  // Refs so the keyboard handler can access callbacks without declaration order issues
  const handleOverviewTapRef = useRef<(itemId: string) => void>(() => {});
  const handleAddTerminalRef = useRef<() => void>(() => {});

  // Window mode keyboard navigation (Cmd+I/J/K/L + Enter)
  useEffect(() => {
    if (phase !== 'overview' || !isVisible) return;
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // Enter — select highlighted terminal or add new
      if (key === 'enter' && !e.altKey && !e.ctrlKey) {
        if (highlightedItemId === '__new__') {
          e.preventDefault();
          handleAddTerminalRef.current();
        } else if (highlightedItemId) {
          e.preventDefault();
          handleOverviewTapRef.current(highlightedItemId);
        }
        return;
      }

      // Cmd+I/J/K/L — navigate grid (includes "New Terminal" button as last cell)
      if (!e.metaKey) return;
      const dirMap: Record<string, string> = { i: 'up', j: 'left', k: 'down', l: 'right' };
      const dir = dirMap[key];
      if (!dir) return;
      e.preventDefault();

      const totalCount = carouselItems.length + 1; // +1 for "New Terminal"
      const cols = gridCols;
      const currentIdx = highlightedItemId === '__new__'
        ? carouselItems.length
        : highlightedItemId
          ? carouselItems.findIndex((c) => c.id === highlightedItemId)
          : 0;
      if (currentIdx === -1) return;

      const row = Math.floor(currentIdx / cols);
      const col = currentIdx % cols;
      let newIdx = currentIdx;

      if (dir === 'left') newIdx = currentIdx > 0 ? currentIdx - 1 : currentIdx;
      else if (dir === 'right') newIdx = currentIdx + 1 < totalCount ? currentIdx + 1 : currentIdx;
      else if (dir === 'up') newIdx = row > 0 ? currentIdx - cols : currentIdx;
      else if (dir === 'down') {
        const targetIdx = currentIdx + cols;
        if (targetIdx < totalCount) {
          newIdx = targetIdx;
        } else {
          // No item in the same column in the next row — focus the last item in that row
          const targetRow = row + 1;
          const lastRowStart = targetRow * cols;
          if (lastRowStart < totalCount) {
            newIdx = totalCount - 1;
          }
        }
      }

      if (newIdx >= 0 && newIdx < totalCount) {
        scrollToHighlightRef.current = true;
        setHighlightedItemId(newIdx === carouselItems.length ? '__new__' : carouselItems[newIdx].id);
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [phase, isVisible, highlightedItemId, carouselItems, containerSize.width, uiZoom]);

  // Cmd hold-release: exit window mode and focus the highlighted terminal
  useEffect(() => {
    if (phase !== 'overview' || !isVisible) return;
    if (!_zoomEnteredViaHold) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Meta') return;
      clearZoomHold();
      if (highlightedItemId === '__new__') {
        handleAddTerminalRef.current();
      } else if (highlightedItemId) {
        handleOverviewTapRef.current(highlightedItemId);
      } else {
        // No selection — just exit window mode
        setCarouselZoomedOut(false);
      }
    };
    window.addEventListener('keyup', handler, true);
    return () => window.removeEventListener('keyup', handler, true);
  }, [phase, isVisible, highlightedItemId, setCarouselZoomedOut]);

  // Scroll highlighted item into view in window mode (keyboard nav only, not hover)
  useEffect(() => {
    if (phase !== 'overview' || !highlightedItemId || !scrollRef.current) return;
    if (!justEnteredOverviewRef.current && !scrollToHighlightRef.current) return;
    // Instant scroll on initial entry (no jerk after transition), smooth for keyboard nav
    const behavior = justEnteredOverviewRef.current ? 'instant' as ScrollBehavior : 'smooth';
    justEnteredOverviewRef.current = false;
    scrollToHighlightRef.current = false;

    if (highlightedItemId === '__new__') {
      // "New Terminal" button — use memoized rect
      const container = scrollRef.current;
      const top = addButtonRect.y;
      const bottom = addButtonRect.y + addButtonRect.height;
      if (top < container.scrollTop) {
        container.scrollTo({ top: top - gridPadding, behavior });
      } else if (bottom > container.scrollTop + container.clientHeight) {
        container.scrollTo({ top: bottom - container.clientHeight + gridPadding, behavior });
      }
    } else {
      const el = cardRefsMap.current.get(highlightedItemId);
      if (el) {
        const container = scrollRef.current;
        const top = el.offsetTop;
        const bottom = top + el.offsetHeight;
        if (top < container.scrollTop) {
          container.scrollTo({ top: top - gridPadding, behavior });
        } else if (bottom > container.scrollTop + container.clientHeight) {
          container.scrollTo({ top: bottom - container.clientHeight + gridPadding, behavior });
        }
      }
    }
  }, [highlightedItemId, phase]);

  // Pinch gesture — continuous progress
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();

    if (phaseRef.current === 'carousel') {
      // scrollOffsetRef already has the current position
      phaseRef.current = 'transitioning';
      setPhase('transitioning');
      gestureAccumRef.current = 0;
      gestureStartRef.current = 'carousel';
      cancelAnimationFrame(animFrameRef.current);
    } else if (phaseRef.current === 'overview') {
      phaseRef.current = 'transitioning';
      setPhase('transitioning');
      gestureAccumRef.current = PINCH_RANGE;
      gestureStartRef.current = 'overview';
      cancelAnimationFrame(animFrameRef.current);
    } else if (phaseRef.current === 'transitioning') {
      cancelAnimationFrame(animFrameRef.current);
      gestureAccumRef.current = progressRef.current * PINCH_RANGE;
    }

    gestureAccumRef.current = clamp(gestureAccumRef.current + e.deltaY, 0, PINCH_RANGE);
    const p = gestureAccumRef.current / PINCH_RANGE;
    progressRef.current = p;
    // Batch setProgress to once per frame — trackpads can fire 120+ wheel events/sec
    cancelAnimationFrame(gestureRafRef.current);
    gestureRafRef.current = requestAnimationFrame(() => {
      setProgress(progressRef.current);
    });

    if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
    gestureTimeoutRef.current = setTimeout(() => {
      const cur = progressRef.current;
      const commitToOverview = gestureStartRef.current === 'carousel'
        ? cur >= COMMIT_THRESHOLD
        : cur > 1 - COMMIT_THRESHOLD;
      if (commitToOverview) {
        overviewEntryRef.current = 'touch';
        lastSyncedRef.current = true;
        setCarouselZoomedOut(true);
        animateTo(1, () => { phaseRef.current = 'overview'; setPhase('overview'); });
      } else {
        lastSyncedRef.current = false;
        setCarouselZoomedOut(false);
        animateTo(0, () => { phaseRef.current = 'carousel'; setPhase('carousel'); });
      }
    }, 150);
  }, [setCarouselZoomedOut]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', handleWheel, { capture: true });
  }, [handleWheel]);

  // Cleanup
  useEffect(() => () => {
    cancelAnimationFrame(animFrameRef.current);
    cancelAnimationFrame(scrollAnimRef.current);
    cancelAnimationFrame(gestureRafRef.current);
    if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
    if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
  }, []);

  // On focus change: scroll only if focused card is outside the visible viewport
  useEffect(() => {
    if (phase !== 'carousel' || isEnterAnimating.current || isExitAnimating.current) return;
    const cw = containerSize.width / effectiveVisible;
    const cardLeft = carouselFocusedIndex * cw;
    const cardRight = cardLeft + cw;
    const viewLeft = scrollOffsetRef.current;
    const viewRight = viewLeft + containerSize.width;
    const maxScroll = Math.max(0, Math.floor((carouselItems.length - removingIds.size - effectiveVisible) * cw));

    if (cardLeft < viewLeft - 1) {
      // Snap so focused card is at left edge
      animateScrollTo(clamp(Math.floor(cardLeft), 0, maxScroll));
    } else if (cardRight > viewRight + 1) {
      // Snap so focused card is at right edge
      const target = Math.floor((carouselFocusedIndex - effectiveVisible + 1) * cw);
      animateScrollTo(clamp(target, 0, maxScroll));
    }
  }, [carouselFocusedIndex, phase, effectiveVisible, containerSize.width, carouselItems.length, animateScrollTo]);

  // Set initial scroll position when entering carousel mode or becoming visible
  useEffect(() => {
    if (phase !== 'carousel' || !isVisible) return;
    const cw = containerSize.width / effectiveVisible;
    const max = Math.max(0, (carouselItems.length - effectiveVisible) * cw);
    cancelAnimationFrame(scrollAnimRef.current);
    scrollOffsetRef.current = clamp(carouselFocusedIndex * cw, 0, max);
    syncPersistentLayer();
    requestAnimationFrame(syncPersistentLayer);
  }, [isVisible, phase, containerSize.width]);

  // Clamp scroll offset when items are removed
  useEffect(() => {
    if (phase !== 'carousel') return;
    if (isExitAnimating.current) return;
    const cw = containerSize.width / effectiveVisible;
    const max = Math.max(0, (carouselItems.length - removingIds.size - effectiveVisible) * cw);
    if (scrollOffsetRef.current > max + 1) {
      animateScrollTo(max);
    }
  }, [carouselItems.length, removingIds.size, phase, effectiveVisible, containerSize.width, animateScrollTo]);

  // Horizontal wheel → update scroll offset directly, snap when fingers lift.
  // Uses Electron's input-event gesture phases to detect finger-lift precisely.
  // Axis locking: the first wheel event in a gesture determines the axis.
  // If vertical, we let the terminal handle it and ignore horizontal movement.
  const scrollAxisRef = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const scrollAxisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const momentumLockedRef = useRef(false);
  const scrollingRef = useRef(false);

  // Listen for trackpad gesture phases from Electron main process
  useEffect(() => {
    return window.termyApi.scroll.onPhase((gestureType) => {
      if (phaseRef.current !== 'carousel') return;

      if (gestureType === 'gestureScrollBegin') {
        scrollingRef.current = true;
        momentumLockedRef.current = false;
      } else if (gestureType === 'gestureScrollEnd') {
        // Fingers lifted — snap to nearest card
        scrollingRef.current = false;
        momentumLockedRef.current = true;

        const cw = containerSize.width / effectiveVisible;
        const activeCount = carouselItems.length - removingIds.size;
        const maxSnap = Math.max(0, (activeCount - effectiveVisible) * cw);
        const snapped = Math.round(scrollOffsetRef.current / cw) * cw;
        const target = clamp(snapped, 0, maxSnap);
        animateScrollTo(target);

        const newIdx = clamp(Math.round(target / cw), 0, activeCount - 1);
        if (newIdx !== carouselFocusedIndex) carouselScrollTo(newIdx);
      } else if (gestureType === 'gestureFlingCancel') {
        momentumLockedRef.current = false;
      }
    });
  }, [animateScrollTo, effectiveVisible, carouselItems.length, removingIds.size, containerSize.width, carouselFocusedIndex, carouselScrollTo]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      if (phaseRef.current !== 'carousel') return;

      // Determine axis on first event of a gesture
      if (scrollAxisRef.current === 'none') {
        scrollAxisRef.current = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? 'horizontal' : 'vertical';
      }
      // Reset axis lock after scroll inactivity
      if (scrollAxisTimeoutRef.current) clearTimeout(scrollAxisTimeoutRef.current);
      scrollAxisTimeoutRef.current = setTimeout(() => { scrollAxisRef.current = 'none'; }, 150);

      // Vertical scroll — let the terminal handle it
      if (scrollAxisRef.current === 'vertical') return;

      // Horizontal-locked: prevent the event from also scrolling the terminal
      e.preventDefault();
      e.stopPropagation();

      // After fingers lifted, swallow momentum wheel events
      if (momentumLockedRef.current) return;

      // Cancel any running scroll animation — user took over
      cancelAnimationFrame(scrollAnimRef.current);

      const cw = containerSize.width / effectiveVisible;
      const activeCount = carouselItems.length - removingIds.size;
      const maxScroll = Math.max(0, (activeCount - effectiveVisible) * cw);
      const prev = scrollOffsetRef.current;
      scrollOffsetRef.current = clamp(prev + e.deltaX, 0, maxScroll);
      syncPersistentLayer();

      // Fallback snap for non-trackpad devices (mice don't fire gesture events)
      if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
      snapTimeoutRef.current = setTimeout(() => {
        if (phaseRef.current !== 'carousel') return;
        if (scrollingRef.current) return; // trackpad still active, gesture handler will snap
        const maxSnap = Math.max(0, (activeCount - effectiveVisible) * cw);
        const snapped = Math.round(scrollOffsetRef.current / cw) * cw;
        const target = clamp(snapped, 0, maxSnap);
        animateScrollTo(target);
        const newIdx = clamp(Math.round(target / cw), 0, activeCount - 1);
        if (newIdx !== carouselFocusedIndex) carouselScrollTo(newIdx);
      }, 150);
    };
    el.addEventListener('wheel', handler, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', handler, { capture: true });
  }, [syncPersistentLayer, animateScrollTo, effectiveVisible, carouselItems.length, removingIds.size, containerSize.width, carouselFocusedIndex, carouselScrollTo]);

  // --- Detect new terminals and animate them in ---
  // The width animation (animatedVisible) handles existing cards shrinking.
  // The clip-path animation reveals the new card on top of that.
  useLayoutEffect(() => {
    if (carouselItems.length > prevItemCountRef.current && phase === 'carousel') {
      const newItem = carouselItems[carouselItems.length - 1];
      const el = cardRefsMap.current.get(newItem.id);
      const screenIsFull = prevItemCountRef.current >= visibleCount;

      if (el && !screenIsFull) {
        isEnterAnimating.current = true;
        const anim = el.animate([
          { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
          { clipPath: 'inset(0 0% 0 0)', opacity: 1 },
        ], {
          duration: 280,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'backwards',
        });
        anim.onfinish = () => {
          isEnterAnimating.current = false;
        };
      }
    }
    prevItemCountRef.current = carouselItems.length;
  }, [carouselItems.length, phase, visibleCount]);

  // --- FLIP animation: slide remaining cards into place after a removal ---
  useLayoutEffect(() => {
    const oldPositions = flipPositionsRef.current;
    if (!oldPositions || phase !== 'carousel') return;
    flipPositionsRef.current = null;

    cardRefsMap.current.forEach((el, id) => {
      const oldLeft = oldPositions.get(id);
      if (oldLeft === undefined) return;
      const newLeft = el.getBoundingClientRect().left;
      const delta = oldLeft - newLeft;
      if (Math.abs(delta) < 1) return;
      el.animate([
        { transform: `translateX(${delta}px)` },
        { transform: 'translateX(0)' },
      ], {
        duration: 250,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'backwards',
      });
    });
  }, [carouselItems.length, phase]);

  // --- Animated terminal removal ---
  const handleRemoveTerminal = useCallback((itemId: string) => {
    const el = cardRefsMap.current.get(itemId);
    if (!el || phase !== 'carousel') {
      carouselRemoveTerminal(itemId);
      return;
    }

    isExitAnimating.current = true;

    setRemovingIds((prev) => new Set(prev).add(itemId));
    const anim = el.animate([
      { clipPath: 'inset(0 0% 0 0)', opacity: 1 },
      { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
    ], {
      duration: 250,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'forwards',
    });
    anim.onfinish = () => {
      // Record screen positions of remaining cards for FLIP slide animation
      const positions = new Map<string, number>();
      cardRefsMap.current.forEach((cardEl, id) => {
        if (id !== itemId) positions.set(id, cardEl.getBoundingClientRect().left);
      });
      flipPositionsRef.current = positions;

      // Clear guard before state updates so scroll clamp can run in the batched render
      isExitAnimating.current = false;
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      carouselRemoveTerminal(itemId);
    };
  }, [phase, carouselRemoveTerminal]);

  // Expose animated remove globally so keyboard shortcuts can use it
  useEffect(() => {
    setAnimatedRemove(handleRemoveTerminal);
    return () => setAnimatedRemove(null);
  }, [handleRemoveTerminal]);

  const handleAddTerminal = useCallback(() => {
    carouselAddTerminal();
  }, [carouselAddTerminal]);
  handleAddTerminalRef.current = handleAddTerminal;

  // --- Overview tap (zoom back to a card) ---
  const handleOverviewTap = useCallback((itemId: string) => {
    const idx = carouselItems.findIndex((c) => c.id === itemId);
    if (idx !== -1) {
      const cw = containerSize.width / effectiveVisible;
      scrollOffsetRef.current = idx * cw;
      carouselFocusItem(itemId);
      carouselScrollTo(idx);
    }

    lastSyncedRef.current = false;
    setCarouselZoomedOut(false);
    phaseRef.current = 'transitioning';
    setPhase('transitioning');
    animateTo(0, () => { phaseRef.current = 'carousel'; setPhase('carousel'); });
  }, [carouselItems, containerSize.width, effectiveVisible, carouselFocusItem, carouselScrollTo, setCarouselZoomedOut]);
  handleOverviewTapRef.current = handleOverviewTap;

  // --- Drag to reorder ---
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // --- Compute interpolated positions (memoized to avoid O(n) recalc every frame) ---
  const gridPadding = GRID_PADDING / uiZoom;
  const gridGap = GRID_GAP / uiZoom;
  const gridMinCardWidth = GRID_MIN_CARD_WIDTH / uiZoom;

  // Grid column count for z-index computation during transition
  const gridCols = useMemo(() => Math.max(1, Math.floor(
    (containerSize.width - 2 * gridPadding + gridGap) / (gridMinCardWidth + gridGap)
  )), [containerSize.width, gridPadding, gridGap, gridMinCardWidth]);
  const focusedGridRow = Math.floor(carouselFocusedIndex / gridCols);
  const totalGridRows = Math.ceil(carouselItems.length / gridCols);

  const maxScrollOffset = Math.max(0, (carouselItems.length - animatedVisible) * realCardWidth);
  const clampedScrollOffset = clamp(scrollOffsetRef.current, 0, maxScrollOffset);

  const carouselPos = useMemo(() => computeCarouselPositions(
    carouselItems.length, clampedScrollOffset, containerSize.width, animatedVisible,
  ), [carouselItems.length, clampedScrollOffset, containerSize.width, animatedVisible]);
  const overviewPos = useMemo(() => computeOverviewPositions(
    carouselItems.length, containerSize.width, realCardWidth, realCardHeight,
    gridPadding, gridGap, gridMinCardWidth,
  ), [carouselItems.length, containerSize.width, realCardWidth, realCardHeight, gridPadding, gridGap, gridMinCardWidth]);

  // Memoize add button rect to avoid repeated computation in render
  const addButtonRect = useMemo(() => getAddButtonRect(
    carouselItems.length, containerSize.width, realCardWidth, realCardHeight,
    gridPadding, gridGap, gridMinCardWidth,
  ), [carouselItems.length, containerSize.width, realCardWidth, realCardHeight, gridPadding, gridGap, gridMinCardWidth]);

  // Compute how much the overview grid needs to scroll to show the focused card.
  // During the transition, we offset all overview Y positions by this amount so
  // cards animate to visible positions. When overview mode starts, we set scrollTop
  // to the real offset so everything stays in place.
  const focusedOverview = overviewPos[carouselFocusedIndex];
  const focusedCardBottom = focusedOverview
    ? focusedOverview.y + focusedOverview.clippedH
    : 0;
  const overviewScrollOffset = focusedCardBottom > containerSize.height
    ? focusedCardBottom - containerSize.height + gridPadding
    : 0;

  const isCarousel = phase === 'carousel';


  // ===================== RENDER =====================

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Content area */}
      <div ref={containerRef} className="flex-1 min-h-0 relative overflow-hidden">
        <BackgroundShader progress={progress} active={phase !== 'carousel'} />

        {/* Scrollable layer — only scrolls in window mode */}
        <div
          ref={scrollRef}
          className={`absolute inset-0 ${phase === 'overview' ? 'overflow-y-auto overflow-x-hidden' : ''}`}
        >

        {/* Persistent terminal layer — always mounted, terminals never unmount */}
        <div
          ref={persistentLayerRef}
          className="absolute inset-0"
          style={{
            pointerEvents: 'none',
            zIndex: 1,
            overflow: isCarousel ? 'visible' : 'hidden',
            ...(phase === 'overview' ? {
              minHeight: addButtonRect.y + addButtonRect.height + gridPadding,
            } : {}),
          }}
        >
          {carouselItems.map((item, i) => {
            const isRemoving = removingIds.has(item.id);

            // Position: in carousel mode, static positions (parent translateX handles scroll)
            // In transition/overview, interpolated positions
            let x: number, y: number, s: number;
            if (isCarousel) {
              x = i * realCardWidth;
              y = 0;
              s = 1;
            } else {
              const from = carouselPos[i];
              const to = overviewPos[i];
              // During transition, offset overview Y so the focused card animates
              // to a visible position. In overview mode, scrollTop handles it.
              const yOffset = phase !== 'overview' ? overviewScrollOffset : 0;
              x = lerp(from.x, to.x, progress);
              y = lerp(from.y, to.y - yOffset, progress);
              s = lerp(from.scale, to.scale, progress);
            }

            const visualW = realCardWidth * s;
            const fullVisualH = realCardHeight * s;
            const clippedH = overviewPos[i]?.clippedH ?? fullVisualH;
            const visualH = isCarousel ? fullVisualH : lerp(fullVisualH, clippedH, progress);
            const isComplete = progress >= 1;

            const isHighlighted = isComplete && highlightedItemId === item.id;
            const isFocusedCard = item.id === carouselFocusedItemId;

            return (
              <div
                key={item.id}
                ref={(el) => {
                  if (el) cardRefsMap.current.set(item.id, el);
                  else cardRefsMap.current.delete(item.id);
                }}
                onMouseEnter={isComplete && overviewEntryRef.current === 'touch' ? () => setHighlightedItemId(item.id) : undefined}
                onMouseLeave={isComplete && overviewEntryRef.current === 'touch' ? () => setHighlightedItemId(null) : undefined}
                className={`absolute ${isComplete
                  ? `${overviewEntryRef.current === 'touch' ? 'group' : ''} transition-all duration-200 ${isHighlighted
                    ? 'outline outline-2 outline-blue-500'
                    : 'outline outline-1 outline-white/10'}`
                  : ''}`}
                style={{
                  left: x,
                  top: y,
                  zIndex: (() => {
                    const cardRow = Math.floor(i / gridCols);
                    const rowDistance = Math.abs(cardRow - focusedGridRow);
                    const rowZ = (totalGridRows - rowDistance) * 2;
                    return isFocusedCard ? rowZ + 1 : rowZ;
                  })(),
                  width: isCarousel ? realCardWidth : visualW,
                  height: isCarousel ? realCardHeight : visualH,
                  borderRadius: isCarousel ? 2 : lerp(2, 10, progress),
                  overflow: 'hidden',
                  pointerEvents: isRemoving ? 'none' : 'auto',
                  transition: isComplete ? 'box-shadow 200ms ease, transform 150ms ease' : undefined,
                  // Apply blur only at final state — animating blur per-frame is GPU-intensive
                  ...(progress >= 1 ? {
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                  } : {}),
                  // Always set background (don't remove in carousel) to avoid
                  // compositing layer teardown that flashes the WebGL canvas.
                  background: `rgba(17, 17, 17, ${isCarousel ? 1 : lerp(1, 0.82, progress)})`,
                  ...(!isCarousel && phase !== 'overview' ? {
                    outline: isFocusedCard
                      ? `2px solid rgba(59, 130, 246, ${clamp(progress, 0, 1)})`
                      : `1px solid rgba(255, 255, 255, ${0.1 * clamp(progress, 0, 1)})`,
                    outlineOffset: 0,
                  } : {}),
                }}
              >
                {/* Inner card at full resolution, scaled via CSS in overview */}
                <div
                  style={{
                    width: realCardWidth,
                    height: realCardHeight,
                    transform: `scale(${s})`,
                    transformOrigin: 'top left',
                    opacity: isCarousel ? 1 : lerp(1, phase === 'overview' ? (isHighlighted ? 1 : 0.5) : (isFocusedCard ? 1 : 0.5), progress),
                    willChange: 'transform',
                    transition: isComplete ? 'opacity 200ms ease' : undefined,
                  }}
                  draggable={isComplete}
                  onDragStart={isComplete ? (e) => {
                    setDragIdx(i);
                    e.dataTransfer.effectAllowed = 'move';
                  } : undefined}
                  onDragOver={isComplete ? (e) => {
                    e.preventDefault();
                    setDragOverIdx(i);
                  } : undefined}
                  onDrop={isComplete ? (e) => {
                    e.preventDefault();
                    if (dragIdx !== null && dragIdx !== i) carouselReorder(dragIdx, i);
                    setDragIdx(null);
                    setDragOverIdx(null);
                  } : undefined}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                >
                  <CarouselTerminalCard
                    item={item}
                    isFocused={isComplete ? false : (!isRemoving && item.id === carouselFocusedItemId)}
                    isVisible={isVisible}
                    interactionDisabled={progress > 0.1}
                    resizeSuppressed={!isCarousel}
                    overviewProgress={progress}
                    cardScale={s}
                    onClose={() => isCarousel ? handleRemoveTerminal(item.id) : carouselRemoveTerminal(item.id)}
                    onTap={!isCarousel ? () => handleOverviewTap(item.id) : undefined}
                  />
                </div>

                {/* Close button — overview only, hidden in keyboard mode */}
                {progress > 0.6 && overviewEntryRef.current !== 'keyboard' && (
                  <button
                    className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center
                      rounded-full bg-black/60 text-gray-500
                      hover:bg-red-500/90 hover:text-white hover:scale-110
                      active:scale-90 active:bg-red-600 active:text-white
                      transition-all duration-150 ease-out z-30
                      opacity-0 group-hover:opacity-100 cursor-pointer select-none
                      backdrop-blur-sm shadow-sm hover:shadow-md hover:shadow-red-500/20"
                    onClick={(e) => { e.stopPropagation(); carouselRemoveTerminal(item.id); }}
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
                    </svg>
                  </button>
                )}

                {/* Click overlay to zoom into card — overview only */}
                {progress > 0.5 && (
                  <div
                    className="absolute inset-0 z-10 cursor-pointer"
                    onMouseDown={() => {
                      const wrapper = cardRefsMap.current.get(item.id);
                      if (wrapper) wrapper.style.transform = 'scale(0.96)';
                    }}
                    onMouseUp={() => {
                      const wrapper = cardRefsMap.current.get(item.id);
                      if (wrapper) wrapper.style.transform = '';
                    }}
                    onMouseLeave={() => {
                      const wrapper = cardRefsMap.current.get(item.id);
                      if (wrapper) wrapper.style.transform = '';
                    }}
                    onClick={() => handleOverviewTap(item.id)}
                  />
                )}

                {/* Drag target indicator */}
                {dragOverIdx === i && dragIdx !== i && (
                  <div className="absolute inset-0 ring-2 ring-blue-400/50 rounded-lg pointer-events-none z-20" />
                )}
              </div>
            );
          })}

          {/* Add button — grid position in overview */}
          {(() => {
            if (progress > 0.4) {
              const r = addButtonRect;
              const isNewHighlighted = progress >= 1 && highlightedItemId === '__new__';
              return (
                <button
                  className={`absolute flex items-center justify-center rounded-lg
                    border-2 border-dashed duration-150 transition-[border-color,background-color,color,transform]
                    ${overviewEntryRef.current === 'keyboard' ? '' : 'cursor-pointer active:scale-95'}
                    ${isNewHighlighted
                      ? 'border-blue-500 bg-white/5 text-white/70'
                      : overviewEntryRef.current === 'keyboard'
                        ? 'border-white/10 text-white/50'
                        : 'border-white/10 hover:border-white/25 hover:bg-white/5 text-white/50 hover:text-white/70'
                    }`}
                  style={{
                    left: r.x,
                    top: r.y - (phase !== 'overview' ? overviewScrollOffset : 0),
                    width: r.width, height: r.height,
                    opacity: clamp((progress - 0.4) / 0.6, 0, 1),
                    pointerEvents: 'auto',
                    zIndex: -1,
                  }}
                  onMouseEnter={progress >= 1 && overviewEntryRef.current === 'touch' ? () => setHighlightedItemId('__new__') : undefined}
                  onMouseLeave={progress >= 1 && overviewEntryRef.current === 'touch' ? () => setHighlightedItemId(null) : undefined}
                  onClick={handleAddTerminal}
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-2xl">+</span>
                    <span className="text-xs">New Terminal</span>
                  </div>
                </button>
              );
            }
            return null;
          })()}
        </div>

        </div>{/* end scrollRef */}
      </div>

      {/* Dot indicators — always reserve space so terminal height doesn't jump */}
      <div
        className="flex items-center justify-center gap-1.5 h-5 shrink-0"
        style={{ opacity: progress <= 0 ? 1 : Math.max(0, 1 - progress * 3) }}
      >
        {carouselItems.map((item, index) => (
            <button
              key={item.id}
              className={`rounded-full transition-all duration-200
                ${index === carouselFocusedIndex
                  ? 'w-2 h-2 bg-gray-400'
                  : 'w-1.5 h-1.5 bg-gray-600 hover:bg-gray-500'
                }`}
              onClick={() => carouselScrollTo(index)}
            />
        ))}
      </div>
    </div>
  );
}
