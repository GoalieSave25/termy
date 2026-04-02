const recentInteractions = new Map<string, number>();

export function markSessionInteraction(sessionId: string): void {
  recentInteractions.set(sessionId, Date.now());
}

export function hasRecentSessionInteraction(sessionId: string, withinMs = 1000): boolean {
  const last = recentInteractions.get(sessionId);
  return last !== undefined && Date.now() - last <= withinMs;
}

export function clearSessionInteraction(sessionId: string): void {
  recentInteractions.delete(sessionId);
}
