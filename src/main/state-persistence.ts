import { app } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const STATE_FILE = 'terminal-state.json';

function getStatePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE);
}

export async function saveState(data: string): Promise<void> {
  try {
    const filePath = getStatePath();
    // Atomic write: write to temp file, then rename
    const tmpPath = filePath + '.tmp';
    await fsp.writeFile(tmpPath, data, 'utf-8');
    await fsp.rename(tmpPath, filePath);
  } catch (err) {
    console.error('[STATE] Failed to save state:', err);
  }
}

export async function loadState(): Promise<string | null> {
  try {
    const filePath = getStatePath();
    try {
      return await fsp.readFile(filePath, 'utf-8');
    } catch {
      // File doesn't exist
    }
  } catch (err) {
    console.error('[STATE] Failed to load state:', err);
  }
  return null;
}
