import { describe, it, expect } from 'vitest';
import type { EntitySpan } from '../../app/ui/console/src/types/entities';
import { collapseEntitiesForUI } from '../../app/ui/console/src/components/entity-review-utils';

describe('entity-review-utils', () => {
  it('collapses duplicate entities by entityId and aggregates metadata', () => {
    const entities: EntitySpan[] = [
      { text: 'Barty', type: 'PERSON', start: 0, end: 5, confidence: 0.95, source: 'booknlp', entityId: 'global_booknlp_0' },
      { text: 'Barty', type: 'PERSON', start: 10, end: 15, confidence: 0.9, source: 'natural', entityId: 'global_booknlp_0' },
      { text: 'Preston', type: 'PERSON', start: 20, end: 27, confidence: 0.8, source: 'booknlp', entityId: 'global_booknlp_1' },
    ];

    const indexMap = new Map<EntitySpan, number>();
    entities.forEach((e, i) => indexMap.set(e, i));

    const grouped = collapseEntitiesForUI(entities, indexMap);

    expect(grouped.length).toBe(2);
    const barty = grouped.find(g => g.entity.entityId === 'global_booknlp_0');
    expect(barty).toBeDefined();
    expect(barty?.duplicateCount).toBe(2);
    expect(barty?.indices.sort()).toEqual([0, 1]);
    expect(barty?.sources).toContain('booknlp');
    expect(barty?.sources).toContain('natural');
  });
});
