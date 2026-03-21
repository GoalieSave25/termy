export function detectShell(): string {
  return process.env.SHELL ?? '/bin/zsh';
}
