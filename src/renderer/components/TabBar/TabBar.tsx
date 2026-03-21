import { useState } from 'react';
import { useLayoutStore } from '../../store/layout-store';
export function TabBar() {
  const tabs = useLayoutStore((s) => s.tabs);
  const activeTabId = useLayoutStore((s) => s.activeTabId);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const createTab = useLayoutStore((s) => s.createTab);
  const closeTab = useLayoutStore((s) => s.closeTab);
  const reorderTab = useLayoutStore((s) => s.reorderTab);
  const setDraggingTab = useLayoutStore((s) => s.setDraggingTab);
  const visibleCount = useLayoutStore((s) => s.visibleCount);
  const setVisibleCount = useLayoutStore((s) => s.setVisibleCount);
  const carouselAddTerminal = useLayoutStore((s) => s.carouselAddTerminal);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);


  const handleCloseGroup = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.carouselItems.length > 1) {
      setConfirmClose(tabId);
    } else {
      closeTab(tabId);
    }
  };

  return (
    <div className="flex items-center h-9 bg-[#161616] select-none app-drag border-b border-white/5">
      {/* Traffic light spacer */}
      <div className="w-20 shrink-0" />

      <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar app-no-drag">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isDropTarget = dropTarget === tab.id;
          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-termy-tab', tab.id);
                e.dataTransfer.effectAllowed = 'move';
                setDraggingTabId(tab.id);
                setDraggingTab(true);
                const otherTab = tabs.find((t) => t.id !== tab.id);
                if (otherTab) {
                  setActiveTab(otherTab.id);
                }
              }}
              onDragEnd={() => {
                setDraggingTabId(null);
                setDraggingTab(false);
                setDropTarget(null);
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('application/x-termy-tab')) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (draggingTabId && tab.id !== draggingTabId) {
                    setActiveTab(tab.id);
                  }
                  setDropTarget(tab.id);
                }
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => {
                e.preventDefault();
                const fromTabId = e.dataTransfer.getData('application/x-termy-tab');
                if (fromTabId && fromTabId !== tab.id) {
                  reorderTab(fromTabId, tab.id);
                }
                setDropTarget(null);
              }}
              className={`
                group flex items-center gap-1 px-3 h-7 rounded-md text-xs font-medium transition-colors cursor-default
                ${isActive
                  ? 'bg-[#2a2a2a] text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-[#252525]'
                }
                ${isDropTarget ? 'ring-1 ring-gray-400/50' : ''}
              `}
              onClick={() => setActiveTab(tab.id)}
              onDoubleClick={(e) => {
                e.preventDefault();
                const label = prompt('Rename group:', tab.label);
                if (label) useLayoutStore.getState().renameTab(tab.id, label, true);
              }}
            >
              <span className="truncate max-w-32">{tab.label}</span>
              <button
                className={`
                  ml-0.5 w-4 h-4 flex items-center justify-center rounded-full
                  transition-all duration-150 ease-out cursor-pointer select-none
                  ${isActive
                    ? 'text-gray-500 hover:text-white hover:bg-red-500/80 active:scale-90 active:bg-red-600 active:text-white'
                    : 'opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white hover:bg-red-500/80 active:scale-90 active:bg-red-600 active:text-white'
                  }
                `}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseGroup(tab.id);
                }}
              >
                <svg width="6" height="6" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
                </svg>
              </button>
            </div>
          );
        })}

        <button
          className="flex items-center justify-center w-7 h-7 rounded-md
            text-gray-500 hover:text-gray-200 hover:bg-[#252525]
            active:scale-90 transition-all duration-150 ease-out cursor-pointer select-none"
          onClick={() => createTab()}
          title="New Group (⌘T)"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="5" y1="1" x2="5" y2="9" /><line x1="1" y1="5" x2="9" y2="5" />
          </svg>
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Visible count stepper + New terminal button */}
      <div className="flex items-center gap-2 mr-3 app-no-drag">
      <div className="flex items-center gap-0">
        <button
          className="w-5 h-5 flex items-center justify-center rounded-l
            text-[10px] text-gray-500 hover:text-gray-200 hover:bg-white/10
            bg-white/5 transition-colors"
          onClick={() => setVisibleCount(visibleCount - 1)}
          disabled={visibleCount <= 1}
          title="Show fewer terminals"
        >
          −
        </button>
        <div className="h-5 px-1.5 flex items-center justify-center bg-white/5 text-[10px] text-gray-400 font-medium tabular-nums min-w-[20px]">
          {visibleCount}
        </div>
        <button
          className="w-5 h-5 flex items-center justify-center rounded-r
            text-[10px] text-gray-500 hover:text-gray-200 hover:bg-white/10
            bg-white/5 transition-colors"
          onClick={() => setVisibleCount(visibleCount + 1)}
          title="Show more terminals"
        >
          +
        </button>
      </div>
      <button
        className="flex items-center gap-1 h-5 px-2 rounded
          text-[10px] font-medium text-gray-500 hover:text-gray-200
          bg-white/5 hover:bg-white/10
          active:scale-95 transition-all duration-150 cursor-pointer select-none"
        onClick={() => carouselAddTerminal()}
        title="New Terminal (⌘D)"
      >
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="5" y1="1" x2="5" y2="9" /><line x1="1" y1="5" x2="9" y2="5" />
        </svg>
        New
      </button>
      </div>

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
