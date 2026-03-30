import { useState, useEffect, useCallback, useRef } from 'react';
import { useSettingsStore } from '../../../store/settings-store';
import type { KeybindingAction, KeyCombo } from '../../../types/settings';
import {
  DEFAULT_KEYBINDINGS,
  ACTION_META,
  formatKeyCombo,
  type ActionCategory,
} from '../../../lib/default-keybindings';

const CATEGORY_ORDER: ActionCategory[] = ['General', 'Navigation', 'Tabs', 'Terminal'];

function groupActions(): { category: ActionCategory; actions: KeybindingAction[] }[] {
  const grouped = new Map<ActionCategory, KeybindingAction[]>();
  for (const cat of CATEGORY_ORDER) grouped.set(cat, []);
  for (const [action, meta] of Object.entries(ACTION_META) as [KeybindingAction, { label: string; category: ActionCategory }][]) {
    grouped.get(meta.category)?.push(action);
  }
  return CATEGORY_ORDER.map((cat) => ({ category: cat, actions: grouped.get(cat) ?? [] }));
}

function KeybindingBadge({ combo, recording, onClick }: { combo: KeyCombo; recording: boolean; onClick: () => void }) {
  return (
    <button
      className="cursor-pointer select-none"
      onClick={onClick}
      style={{
        fontFamily: '-apple-system, monospace',
        fontSize: 12,
        color: recording ? '#6ECB63' : 'rgba(255,255,255,0.5)',
        background: recording ? 'rgba(110,203,99,0.1)' : 'rgba(255,255,255,0.06)',
        border: recording ? '1px solid rgba(110,203,99,0.4)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 5,
        padding: '3px 8px',
        transition: 'all 80ms ease',
        whiteSpace: 'nowrap',
        animation: recording ? 'keybind-pulse 1.5s ease-in-out infinite' : 'none',
      }}
    >
      {recording ? 'Press keys...' : formatKeyCombo(combo)}
    </button>
  );
}

function findConflict(
  combo: KeyCombo,
  keybindings: Record<KeybindingAction, KeyCombo>,
  excludeAction: KeybindingAction,
): KeybindingAction | null {
  for (const [action, existing] of Object.entries(keybindings) as [KeybindingAction, KeyCombo][]) {
    if (action === excludeAction) continue;
    if (
      existing.key === combo.key &&
      existing.meta === combo.meta &&
      existing.shift === combo.shift &&
      existing.alt === combo.alt &&
      existing.ctrl === combo.ctrl
    ) {
      return action;
    }
  }
  return null;
}

function KeybindingRow({ action }: { action: KeybindingAction }) {
  const keybindings = useSettingsStore((s) => s.keybindings);
  const overrides = useSettingsStore((s) => s.keybindingOverrides);
  const setKeybinding = useSettingsStore((s) => s.setKeybinding);
  const resetKeybinding = useSettingsStore((s) => s.resetKeybinding);

  const [recording, setRecording] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const recordingRef = useRef(false);

  const combo = keybindings[action];
  const isOverridden = action in overrides;
  const meta = ACTION_META[action];

  const handleRecord = useCallback(() => {
    setRecording(true);
    recordingRef.current = true;
    setConflict(null);
  }, []);

  useEffect(() => {
    if (!recording) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels recording
      if (e.key === 'Escape') {
        setRecording(false);
        recordingRef.current = false;
        setConflict(null);
        return;
      }

      // Ignore lone modifier presses
      if (['Meta', 'Shift', 'Alt', 'Control'].includes(e.key)) return;

      // Backspace unbinds (reset to default)
      if (e.key === 'Backspace' && !e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey) {
        resetKeybinding(action);
        setRecording(false);
        recordingRef.current = false;
        setConflict(null);
        return;
      }

      const newCombo: KeyCombo = {
        key: e.key.toLowerCase(),
        meta: e.metaKey,
        shift: e.shiftKey,
        alt: e.altKey,
        ctrl: e.ctrlKey,
      };

      // Check for conflicts
      const conflictAction = findConflict(newCombo, keybindings, action);
      if (conflictAction) {
        setConflict(`Conflicts with "${ACTION_META[conflictAction].label}"`);
        // Still set it — the user can fix the other one
      } else {
        setConflict(null);
      }

      setKeybinding(action, newCombo);
      setRecording(false);
      recordingRef.current = false;
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recording, action, keybindings, setKeybinding, resetKeybinding]);

  return (
    <div
      className="setting-row flex items-center justify-between"
      style={{
        padding: '8px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', flex: 1 }}>
        {meta.label}
      </span>
      <div className="flex items-center gap-2">
        {conflict && (
          <span style={{ fontSize: 11, color: 'rgba(248,113,113,0.7)' }}>
            {conflict}
          </span>
        )}
        <KeybindingBadge combo={combo} recording={recording} onClick={handleRecord} />
        {isOverridden && (
          <button
            className="cursor-pointer"
            onClick={() => { resetKeybinding(action); setConflict(null); }}
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.3)',
              background: 'none',
              border: 'none',
              padding: '2px 4px',
              transition: 'color 80ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}
            title="Reset to default"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

export function KeybindingsSection() {
  const resetAll = useSettingsStore((s) => s.resetAllKeybindings);
  const overrides = useSettingsStore((s) => s.keybindingOverrides);
  const groups = groupActions();
  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div>
      <div className="flex items-center justify-between" style={{ padding: '16px 0 8px' }}>
        <div
          className="select-none"
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase' as const,
            color: 'rgba(255,255,255,0.35)',
          }}
        >
          Keybindings
        </div>
        {hasOverrides && (
          <button
            className="cursor-pointer"
            onClick={resetAll}
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.35)',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 5,
              padding: '3px 8px',
              transition: 'all 80ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#e4e4e7';
              e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            }}
          >
            Reset All
          </button>
        )}
      </div>

      <div
        className="select-none"
        style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.3)',
          padding: '0 0 16px',
        }}
      >
        Click a shortcut to rebind. Press Escape to cancel, Backspace to reset.
      </div>

      {groups.map(({ category, actions }) => (
        <div key={category} style={{ marginBottom: 20 }}>
          <div
            className="select-none"
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase' as const,
              color: 'rgba(255,255,255,0.25)',
              padding: '8px 0 4px',
            }}
          >
            {category}
          </div>
          {actions.map((action) => (
            <KeybindingRow key={action} action={action} />
          ))}
        </div>
      ))}
    </div>
  );
}
