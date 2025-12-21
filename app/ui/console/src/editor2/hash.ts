import type { BlockIndexEntry } from './types';

// Lightweight deterministic hash (djb2 variant) for browser/Node parity
export function computeDocVersion(plainText: string, blocks?: BlockIndexEntry[]): string {
  let hash = 5381;
  for (let i = 0; i < plainText.length; i++) {
    hash = (hash * 33) ^ plainText.charCodeAt(i);
  }
  if (blocks) {
    for (const block of blocks) {
      hash = (hash * 33) ^ block.type.length;
      hash = (hash * 33) ^ (block.plainEnd - block.plainStart);
    }
  }
  return `v${(hash >>> 0).toString(16)}`;
}
