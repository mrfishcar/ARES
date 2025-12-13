import { describe, expect, it } from 'vitest';
import { projectEntitiesToVisibleRanges } from '../app/ui/console/src/editor/entityVisibility';
import type { EntitySpan } from '../app/ui/console/src/types/entities';

describe('projectEntitiesToVisibleRanges', () => {
  const makeEntity = (start: number, end: number): EntitySpan => ({
    start,
    end,
    text: 'entity',
    type: 'PERSON',
    confidence: 1,
    source: 'natural',
  });

  it('filters entities to the padded visible window', () => {
    const entities: EntitySpan[] = [
      makeEntity(0, 10),
      makeEntity(920, 940),
      makeEntity(4000, 4010),
    ];

    const { spans, scannedBytes } = projectEntitiesToVisibleRanges(
      entities,
      0,
      5000,
      [{ from: 900, to: 950 }],
      50,
    );

    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ from: 920, to: 940 });
    expect(scannedBytes).toBe(20);
  });

  it('respects base offsets when mapping spans', () => {
    const entities: EntitySpan[] = [makeEntity(150, 170)];

    const { spans } = projectEntitiesToVisibleRanges(
      entities,
      100,
      200,
      [{ from: 0, to: 80 }],
      10,
    );

    expect(spans[0]).toMatchObject({ from: 50, to: 70 });
  });
});
