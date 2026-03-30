import { useState, useEffect, useRef, useCallback } from 'react';
import { useLayoutStore } from '../../store/layout-store';

interface ContextMenu {
  tabId: string;
  x: number;
  y: number;
}

function getTabTranslateX(
  tabIndex: number,
  dragFromIndex: number,
  insertionIndex: number,
  width: number,
): number {
  if (tabIndex === dragFromIndex) return 0;
  if (dragFromIndex < insertionIndex) {
    // Dragging right: tabs in (dragFrom, insertion] shift left
    if (tabIndex > dragFromIndex && tabIndex <= insertionIndex) return -width;
  } else if (dragFromIndex > insertionIndex) {
    // Dragging left: tabs in [insertion, dragFrom) shift right
    if (tabIndex >= insertionIndex && tabIndex < dragFromIndex) return width;
  }
  return 0;
}

export function TabBar() {
  const tabs = useLayoutStore((s) => s.tabs);
  const activeTabId = useLayoutStore((s) => s.activeTabId);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const createTab = useLayoutStore((s) => s.createTab);
  const closeTab = useLayoutStore((s) => s.closeTab);
  const reorderTab = useLayoutStore((s) => s.reorderTab);
  const setDraggingTab = useLayoutStore((s) => s.setDraggingTab);
  const carouselAddTerminal = useLayoutStore((s) => s.carouselAddTerminal);

  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const draggedTabWidth = useRef(0);
  const originalMidpoints = useRef<number[]>([]);
  const dragFromIndexRef = useRef(-1);
  const clickAnimRef = useRef<{ tabId: string; startY: number; isLiftingOff: boolean } | null>(null);
  const clickAnimCleanupRef = useRef<(() => void) | null>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);

  // Clean up click animation listeners on unmount
  useEffect(() => () => { clickAnimCleanupRef.current?.(); }, []);

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  // Focus rename input when it appears
  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  const handleRenameSubmit = (tabId: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      useLayoutStore.getState().renameTab(tabId, trimmed, true);
    }
    setRenaming(null);
  };

  const handleCloseGroup = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.carouselItems.length > 1) {
      setConfirmClose(tabId);
    } else {
      closeTab(tabId);
    }
  };

  const computeInsertionIndex = useCallback((clientX: number): number => {
    const dragFromIndex = dragFromIndexRef.current;
    const midpoints = originalMidpoints.current;

    // Walk through non-dragged tabs, find where cursor falls
    let slotIndex = 0;
    let found = false;
    for (let i = 0; i < midpoints.length; i++) {
      if (i === dragFromIndex) continue;
      if (clientX < midpoints[i]) {
        // Cursor is before this tab's midpoint
        // slotIndex = position among all tabs (not just non-dragged)
        slotIndex = i > dragFromIndex ? i - 1 : i;
        found = true;
        break;
      }
    }
    if (!found) {
      // Cursor is past all tabs — insert at end
      slotIndex = midpoints.length - 1;
    }
    return slotIndex;
  }, []);

  const dragFromIndex = draggingTabId ? tabs.findIndex((t) => t.id === draggingTabId) : -1;

  return (
    <div
      ref={tabBarRef}
      className="flex items-center h-10 select-none app-drag overflow-y-clip"
      style={{
        background: 'linear-gradient(to bottom, #0e0e0e, #141414)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {/* Traffic light spacer */}
      <div className="w-20 shrink-0" />

      <div
        ref={tabContainerRef}
        className="flex items-center gap-0.5 h-full overflow-x-auto overflow-y-clip no-scrollbar app-no-drag"
        style={{ maxWidth: 'calc(100vw - 250px)' }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('application/x-termy-tab')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (draggingTabId) {
            const newIndex = computeInsertionIndex(e.clientX);
            if (newIndex !== insertionIndex) {
              setInsertionIndex(newIndex);
            }
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          const fromTabId = e.dataTransfer.getData('application/x-termy-tab');
          if (fromTabId && insertionIndex !== null) {
            reorderTab(fromTabId, insertionIndex);
          }
          setDraggingTabId(null);
          setInsertionIndex(null);
          setDraggingTab(false);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setInsertionIndex(null);
          }
        }}
      >
        {tabs.map((tab, tabIndex) => {
          const isActive = tab.id === activeTabId;
          const isRenaming = renaming === tab.id;
          const isDragged = draggingTabId === tab.id;

          const translateX =
            draggingTabId && insertionIndex !== null && dragFromIndex !== -1
              ? getTabTranslateX(tabIndex, dragFromIndex, insertionIndex, draggedTabWidth.current)
              : 0;

          return (
            <div
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              draggable={!isRenaming}
              onDragStart={(e) => {
                // Always prevent native drag when click animation is active —
                // native dragstart fires after ~3px, before we can detect direction
                if (clickAnimRef.current) {
                  e.preventDefault();
                  return;
                }

                e.dataTransfer.setData('application/x-termy-tab', tab.id);
                e.dataTransfer.effectAllowed = 'move';

                // Measure tab width (including gap)
                const el = tabRefs.current.get(tab.id);
                if (el) {
                  draggedTabWidth.current = el.offsetWidth + 2; // 2px = gap-0.5
                }

                // Cache midpoints of all tabs
                originalMidpoints.current = tabs.map((t) => {
                  const ref = tabRefs.current.get(t.id);
                  if (!ref) return 0;
                  const rect = ref.getBoundingClientRect();
                  return rect.left + rect.width / 2;
                });

                dragFromIndexRef.current = tabIndex;
                setDraggingTab(true);

                // Defer so browser captures the ghost from the visible tab first
                requestAnimationFrame(() => {
                  setDraggingTabId(tab.id);
                  setInsertionIndex(tabIndex);
                });
              }}
              onDragEnd={() => {
                setDraggingTabId(null);
                setInsertionIndex(null);
                setDraggingTab(false);
              }}
              className={`
                group flex items-center gap-1 px-3 h-12 font-medium cursor-pointer min-w-[120px]
                transition-colors duration-150
                ${tabIndex === 0 ? 'ml-2' : ''}
                ${isActive ? 'tab-active' : 'tab-inactive'}
              `}
              style={{
                opacity: isDragged ? 0 : 1,
                transform: `translateX(${translateX}px)`,
                transition: draggingTabId ? 'transform 200ms ease' : 'none',
              }}
              onMouseDown={(e) => {
                if (e.button !== 0 || isRenaming) return;
                const el = tabRefs.current.get(tab.id);
                if (!el) return;

                el.style.transition = 'scale 250ms ease, opacity 250ms ease';
                el.style.scale = '0.92';

                const startX = e.clientX;
                const startY = e.clientY;
                let dragging = false;
                let popDone = false;
                let curInsertIdx = tabIndex;

                clickAnimRef.current = { tabId: tab.id, startY, isLiftingOff: false };

                // Grab offset: distance from cursor to tab's center
                const elRect = el.getBoundingClientRect();
                const grabOffset = e.clientX - (elRect.left + elRect.width / 2);

                // Cache measurements for reorder
                const cachedTabWidth = el.offsetWidth + 2;
                const cachedRects = tabs.map((t) => {
                  const ref = tabRefs.current.get(t.id);
                  if (!ref) return { left: 0, width: 0, mid: 0 };
                  const rect = ref.getBoundingClientRect();
                  return { left: rect.left, width: rect.width, mid: rect.left + rect.width / 2 };
                });
                const cachedMidpoints = cachedRects.map(r => r.mid);

                let lastClientX = startX;

                const enterDragMode = (dx: number) => {
                  dragging = true;
                  const state = clickAnimRef.current;
                  if (state) state.isLiftingOff = true;
                  setActiveTab(tab.id);
                  if (tabContainerRef.current) tabContainerRef.current.style.overflowX = 'visible';
                  el.style.position = 'relative';
                  el.style.zIndex = '50';
                  el.style.color = 'rgba(255, 255, 255, 0.9)';
                  el.style.transition = 'scale 300ms cubic-bezier(0.2, 0, 0, 1.1), opacity 300ms ease, background 300ms ease, backdrop-filter 300ms ease';
                  el.style.scale = '1.35';
                  el.style.translate = `${dx}px 0`;
                  el.style.opacity = '1';
                  el.style.background = '#181818';
                  el.style.backdropFilter = 'blur(2px)';
                  (el.style as any).webkitBackdropFilter = 'blur(2px)';
                  setDraggingTab(true);
                  setTimeout(() => {
                    if (clickAnimRef.current?.tabId === tab.id) {
                      el.style.transition = 'none';
                    }
                  }, 300);
                };

                // Long press triggers drag mode
                const longPressTimer = setTimeout(() => {
                  if (!dragging) {
                    enterDragMode(lastClientX - startX);
                  }
                }, 500);

                const handleMouseMove = (ev: MouseEvent) => {
                  const state = clickAnimRef.current;
                  if (!state || state.tabId !== tab.id) return;

                  lastClientX = ev.clientX;
                  const dx = ev.clientX - startX;
                  const dy = startY - ev.clientY;
                  const dist = Math.sqrt(dx * dx + dy * dy);

                  if (!dragging && dist > 5) {
                    clearTimeout(longPressTimer);
                    enterDragMode(dx);
                  }

                  if (dragging) {
                    // Always track cursor — translate is separate from scale so no amplification
                    el.style.translate = `${dx}px 0`;

                    // Use effective tab center and near-edge thresholds for snappy swaps
                    const tabCenter = ev.clientX - grabOffset;
                    const halfTab = cachedTabWidth / 2;
                    let newIdx = cachedMidpoints.length - 1;
                    for (let i = 0; i < cachedMidpoints.length; i++) {
                      if (i === tabIndex) continue;
                      // Swap at the near edge of adjacent tabs, not their center
                      const threshold = i > tabIndex
                        ? cachedMidpoints[i] - halfTab   // left edge for tabs to the right
                        : cachedMidpoints[i] + halfTab;  // right edge for tabs to the left
                      if (tabCenter < threshold) {
                        newIdx = i > tabIndex ? i - 1 : i;
                        break;
                      }
                    }
                    if (newIdx !== curInsertIdx) {
                      curInsertIdx = newIdx;
                      tabs.forEach((t, i) => {
                        if (t.id === tab.id) return;
                        const ref = tabRefs.current.get(t.id);
                        if (!ref) return;
                        const shift = getTabTranslateX(i, tabIndex, curInsertIdx, cachedTabWidth);
                        ref.style.transform = `translateX(${shift}px)`;
                        ref.style.transition = 'transform 350ms ease';
                      });
                    }
                  }
                };

                const handleMouseUp = () => {
                  cleanup();

                  if (dragging) {
                    // Animate to the gap center — accounts for different tab widths
                    let gapCenter: number;
                    if (curInsertIdx < tabIndex) {
                      // Dragging left: gap opens at the original left edge of the insertion tab
                      gapCenter = cachedRects[curInsertIdx].left + cachedTabWidth / 2;
                    } else {
                      // Dragging right: gap opens at the original right edge of the insertion tab
                      gapCenter = cachedRects[curInsertIdx].left + cachedRects[curInsertIdx].width - cachedTabWidth / 2;
                    }
                    const targetX = gapCenter - cachedRects[tabIndex].mid;
                    el.style.transition = 'translate 400ms cubic-bezier(0.2, 0, 0, 1), scale 400ms cubic-bezier(0.2, 0, 0, 1), opacity 400ms ease, background 400ms ease, backdrop-filter 400ms ease';
                    el.style.translate = `${targetX}px 0`;
                    el.style.scale = '1';
                    el.style.opacity = '1';
                    el.style.background = '';
                    el.style.backdropFilter = '';
                    (el.style as any).webkitBackdropFilter = '';

                    // After animation, clean up and finalize reorder
                    setTimeout(() => {
                      el.style.transition = 'none';
                      el.style.translate = '';
                      el.style.scale = '';
                      el.style.color = '';
                      el.style.zIndex = '';
                      el.style.position = '';
                      if (tabContainerRef.current) tabContainerRef.current.style.overflowX = '';
                      tabs.forEach((t) => {
                        if (t.id === tab.id) return;
                        const ref = tabRefs.current.get(t.id);
                        if (ref) {
                          ref.style.transform = '';
                          ref.style.transition = '';
                        }
                      });
                      if (curInsertIdx !== tabIndex) {
                        reorderTab(tab.id, curInsertIdx);
                      }
                      setDraggingTab(false);
                    }, 400);
                  } else {
                    // Simple click — animate scale back
                    el.style.transition = 'scale 400ms cubic-bezier(0.2, 0, 0, 1)';
                    el.style.scale = '1';
                    setTimeout(() => {
                      el.style.transition = '';
                      el.style.scale = '';
                    }, 400);
                    setDraggingTab(false);
                  }
                };

                const cleanup = () => {
                  clearTimeout(longPressTimer);
                  window.removeEventListener('mousemove', handleMouseMove);
                  window.removeEventListener('mouseup', handleMouseUp);
                  clickAnimRef.current = null;
                  clickAnimCleanupRef.current = null;
                };

                clickAnimCleanupRef.current = cleanup;
                window.addEventListener('mousemove', handleMouseMove);
                window.addEventListener('mouseup', handleMouseUp);
              }}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
              }}
            >
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  className="bg-transparent outline-none text-xs w-full min-w-0"
                  style={{ color: 'rgba(255,255,255,0.9)' }}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRenameSubmit(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit(tab.id);
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <span className="truncate max-w-48">{tab.label}</span>
              )}
            </div>
          );
        })}

        <button
          className="flex items-center justify-center px-4 h-12 text-xs font-medium
            transition-colors duration-150 cursor-pointer select-none tab-inactive"
          onMouseDown={(e) => {
            const el = e.currentTarget;
            el.style.transition = 'scale 250ms ease, color 150ms, background-color 150ms';
            el.style.scale = '0.8';
            const handleUp = () => {
              el.style.transition = 'scale 400ms cubic-bezier(0.2, 0, 0, 1), color 150ms, background-color 150ms';
              el.style.scale = '1';
              setTimeout(() => { el.style.transition = ''; el.style.scale = ''; }, 400);
              window.removeEventListener('mouseup', handleUp);
            };
            window.addEventListener('mouseup', handleUp);
          }}
          onClick={async () => {
            await createTab();
            const newTabId = useLayoutStore.getState().activeTabId;
            const newTab = useLayoutStore.getState().tabs.find(t => t.id === newTabId);
            if (newTab) {
              setRenameValue(newTab.label);
              setRenaming(newTabId);
            }
          }}
          title="New Group (⌘T)"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="5" y1="1" x2="5" y2="9" /><line x1="1" y1="5" x2="9" y2="5" />
          </svg>
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] app-no-drag flex flex-col"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            padding: 4,
            background: 'rgba(26, 26, 26, 0.3)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 10,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 16px 70px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="ctx-item text-left text-[13px] cursor-default"
            style={{ color: 'rgba(255,255,255,0.9)', padding: '6px 10px', borderRadius: 6 }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            onClick={() => {
              const tab = tabs.find((t) => t.id === contextMenu.tabId);
              if (tab) {
                setRenameValue(tab.label);
                setRenaming(contextMenu.tabId);
              }
              setContextMenu(null);
            }}
          >
            Rename
          </button>
          <button
            className="ctx-item text-left text-[13px] cursor-default"
            style={{ color: 'rgba(255,100,100,0.9)', padding: '6px 10px', borderRadius: 6 }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            onClick={() => {
              handleCloseGroup(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            Close
          </button>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm app-no-drag">
          <div className="bg-[#1e1e1e] border border-white/10 rounded-xl p-5 shadow-2xl max-w-sm w-80">
            <h3 className="text-sm font-medium text-white mb-2">Close group?</h3>
            <p className="text-xs text-gray-400 mb-5">
              This will close {tabs.find((t) => t.id === confirmClose)?.carouselItems.length ?? 0} terminals in this group.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 h-7 rounded-md text-xs font-medium text-gray-300
                  bg-white/5 hover:bg-white/10
                  active:scale-95 transition-all duration-150 cursor-pointer"
                onClick={() => setConfirmClose(null)}
              >
                Cancel
              </button>
              <button
                className="px-3 h-7 rounded-md text-xs font-medium text-white
                  bg-red-500/80 hover:bg-red-500
                  active:scale-95 transition-all duration-150 cursor-pointer"
                onClick={() => {
                  closeTab(confirmClose);
                  setConfirmClose(null);
                }}
              >
                Close group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
