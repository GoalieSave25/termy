import type { PaneNode, PaneId, LeafNode, SplitNode, SplitDirection } from '../types/pane';
import { nanoid } from 'nanoid';

export function findNode(root: PaneNode, id: PaneId): PaneNode | null {
  if (root.id === id) return root;
  if (root.type === 'split') {
    return findNode(root.first, id) ?? findNode(root.second, id);
  }
  return null;
}

export function findParent(root: PaneNode, id: PaneId): SplitNode | null {
  if (root.type === 'split') {
    if (root.first.id === id || root.second.id === id) return root;
    return findParent(root.first, id) ?? findParent(root.second, id);
  }
  return null;
}

export function replaceNode(root: PaneNode, targetId: PaneId, replacement: PaneNode): PaneNode {
  if (root.id === targetId) return replacement;
  if (root.type === 'split') {
    return {
      ...root,
      first: replaceNode(root.first, targetId, replacement),
      second: replaceNode(root.second, targetId, replacement),
    };
  }
  return root;
}

export function removeLeaf(root: PaneNode, leafId: PaneId): PaneNode | null {
  if (root.type === 'leaf') {
    return root.id === leafId ? null : root;
  }
  if (root.first.id === leafId) return root.second;
  if (root.second.id === leafId) return root.first;

  const firstResult = root.first.type === 'split' ? removeLeaf(root.first, leafId) : root.first;
  if (firstResult !== root.first) {
    return firstResult === null ? root.second : { ...root, first: firstResult };
  }
  const secondResult = root.second.type === 'split' ? removeLeaf(root.second, leafId) : root.second;
  if (secondResult !== root.second) {
    return secondResult === null ? root.first : { ...root, second: secondResult };
  }
  return root;
}

export function getLeaves(root: PaneNode): LeafNode[] {
  if (root.type === 'leaf') return [root];
  return [...getLeaves(root.first), ...getLeaves(root.second)];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeLayout(root: PaneNode, bounds: Rect): Map<PaneId, Rect> {
  const result = new Map<PaneId, Rect>();

  function walk(node: PaneNode, b: Rect) {
    if (node.type === 'leaf') {
      result.set(node.id, b);
      return;
    }
    if (node.direction === 'horizontal') {
      const firstWidth = b.width * node.ratio;
      walk(node.first, { x: b.x, y: b.y, width: firstWidth, height: b.height });
      walk(node.second, { x: b.x + firstWidth, y: b.y, width: b.width - firstWidth, height: b.height });
    } else {
      const firstHeight = b.height * node.ratio;
      walk(node.first, { x: b.x, y: b.y, width: b.width, height: firstHeight });
      walk(node.second, { x: b.x, y: b.y + firstHeight, width: b.width, height: b.height - firstHeight });
    }
  }

  walk(root, bounds);
  return result;
}

type Direction = 'left' | 'right' | 'up' | 'down';

export function findNearest(
  layout: Map<PaneId, Rect>,
  fromId: PaneId,
  direction: Direction,
): PaneId | null {
  const from = layout.get(fromId);
  if (!from) return null;

  const fromCenterX = from.x + from.width / 2;
  const fromCenterY = from.y + from.height / 2;

  let bestId: PaneId | null = null;
  let bestDist = Infinity;

  for (const [id, rect] of layout) {
    if (id === fromId) continue;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;

    let valid = false;
    switch (direction) {
      case 'left':  valid = cx < fromCenterX; break;
      case 'right': valid = cx > fromCenterX; break;
      case 'up':    valid = cy < fromCenterY; break;
      case 'down':  valid = cy > fromCenterY; break;
    }
    if (!valid) continue;

    // Weight: prefer candidates aligned on the primary axis.
    // The off-axis distance is penalized 3x so a pane directly to the side
    // is always preferred over a diagonal one that happens to be closer.
    const isHorizontal = direction === 'left' || direction === 'right';
    const primary = isHorizontal ? Math.abs(cx - fromCenterX) : Math.abs(cy - fromCenterY);
    const offAxis = isHorizontal ? Math.abs(cy - fromCenterY) : Math.abs(cx - fromCenterX);
    const dist = primary + offAxis * 3;
    if (dist < bestDist) {
      bestDist = dist;
      bestId = id;
    }
  }

  return bestId;
}

export function splitLeaf(
  root: PaneNode,
  leafId: PaneId,
  direction: SplitDirection,
  newLeaf: LeafNode,
  newSplitId: PaneId,
): PaneNode {
  const split: SplitNode = {
    type: 'split',
    id: newSplitId,
    direction,
    ratio: 0.5,
    first: findNode(root, leafId)! as LeafNode,
    second: newLeaf,
  };
  return replaceNode(root, leafId, split);
}

// --- Proportional split helpers ---

interface RowItem {
  node: PaneNode;
  width: number;
}

/**
 * Find the topmost same-direction split ancestor of a leaf,
 * only following a continuous chain of same-direction splits.
 */
export function findRowRoot(root: PaneNode, leafId: PaneId, direction: SplitDirection): PaneId | null {
  function walk(node: PaneNode, currentRowRoot: PaneId | null): PaneId | null {
    if (node.type === 'leaf') {
      return node.id === leafId ? currentRowRoot : null;
    }
    if (node.direction === direction) {
      const rowRoot = currentRowRoot ?? node.id;
      return walk(node.first, rowRoot) ?? walk(node.second, rowRoot);
    }
    return walk(node.first, null) ?? walk(node.second, null);
  }
  return walk(root, null);
}

/** Flatten a same-direction split chain into items with absolute widths. */
export function flattenRow(node: PaneNode, direction: SplitDirection): RowItem[] {
  if (node.type === 'leaf' || node.direction !== direction) {
    return [{ node, width: 1.0 }];
  }
  return [
    ...flattenRow(node.first, direction).map(i => ({ ...i, width: i.width * node.ratio })),
    ...flattenRow(node.second, direction).map(i => ({ ...i, width: i.width * (1 - node.ratio) })),
  ];
}

/** Rebuild a right-leaning binary tree from a list of items with widths. */
function buildRow(items: RowItem[], direction: SplitDirection): PaneNode {
  if (items.length === 1) return items[0].node;
  const total = items.reduce((s, i) => s + i.width, 0);
  return {
    type: 'split',
    id: nanoid(),
    direction,
    ratio: items[0].width / total,
    first: items[0].node,
    second: buildRow(items.slice(1), direction),
  };
}

/**
 * Split a leaf with proportional space allocation.
 * If the leaf is in a row of same-direction splits, the new pane gets 1/(n+1)
 * and existing panes scale by n/(n+1). Otherwise, a standard 50/50 split.
 */
export function splitLeafProportional(
  root: PaneNode,
  leafId: PaneId,
  direction: SplitDirection,
  newLeaf: LeafNode,
): PaneNode {
  const rowRootId = findRowRoot(root, leafId, direction);

  if (!rowRootId) {
    const split: SplitNode = {
      type: 'split',
      id: nanoid(),
      direction,
      ratio: 0.5,
      first: findNode(root, leafId)! as LeafNode,
      second: newLeaf,
    };
    return replaceNode(root, leafId, split);
  }

  const rowRoot = findNode(root, rowRootId)!;
  const items = flattenRow(rowRoot, direction);
  const targetIdx = items.findIndex(item => findNode(item.node, leafId) !== null);
  if (targetIdx === -1) return splitLeaf(root, leafId, direction, newLeaf, nanoid());

  const n = items.length;
  const scale = n / (n + 1);
  const newItems: RowItem[] = [];
  for (let i = 0; i < items.length; i++) {
    newItems.push({ node: items[i].node, width: items[i].width * scale });
    if (i === targetIdx) {
      newItems.push({ node: newLeaf, width: 1 / (n + 1) });
    }
  }

  return replaceNode(root, rowRootId, buildRow(newItems, direction));
}

// --- Focus-based resize helpers ---

function containsLeaf(node: PaneNode, leafId: PaneId): boolean {
  if (node.type === 'leaf') return node.id === leafId;
  return containsLeaf(node.first, leafId) || containsLeaf(node.second, leafId);
}

export interface RowSplitSizes {
  splitId: PaneId;
  ratio: number; // target ratio for this split node (first / total)
}

/**
 * Compute focus-adjusted ratios for the horizontal row containing the focused pane.
 * Returns per-split ratios for the right-leaning binary chain, or null if
 * the focused pane is not in a horizontal row.
 */
export function computeFocusedRowRatios(
  root: PaneNode,
  focusedPaneId: PaneId,
): RowSplitSizes[] | null {
  const rowRootId = findRowRoot(root, focusedPaneId, 'horizontal');
  if (!rowRootId) return null;

  const rowRoot = findNode(root, rowRootId);
  if (!rowRoot) return null;

  const items = flattenRow(rowRoot, 'horizontal');
  const n = items.length;
  if (n <= 1) return null;

  const focusedIdx = items.findIndex(item => containsLeaf(item.node, focusedPaneId));
  if (focusedIdx === -1) return null;

  const focusedShare = Math.max(1 / 3, 2 / n);
  const unfocusedShare = (1 - focusedShare) / (n - 1);
  const targetWidths = items.map((_, i) => i === focusedIdx ? focusedShare : unfocusedShare);

  return widthsToRatios(rowRoot, targetWidths);
}

/**
 * Compute equal ratios for a horizontal row (used when focus leaves a row).
 */
export function computeEqualRowRatios(
  root: PaneNode,
  rowRootId: PaneId,
): RowSplitSizes[] | null {
  const rowRoot = findNode(root, rowRootId);
  if (!rowRoot || rowRoot.type !== 'split') return null;

  const items = flattenRow(rowRoot, 'horizontal');
  const n = items.length;
  if (n <= 1) return null;

  const equalWidth = 1 / n;
  const targetWidths = items.map(() => equalWidth);

  return widthsToRatios(rowRoot, targetWidths);
}

/**
 * Convert flat target widths into per-split ratios for a right-leaning binary tree.
 */
function widthsToRatios(node: PaneNode, widths: number[]): RowSplitSizes[] {
  const result: RowSplitSizes[] = [];

  function walk(n: PaneNode, ws: number[]): void {
    if (n.type !== 'split' || n.direction !== 'horizontal' || ws.length < 2) return;

    const firstWidth = ws[0];
    const restWidth = ws.slice(1).reduce((a, b) => a + b, 0);
    const total = firstWidth + restWidth;
    result.push({ splitId: n.id, ratio: firstWidth / total });

    if (n.second.type === 'split' && n.second.direction === 'horizontal') {
      walk(n.second, ws.slice(1));
    }
  }

  walk(node, widths);
  return result;
}
