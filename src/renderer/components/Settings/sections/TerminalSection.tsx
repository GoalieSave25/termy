import { useState, useEffect } from 'react';
import { useSettingsStore } from '../../../store/settings-store';
import { FONT_FAMILIES, CURSOR_STYLES } from '../../../types/settings';

/** Detect if a font is installed by comparing its metrics against serif (proportional). */
function isFontAvailable(fontName: string): boolean {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const testString = 'abcdefghijklmnopqrstuvwxyz0123456789';
  ctx.font = '72px serif';
  const serifWidth = ctx.measureText(testString).width;
  ctx.font = `72px "${fontName}", serif`;
  const testWidth = ctx.measureText(testString).width;
  return testWidth !== serifWidth;
}

function useAvailableFonts() {
  const [available, setAvailable] = useState<Set<string>>(new Set());
  useEffect(() => {
    const set = new Set<string>();
    for (const f of FONT_FAMILIES) {
      const primary = f.value.split(',')[0].trim().replace(/"/g, '');
      if (isFontAvailable(primary)) set.add(f.value);
    }
    setAvailable(set);
  }, []);
  return available;
}

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

function SelectControl({ value, options, onChange }: { value: string; options: { value: string; label: string; disabled?: boolean }[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        padding: '5px 28px 5px 10px',
        fontSize: 13,
        color: '#e4e4e7',
        outline: 'none',
        cursor: 'pointer',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(255,255,255,0.4)' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
      ))}
    </select>
  );
}

function ToggleControl({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="cursor-pointer"
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: value ? '#6ECB63' : 'rgba(255,255,255,0.12)',
        border: 'none',
        position: 'relative',
        transition: 'background 120ms ease',
        padding: 0,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#fff',
          position: 'absolute',
          top: 3,
          left: value ? 19 : 3,
          transition: 'left 120ms ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  );
}

function SliderWithNumber({
  value, min, max, step, onChange,
}: {
  value: number; min: number; max: number; step: number; onChange: (v: number) => void;
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
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v) && v >= min && v <= max) onChange(v);
        }}
        style={{
          width: 52,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6,
          padding: '4px 6px',
          fontSize: 13,
          color: '#e4e4e7',
          textAlign: 'center',
          outline: 'none',
        }}
      />
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
        width: 80,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        padding: '5px 10px',
        fontSize: 13,
        color: '#e4e4e7',
        textAlign: 'center',
        outline: 'none',
      }}
    />
  );
}

export function TerminalSection() {
  const terminal = useSettingsStore((s) => s.terminal);
  const update = useSettingsStore((s) => s.updateTerminal);
  const availableFonts = useAvailableFonts();

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
        Terminal
      </div>

      <SettingRow label="Font Family" description="Monospace font for the terminal">
        <SelectControl
          value={terminal.fontFamily}
          options={FONT_FAMILIES.map((f) => ({
            value: f.value,
            label: availableFonts.has(f.value) ? f.label : `${f.label} (not installed)`,
            disabled: !availableFonts.has(f.value),
          }))}
          onChange={(v) => update({ fontFamily: v })}
        />
      </SettingRow>

      <SettingRow label="Font Size">
        <SliderWithNumber
          value={terminal.fontSize}
          min={8} max={32} step={1}
          onChange={(v) => update({ fontSize: v })}
        />
      </SettingRow>

      <SettingRow label="Line Height">
        <SliderWithNumber
          value={terminal.lineHeight}
          min={1.0} max={2.0} step={0.1}
          onChange={(v) => update({ lineHeight: Math.round(v * 10) / 10 })}
        />
      </SettingRow>

      <SettingRow label="Cursor Style">
        <SelectControl
          value={terminal.cursorStyle}
          options={CURSOR_STYLES}
          onChange={(v) => update({ cursorStyle: v as 'bar' | 'block' | 'underline' })}
        />
      </SettingRow>

      <SettingRow label="Cursor Blink">
        <ToggleControl
          value={terminal.cursorBlink}
          onChange={(v) => update({ cursorBlink: v })}
        />
      </SettingRow>

      <SettingRow label="Scrollback Lines" description="Number of lines kept in history">
        <NumberInput
          value={terminal.scrollback}
          min={1000} max={100000} step={1000}
          onChange={(v) => update({ scrollback: v })}
        />
      </SettingRow>

      <SettingRow label="Option as Meta" description="Treat Option key as Meta in terminal">
        <ToggleControl
          value={terminal.macOptionIsMeta}
          onChange={(v) => update({ macOptionIsMeta: v })}
        />
      </SettingRow>
    </div>
  );
}
