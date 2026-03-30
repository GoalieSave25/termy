import { useState, useEffect, useRef } from 'react';
import { useLayoutStore } from '../../store/layout-store';
import { useSettingsStore } from '../../store/settings-store';
import { SettingsSidebar, type SettingsCategory } from './SettingsSidebar';
import { TerminalSection } from './sections/TerminalSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { KeybindingsSection } from './sections/KeybindingsSection';

export function Settings() {
  const open = useLayoutStore((s) => s.settingsOpen);
  const setOpen = useLayoutStore((s) => s.setSettingsOpen);
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('terminal');
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset scroll when switching categories
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [activeCategory]);

  // Reset to first tab when opened
  useEffect(() => {
    if (open) setActiveCategory('terminal');
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(0, 0, 0, 0.5)',
          animation: 'fuzzy-overlay-in 150ms ease-out',
        }}
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div
        className="relative w-[780px] h-[75vh] overflow-hidden flex"
        style={{
          background: 'rgba(26, 26, 26, 0.3)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 16px 70px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
          animation: 'fuzzy-panel-in 220ms cubic-bezier(0.32, 1.28, 0.54, 1)',
        }}
      >
        {/* Top edge highlight */}
        <div
          className="absolute top-0 left-0 right-0 h-px pointer-events-none z-10"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.06) 70%, transparent 100%)',
          }}
        />

        {/* Sidebar */}
        <SettingsSidebar active={activeCategory} onSelect={setActiveCategory} onReset={() => useSettingsStore.getState().resetAll()} />

        {/* Divider */}
        <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />

        {/* Content area — extra background to reduce transparency */}
        <div
          className="flex-1 relative min-h-0 flex flex-col"
          style={{ background: 'rgba(17,17,17,0.75)' }}
        >
          {/* Top gradient — masks content scrolling behind esc badge */}
          <div
            className="absolute top-0 left-0 right-0 pointer-events-none z-10"
            style={{
              height: 64,
              background: 'linear-gradient(to bottom, rgba(17,17,17,1) 0%, rgba(17,17,17,0) 100%)',
            }}
          />

          {/* Esc badge — top right, floats over gradient */}
          <kbd
            className="absolute top-4 right-4 shrink-0 select-none z-20 cursor-pointer"
            onClick={() => setOpen(false)}
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.35)',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 5,
              padding: '3px 8px',
              fontFamily: '-apple-system, monospace',
              transition: 'color 80ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
          >
            esc
          </kbd>

          {/* Scrollable content */}
          <div
            ref={contentRef}
            className="flex-1 overflow-y-auto"
            style={{ padding: '20px 24px' }}
          >
            {activeCategory === 'terminal' && <TerminalSection />}
            {activeCategory === 'appearance' && <AppearanceSection />}
            {activeCategory === 'keybindings' && <KeybindingsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
