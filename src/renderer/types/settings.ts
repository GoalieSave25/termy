export interface KeyCombo {
  key: string;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
}

export type KeybindingAction =
  | 'addTerminal'
  | 'closeTerminal'
  | 'closeTab'
  | 'toggleSearch'
  | 'clearTerminal'
  | 'toggleWindowMode'
  | 'enterWindowModeI'
  | 'enterWindowModeK'
  | 'fuzzyFinder'
  | 'openSettings'
  | 'focusLeft'
  | 'focusRight'
  | 'focusNext'
  | 'focusPrevious'
  | 'altFocusLeft'
  | 'altFocusRight'
  | 'nextTab'
  | 'prevTab'
  | 'altNextTab'
  | 'altPrevTab'
  | 'jumpToTab1'
  | 'jumpToTab2'
  | 'jumpToTab3'
  | 'jumpToTab4'
  | 'jumpToTab5'
  | 'jumpToTab6'
  | 'jumpToTab7'
  | 'jumpToTab8'
  | 'jumpToTab9'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'promptUp'
  | 'promptDown'
  | 'toggleMaximize';

export interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: 'bar' | 'block' | 'underline';
  cursorBlink: boolean;
  scrollback: number;
  macOptionIsMeta: boolean;
}

export interface AppearanceSettings {
  uiZoom: number;
  windowOpacity: number;
  visibleCount: number;
}

export interface SettingsData {
  version: number;
  terminal: TerminalSettings;
  appearance: AppearanceSettings;
  keybindings: Partial<Record<KeybindingAction, KeyCombo>>;
}

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 13,
  lineHeight: 1.2,
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollback: 2_000,
  macOptionIsMeta: true,
};

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  uiZoom: 1.0,
  windowOpacity: 1.0,
  visibleCount: 2,
};

export const FONT_FAMILIES = [
  { value: 'Menlo, Monaco, "Courier New", monospace', label: 'Menlo' },
  { value: 'Monaco, Menlo, "Courier New", monospace', label: 'Monaco' },
  { value: '"SF Mono", Menlo, Monaco, monospace', label: 'SF Mono' },
  { value: '"Andale Mono", Menlo, Monaco, monospace', label: 'Andale Mono' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
  { value: '"PT Mono", Menlo, Monaco, monospace', label: 'PT Mono' },
  { value: '"JetBrains Mono", Menlo, Monaco, monospace', label: 'JetBrains Mono' },
  { value: '"Fira Code", Menlo, Monaco, monospace', label: 'Fira Code' },
  { value: '"IBM Plex Mono", Menlo, Monaco, monospace', label: 'IBM Plex Mono' },
  { value: '"Source Code Pro", Menlo, Monaco, monospace', label: 'Source Code Pro' },
  { value: '"Hack", Menlo, Monaco, monospace', label: 'Hack' },
] as const;

export const CURSOR_STYLES = [
  { value: 'bar' as const, label: 'Bar' },
  { value: 'block' as const, label: 'Block' },
  { value: 'underline' as const, label: 'Underline' },
];
