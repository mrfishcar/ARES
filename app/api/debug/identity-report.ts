// DEBUG_IDENTITY helpers for building identity debug blocks without changing
// the main response shape.

export interface IdentityGroupSummary {
  groupKey: string;
  keyType: 'globalId' | 'eid' | 'booknlp' | 'name';
  countEntitiesInResponse: number;
  sources: string[];
  exampleNames: string[];
  exampleIds: string[];
  clusterIds: string[];
}

export interface IdentityDebugReport {
  groups: IdentityGroupSummary[];
  worstOffender?: {
    groupKey: string;
    sampleA?: any;
    sampleB?: any;
    fieldDiffs: string[];
  };
  mentions: {
    hasMentions: boolean;
    totalMentions: number;
    mentionsForWorstGroup: number;
    fallbackNote?: string;
  };
}

function chooseGroupKey(entity: any): { key: string; keyType: IdentityGroupSummary['keyType'] } {
  const canonical = (entity.canonical || '').trim().toLowerCase();
  const type = entity.type || 'UNKNOWN';
  if (entity.id) return { key: `global:${entity.id}`, keyType: 'globalId' };
  if (entity.eid != null) return { key: `eid:${entity.eid}`, keyType: 'eid' };
  if (entity.booknlp_id) return { key: `booknlp:${entity.booknlp_id}`, keyType: 'booknlp' };
  return { key: `name:${type}:${canonical}`, keyType: 'name' };
}

function diffFields(a: any = {}, b: any = {}): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diffs: string[] = [];
  for (const key of keys) {
    const av = a[key];
    const bv = b[key];
    if (JSON.stringify(av) !== JSON.stringify(bv)) {
      diffs.push(key);
    }
  }
  return diffs;
}

export function buildIdentityDebugReport(
  entities: any[],
  spans: Array<{ entity_id: string }> | undefined,
  topN: number = 20
): IdentityDebugReport {
  const groupMap = new Map<string, {
    keyType: IdentityGroupSummary['keyType'];
    entities: any[];
    sources: Set<string>;
    exampleNames: Set<string>;
    exampleIds: Set<string>;
    clusterIds: Set<string>;
  }>();
  const entityToGroup = new Map<string, string>();

  for (const ent of entities) {
    const { key, keyType } = chooseGroupKey(ent);
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        keyType,
        entities: [],
        sources: new Set(),
        exampleNames: new Set(),
        exampleIds: new Set(),
        clusterIds: new Set(),
      });
    }
    const bucket = groupMap.get(key)!;
    bucket.entities.push(ent);
    bucket.sources.add((ent as any).source || 'unknown');
    if (ent.canonical) bucket.exampleNames.add(ent.canonical);
    if (Array.isArray(ent.aliases)) {
      for (const alias of ent.aliases.slice(0, 2)) bucket.exampleNames.add(alias);
    }
    if (ent.id) bucket.exampleIds.add(ent.id);
    if (ent.booknlp_id) bucket.clusterIds.add(ent.booknlp_id);
    if (ent.id) entityToGroup.set(ent.id, key);
  }

  const sortedGroups = Array.from(groupMap.entries())
    .map(([groupKey, data]) => ({
      groupKey,
      keyType: data.keyType,
      countEntitiesInResponse: data.entities.length,
      sources: Array.from(data.sources),
      exampleNames: Array.from(data.exampleNames).slice(0, 3),
      exampleIds: Array.from(data.exampleIds).slice(0, 3),
      clusterIds: Array.from(data.clusterIds),
      entities: data.entities,
    }))
    .sort((a, b) => b.countEntitiesInResponse - a.countEntitiesInResponse)
    .slice(0, topN);

  const worst = sortedGroups[0];
  let sampleA: any;
  let sampleB: any;
  let fieldDiffs: string[] = [];
  if (worst && worst.entities.length >= 2) {
    sampleA = worst.entities[0];
    sampleB = worst.entities[1];
    fieldDiffs = diffFields(sampleA, sampleB);
  } else if (worst && worst.entities.length === 1) {
    sampleA = worst.entities[0];
    fieldDiffs = [];
  }

  let mentionsForWorstGroup = 0;
  if (spans && worst) {
    const targetKey = worst.groupKey;
    for (const span of spans) {
      const key = span.entity_id ? entityToGroup.get(span.entity_id) : undefined;
      if (key === targetKey) {
        mentionsForWorstGroup += 1;
      }
    }
  }

  return {
    groups: sortedGroups.map(({ entities: _entities, ...rest }) => rest),
    worstOffender: worst
      ? {
          groupKey: worst.groupKey,
          sampleA,
          sampleB,
          fieldDiffs,
        }
      : undefined,
    mentions: {
      hasMentions: Array.isArray(spans) && spans.length > 0,
      totalMentions: Array.isArray(spans) ? spans.length : 0,
      mentionsForWorstGroup,
      fallbackNote: !spans ? 'spans not returned; mention_count may live on entities' : undefined,
    },
  };
}
