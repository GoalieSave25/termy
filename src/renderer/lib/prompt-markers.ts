import type { IMarker } from '@xterm/xterm';

export interface PromptRegion {
  promptStart: IMarker;
  commandStart: IMarker | null;
  outputEnd: IMarker | null;
  exitCode?: number;
}

export interface PromptTracker {
  regions: PromptRegion[];
  current: PromptRegion | null;
}

export function createPromptTracker(): PromptTracker {
  return { regions: [], current: null };
}
