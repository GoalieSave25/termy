import * as net from 'node:net';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { BrowserWindow, Notification } from 'electron';
import { IpcOn } from '../shared/ipc-channels';

export class NotificationServer {
  private server: net.Server | null = null;
  private socketPath: string;
  private window: BrowserWindow | null = null;

  constructor() {
    const sockDir = path.join(os.tmpdir(), 'termy');
    fs.mkdirSync(sockDir, { recursive: true });
    this.socketPath = path.join(sockDir, `notify-${process.pid}.sock`);
  }

  setWindow(win: BrowserWindow) {
    this.window = win;
  }

  getSocketPath(): string {
    return this.socketPath;
  }

  start(): void {
    try { fs.unlinkSync(this.socketPath); } catch {}

    this.server = net.createServer((conn) => {
      let data = '';
      conn.on('data', (chunk) => { data += chunk.toString(); });
      conn.on('end', () => {
        try {
          const notification = JSON.parse(data);
          if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send(IpcOn.CLAUDE_NOTIFICATION, notification);

            // Show native notification when window is not focused
            if (!this.window.isFocused() && Notification.isSupported()) {
              new Notification({
                title: notification.title ?? 'Claude Code',
                body: notification.message ?? 'Task complete',
              }).show();
            }
          }
        } catch {
          // Ignore malformed data
        }
      });
    });

    this.server.listen(this.socketPath);
  }

  stop(): void {
    this.server?.close();
    try { fs.unlinkSync(this.socketPath); } catch {}
  }
}
