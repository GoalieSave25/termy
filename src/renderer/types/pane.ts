export type PaneId = string;
export type SplitDirection = 'horizontal' | 'vertical';

export interface LeafNode {
  type: 'leaf';
  id: PaneId;
  sessionId: string;
}

export interface SplitNode {
  type: 'split';
  id: PaneId;
  direction: SplitDirection;
  ratio: number;
  first: PaneNode;
  second: PaneNode;
}

export type PaneNode = LeafNode | SplitNode;
