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

  const keyFor = (entity: EntitySpan) =>
    entity.entityId || `${entity.text.toLowerCase()}::${entity.type}`;

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
    const pickedType = Array.from(bucket.types.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || representative.type;
    const mergedEntity: EntitySpan = {
      ...representative,
      type: pickedType as EntityType,
      displayText: representative.canonicalName || representative.displayText || representative.text,
    };
    rows.push({
      rowKey: `${groupKey}-${bucket.indices.length}`,
      entity: mergedEntity,
      indices: bucket.indices,
      duplicateCount: bucket.indices.length,
      sources: Array.from(bucket.sources),
      typeConflicts: Array.from(bucket.types.keys()),
      ids: Array.from(bucket.ids),
    });
  }

  return rows;
}
