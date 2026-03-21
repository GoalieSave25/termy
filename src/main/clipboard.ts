import { clipboard, app } from 'electron';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type { ClipboardImageResponse } from '../shared/types';

// Track temp files for cleanup on exit
const tempFiles: string[] = [];

app.on('will-quit', () => {
  for (const f of tempFiles) {
    try { unlinkSync(f); } catch { /* already gone */ }
  }
  tempFiles.length = 0;
});

export function readClipboardImage(): ClipboardImageResponse {
  const image = clipboard.readImage();

  if (image.isEmpty()) {
    return { filePath: null, mimeType: null, width: 0, height: 0 };
  }

  const size = image.getSize();
  const pngBuffer = image.toPNG();
  const id = randomBytes(4).toString('hex');
  const filePath = join(tmpdir(), `termy-paste-${id}.png`);
  writeFileSync(filePath, pngBuffer);
  tempFiles.push(filePath);

  return {
    filePath,
    mimeType: 'image/png',
    width: size.width,
    height: size.height,
  };
}
