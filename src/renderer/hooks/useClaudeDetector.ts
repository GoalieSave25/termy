import { useEffect, useRef } from 'react';
import { useLayoutStore } from '../store/layout-store';
import { useSessionStore } from '../store/session-store';
import { onTitleChange } from '../lib/terminal-registry';
import { clearSessionInteraction, hasRecentSessionInteraction } from '../lib/session-interactions';

function isClaudeTitle(title: string): boolean {
  const lower = title.toLowerCase();
  // Claude Code titles are prefixed with a status char: "✳ Claude Code", "⠂ Claude Code"
  return lower === 'claude' || lower.includes('claude code') || lower.includes('claude:');
}

function isSpinnerChar(cp: number): boolean {
  // Braille patterns (U+2800–U+28FF) — used by Claude Code / Codex spinners
  return cp >= 0x2800 && cp <= 0x28FF;
}

function markClaudeCompleted(sessionId: string): void {
  if (hasRecentSessionInteraction(sessionId)) return;
  const session = useSessionStore.getState().sessions[sessionId];
  if (session?.claudeCompleted) return;
  clearSessionInteraction(sessionId);
  useSessionStore.getState().updateSession(sessionId, { claudeCompleted: true });
  window.termyApi.notification.bounceInformational();
}

export function useClaudeDetector() {
  const titleUnsubs = useRef<Map<string, () => void>>(new Map());
  const trackedSessions = useRef<Set<string>>(new Set());
  const idleTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Track which sessions were detected via title vs process scan
  const detectedViaTitle = useRef<Set<string>>(new Set());
  // Track sessions that have shown a spinner title (to detect completion)
  const spinnerSeenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const interval = setInterval(() => {
      const layoutState = useLayoutStore.getState();
      const sessionState = useSessionStore.getState();

      // Collect all session IDs across all tabs
      const allSessionIds = new Set<string>();
      for (const tab of layoutState.tabs) {
        for (const item of tab.carouselItems) {
          allSessionIds.add(item.sessionId);
        }
      }

      for (const sessionId of allSessionIds) {
        // Register title watchers for new sessions
        if (!trackedSessions.current.has(sessionId)) {
          trackedSessions.current.add(sessionId);
          const unsub = onTitleChange(sessionId, (title) => {
            const s = useSessionStore.getState().sessions[sessionId];
            if (!s) return;

            // Spinner-based detection FIRST — must run before the text-based
            // reset below, which would clear spinnerSeen and prevent completion.
            // Claude Code prefixes ALL titles with ⠂/⠐ (active) or ✳ (idle).
            const firstCp = title.codePointAt(0) ?? 0;
            if (isSpinnerChar(firstCp)) {
              spinnerSeenRef.current.add(sessionId);
              if (!s.isClaudeSession) {
                detectedViaTitle.current.add(sessionId);
                useSessionStore.getState().updateSession(sessionId, {
                  isClaudeSession: true,
                  claudeState: 'active',
                });
              }
            } else if (firstCp === 0x2733 && spinnerSeenRef.current.has(sessionId)) {
              // ✳ after spinner = Claude finished its turn
              spinnerSeenRef.current.delete(sessionId);
              markClaudeCompleted(sessionId);
            } else if (spinnerSeenRef.current.has(sessionId)) {
              // Spinner stopped without ✳ (e.g. Codex CLI) — treat as completed
              spinnerSeenRef.current.delete(sessionId);
              markClaudeCompleted(sessionId);
            }

            // Text-based detection (title contains "claude", or has spinner/✳ prefix)
            const isClaude = isClaudeTitle(title) || isSpinnerChar(firstCp) || firstCp === 0x2733;
            if (!s.isClaudeSession && isClaude) {
              detectedViaTitle.current.add(sessionId);
              useSessionStore.getState().updateSession(sessionId, {
                isClaudeSession: true,
                claudeState: 'active',
              });
            } else if (s.isClaudeSession && !isClaude) {
              // Title changed away from AI CLI (e.g. back to shell prompt)
              detectedViaTitle.current.delete(sessionId);
              spinnerSeenRef.current.delete(sessionId);
              useSessionStore.getState().updateSession(sessionId, {
                isClaudeSession: false,
                claudeState: 'inactive',
                claudeStatus: undefined,
              });
            }
          });
          titleUnsubs.current.set(sessionId, unsub);
        }

        const session = sessionState.sessions[sessionId];
        if (!session) continue;

        // Title-based detection handles most cases reactively.
        // Process scan is only needed for sessions not yet detected via title,
        // or to check if a process-detected Claude session is still running.
        // Skip process scan for title-detected sessions entirely.
        if (detectedViaTitle.current.has(sessionId)) continue;

        // Single process scan per session per interval (not two separate calls)
        window.termyApi.pty.childProcesses(sessionId).then((names) => {
          const hasClaude = names.some(
            (n) => n === 'claude' || n.endsWith('/claude')
          );
          const s = useSessionStore.getState().sessions[sessionId];
          if (!s) return;

          if (!s.isClaudeSession && hasClaude) {
            // Process-based detection
            useSessionStore.getState().updateSession(sessionId, {
              isClaudeSession: true,
              claudeState: 'active',
            });
          } else if (s.isClaudeSession && !hasClaude) {
            // Claude process gone — reset
            useSessionStore.getState().updateSession(sessionId, {
              isClaudeSession: false,
              claudeState: 'inactive',
              claudeStatus: undefined,
            });
            const timer = idleTimers.current.get(sessionId);
            if (timer) {
              clearTimeout(timer);
              idleTimers.current.delete(sessionId);
            }
          } else if (s.isClaudeSession && hasClaude && s.claudeState === 'active') {
            // Claude still running — track active/idle transitions
            const hasChildTools = names.some(
              (n) => n !== 'claude' && n !== 'node' && !n.endsWith('/zsh') && !n.endsWith('/bash') && !n.endsWith('/fish') && n !== 'zsh' && n !== 'bash' && n !== 'fish'
            );
            if (!hasChildTools && !idleTimers.current.has(sessionId)) {
              const timer = setTimeout(() => {
                const s2 = useSessionStore.getState().sessions[sessionId];
                if (s2?.claudeState === 'active') {
                  useSessionStore.getState().updateSession(sessionId, { claudeState: 'idle' });
                }
                idleTimers.current.delete(sessionId);
              }, 5000);
              idleTimers.current.set(sessionId, timer);
            } else if (hasChildTools) {
              const timer = idleTimers.current.get(sessionId);
              if (timer) {
                clearTimeout(timer);
                idleTimers.current.delete(sessionId);
              }
            }
          }
        });
      }

      // Clean up sessions that no longer exist
      for (const sessionId of trackedSessions.current) {
        if (!allSessionIds.has(sessionId)) {
          titleUnsubs.current.get(sessionId)?.();
          titleUnsubs.current.delete(sessionId);
          trackedSessions.current.delete(sessionId);
          detectedViaTitle.current.delete(sessionId);
          spinnerSeenRef.current.delete(sessionId);
          const timer = idleTimers.current.get(sessionId);
          if (timer) clearTimeout(timer);
          idleTimers.current.delete(sessionId);
        }
      }
    }, 10_000);

    // Also listen for Claude notifications
    const unsubNotification = window.termyApi.notification.onClaude((data) => {
      if (data.sessionId) {
        useSessionStore.getState().updateSession(data.sessionId, { claudeState: 'idle' });
      }
    });

    return () => {
      clearInterval(interval);
      unsubNotification();
      for (const unsub of titleUnsubs.current.values()) unsub();
      titleUnsubs.current.clear();
      trackedSessions.current.clear();
      detectedViaTitle.current.clear();
      spinnerSeenRef.current.clear();
      for (const timer of idleTimers.current.values()) clearTimeout(timer);
      idleTimers.current.clear();
    };
  }, []);
}
