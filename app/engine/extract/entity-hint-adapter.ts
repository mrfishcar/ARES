/**
 * Projects EntityHint spans to spaCy tokens by char offsets.
 * Produces a token-level map and a quick lookup for nearest-entity type.
 */

import type { EntityHint, EntType } from './entity-pass';

export interface SpacyToken {
  i: number;       // token index
  text: string;
  start: number;   // char offset inclusive
  end: number;     // char offset exclusive
}

export interface HintProjection {
  /** token index -> EntType (or 'UNKNOWN' if none) */
  tokenTypes: EntType[];
  /** nearest entity type by char position */
  nearestTypeAt(pos: number): EntType;
}

/** Build projection from spaCy tokens + entity hints */
export function projectHints(tokens: SpacyToken[], hints: EntityHint[]): HintProjection {
  const N = tokens.length;
  const tokenTypes: EntType[] = Array(N).fill('UNKNOWN');

  // Assign direct overlaps
  for (const h of hints) {
    for (let t = 0; t < N; t++) {
      const tok = tokens[t];
      const overlap = Math.max(0, Math.min(tok.end, h.end) - Math.max(tok.start, h.start));
      if (overlap > 0) tokenTypes[t] = h.type;
    }
  }

  // Build a sorted list of hint midpoints for nearest queries
  const mids = hints.map(h => ({ mid: (h.start + h.end) / 2, type: h.type })).sort((a,b)=>a.mid-b.mid);

  function nearestTypeAt(pos: number): EntType {
    if (mids.length === 0) return 'UNKNOWN';
    // binary search
    let lo = 0, hi = mids.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (mids[mid].mid < pos) lo = mid + 1; else hi = mid;
    }
    const cand = mids[lo];
    // Compare with previous neighbor if closer
    if (lo > 0 && Math.abs(mids[lo-1].mid - pos) < Math.abs(cand.mid - pos)) return mids[lo-1].type;
    return cand.type;
  }

  return { tokenTypes, nearestTypeAt };
}
