import type { KeybindingAction, KeyCombo } from '../types/settings';

function k(key: string, meta = true, shift = false, alt = false, ctrl = false): KeyCombo {
  return { key, meta, shift, alt, ctrl };
}

export const DEFAULT_KEYBINDINGS: Record<KeybindingAction, KeyCombo> = {
  addTerminal:       k('t'),
  closeTerminal:     k('w'),
  closeTab:          k('w', true, true),
  toggleSearch:      k('f'),
  clearTerminal:     k('k', true, true),
  toggleWindowMode:  k('enter', true, true),
  enterWindowModeI:  k('i'),
  enterWindowModeK:  k('k'),
  fuzzyFinder:       k(' ', false, false, false, true),
  openSettings:      k(','),
  focusLeft:         k('j'),
  focusRight:        k('l'),
  focusNext:         k(']'),
  focusPrevious:     k('['),
  altFocusLeft:      k('arrowleft', true, false, true),
  altFocusRight:     k('arrowright', true, false, true),
  nextTab:           k(']', true, true),
  prevTab:           k('[', true, true),
  altNextTab:        k('o'),
  altPrevTab:        k('u'),
  jumpToTab1:        k('1'),
  jumpToTab2:        k('2'),
  jumpToTab3:        k('3'),
  jumpToTab4:        k('4'),
  jumpToTab5:        k('5'),
  jumpToTab6:        k('6'),
  jumpToTab7:        k('7'),
  jumpToTab8:        k('8'),
  jumpToTab9:        k('9'),
  zoomIn:            k('='),
  zoomOut:           k('-'),
  zoomReset:         k('0'),
  promptUp:          k('arrowup'),
  promptDown:        k('arrowdown'),
  toggleMaximize:    k('f', true, true),
};

export type ActionCategory = 'General' | 'Navigation' | 'Tabs' | 'Terminal';

export interface ActionMeta {
  label: string;
  category: ActionCategory;
}

export const ACTION_META: Record<KeybindingAction, ActionMeta> = {
  addTerminal:       { label: 'New Terminal',             category: 'General' },
  closeTerminal:     { label: 'Close Terminal',           category: 'General' },
  closeTab:          { label: 'Close Tab',                category: 'Tabs' },
  toggleSearch:      { label: 'Find',                     category: 'General' },
  clearTerminal:     { label: 'Clear Terminal',           category: 'Terminal' },
  toggleWindowMode:  { label: 'Toggle Window Mode',       category: 'General' },
  enterWindowModeI:  { label: 'Window Mode (I)',          category: 'General' },
  enterWindowModeK:  { label: 'Window Mode (K)',          category: 'General' },
  fuzzyFinder:       { label: 'Fuzzy Finder',             category: 'General' },
  openSettings:      { label: 'Settings',                 category: 'General' },
  focusLeft:         { label: 'Focus Left',               category: 'Navigation' },
  focusRight:        { label: 'Focus Right',              category: 'Navigation' },
  focusNext:         { label: 'Focus Next',               category: 'Navigation' },
  focusPrevious:     { label: 'Focus Previous',           category: 'Navigation' },
  altFocusLeft:      { label: 'Focus Left (Alt)',         category: 'Navigation' },
  altFocusRight:     { label: 'Focus Right (Alt)',        category: 'Navigation' },
  nextTab:           { label: 'Next Tab',                 category: 'Tabs' },
  prevTab:           { label: 'Previous Tab',             category: 'Tabs' },
  altNextTab:        { label: 'Next Tab (Alt)',           category: 'Tabs' },
  altPrevTab:        { label: 'Previous Tab (Alt)',       category: 'Tabs' },
  jumpToTab1:        { label: 'Jump to Tab 1',            category: 'Tabs' },
  jumpToTab2:        { label: 'Jump to Tab 2',            category: 'Tabs' },
  jumpToTab3:        { label: 'Jump to Tab 3',            category: 'Tabs' },
  jumpToTab4:        { label: 'Jump to Tab 4',            category: 'Tabs' },
  jumpToTab5:        { label: 'Jump to Tab 5',            category: 'Tabs' },
  jumpToTab6:        { label: 'Jump to Tab 6',            category: 'Tabs' },
  jumpToTab7:        { label: 'Jump to Tab 7',            category: 'Tabs' },
  jumpToTab8:        { label: 'Jump to Tab 8',            category: 'Tabs' },
  jumpToTab9:        { label: 'Jump to Tab 9',            category: 'Tabs' },
  zoomIn:            { label: 'Zoom In',                  category: 'General' },
  zoomOut:           { label: 'Zoom Out',                 category: 'General' },
  zoomReset:         { label: 'Reset Zoom',               category: 'General' },
  promptUp:          { label: 'Previous Prompt',          category: 'Navigation' },
  promptDown:        { label: 'Next Prompt',              category: 'Navigation' },
  toggleMaximize:    { label: 'Toggle Maximize',          category: 'General' },
};

/** Format a KeyCombo for display (e.g. "Cmd+Shift+D") */
export function formatKeyCombo(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push('Ctrl');
  if (combo.alt) parts.push('Alt');
  if (combo.shift) parts.push('Shift');
  if (combo.meta) parts.push('Cmd');

  // Prettify key names
  const keyMap: Record<string, string> = {
    arrowup: 'Up', arrowdown: 'Down', arrowleft: 'Left', arrowright: 'Right',
    enter: 'Enter', escape: 'Esc', backspace: 'Backspace', tab: 'Tab',
    ' ': 'Space', ',': ',', '.': '.', '/': '/', '\\': '\\',
    '[': '[', ']': ']', '=': '=', '-': '-',
  };
  const prettyKey = keyMap[combo.key] ?? combo.key.toUpperCase();
  parts.push(prettyKey);
  return parts.join('+');
}

/** Check if a KeyboardEvent matches a KeyCombo */
export function eventMatchesCombo(e: KeyboardEvent, combo: KeyCombo): boolean {
  return (
    e.key.toLowerCase() === combo.key &&
    e.metaKey === combo.meta &&
    e.shiftKey === combo.shift &&
    e.altKey === combo.alt &&
    e.ctrlKey === combo.ctrl
  );
}
