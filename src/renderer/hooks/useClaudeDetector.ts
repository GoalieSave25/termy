import { useEffect, useRef } from 'react';
import { useLayoutStore } from '../store/layout-store';
import { useSessionStore } from '../store/session-store';
import { onTitleChange } from '../lib/terminal-registry';

function isClaudeTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return lower === 'claude' || lower.startsWith('claude:') || lower.startsWith('claude code');
}

export function useClaudeDetector() {
  const titleUnsubs = useRef<Map<string, () => void>>(new Map());
  const trackedSessions = useRef<Set<string>>(new Set());
  const idleTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Track which sessions were detected via title vs process scan
  const detectedViaTitle = useRef<Set<string>>(new Set());

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
            const isClaude = isClaudeTitle(title);
            const s = useSessionStore.getState().sessions[sessionId];
            if (!s) return;
            if (!s.isClaudeSession && isClaude) {
              detectedViaTitle.current.add(sessionId);
              useSessionStore.getState().updateSession(sessionId, {
                isClaudeSession: true,
                claudeState: 'active',
              });
            } else if (s.isClaudeSession && !isClaude) {
              // Title changed away from Claude (e.g. back to shell prompt)
              detectedViaTitle.current.delete(sessionId);
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
      for (const timer of idleTimers.current.values()) clearTimeout(timer);
      idleTimers.current.clear();
    };
  }, []);
}
