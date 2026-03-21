import { app, dialog } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

async function getSourceDir(): Promise<string | null> {
  try {
    const configPath = path.join(app.getPath('userData'), 'source-dir');
    const dir = (await fs.readFile(configPath, 'utf-8')).trim();
    await fs.access(path.join(dir, '.git'));
    return dir;
  } catch {
    return null;
  }
}

interface UpdateCheckResult {
  available: boolean;
  behindCount: number;
  commitSummaries: string[];
}

async function checkGitStatus(repoDir: string): Promise<UpdateCheckResult | null> {
  // Only check on main branch
  const { stdout: branch } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoDir });
  if (branch.trim() !== 'main') return null;

  // Skip if working tree is dirty
  const { stdout: status } = await execFileAsync('git', ['status', '--porcelain'], { cwd: repoDir });
  if (status.trim().length > 0) return null;

  // Fetch latest
  await execFileAsync('git', ['fetch', 'origin', 'main'], { cwd: repoDir, timeout: 15_000 });

  // Count commits behind
  const { stdout: behindStr } = await execFileAsync(
    'git', ['rev-list', '--count', 'HEAD..origin/main'], { cwd: repoDir },
  );
  const behindCount = parseInt(behindStr.trim(), 10);

  if (behindCount === 0) {
    return { available: false, behindCount: 0, commitSummaries: [] };
  }

  // Get commit summaries for the dialog
  const { stdout: logStr } = await execFileAsync(
    'git', ['log', '--oneline', 'HEAD..origin/main', '--max-count=10'], { cwd: repoDir },
  );
  const commitSummaries = logStr.trim().split('\n').filter(Boolean);

  return { available: true, behindCount, commitSummaries };
}

export async function checkForUpdates(options: { silent?: boolean } = {}): Promise<void> {
  const { silent = false } = options;

  const sourceDir = await getSourceDir();
  if (!sourceDir) {
    if (!silent) {
      dialog.showMessageBox({
        type: 'warning',
        title: 'Update Check Failed',
        message: 'Could not locate the Termy source directory.',
        detail: 'Run the install script again: npm run setup',
      });
    }
    return;
  }

  let result: UpdateCheckResult | null;
  try {
    result = await checkGitStatus(sourceDir);
  } catch (err) {
    if (!silent) {
      dialog.showMessageBox({
        type: 'error',
        title: 'Update Check Failed',
        message: 'Could not check for updates.',
        detail: String(err),
      });
    }
    return;
  }

  if (result === null) {
    if (!silent) {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Check Skipped',
        message: 'Updates are only checked on the main branch with a clean working tree.',
      });
    }
    return;
  }

  if (!result.available) {
    if (!silent) {
      dialog.showMessageBox({
        type: 'info',
        title: 'No Updates Available',
        message: 'Termy is up to date.',
      });
    }
    return;
  }

  const detail = [
    `${result.behindCount} new commit${result.behindCount > 1 ? 's' : ''} available:`,
    '',
    ...result.commitSummaries.map(s => `  ${s}`),
    ...(result.behindCount > 10 ? [`  ... and ${result.behindCount - 10} more`] : []),
    '',
    'The app will quit, update, and relaunch automatically.',
    'This may take a minute.',
  ].join('\n');

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: 'A new version of Termy is available.',
    detail,
    buttons: ['Update Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });

  if (response !== 0) return;

  // Spawn the update script as a detached process
  const updateScript = path.join(sourceDir, 'scripts', 'update.sh');
  const child = spawn('bash', [updateScript, sourceDir, String(process.pid)], {
    detached: true,
    stdio: 'ignore',
    cwd: sourceDir,
  });
  child.unref();

  app.quit();
}
