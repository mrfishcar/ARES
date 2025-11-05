# ARES Phase 3 - Knowledge Graph Enhancement Plan

**Goal: Transform extracted relations into a rich, queryable knowledge graph**

## Objectives

1. **Relation Qualifiers & Provenance** - Add time/place/source metadata
2. **Confidence & Calibration** - Compute confidence scores with distance penalties
3. **Cross-Document Merge** - Canonical entity linking and deduplication
4. **Contradiction Detection** - Flag conflicting facts with evidence pointers
5. **Query Layer** - Flexible filtering and retrieval API
6. **Export Formats** - JSON-LD, CSV, Graphviz DOT
7. **Testing & Validation** - Comprehensive qualifier tests

---

## 1. Relation Qualifiers & Provenance

### Schema Extension

```typescript
type Qualifier = {
  type: 'time' | 'place' | 'source';
  value: string;
  entity_id?: string;  // Link to DATE/PLACE entity
  span?: [number, number];  // Character offsets
};

type Relation = {
  // Existing fields
  id: string;
  subj: string;
  pred: Predicate;
  obj: string;
  evidence: Evidence[];

  // NEW Phase 3 fields
  qualifiers?: Qualifier[];
  conf?: number;  // 0.0 - 1.0 confidence score
  extractor?: 'dep' | 'regex';  // Extraction method
};
```

### Extraction Strategy

**Time Qualifiers:**
- Pattern: "X married Y **in 3019**"
- Scan ±12 tokens around relation trigger
- If DATE entity found, attach `{type:'time', value:'3019', entity_id:<date_id>}`

**Place Qualifiers:**
- Pattern: "X dwelt **in Hebron**"
- Already captured in relation object, but also add as qualifier
- `{type:'place', value:'Hebron', entity_id:<place_id>}`

**Source Qualifiers:**
- Always attach document ID/title
- `{type:'source', value:docId}`

### Implementation

```typescript
function extractQualifiers(
  tokens: Token[],
  triggerIdx: number,
  entities: Entity[],
  spans: Span[]
): Qualifier[] {
  const qualifiers: Qualifier[] = [];
  const window = 12;

  // Scan window around trigger
  for (let i = Math.max(0, triggerIdx - window);
       i < Math.min(tokens.length, triggerIdx + window);
       i++) {
    const tok = tokens[i];

    // Find entity at this token
    const entitySpan = spans.find(s =>
      s.start <= tok.start && tok.end <= s.end
    );

    if (!entitySpan) continue;

    const entity = entities.find(e => e.id === entitySpan.entity_id);
    if (!entity) continue;

    // Add qualifier based on entity type
    if (entity.type === 'DATE') {
      qualifiers.push({
        type: 'time',
        value: entity.canonical,
        entity_id: entity.id,
        span: [entitySpan.start, entitySpan.end]
      });
    } else if (entity.type === 'PLACE' && tok.i !== triggerIdx) {
      // Only add if not the main object
      qualifiers.push({
        type: 'place',
        value: entity.canonical,
        entity_id: entity.id,
        span: [entitySpan.start, entitySpan.end]
      });
    }
  }

  return qualifiers;
}
```

---

## 2. Confidence & Calibration

### Confidence Formula

```
conf = base × type_guard_bonus × distance_penalty

where:
- base = 0.9 (dep) or 0.7 (regex)
- type_guard_bonus = 1.05 if types match guard, 1.0 otherwise
- distance_penalty = exp(-Δchars / 40)
  - Δchars = character distance between subject and object
```

### Implementation

```typescript
function computeConfidence(
  subjTok: Token,
  objTok: Token,
  extractor: 'dep' | 'regex',
  passedTypeGuard: boolean
): number {
  // Base confidence
  const base = extractor === 'dep' ? 0.9 : 0.7;

  // Type guard bonus
  const typeBonus = passedTypeGuard ? 1.05 : 1.0;

  // Distance penalty (exponential decay)
  const charDist = Math.abs(objTok.start - subjTok.start);
  const distPenalty = Math.exp(-charDist / 40);

  return base * typeBonus * distPenalty;
}
```

### Entity Confidence Aggregation

```typescript
// Average confidence of all relations involving this entity
entity.centrality = avg(relations.where(r => r.subj === entity.id || r.obj === entity.id).map(r => r.conf))
```

---

## 3. Cross-Document Merge & Canonicalization

### Entity Merging Strategy

**Canonical Key:**
```typescript
function normalizeKey(name: string): string {
  return name.toLowerCase()
    .normalize('NFD')  // Decompose diacritics
    .replace(/[\u0300-\u036f]/g, '')  // Remove diacritics
    .trim();
}
```

**Merge Policy:**
- Same normalized name + same type → merge entities
- Keep all aliases: `["Gandalf", "Gandalf the Grey", "Mithrandir"]`
- Prefer longest mention as canonical

**Canonicalization Rules:**
1. "X the Y" → canonical: "X the Y", aliases: ["X", "Y"] (if Y is descriptive)
2. Multiple documents → merge spans, union aliases
3. Track provenance: which doc introduced which alias

### Implementation

```typescript
function mergeEntitiesAcrossDocs(
  docs: Array<{ entities: Entity[], spans: Span[] }>
): { entities: Entity[], aliasMap: Map<string, string> } {
  const canonicalMap = new Map<string, Entity>();
  const aliasMap = new Map<string, string>();  // alias → canonical_id

  for (const doc of docs) {
    for (const entity of doc.entities) {
      const key = `${entity.type}::${normalizeKey(entity.canonical)}`;

      if (canonicalMap.has(key)) {
        // Merge with existing
        const canonical = canonicalMap.get(key)!;
        canonical.aliases = [...new Set([...canonical.aliases, entity.canonical])];

        // Update alias map
        aliasMap.set(entity.id, canonical.id);
      } else {
        // New canonical entity
        canonicalMap.set(key, { ...entity });
        aliasMap.set(entity.id, entity.id);
      }
    }
  }

  return {
    entities: Array.from(canonicalMap.values()),
    aliasMap
  };
}
```

---

## 4. Contradiction Detection

### Conflict Types

1. **Single-valued predicates:** Multiple different objects
   - `parent_of(Aragorn → Arathorn)` vs `parent_of(Aragorn → Someone_Else)`

2. **Temporal conflicts:** Same relation at different times
   - `lives_in(Jacob → Hebron)` at time T1 vs `lives_in(Jacob → Jerusalem)` at time T2

3. **Type conflicts:** Same name, different entity types
   - `Gandalf (PERSON)` vs `Gandalf (PLACE)` - likely error

### Implementation

```typescript
type Conflict = {
  type: 'value_conflict' | 'temporal_conflict' | 'type_conflict';
  predicate?: Predicate;
  subject?: string;
  relations: string[];  // IDs of conflicting relations
  evidence: Evidence[][];  // Evidence for each conflicting relation
};

function detectConflicts(
  entities: Entity[],
  relations: Relation[]
): Conflict[] {
  const conflicts: Conflict[] = [];

  // Single-valued predicates (not many-valued like traveled_to)
  const singleValued = new Set(['parent_of', 'married_to', 'born_in', 'dies_in']);

  // Group relations by (subject, predicate)
  const groups = new Map<string, Relation[]>();
  for (const rel of relations) {
    if (!singleValued.has(rel.pred)) continue;

    const key = `${rel.subj}::${rel.pred}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(rel);
  }

  // Check for conflicts
  for (const [key, rels] of groups) {
    if (rels.length <= 1) continue;

    // Check if all objects are the same
    const objects = new Set(rels.map(r => r.obj));
    if (objects.size > 1) {
      conflicts.push({
        type: 'value_conflict',
        predicate: rels[0].pred,
        subject: rels[0].subj,
        relations: rels.map(r => r.id),
        evidence: rels.map(r => r.evidence)
      });
    }
  }

  return conflicts;
}
```

---

## 5. Query Layer

### API Design

```typescript
interface QueryOptions {
  subject?: string;  // Entity ID or name
  predicate?: Predicate;
  object?: string;  // Entity ID or name
  time?: string;  // Filter by time qualifier
  minConf?: number;  // Minimum confidence
}

function query(
  entities: Entity[],
  relations: Relation[],
  options: QueryOptions
): Relation[] {
  return relations.filter(rel => {
    // Subject filter
    if (options.subject) {
      const subjEnt = entities.find(e => e.id === rel.subj);
      if (!subjEnt) return false;
      if (!matchEntity(subjEnt, options.subject)) return false;
    }

    // Predicate filter
    if (options.predicate && rel.pred !== options.predicate) return false;

    // Object filter
    if (options.object) {
      const objEnt = entities.find(e => e.id === rel.obj);
      if (!objEnt) return false;
      if (!matchEntity(objEnt, options.object)) return false;
    }

    // Time filter
    if (options.time) {
      const timeQual = rel.qualifiers?.find(q => q.type === 'time');
      if (!timeQual || !timeQual.value.includes(options.time)) return false;
    }

    // Confidence filter
    if (options.minConf && (!rel.conf || rel.conf < options.minConf)) return false;

    return true;
  });
}

function matchEntity(entity: Entity, query: string): boolean {
  // Match by ID or canonical name (case-insensitive)
  return entity.id === query ||
         entity.canonical.toLowerCase().includes(query.toLowerCase()) ||
         entity.aliases.some(a => a.toLowerCase().includes(query.toLowerCase()));
}
```

---

## 6. Export Formats

### JSON-LD

```typescript
function toJSONLD(entities: Entity[], relations: Relation[]): object {
  return {
    "@context": {
      "@vocab": "http://schema.org/",
      "ares": "http://ares.example.org/vocab/"
    },
    "@graph": [
      ...entities.map(e => ({
        "@id": `ares:entity/${e.id}`,
        "@type": e.type,
        "name": e.canonical,
        "alternateName": e.aliases,
        "confidence": e.centrality
      })),
      ...relations.map(r => ({
        "@id": `ares:relation/${r.id}`,
        "@type": "Role",
        "agent": { "@id": `ares:entity/${r.subj}` },
        "object": { "@id": `ares:entity/${r.obj}` },
        "roleName": r.pred,
        "confidence": r.conf,
        "evidence": r.evidence.map(ev => ({
          "text": ev.span.text,
          "source": ev.doc_id,
          "position": [ev.span.start, ev.span.end]
        })),
        "qualifiers": r.qualifiers
      }))
    ]
  };
}
```

### CSV

```typescript
function toCSV(entities: Entity[], relations: Relation[]): string {
  const header = 'subject,predicate,object,confidence,doc,ev_start,ev_end,time,place\n';

  const rows = relations.map(r => {
    const subj = entities.find(e => e.id === r.subj)?.canonical || r.subj;
    const obj = entities.find(e => e.id === r.obj)?.canonical || r.obj;
    const ev = r.evidence[0];
    const timeQual = r.qualifiers?.find(q => q.type === 'time')?.value || '';
    const placeQual = r.qualifiers?.find(q => q.type === 'place')?.value || '';

    return `"${subj}","${r.pred}","${obj}",${r.conf || 0},"${ev.doc_id}",${ev.span.start},${ev.span.end},"${timeQual}","${placeQual}"`;
  }).join('\n');

  return header + rows;
}
```

### Graphviz DOT

```typescript
function toDOT(entities: Entity[], relations: Relation[]): string {
  let dot = 'digraph ARES {\n';
  dot += '  node [shape=box];\n';

  // Entities as nodes
  for (const e of entities) {
    const label = e.canonical + (e.centrality ? `\\n${e.centrality.toFixed(2)}` : '');
    dot += `  "${e.id}" [label="${label}"];\n`;
  }

  // Relations as edges
  for (const r of relations) {
    const label = r.pred + (r.conf ? `\\n${r.conf.toFixed(2)}` : '');
    dot += `  "${r.subj}" -> "${r.obj}" [label="${label}"];\n`;
  }

  dot += '}\n';
  return dot;
}
```

---

## 7. Testing & Validation

### Test Cases (tests/qualifiers.spec.ts)

1. **married_in_year**
   ```
   Text: "Aragorn married Arwen in 3019."
   Expected: married_to relation with time qualifier '3019'
   ```

2. **lives_in_place**
   ```
   Text: "Jacob dwelt in Hebron."
   Expected: lives_in relation with place qualifier 'Hebron'
   ```

3. **traveled_to_with_date**
   ```
   Text: "Gandalf traveled to Minas Tirith in the year 3018."
   Expected: traveled_to with time qualifier '3018'
   ```

4. **multi_sentence_begat**
   ```
   Text: "Abram begat Isaac in Canaan. Isaac begat Jacob."
   Expected: Two parent_of relations, first with place qualifier 'Canaan'
   ```

5. **conflicting_parents**
   ```
   Text: "Tom is the son of Bob. Tom is the son of Jim."
   Expected: Conflict detected with 2 parent_of relations
   ```

6. **nickname_alias**
   ```
   Text: "Gandalf the Grey traveled. Later, Gandalf visited Rohan."
   Expected: One entity with aliases ["Gandalf", "Gandalf the Grey"]
   ```

---

## Implementation Checklist

- [ ] Update `app/engine/schema.ts` with Qualifier type and extended Relation
- [ ] Add `computeConfidence()` to `app/engine/extract/relations.ts`
- [ ] Add `extractQualifiers()` to scan token windows
- [ ] Update all dependency patterns to attach qualifiers
- [ ] Create `app/engine/merge.ts` with canonicalization logic
- [ ] Create `app/engine/conflicts.ts` with conflict detection
- [ ] Create `app/engine/query.ts` with query API
- [ ] Create `app/engine/export.ts` with JSON-LD, CSV, DOT exporters
- [ ] Create `tests/qualifiers.spec.ts` with 6 test cases
- [ ] Run existing tests to ensure 15/15 still pass
- [ ] Document edge cases and performance notes

---

## Guardrails (Preserve Phase 2 Wins)

✅ **Keep dependency-first extraction** (0.9 conf)
✅ **Keep regex fallback** (0.7 conf)
✅ **Keep overlap-based binding** (best-match by start position)
✅ **Keep semantic head selection** (chooseSemanticHead with amod)
✅ **Keep multi-span entities** (dedupe includes position)
✅ **Keep type guards** (strict validation)

---

## Success Criteria

- ✅ All existing 15 tests pass
- ✅ 6 new qualifier tests pass
- ✅ Confidence scores computed for all relations
- ✅ Qualifiers extracted for time/place
- ✅ Entities merge across documents
- ✅ Conflicts detected and reported
- ✅ Query API functional
- ✅ Export to JSON-LD, CSV, DOT working

**Estimated LOC:** ~800 new lines across 4 new modules + updates to existing files
