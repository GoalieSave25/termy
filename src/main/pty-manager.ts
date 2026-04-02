import * as pty from 'node-pty';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { BrowserWindow } from 'electron';

const execAsync = promisify(exec);
import { IpcOn } from '../shared/ipc-channels';
import type { PtyCreateRequest, PtyCreateResponse } from '../shared/types';
import { sanitizeShellEnv } from './shell-env';

interface PtyEntry {
  process: pty.IPty;
  /** Disposables returned by onData/onExit — must be disposed to avoid leaks */
  dataDisposable: pty.IDisposable;
  exitDisposable: pty.IDisposable;
  /** Cancel the batched output flush timer on destroy */
  cancelFlush: () => void;
}

export class PtyManager {
  private ptys = new Map<string, PtyEntry>();
  /** Sessions that were explicitly destroyed — suppress their onExit IPC */
  private destroyed = new Set<string>();
  private window: BrowserWindow | null = null;
  private notificationSocketPath: string | null = null;
  /** Resolved login shell environment — set once at app startup. */
  private shellEnv: Record<string, string> = process.env as Record<string, string>;

  setWindow(win: BrowserWindow) {
    this.window = win;
  }

  setNotificationSocketPath(path: string) {
    this.notificationSocketPath = path;
  }

  setShellEnv(env: Record<string, string>) {
    this.shellEnv = sanitizeShellEnv(env);
  }

  create(request: PtyCreateRequest): PtyCreateResponse {
    const shell = request.shell ?? this.shellEnv.SHELL ?? process.env.SHELL ?? '/bin/zsh';

    console.error(`[PTY] spawning shell=${shell} cwd=${request.cwd ?? this.shellEnv.HOME} cols=${request.cols} rows=${request.rows}`);
    const ptyProcess = pty.spawn(shell, ['--login'], {
      name: 'xterm-256color',
      cols: request.cols,
      rows: request.rows,
      cwd: (request.cwd === '~' ? this.shellEnv.HOME : request.cwd) ?? this.shellEnv.HOME ?? '/',
      env: sanitizeShellEnv({
        ...this.shellEnv,
        ...request.env,
        TERM_PROGRAM: 'Termy',
        COLORTERM: 'truecolor',
        ...(this.notificationSocketPath ? { TERMY_NOTIFICATION_SOCKET: this.notificationSocketPath } : {}),
      }),
    });

    // Batch output at ~4ms intervals to reduce IPC overhead
    let outputChunks: string[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const cancelFlush = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      outputChunks = [];
    };

    const dataDisposable = ptyProcess.onData((data: string) => {
      outputChunks.push(data);
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send(IpcOn.PTY_OUTPUT, {
              sessionId: request.sessionId,
              data: outputChunks.join(''),
            });
          }
          outputChunks = [];
          flushTimer = null;
        }, 16);
      }
    });

    const exitDisposable = ptyProcess.onExit(({ exitCode, signal }) => {
      console.error(`[PTY] session=${request.sessionId} exited code=${exitCode} signal=${signal} shell=${shell}`);
      this.ptys.delete(request.sessionId);
      // Don't send IPC for sessions that were explicitly destroyed
      if (this.destroyed.has(request.sessionId)) {
        this.destroyed.delete(request.sessionId);
        return;
      }
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send(IpcOn.PTY_EXIT, {
          sessionId: request.sessionId,
          exitCode,
          signal,
        });
      }
    });

    this.ptys.set(request.sessionId, {
      process: ptyProcess,
      dataDisposable,
      exitDisposable,
      cancelFlush,
    });

    return {
      sessionId: request.sessionId,
      pid: ptyProcess.pid,
      shell,
    };
  }

  write(sessionId: string, data: string): void {
    this.ptys.get(sessionId)?.process.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.ptys.get(sessionId)?.process.resize(cols, rows);
  }

  destroy(sessionId: string): void {
    const entry = this.ptys.get(sessionId);
    if (!entry) return;

    // Mark as explicitly destroyed so onExit skips IPC
    this.destroyed.add(sessionId);

    // Cancel any pending batched output flush
    entry.cancelFlush();

    // Dispose event listeners to prevent further callbacks
    entry.dataDisposable.dispose();
    entry.exitDisposable.dispose();

    // Kill the entire process group so child processes (vim, node, etc.)
    // are also terminated, not just the shell itself.
    // node-pty spawns with POSIX_SPAWN_SETSID on macOS, so the shell PID
    // is also the process group leader.
    const pid = entry.process.pid;
    try {
      process.kill(-pid, 'SIGHUP');
    } catch {
      // Process group already dead, or pid invalid — fall back to direct kill
      try { entry.process.kill(); } catch { /* already dead */ }
    }

    this.ptys.delete(sessionId);
  }

  destroyAll(): void {
    for (const [id] of this.ptys) {
      this.destroy(id);
    }
  }

  listSessions(): string[] {
    return Array.from(this.ptys.keys());
  }

  async getChildProcessNames(sessionId: string): Promise<string[]> {
    const entry = this.ptys.get(sessionId);
    if (!entry) return [];
    const p = entry.process;
    try {
      const { stdout } = await execAsync(`ps -o comm= -g ${p.pid}`, {
        timeout: 500,
      });
      return stdout.trim().split('\n').map(s => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
}
