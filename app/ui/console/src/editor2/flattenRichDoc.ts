import type {
  SerializedEditorState,
  SerializedLexicalNode,
  SerializedTextNode,
} from 'lexical';
import { type BlockIndexEntry, type FlattenResult, type PosMapEntry, type RichPoint } from './types';
import { computeDocVersion } from './hash';

interface CollectResult {
  text: string;
  entries: PosMapEntry[];
}

const isTextNode = (node: SerializedLexicalNode): node is SerializedTextNode =>
  node.type === 'text';

function appendSeparator(
  entries: PosMapEntry[],
  plainOffset: number,
  length: number,
  beforeKey?: string,
  afterKey?: string,
): PosMapEntry {
  const entry: PosMapEntry = {
    kind: 'separator',
    plainStart: plainOffset,
    plainEnd: plainOffset + length,
    beforeKey,
    afterKey,
  };
  entries.push(entry);
  return entry;
}

function collectFromChildren(
  children: SerializedLexicalNode[] | undefined,
  plainOffset: { current: number },
): CollectResult {
  let text = '';
  const entries: PosMapEntry[] = [];

  for (const child of children || []) {
    if (isTextNode(child)) {
      const childText = child.text || '';
      const start = plainOffset.current;
      const end = start + childText.length;
      entries.push({
        kind: 'text',
        key: child.key,
        textStart: 0,
        textEnd: childText.length,
        plainStart: start,
        plainEnd: end,
      });
      text += childText;
      plainOffset.current = end;
    } else if (child.type === 'linebreak') {
      text += '\n';
      appendSeparator(entries, plainOffset.current, 1, child.key, child.key);
      plainOffset.current += 1;
    } else if (Array.isArray((child as any).children)) {
      const nested = collectFromChildren((child as any).children, plainOffset);
      text += nested.text;
      entries.push(...nested.entries);
    }
  }

  return { text, entries };
}

function collectBlockText(
  block: SerializedLexicalNode,
  plainOffset: { current: number },
): { text: string; entries: PosMapEntry[]; blockKey: string } {
  const blockKey = block.key || `block-${Math.random().toString(36).slice(2)}`;

  if (block.type === 'horizontalrule') {
    // Represent divider as blank line for deterministic spacing
    return { text: '', entries: [], blockKey };
  }

  if (block.type === 'list') {
    const items = (block as any).children as SerializedLexicalNode[] | undefined;
    let text = '';
    const entries: PosMapEntry[] = [];
    if (items) {
      items.forEach((item, idx) => {
        const collected = collectFromChildren((item as any).children, plainOffset);
        text += collected.text;
        entries.push(...collected.entries);
        if (idx < items.length - 1) {
          text += '\n';
          appendSeparator(entries, plainOffset.current, 1, item.key, items[idx + 1]?.key);
          plainOffset.current += 1;
        }
      });
    }
    return { text, entries, blockKey };
  }

  const collected = collectFromChildren((block as any).children, plainOffset);
  return { text: collected.text, entries: collected.entries, blockKey };
}

function blockSeparatorGap(
  plainOffset: { current: number },
  entries: PosMapEntry[],
  beforeKey?: string,
  afterKey?: string,
) {
  appendSeparator(entries, plainOffset.current, 2, beforeKey, afterKey);
  plainOffset.current += 2;
}

export function flattenRichDoc(docJSON: SerializedEditorState): FlattenResult {
  const root = (docJSON as any).root as SerializedLexicalNode & { children?: SerializedLexicalNode[] };
  if (!root || root.type !== 'root') {
    return { plainText: '', posMap: [], blocks: [] };
  }

  const entries: PosMapEntry[] = [];
  const blocks: BlockIndexEntry[] = [];
  const plainOffset = { current: 0 };
  let plainText = '';

  const children = root.children || [];

  children.forEach((block, idx) => {
    const blockStart = plainOffset.current;
    const { text, entries: blockEntries, blockKey } = collectBlockText(block, plainOffset);
    plainText += text;
    entries.push(...blockEntries);
    const blockEnd = plainOffset.current = blockStart + text.length;

    blocks.push({
      key: blockKey,
      type: block.type,
      plainStart: blockStart,
      plainEnd: blockEnd,
    });

    const isLast = idx === children.length - 1;
    if (!isLast) {
      plainText += '\n\n';
      blockSeparatorGap(plainOffset, entries, block.key, children[idx + 1]?.key);
    }
  });

  return {
    plainText,
    posMap: entries,
    blocks,
  };
}

export function mapPlainOffsetToRich(posMap: PosMapEntry[], offset: number): RichPoint | null {
  if (!posMap.length) return null;
  const clamped = Math.max(0, offset);
  let low = 0;
  let high = posMap.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const entry = posMap[mid];
    if (clamped < entry.plainStart) {
      high = mid - 1;
    } else if (clamped > entry.plainEnd) {
      low = mid + 1;
    } else {
      if (entry.kind === 'text' && entry.key) {
        const relative = Math.min(entry.textEnd ?? 0, Math.max(0, clamped - entry.plainStart + (entry.textStart ?? 0)));
        return { key: entry.key, offset: relative };
      }
      // Separator: snap to closest neighbor
      if (entry.beforeKey) {
        return { key: entry.beforeKey, offset: 0 };
      }
      if (entry.afterKey) {
        return { key: entry.afterKey, offset: 0 };
      }
      return null;
    }
  }

  const entry = posMap[Math.max(0, Math.min(posMap.length - 1, low))];
  if (entry.kind === 'text' && entry.key) {
    const relative = clamped < entry.plainStart ? 0 : (entry.textEnd ?? 0);
    return { key: entry.key, offset: relative };
  }
  return null;
}

export function mapRichToPlain(posMap: PosMapEntry[], point: RichPoint): number | null {
  const entry = posMap.find(e => e.kind === 'text' && e.key === point.key);
  if (!entry || entry.textStart == null) return null;
  const offset = entry.plainStart + (point.offset - entry.textStart);
  return Math.max(entry.plainStart, Math.min(entry.plainEnd, offset));
}

export function snapshotRichDoc(docJSON: SerializedEditorState): FlattenResult & { docVersion: string } {
  const flattened = flattenRichDoc(docJSON);
  return {
    ...flattened,
    docVersion: computeDocVersion(flattened.plainText, flattened.blocks),
  };
}
