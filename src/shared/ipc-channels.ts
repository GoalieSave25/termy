/** Renderer -> Main (invoke/handle pattern for request/response) */
export const IpcInvoke = {
  PTY_CREATE: 'pty:create',
  PTY_DESTROY: 'pty:destroy',
  PTY_RESIZE: 'pty:resize',
  PTY_CHILD_PROCESSES: 'pty:child-processes',
  PTY_LIST: 'pty:list',
  CLIPBOARD_READ_IMAGE: 'clipboard:read-image',
  SHELL_DETECT: 'shell:detect',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
  SHOW_NOTIFICATION: 'notification:show',
  STATE_SAVE: 'state:save',
  STATE_LOAD: 'state:load',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_LOAD: 'settings:load',
} as const;

/** Renderer -> Main (send, fire-and-forget) */
export const IpcSend = {
  PTY_INPUT: 'pty:input',
  DOCK_BOUNCE_INFORMATIONAL: 'dock:bounce-informational',
} as const;

/** Main -> Renderer (send from main, on in renderer) */
export const IpcOn = {
  PTY_OUTPUT: 'pty:output',
  PTY_EXIT: 'pty:exit',
  CLAUDE_NOTIFICATION: 'claude:notification',
  SCROLL_PHASE: 'scroll:phase',
  OPEN_SETTINGS: 'menu:open-settings',
} as const;
