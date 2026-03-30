export type SettingsCategory = 'terminal' | 'appearance' | 'keybindings';

const categories: { id: SettingsCategory; label: string; icon: React.ReactNode }[] = [
  {
    id: 'terminal',
    label: 'Terminal',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="2" width="14" height="12" rx="2" />
        <path d="M4 6l2.5 2L4 10" />
        <line x1="8.5" y1="10" x2="12" y2="10" />
      </svg>
    ),
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
      </svg>
    ),
  },
  {
    id: 'keybindings',
    label: 'Keybindings',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="14" height="9" rx="2" />
        <line x1="4" y1="7" x2="4" y2="7.01" />
        <line x1="8" y1="7" x2="8" y2="7.01" />
        <line x1="12" y1="7" x2="12" y2="7.01" />
        <line x1="5" y1="10" x2="11" y2="10" />
      </svg>
    ),
  },
];

interface SettingsSidebarProps {
  active: SettingsCategory;
  onSelect: (cat: SettingsCategory) => void;
}

export function SettingsSidebar({ active, onSelect, onReset }: SettingsSidebarProps & { onReset: () => void }) {
  return (
    <div
      className="shrink-0 flex flex-col gap-1"
      style={{ width: 200, padding: '16px 12px' }}
    >
      <div
        className="select-none"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase' as const,
          color: 'rgba(255,255,255,0.35)',
          padding: '16px 10px 12px',
        }}
      >
        Settings
      </div>
      {categories.map((cat) => {
        const isActive = active === cat.id;
        return (
          <button
            key={cat.id}
            className="settings-sidebar-btn w-full text-left cursor-pointer flex items-center gap-2.5"
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              fontSize: 14,
              color: isActive ? '#f4f4f5' : 'rgba(255,255,255,0.55)',
              background: isActive ? 'rgba(255,255,255,0.09)' : 'transparent',
              transition: 'background 80ms ease, color 80ms ease, transform 150ms ease',
            }}
            onClick={() => onSelect(cat.id)}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ opacity: isActive ? 0.9 : 0.5, transition: 'opacity 80ms ease' }}>
              {cat.icon}
            </span>
            {cat.label}
          </button>
        );
      })}

      {/* Spacer to push reset to bottom */}
      <div className="flex-1" />

      <button
        className="ctx-item w-full text-left cursor-pointer flex items-center gap-2.5"
        style={{
          padding: '8px 10px',
          borderRadius: 8,
          fontSize: 13,
          color: 'rgba(255,255,255,0.35)',
          transition: 'background 80ms ease, color 80ms ease, transform 120ms cubic-bezier(0.32,1.2,0.54,1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
          e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
        }}
        onClick={onReset}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
          <path d="M3 12a9 9 0 1 1 9 9" />
          <polyline points="1 7 3 12 8 10" />
        </svg>
        Reset to Defaults
      </button>
    </div>
  );
}
