export interface PtyCreateRequest {
  sessionId: string;
  shell?: string;
  cwd?: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
}

export interface PtyCreateResponse {
  sessionId: string;
  pid: number;
  shell: string;
}

export interface PtyResizeRequest {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface PtyInputMessage {
  sessionId: string;
  data: string;
}

export interface PtyOutputMessage {
  sessionId: string;
  data: string;
}

export interface PtyExitMessage {
  sessionId: string;
  exitCode: number;
  signal?: number;
}

export interface ClipboardImageResponse {
  filePath: string | null;
  mimeType: string | null;
  width: number;
  height: number;
}

export interface ClaudeNotification {
  type: string;
  title?: string;
  message?: string;
  sessionId?: string;
}

export interface TermyApi {
  pty: {
    create(req: PtyCreateRequest): Promise<PtyCreateResponse>;
    destroy(sessionId: string): Promise<void>;
    resize(req: PtyResizeRequest): Promise<void>;
    sendInput(sessionId: string, data: string): void;
    onOutput(callback: (msg: PtyOutputMessage) => void): () => void;
    onExit(callback: (msg: PtyExitMessage) => void): () => void;
    childProcesses(sessionId: string): Promise<string[]>;
    list(): Promise<string[]>;
  };
  clipboard: {
    readImage(): Promise<ClipboardImageResponse>;
  };
  shell: {
    detect(): Promise<string>;
    openExternal(url: string): Promise<void>;
  };
  zoom: {
    setFactor(factor: number): void;
    getFactor(): number;
  };
  notification: {
    show(opts: { title: string; body: string }): Promise<void>;
    onClaude(callback: (data: ClaudeNotification) => void): () => void;
  };
  persistence: {
    save(data: string): Promise<void>;
    load(): Promise<string | null>;
  };
  settings: {
    save(data: string): Promise<void>;
    load(): Promise<string | null>;
  };
  scroll: {
    onPhase(callback: (phase: string) => void): () => void;
  };
  system: {
    onResume(callback: () => void): () => void;
    onOpenSettings(callback: () => void): () => void;
  };
  getPathForFile(file: File): string;
}
