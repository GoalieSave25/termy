/**
 * Auto-generate terminal tab titles.
 * Strategy: try Chrome Prompt API (window.ai), fall back to heuristic parsing.
 */

let aiSession: any = null;
let aiAvailable: boolean | null = null;

async function getAiSession(): Promise<any> {
  if (aiAvailable === false) return null;
  if (aiSession) return aiSession;

  try {
    const ai = (window as any).ai;
    if (!ai?.languageModel) {
      aiAvailable = false;
      return null;
    }
    aiSession = await ai.languageModel.create({
      systemPrompt: 'You generate 2-3 word terminal tab titles. Respond with ONLY the title, nothing else.',
    });
    aiAvailable = true;
    return aiSession;
  } catch {
    aiAvailable = false;
    return null;
  }
}

async function generateWithAi(bufferText: string): Promise<string | null> {
  const session = await getAiSession();
  if (!session) return null;

  try {
    const result = await session.prompt(
      `Generate a 2-3 word title for this terminal session based on the output below.\n\n${bufferText.slice(-1500)}`
    );
    const title = result?.trim();
    if (title && title.length < 30) return title;
    return null;
  } catch {
    return null;
  }
}

/**
 * Heuristic title generation from terminal buffer text.
 * Parses common shell prompt patterns and recent commands.
 */
export function generateHeuristic(bufferText: string): string {
  const lines = bufferText.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return '';

  // Look for common running process indicators
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
    const line = lines[i].trim();

    // SSH session
    if (/^(ssh|scp)\s/.test(line) || /Last login:/.test(line)) return 'SSH Session';

    // Docker
    if (/^docker\s/.test(line)) return 'Docker';

    // Python/Node/etc REPL
    if (/^>>>/.test(line)) return 'Python REPL';
    if (/^>\s/.test(line) && lines.some((l) => l.includes('node'))) return 'Node REPL';

    // Editors
    if (/^(vim|nvim|nano|emacs)\s/.test(line)) return 'Editor';
  }

  // Try to extract the last command from a shell prompt
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
    const line = lines[i];

    // Match common prompt patterns and extract command after prompt
    // zsh: user@host path %  OR  path %
    // bash: user@host:path$  OR  $
    const promptMatch = line.match(/(?:[$%#>])\s+(.+)$/);
    if (promptMatch) {
      const cmd = promptMatch[1].trim().split(/\s+/)[0];
      if (cmd && cmd.length > 1) {
        return formatCommand(cmd);
      }
    }
  }

  // Try to find the last non-empty line that looks like a command
  const lastLine = lines[lines.length - 1]?.trim() ?? '';
  if (lastLine.match(/[$%#>]\s*$/)) {
    // Empty prompt — look at what's above
    for (let i = lines.length - 2; i >= Math.max(0, lines.length - 5); i--) {
      const line = lines[i].trim();
      if (line && !line.match(/[$%#>]\s*$/)) {
        const word = line.split(/\s+/)[0];
        if (word && word.length > 1 && word.length < 20) {
          return formatCommand(word);
        }
      }
    }
  }

  return '';
}

function formatCommand(cmd: string): string {
  // Clean up and capitalize
  const name = cmd.replace(/^[./~]+/, '').replace(/\.(sh|py|js|ts)$/, '');
  if (!name) return '';

  const knownCommands: Record<string, string> = {
    git: 'Git',
    npm: 'npm',
    node: 'Node',
    python: 'Python',
    python3: 'Python',
    pip: 'pip Install',
    cargo: 'Cargo',
    make: 'Make',
    cmake: 'CMake',
    go: 'Go',
    ruby: 'Ruby',
    java: 'Java',
    kubectl: 'Kubernetes',
    terraform: 'Terraform',
    docker: 'Docker',
    'docker-compose': 'Docker Compose',
    ssh: 'SSH',
    scp: 'SCP',
    curl: 'curl',
    wget: 'wget',
    htop: 'htop',
    top: 'top',
    vim: 'Vim',
    nvim: 'Neovim',
    nano: 'nano',
    claude: 'Claude Code',
    npx: 'npx',
    yarn: 'Yarn',
    pnpm: 'pnpm',
    bun: 'Bun',
    cat: 'cat',
    less: 'less',
    grep: 'grep',
    find: 'find',
    ls: 'Shell',
    cd: 'Shell',
  };

  return knownCommands[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Generate a title for a terminal session.
 * Tries AI first, falls back to heuristic.
 */
export async function generateTitle(bufferText: string): Promise<string> {
  if (!bufferText.trim()) return '';

  // Try AI
  const aiTitle = await generateWithAi(bufferText);
  if (aiTitle) return aiTitle;

  // Fall back to heuristic
  return generateHeuristic(bufferText);
}
