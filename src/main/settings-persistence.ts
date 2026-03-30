import { app } from 'electron';
import fsp from 'node:fs/promises';
import path from 'node:path';

const SETTINGS_FILE = 'termy-settings.json';

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

export async function saveSettings(data: string): Promise<void> {
  try {
    const filePath = getSettingsPath();
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = filePath + '.tmp';
    await fsp.writeFile(tmpPath, data, 'utf-8');
    await fsp.rename(tmpPath, filePath);
  } catch (err) {
    console.error('[SETTINGS] Failed to save settings:', err);
  }
}

export async function loadSettings(): Promise<string | null> {
  try {
    const filePath = getSettingsPath();
    return await fsp.readFile(filePath, 'utf-8');
  } catch {
    // File doesn't exist yet
  }
  return null;
}
