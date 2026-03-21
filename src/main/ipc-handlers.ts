import { ipcMain, shell, Notification } from 'electron';
import { IpcInvoke, IpcSend } from '../shared/ipc-channels';
import type { PtyCreateRequest, PtyResizeRequest } from '../shared/types';
import { PtyManager } from './pty-manager';
import { readClipboardImage } from './clipboard';
import { detectShell } from './shell-detector';
import { saveState, loadState } from './state-persistence';

export function registerIpcHandlers(ptyManager: PtyManager) {
  ipcMain.handle(IpcInvoke.PTY_CREATE, (_event, req: PtyCreateRequest) => {
    return ptyManager.create(req);
  });

  ipcMain.handle(IpcInvoke.PTY_DESTROY, (_event, sessionId: string) => {
    ptyManager.destroy(sessionId);
  });

  ipcMain.handle(IpcInvoke.PTY_RESIZE, (_event, req: PtyResizeRequest) => {
    ptyManager.resize(req.sessionId, req.cols, req.rows);
  });

  ipcMain.handle(IpcInvoke.PTY_CHILD_PROCESSES, (_event, sessionId: string) => {
    return ptyManager.getChildProcessNames(sessionId);
  });

  ipcMain.handle(IpcInvoke.PTY_LIST, () => {
    return ptyManager.listSessions();
  });

  ipcMain.handle(IpcInvoke.CLIPBOARD_READ_IMAGE, () => {
    return readClipboardImage();
  });

  ipcMain.handle(IpcInvoke.SHELL_DETECT, () => {
    return detectShell();
  });

  ipcMain.handle(IpcInvoke.SHELL_OPEN_EXTERNAL, (_event, url: string) => {
    try {
      const parsed = new URL(url);
      if (['http:', 'https:', 'file:'].includes(parsed.protocol)) {
        return shell.openExternal(url);
      }
    } catch {
      // Invalid URL, ignore
    }
  });

  ipcMain.handle(IpcInvoke.SHOW_NOTIFICATION, (_event, opts: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      new Notification(opts).show();
    }
  });

  ipcMain.handle(IpcInvoke.STATE_SAVE, (_event, data: string) => {
    return saveState(data);
  });

  ipcMain.handle(IpcInvoke.STATE_LOAD, () => {
    return loadState();
  });

  ipcMain.on(IpcSend.PTY_INPUT, (_event, sessionId: string, data: string) => {
    ptyManager.write(sessionId, data);
  });
}
