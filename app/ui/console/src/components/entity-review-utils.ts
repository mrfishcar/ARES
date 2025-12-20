import type { EntitySpan, EntityType } from '../types/entities';

export interface AggregatedEntityRow {
  rowKey: string;
  entity: EntitySpan;
  indices: number[];
  duplicateCount: number;
  sources: string[];
  typeConflicts: string[];
  ids: string[];
}

export function collapseEntitiesForUI(
  displayEntities: EntitySpan[],
  indexMap: Map<EntitySpan, number>
): AggregatedEntityRow[] {
  const groups = new Map<string, {
    entities: EntitySpan[];
    indices: number[];
    sources: Set<string>;
    types: Map<string, number>;
    ids: Set<string>;
  }>();

  const keyFor = (entity: EntitySpan) => {
    if (entity.entityId) return entity.entityId;

    const normalizedText = (entity.canonicalName || entity.displayText || entity.text || '')
      .trim()
      .toLowerCase();

    if (normalizedText.length === 0) {
      const start = typeof entity.start === 'number' ? entity.start : 'u';
      const end = typeof entity.end === 'number' ? entity.end : 'u';
      return `${entity.type || 'unknown'}::${start}-${end}`;
    }

    return `${normalizedText}::${entity.type}`;
  };

  for (const entity of displayEntities) {
    const key = keyFor(entity);
    const idx = indexMap.get(entity);
    if (idx === undefined) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        entities: [],
        indices: [],
        sources: new Set(),
        types: new Map(),
        ids: new Set(),
      });
    }
    const bucket = groups.get(key)!;
    bucket.entities.push(entity);
    bucket.indices.push(idx);
    bucket.sources.add(entity.source || 'unknown');
    bucket.types.set(entity.type, (bucket.types.get(entity.type) || 0) + 1);
    if (entity.entityId) bucket.ids.add(entity.entityId);
  }

  const rows: AggregatedEntityRow[] = [];
  for (const [groupKey, bucket] of groups.entries()) {
    const representative = bucket.entities[0];
    const sortedTypes = Array.from(bucket.types.entries()).sort((a, b) => {
      if (b[1] === a[1]) return a[0].localeCompare(b[0]);
      return b[1] - a[1];
    });
    const pickedType = sortedTypes[0]?.[0] || representative.type;
    const mergedEntity: EntitySpan = {
      ...representative,
      type: pickedType as EntityType,
      displayText: representative.canonicalName || representative.displayText || representative.text,
    };
    rows.push({
      rowKey: groupKey,
      entity: mergedEntity,
      indices: bucket.indices,
      duplicateCount: bucket.indices.length,
      sources: Array.from(bucket.sources),
      typeConflicts: sortedTypes.map(([key]) => key),
      ids: Array.from(bucket.ids),
    });
  }

  return rows;
}
