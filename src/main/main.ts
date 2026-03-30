import { app, BrowserWindow, powerMonitor } from 'electron';
import path from 'node:path';
import { PtyManager } from './pty-manager';
import { NotificationServer } from './notification-server';
import { registerIpcHandlers } from './ipc-handlers';
import { buildMenu } from './menu';
import { checkForUpdates } from './auto-updater';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
import started from 'electron-squirrel-startup';
if (started) {
  app.quit();
}

// Enable Chrome AI Prompt API if available
app.commandLine.appendSwitch('enable-features', 'AIPromptAPI');

// Prevent Chromium from permanently blocking WebGL after transient GPU crashes.
// Without this, a single GPU hiccup disables WebGL for the rest of the session.
app.disableDomainBlockingFor3DAPIs();

const ptyManager = new PtyManager();
const notificationServer = new NotificationServer();
ptyManager.setNotificationSocketPath(notificationServer.getSocketPath());
registerIpcHandlers(ptyManager);
buildMenu();

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 300,
    acceptFirstMouse: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  ptyManager.setWindow(mainWindow);
  notificationServer.setWindow(mainWindow);

  // Forward trackpad gesture scroll phases to renderer
  mainWindow.webContents.on('input-event', (_event, input) => {
    const t = input.type;
    if (t === 'gestureScrollBegin' || t === 'gestureScrollEnd' || t === 'gestureFlingStart' || t === 'gestureFlingCancel') {
      mainWindow.webContents.send('scroll:phase', t);
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

};

app.on('ready', () => {
  createWindow();
  notificationServer.start();

  // Notify renderer after sleep/wake so it can rebuild WebGL texture atlases.
  // GPU textures get corrupted on resume but no webglcontextlost event fires.
  powerMonitor.on('resume', () => {
    BrowserWindow.getAllWindows().forEach((w) => {
      w.webContents.send('system:resume');
    });
  });

  if (app.isPackaged) {
    setTimeout(() => {
      checkForUpdates({ silent: true }).catch(err => {
        console.error('[auto-update] Check failed:', err);
      });
    }, 3000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

let isQuitting = false;
app.on('before-quit', (e) => {
  if (isQuitting) return;
  isQuitting = true;
  e.preventDefault();
  ptyManager.destroyAll();
  notificationServer.stop();
  // SIGKILL ourselves to skip V8/libuv teardown entirely.
  // process.exit(0) and app.exit(0) both run C exit() which triggers
  // node-pty's native ThreadSafeFunction cleanup, crashing during V8
  // shutdown (SIGABRT). SIGKILL is handled by the kernel with zero
  // userspace cleanup and does not trigger macOS CrashReporter.
  setTimeout(() => process.kill(process.pid, 'SIGKILL'), 100);
});
