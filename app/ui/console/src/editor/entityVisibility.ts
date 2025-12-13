import type { EntitySpan, EntityType } from '../types/entities';

export interface VisibleSpan {
  from: number;
  to: number;
  type: EntityType;
}

export interface VisibleSpanPlan {
  spans: VisibleSpan[];
  scannedBytes: number;
}

export const VISIBLE_RANGE_PADDING = 600;

export function projectEntitiesToVisibleRanges(
  entities: EntitySpan[],
  base: number,
  docLength: number,
  visibleRanges: readonly { from: number; to: number }[],
  padding: number = VISIBLE_RANGE_PADDING,
): VisibleSpanPlan {
  if (!entities.length || !visibleRanges.length) {
    return { spans: [], scannedBytes: 0 };
  }

  const expanded = visibleRanges.map(range => ({
    from: Math.max(0, range.from - padding),
    to: Math.min(docLength, range.to + padding),
  }));

  const spans: VisibleSpan[] = [];
  let scannedBytes = 0;

  for (const ent of entities) {
    const start = Math.max(0, ent.start - base);
    const end = Math.min(docLength, ent.end - base);
    if (end <= start) continue;

    const hitsViewport = expanded.some(range => end > range.from && start < range.to);
    if (!hitsViewport) continue;

    spans.push({ from: start, to: end, type: ent.type });
    scannedBytes += end - start;
  }

  return { spans, scannedBytes };
}
