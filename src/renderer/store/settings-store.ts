import { create } from 'zustand';
import type {
  SettingsData,
  TerminalSettings,
  AppearanceSettings,
  KeybindingAction,
  KeyCombo,
} from '../types/settings';
import {
  DEFAULT_TERMINAL_SETTINGS,
  DEFAULT_APPEARANCE_SETTINGS,
} from '../types/settings';
import { DEFAULT_KEYBINDINGS } from '../lib/default-keybindings';

const CURRENT_VERSION = 1;

interface SettingsState {
  loaded: boolean;
  terminal: TerminalSettings;
  appearance: AppearanceSettings;
  /** User overrides only — merged with defaults at read time */
  keybindingOverrides: Partial<Record<KeybindingAction, KeyCombo>>;

  /** Merged keybindings (defaults + overrides) */
  keybindings: Record<KeybindingAction, KeyCombo>;

  // Actions
  init: () => Promise<void>;
  updateTerminal: (partial: Partial<TerminalSettings>) => void;
  updateAppearance: (partial: Partial<AppearanceSettings>) => void;
  setKeybinding: (action: KeybindingAction, combo: KeyCombo) => void;
  resetKeybinding: (action: KeybindingAction) => void;
  resetAllKeybindings: () => void;
  resetAll: () => void;
}

function mergeKeybindings(
  overrides: Partial<Record<KeybindingAction, KeyCombo>>,
): Record<KeybindingAction, KeyCombo> {
  return { ...DEFAULT_KEYBINDINGS, ...overrides };
}

function toSaveData(state: SettingsState): string {
  const data: SettingsData = {
    version: CURRENT_VERSION,
    terminal: state.terminal,
    appearance: state.appearance,
    keybindings: state.keybindingOverrides,
  };
  return JSON.stringify(data);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  loaded: false,
  terminal: { ...DEFAULT_TERMINAL_SETTINGS },
  appearance: { ...DEFAULT_APPEARANCE_SETTINGS },
  keybindingOverrides: {},
  keybindings: { ...DEFAULT_KEYBINDINGS },

  init: async () => {
    try {
      const raw = await window.termyApi.settings.load();
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SettingsData>;
        const terminal = { ...DEFAULT_TERMINAL_SETTINGS, ...parsed.terminal };
        const appearance = { ...DEFAULT_APPEARANCE_SETTINGS, ...parsed.appearance };
        const keybindingOverrides = parsed.keybindings ?? {};
        set({
          loaded: true,
          terminal,
          appearance,
          keybindingOverrides,
          keybindings: mergeKeybindings(keybindingOverrides),
        });
        return;
      }
    } catch (err) {
      console.error('[SETTINGS] Failed to load settings:', err);
    }
    set({ loaded: true });
  },

  updateTerminal: (partial) => {
    set((s) => ({ terminal: { ...s.terminal, ...partial } }));
    scheduleSave();
  },

  updateAppearance: (partial) => {
    set((s) => ({ appearance: { ...s.appearance, ...partial } }));
    scheduleSave();
  },

  setKeybinding: (action, combo) => {
    set((s) => {
      const overrides = { ...s.keybindingOverrides, [action]: combo };
      return { keybindingOverrides: overrides, keybindings: mergeKeybindings(overrides) };
    });
    scheduleSave();
  },

  resetKeybinding: (action) => {
    set((s) => {
      const overrides = { ...s.keybindingOverrides };
      delete overrides[action];
      return { keybindingOverrides: overrides, keybindings: mergeKeybindings(overrides) };
    });
    scheduleSave();
  },

  resetAllKeybindings: () => {
    set({ keybindingOverrides: {}, keybindings: { ...DEFAULT_KEYBINDINGS } });
    scheduleSave();
  },

  resetAll: () => {
    set({
      terminal: { ...DEFAULT_TERMINAL_SETTINGS },
      appearance: { ...DEFAULT_APPEARANCE_SETTINGS },
      keybindingOverrides: {},
      keybindings: { ...DEFAULT_KEYBINDINGS },
    });
    scheduleSave();
  },
}));

// Debounced save to disk
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const state = useSettingsStore.getState();
    window.termyApi.settings.save(toSaveData(state)).catch((err) => {
      console.error('[SETTINGS] Failed to save:', err);
    });
    saveTimer = null;
  }, 500);
}
