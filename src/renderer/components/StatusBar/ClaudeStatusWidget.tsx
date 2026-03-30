import type { ClaudeStatusData } from '../../types/session';

interface Props {
  status: ClaudeStatusData;
}

export function ClaudeStatusWidget({ status }: Props) {
  const model = status.model?.display_name;
  const contextPct = status.context_window?.used_percentage;
  const cost = status.cost?.total_cost_usd;
  const duration = status.cost?.total_duration_ms;

  const formatDuration = (ms: number) => {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
  };

  return (
    <>
      {model && <span style={{ color: 'rgba(217, 158, 60, 0.7)' }}>{model}</span>}
      {contextPct != null && (
        <span className="flex items-center gap-1">
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>ctx</span>
          <span style={{ color: contextPct > 80 ? 'rgba(248,113,113,0.9)' : contextPct > 50 ? 'rgba(250,204,21,0.8)' : 'rgba(255,255,255,0.5)' }}>
            {Math.round(contextPct)}%
          </span>
        </span>
      )}
      {cost != null && (
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>${cost.toFixed(3)}</span>
      )}
      {duration != null && (
        <span style={{ color: 'rgba(255,255,255,0.35)' }}>{formatDuration(duration)}</span>
      )}
    </>
  );
}
