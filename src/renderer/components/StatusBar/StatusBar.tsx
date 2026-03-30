import { useMemo } from 'react';
import { useLayoutStore } from '../../store/layout-store';
import { useSessionStore } from '../../store/session-store';
import { ClaudeStatusWidget } from './ClaudeStatusWidget';

export function StatusBar() {
  const tabs = useLayoutStore((s) => s.tabs);
  const activeTabId = useLayoutStore((s) => s.activeTabId);
  const uiZoom = useLayoutStore((s) => s.uiZoom);
  const visibleCount = useLayoutStore((s) => s.visibleCount);
  const setVisibleCount = useLayoutStore((s) => s.setVisibleCount);
  const carouselProgress = useLayoutStore((s) => s.carouselProgress);
  const carouselScrollTo = useLayoutStore((s) => s.carouselScrollTo);
  const sessions = useSessionStore((s) => s.sessions);

  const tab = tabs.find((t) => t.id === activeTabId);

  const carouselItems = tab?.carouselItems ?? [];
  const carouselFocusedIndex = tab?.carouselFocusedIndex ?? 0;
  const carouselFocusedItemId = tab?.carouselFocusedItemId;

  const completedSessionIds = useMemo(
    () => new Set(carouselItems.filter(item => sessions[item.sessionId]?.claudeCompleted).map(item => item.sessionId)),
    [sessions, carouselItems],
  );

  if (!tab) return null;

  const count = carouselItems.length;
  const focusedItem = carouselItems.find((c) => c.id === carouselFocusedItemId);
  const session = focusedItem ? sessions[focusedItem.sessionId] : null;

  // Counter-zoom so the status bar stays the same physical size regardless of UI zoom
  const z = uiZoom;
  const isZoomed = z !== 1;
  const gap = isZoomed ? { gap: `${12 / z}px` } as const : undefined;

  return (
    <div
      className={`flex items-center select-none ${isZoomed ? '' : 'h-8 px-3 text-xs'}`}
      style={{
        background: '#111111',
        boxShadow: '0 -1px 0 rgba(255,255,255,0.03)',
        color: 'rgba(255,255,255,0.35)',
        ...(isZoomed ? { height: `${32 / z}px`, fontSize: `${12 / z}px`, paddingInline: `${12 / z}px` } : {}),
      }}
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
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>{Math.round(uiZoom * 100)}%</span>
        )}
      </div>

      {/* Carousel dot indicators — fade out in sync with window-mode transition */}
      {count > 1 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-center"
          style={{
            opacity: carouselProgress <= 0 ? 1 : Math.max(0, 1 - carouselProgress * 3),
            pointerEvents: carouselProgress > 0.3 ? 'none' : undefined,
          }}
        >
          {carouselItems.map((item, index) => {
            const isCompleted = completedSessionIds.has(item.sessionId);
            const isFocused = index === carouselFocusedIndex;
            return (
              <button
                key={item.id}
                className={`nav-dot flex items-center justify-center cursor-pointer${isFocused ? ' nav-dot-active' : ''}`}
                style={{ width: 20, height: 20 }}
                onClick={() => carouselScrollTo(index)}
              >
                {isCompleted ? (
                  <div className="relative" style={{ width: 10, height: 10 }}>
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: '#2DA1FD',
                        animation: 'claude-dot-ring 2s ease-out infinite',
                      }}
                    />
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: '#2DA1FD',
                        animation: 'claude-dot-pulse 2s ease-in-out infinite',
                        boxShadow: '0 0 3px rgba(45, 161, 253, 0.4)',
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className={`nav-dot-circle rounded-full transition-all duration-200${isFocused ? ' active' : ''}`}
                    style={{
                      width: isFocused ? 10 : 8,
                      height: isFocused ? 10 : 8,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Visible count stepper */}
      <div className="ml-auto flex items-center h-full" style={{ marginRight: 16 }}>
        <button
          className="h-full flex items-center justify-center cursor-pointer
            transition-colors duration-150 select-none"
          style={{ width: 32, color: 'rgba(255,255,255,0.35)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
            e.currentTarget.style.background = '#181818';
            (e.currentTarget.firstElementChild as HTMLElement).style.transform = 'scale(1.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
            e.currentTarget.style.background = 'transparent';
            (e.currentTarget.firstElementChild as HTMLElement).style.transform = 'scale(1)';
          }}
          onMouseDown={(e) => {
            const el = e.currentTarget;
            el.style.transition = 'scale 250ms ease, color 150ms, background-color 150ms';
            el.style.scale = '0.92';
            const handleUp = () => {
              el.style.transition = 'scale 400ms cubic-bezier(0.2, 0, 0, 1), color 150ms, background-color 150ms';
              el.style.scale = '1';
              setTimeout(() => { el.style.transition = ''; el.style.scale = ''; }, 400);
              window.removeEventListener('mouseup', handleUp);
            };
            window.addEventListener('mouseup', handleUp);
          }}
          onClick={() => setVisibleCount(visibleCount - 1)}
          disabled={visibleCount <= 1}
          title="Show fewer terminals"
        >
          <span style={{ transition: 'transform 150ms ease' }}>−</span>
        </button>
        <div className="flex items-center justify-center tabular-nums select-none"
          style={{ width: 20, color: 'rgba(255,255,255,0.35)' }}>
          {visibleCount}
        </div>
        <button
          className="h-full flex items-center justify-center cursor-pointer
            transition-colors duration-150 select-none"
          style={{ width: 32, color: 'rgba(255,255,255,0.35)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
            e.currentTarget.style.background = '#181818';
            (e.currentTarget.firstElementChild as HTMLElement).style.transform = 'scale(1.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
            e.currentTarget.style.background = 'transparent';
            (e.currentTarget.firstElementChild as HTMLElement).style.transform = 'scale(1)';
          }}
          onMouseDown={(e) => {
            const el = e.currentTarget;
            el.style.transition = 'scale 250ms ease, color 150ms, background-color 150ms';
            el.style.scale = '0.92';
            const handleUp = () => {
              el.style.transition = 'scale 400ms cubic-bezier(0.2, 0, 0, 1), color 150ms, background-color 150ms';
              el.style.scale = '1';
              setTimeout(() => { el.style.transition = ''; el.style.scale = ''; }, 400);
              window.removeEventListener('mouseup', handleUp);
            };
            window.addEventListener('mouseup', handleUp);
          }}
          onClick={() => setVisibleCount(visibleCount + 1)}
          title="Show more terminals"
        >
          <span style={{ transition: 'transform 150ms ease' }}>+</span>
        </button>
      </div>
    </div>
  );
}
