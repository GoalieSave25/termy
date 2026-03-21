export type ClaudeState = 'inactive' | 'active' | 'idle';

export interface ClaudeStatusData {
  model?: { id?: string; display_name?: string };
  context_window?: { used_percentage?: number; remaining_percentage?: number };
  cost?: { total_cost_usd?: number; total_duration_ms?: number; total_lines_added?: number; total_lines_removed?: number };
  session_id?: string;
}

export interface TerminalSession {
  id: string;
  pid: number;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  alive: boolean;
  summary?: string;
  isClaudeSession: boolean;
  claudeState: ClaudeState;
  claudeStatus?: ClaudeStatusData;
}
