import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron';
import { IpcInvoke, IpcSend, IpcOn } from '../shared/ipc-channels';
import type {
  PtyCreateRequest,
  PtyCreateResponse,
  PtyResizeRequest,
  PtyOutputMessage,
  PtyExitMessage,
  ClipboardImageResponse,
  ClaudeNotification,
  TermyApi,
} from '../shared/types';

const api: TermyApi = {
  pty: {
    create(req: PtyCreateRequest): Promise<PtyCreateResponse> {
      return ipcRenderer.invoke(IpcInvoke.PTY_CREATE, req);
    },
    destroy(sessionId: string): Promise<void> {
      return ipcRenderer.invoke(IpcInvoke.PTY_DESTROY, sessionId);
    },
    resize(req: PtyResizeRequest): Promise<void> {
      return ipcRenderer.invoke(IpcInvoke.PTY_RESIZE, req);
    },
    sendInput(sessionId: string, data: string): void {
      ipcRenderer.send(IpcSend.PTY_INPUT, sessionId, data);
    },
    onOutput(callback: (msg: PtyOutputMessage) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, msg: PtyOutputMessage) => callback(msg);
      ipcRenderer.on(IpcOn.PTY_OUTPUT, handler);
      return () => ipcRenderer.removeListener(IpcOn.PTY_OUTPUT, handler);
    },
    onExit(callback: (msg: PtyExitMessage) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, msg: PtyExitMessage) => callback(msg);
      ipcRenderer.on(IpcOn.PTY_EXIT, handler);
      return () => ipcRenderer.removeListener(IpcOn.PTY_EXIT, handler);
    },
    childProcesses(sessionId: string): Promise<string[]> {
      return ipcRenderer.invoke(IpcInvoke.PTY_CHILD_PROCESSES, sessionId);
    },
    list(): Promise<string[]> {
      return ipcRenderer.invoke(IpcInvoke.PTY_LIST);
    },
  },
  clipboard: {
    readImage(): Promise<ClipboardImageResponse> {
      return ipcRenderer.invoke(IpcInvoke.CLIPBOARD_READ_IMAGE);
    },
  },
  shell: {
    detect(): Promise<string> {
      return ipcRenderer.invoke(IpcInvoke.SHELL_DETECT);
    },
    openExternal(url: string): Promise<void> {
      return ipcRenderer.invoke(IpcInvoke.SHELL_OPEN_EXTERNAL, url);
    },
  },
  zoom: {
    setFactor(factor: number): void {
      webFrame.setZoomFactor(factor);
    },
    getFactor(): number {
      return webFrame.getZoomFactor();
    },
  },
  notification: {
    show(opts: { title: string; body: string }): Promise<void> {
      return ipcRenderer.invoke(IpcInvoke.SHOW_NOTIFICATION, opts);
    },
    onClaude(callback: (data: ClaudeNotification) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, data: ClaudeNotification) => callback(data);
      ipcRenderer.on(IpcOn.CLAUDE_NOTIFICATION, handler);
      return () => ipcRenderer.removeListener(IpcOn.CLAUDE_NOTIFICATION, handler);
    },
  },
  persistence: {
    save(data: string): Promise<void> {
      return ipcRenderer.invoke(IpcInvoke.STATE_SAVE, data);
    },
    load(): Promise<string | null> {
      return ipcRenderer.invoke(IpcInvoke.STATE_LOAD);
    },
  },
  scroll: {
    onPhase(callback: (phase: string) => void): () => void {
      const handler = (_event: Electron.IpcRendererEvent, phase: string) => callback(phase);
      ipcRenderer.on(IpcOn.SCROLL_PHASE, handler);
      return () => ipcRenderer.removeListener(IpcOn.SCROLL_PHASE, handler);
    },
  },
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  },
};

contextBridge.exposeInMainWorld('termyApi', api);
