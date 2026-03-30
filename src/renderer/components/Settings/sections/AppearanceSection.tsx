import { useSettingsStore } from '../../../store/settings-store';

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div
      className="setting-row flex items-center justify-between"
      style={{
        padding: '12px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <div className="flex flex-col gap-0.5" style={{ minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>{label}</span>
        {description && (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{description}</span>
        )}
      </div>
      <div className="shrink-0 ml-4">{children}</div>
    </div>
  );
}

function SliderWithNumber({
  value, min, max, step, onChange, formatValue,
}: {
  value: number; min: number; max: number; step: number; onChange: (v: number) => void; formatValue?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="settings-slider"
        style={{ width: 120 }}
      />
      <span style={{
        width: 44,
        fontSize: 13,
        color: '#e4e4e7',
        textAlign: 'center',
      }}>
        {formatValue ? formatValue(value) : value}
      </span>
    </div>
  );
}

function NumberInput({
  value, min, max, step, onChange,
}: {
  value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        if (!isNaN(v) && v >= min && v <= max) onChange(v);
      }}
      style={{
        width: 52,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        padding: '5px 8px',
        fontSize: 13,
        color: '#e4e4e7',
        textAlign: 'center',
        outline: 'none',
      }}
    />
  );
}

export function AppearanceSection() {
  const appearance = useSettingsStore((s) => s.appearance);
  const update = useSettingsStore((s) => s.updateAppearance);

  return (
    <div>
      <div
        className="select-none"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase' as const,
          color: 'rgba(255,255,255,0.35)',
          padding: '16px 0 8px',
        }}
      >
        Appearance
      </div>

      <SettingRow label="UI Zoom" description="Scale the entire interface">
        <SliderWithNumber
          value={appearance.uiZoom}
          min={0.5} max={3.0} step={0.1}
          onChange={(v) => update({ uiZoom: Math.round(v * 10) / 10 })}
          formatValue={(v) => `${Math.round(v * 100)}%`}
        />
      </SettingRow>

      <SettingRow label="Window Opacity">
        <SliderWithNumber
          value={appearance.windowOpacity}
          min={0.5} max={1.0} step={0.05}
          onChange={(v) => update({ windowOpacity: Math.round(v * 100) / 100 })}
          formatValue={(v) => `${Math.round(v * 100)}%`}
        />
      </SettingRow>

      <SettingRow label="Visible Terminals" description="Terminals shown side by side in tab mode">
        <NumberInput
          value={appearance.visibleCount}
          min={1} max={6} step={1}
          onChange={(v) => update({ visibleCount: v })}
        />
      </SettingRow>
    </div>
  );
}
