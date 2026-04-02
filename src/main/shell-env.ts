import { execFile } from 'node:child_process';

const TRANSIENT_SHELL_ENV_KEYS = new Set([
  'INIT_CWD',
  'NPM_CONFIG_PREFIX',
  'npm_command',
  'npm_config_prefix',
  'npm_execpath',
  'npm_lifecycle_event',
  'npm_lifecycle_script',
  'npm_node_execpath',
  'npm_package_json',
]);

/**
 * Strip transient package-runner variables from interactive shell sessions.
 *
 * When Termy is launched via `npm start`, npm injects lifecycle/config env vars
 * into the Electron process. Those are useful for npm child processes, but
 * they leak into interactive login shells and can break shell init scripts
 * like nvm (notably via npm_config_prefix).
 */
export function sanitizeShellEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (value == null) continue;
    if (TRANSIENT_SHELL_ENV_KEYS.has(key)) continue;
    env[key] = value;
  }

  return env;
}

/**
 * Resolve the user's login shell environment.
 *
 * When Electron is launched from Finder/Spotlight, `process.env` has a minimal
 * system PATH (/usr/bin:/bin:/usr/sbin:/sbin). Tools installed via Homebrew,
 * nvm, cargo, etc. won't be found. This function spawns a login interactive
 * shell, captures its full environment, and returns it so PTY sessions see the
 * same PATH the user would get in Terminal.app or iTerm2.
 */
export function resolveShellEnv(): Promise<Record<string, string>> {
  const shell = process.env.SHELL || '/bin/zsh';
  const marker = `__TERMY_ENV_${Date.now()}__`;
  const parentEnv = sanitizeShellEnv(process.env);

  return new Promise((resolve) => {
    // -i: interactive (sources .zshrc / .bashrc — nvm, pyenv, etc.)
    // -l: login (sources .zprofile / .bash_profile — Homebrew, path_helper, etc.)
    // -c: run command and exit
    // env -0: null-separated output (handles values with newlines)
    execFile(shell, ['-ilc', `echo -n "${marker}"; env -0`], {
      timeout: 10000,
      encoding: 'utf-8',
      env: parentEnv,
    }, (err, stdout) => {
      if (err || !stdout) {
        console.warn('[shell-env] Failed to resolve login environment, using process.env:', err?.message);
        resolve(parentEnv);
        return;
      }

      // Everything before the marker is shell startup noise (MOTD, etc.)
      const markerIdx = stdout.indexOf(marker);
      if (markerIdx === -1) {
        console.warn('[shell-env] Marker not found in output, using process.env');
        resolve(parentEnv);
        return;
      }

      const envStr = stdout.substring(markerIdx + marker.length);
      const env: Record<string, string> = {};
      for (const entry of envStr.split('\0')) {
        const eq = entry.indexOf('=');
        if (eq > 0) {
          env[entry.substring(0, eq)] = entry.substring(eq + 1);
        }
      }

      // Sanity check — must have at least PATH and HOME
      if (!env.PATH || !env.HOME) {
        console.warn('[shell-env] Resolved env missing PATH or HOME, using process.env');
        resolve(parentEnv);
        return;
      }

      console.log(`[shell-env] Resolved PATH: ${env.PATH}`);
      resolve(env);
    });
  });
}
