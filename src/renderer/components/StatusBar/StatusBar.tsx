import { useLayoutStore } from '../../store/layout-store';
import { useSessionStore } from '../../store/session-store';
import { ClaudeStatusWidget } from './ClaudeStatusWidget';

export function StatusBar() {
  const tabs = useLayoutStore((s) => s.tabs);
  const activeTabId = useLayoutStore((s) => s.activeTabId);
  const uiZoom = useLayoutStore((s) => s.uiZoom);
  const sessions = useSessionStore((s) => s.sessions);

  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return null;

  const count = tab.carouselItems.length;
  const focusedItem = tab.carouselItems.find((c) => c.id === tab.carouselFocusedItemId);
  const session = focusedItem ? sessions[focusedItem.sessionId] : null;

  // Counter-zoom so the status bar stays the same physical size regardless of UI zoom
  const z = uiZoom;
  const isZoomed = z !== 1;
  const gap = isZoomed ? { gap: `${12 / z}px` } as const : undefined;

  return (
    <div
      className={`flex items-center bg-[#161616] text-gray-500 select-none border-t border-white/5 ${isZoomed ? '' : 'h-6 px-3 text-[10px]'}`}
      style={isZoomed ? { height: `${24 / z}px`, fontSize: `${10 / z}px`, paddingInline: `${12 / z}px` } : undefined}
    >
      <div className={`flex items-center ${isZoomed ? '' : 'gap-3'}`} style={gap}>
        {session && (
          <>
            <span>{session.shell.split('/').pop()}</span>
            <span>{session.cols}x{session.rows}</span>
          </>
        )}
        {session?.claudeStatus && <ClaudeStatusWidget status={session.claudeStatus} />}
        <span>{count} terminal{count !== 1 ? 's' : ''}</span>
        {uiZoom !== 1 && (
          <span className="text-gray-400">{Math.round(uiZoom * 100)}%</span>
        )}
      </div>
      <div className={`ml-auto flex items-center ${isZoomed ? '' : 'gap-3'}`} style={gap}>
        <span>⌘D new</span>
        <span>⌘W close</span>
        <span>⌘⇧↵ windows</span>
      </div>
    </div>
  );
}
