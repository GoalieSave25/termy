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
      {model && <span className="text-amber-400/70">{model}</span>}
      {contextPct != null && (
        <span className="flex items-center gap-1">
          <span className="text-gray-600">ctx</span>
          <span className={contextPct > 80 ? 'text-red-400' : contextPct > 50 ? 'text-yellow-400' : 'text-gray-400'}>
            {Math.round(contextPct)}%
          </span>
        </span>
      )}
      {cost != null && (
        <span className="text-gray-400">${cost.toFixed(3)}</span>
      )}
      {duration != null && (
        <span className="text-gray-500">{formatDuration(duration)}</span>
      )}
    </>
  );
}
