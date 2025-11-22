# Level 6: Advanced Features - Temporal Reasoning & Inference

**Date**: November 21, 2025
**Status**: Ready to implement
**Time Estimate**: 10-12 hours
**Goal**: Add temporal reasoning, causal relations, and multi-hop graph inference

---

## Mission

Extend ARES to understand:
1. **Temporal Reasoning**: Events, timelines, sequences
2. **Causal Relations**: Cause-effect chains, dependencies
3. **Multi-hop Inference**: Graph traversal, relationship chains
4. **Knowledge Completion**: Infer missing relationships via paths
5. **Event Extraction**: Complex temporal events

---

## Current State

**Level 5B Complete**: ✅ Optimized global knowledge graph
- ✅ Fast entity matching and indexing
- ✅ Query API for searching and filtering
- ✅ Performance optimized for scale
- ✅ 72/72 tests passing across Levels 1-5B

**Ready For**: Advanced reasoning capabilities

---

## Level 6 Objectives

### 1. Temporal Event Extraction
**Goal**: Extract and link events to timestamps

**Example**:
```
Text: "In 1980, Harry Potter was born. Two years later, his parents died in 1981."

Expected Output:
Event: birth
  - Entity: Harry Potter
  - Time: 1980
  - Description: "was born"

Event: death
  - Entity: James Potter
  - Entity: Lily Potter
  - Time: 1981
  - Description: "died"

Temporal Link: birth BEFORE death (1980 < 1981)
```

### 2. Causal Relation Extraction
**Goal**: Identify cause-effect relationships

**Example**:
```
Text: "The storm caused flooding that destroyed houses."

Expected:
Relation: storm CAUSED flooding
Relation: flooding CAUSED destruction

Chain: storm → flooding → destruction
```

### 3. Multi-hop Inference
**Goal**: Infer relationships through intermediate entities

**Example**:
```
Known facts:
- Harry lives_in Hogwarts
- Hermione lives_in Hogwarts
- Ron lives_in Hogwarts

Inferred:
- Harry COHABITS_WITH Hermione (same location)
- Harry COHABITS_WITH Ron (same location)
- All three are PEERS (at same institution)
```

### 4. Event Graphs
**Goal**: Build temporal event networks

**Example**:
```
Timeline: 1997 → 1998 → 1999

1997: Battle_of_Hogwarts PRECEDES Voldemort_Death
1998: Voldemort_Death PRECEDES Peace_Era
1999: Peace_Era_Begins

Inference: Battle_of_Hogwarts INFLUENCES Peace_Era_Begins (multi-hop)
```

### 5. Causal Chains
**Goal**: Track cause-effect sequences

**Example**:
```
Narrative: "Harry defeated Voldemort, which ended the war, leading to peace."

Chain:
Harry_defeats_Voldemort
  ↓ (CAUSES)
War_ends
  ↓ (LEADS_TO)
Peace_established

Transitive: Harry_defeats_Voldemort LEADS_TO Peace_established
```

---

## Test Structure (12 Tests)

### Test Group 1: Temporal Event Extraction (3 tests)

**Test 6-1: Simple Date-Based Events**
```typescript
const text = `In 1980, Harry was born. His parents died in 1981.`;

const graph = await processText(text);

const events = graph.getEvents();

expect(events).toHaveLength(2);
expect(events[0].type).toBe('birth');
expect(events[0].time).toBe('1980');
expect(events[1].type).toBe('death');
expect(events[1].time).toBe('1981');

// Temporal relation
const beforeRel = graph.findRelation(events[0], events[1], 'before');
expect(beforeRel).toBeDefined();
```

**Test 6-2: Complex Multi-Entity Events**
```typescript
const text = `The Battle of Hogwarts started on May 1 and ended on May 2, 1998.`;

const graph = await processText(text);
const events = graph.getEvents();

expect(events.length).toBeGreaterThan(0);
const battle = events.find(e => e.type === 'battle');

expect(battle).toBeDefined();
expect(battle!.startTime).toBe('1998-05-01');
expect(battle!.endTime).toBe('1998-05-02');
expect(battle!.participants).toContain('Hogwarts');
```

**Test 6-3: Temporal Sequence**
```typescript
const text = `Harry was born in 1980. He attended Hogwarts in 1991.
              He defeated Voldemort in 1998.`;

const graph = await processText(text);
const timeline = graph.getTimeline('Harry');

// Should be in chronological order
expect(timeline[0].year).toBe(1980); // birth
expect(timeline[1].year).toBe(1991); // school
expect(timeline[2].year).toBe(1998); // victory
```

### Test Group 2: Causal Relations (3 tests)

**Test 6-4: Simple Cause-Effect**
```typescript
const text = `The storm caused flooding. The flooding destroyed houses.`;

const graph = await processText(text);

const stormEntity = graph.findEntity('storm');
const floodingEntity = graph.findEntity('flooding');
const destructionEvent = graph.findEvent('destruction');

const causedRel = graph.findRelation(stormEntity, floodingEntity, 'caused');
expect(causedRel).toBeDefined();

const causedRel2 = graph.findRelation(floodingEntity, destructionEvent, 'caused');
expect(causedRel2).toBeDefined();
```

**Test 6-5: Multi-Cause Events**
```typescript
const text = `The war ended because Harry defeated Voldemort and made peace with the Ministry.`;

const graph = await processText(text);

const warEntity = graph.findEntity('war');
const harryEntity = graph.findEntity('Harry');

// Both actions are causes of war ending
const causes = graph.findCauses('war ended');
expect(causes.length).toBeGreaterThanOrEqual(2);
expect(causes.some(c => c.includes('Harry'))).toBe(true);
expect(causes.some(c => c.includes('peace'))).toBe(true);
```

**Test 6-6: Causal Chains**
```typescript
const text = `Harry defeated Voldemort, which ended the war,
              bringing peace to the wizarding world.`;

const graph = await processText(text);

const chain = graph.getCausalChain('peace to the wizarding world');

expect(chain.length).toBeGreaterThanOrEqual(3);
expect(chain[0]).toContain('Harry');
expect(chain[1]).toContain('Voldemort');
expect(chain[2]).toContain('war');
expect(chain[chain.length - 1]).toContain('peace');
```

### Test Group 3: Multi-Hop Inference (3 tests)

**Test 6-7: Same Location Inference**
```typescript
const text = `Harry lives in Hogwarts. Hermione lives in Hogwarts. Ron lives in Hogwarts.`;

const graph = await processText(text);

const harry = graph.findEntity('Harry');
const hermione = graph.findEntity('Hermione');
const ron = graph.findEntity('Ron');

// Should infer cohabitation
const canInfer = graph.inferRelation(harry, hermione, 'cohabits_with');
expect(canInfer).toBe(true);

const canInfer2 = graph.inferRelation(harry, ron, 'cohabits_with');
expect(canInfer2).toBe(true);

// Transitivity: if A cohabits B and B cohabits C, then A and C are connected
const peers = graph.inferRelation(hermione, ron, 'peers');
expect(peers).toBe(true);
```

**Test 6-8: Chain Via Intermediate Entity**
```typescript
const text = `Harry works for Dumbledore. Dumbledore leads the Order of the Phoenix.
              The Order fights against Voldemort.`;

const graph = await processText(text);

// Direct relation: Harry --[works_for]--> Dumbledore
const direct1 = graph.findRelation('Harry', 'Dumbledore', 'works_for');
expect(direct1).toBeDefined();

// Inferred: Harry is against Voldemort (via 2 hops)
const inferred = graph.inferMultiHopRelation('Harry', 'Voldemort', 'opposes');
expect(inferred).toBe(true);
expect(inferred.path).toHaveLength(3); // Harry → Dumbledore → Order → Voldemort
```

**Test 6-9: Transitive Inference**
```typescript
const text = `The Ministry controls Diagon Alley. Diagon Alley has shops.
              Harry buys wands at shops.`;

const graph = await processText(text);

// Transitive: If Ministry controls X, and X has Y, then Ministry indirectly affects Y
const transitive = graph.inferTransitiveRelation('Ministry', 'wands');
expect(transitive).toBeDefined();
expect(transitive.type).toBe('affects');
expect(transitive.confidence).toBeLessThan(1.0); // Lower confidence for inference
expect(transitive.path.length).toBeGreaterThan(1);
```

### Test Group 4: Event Graphs & Timelines (3 tests)

**Test 6-10: Event Timeline**
```typescript
const text = `In 1997, the Battle of Hogwarts started. On May 1, 1998, it began.
              It ended on May 2. This led to Voldemort's death.`;

const graph = await processText(text);

const timeline = graph.buildEventTimeline();

expect(timeline.events.length).toBeGreaterThanOrEqual(3);
expect(timeline.events[0].time).toBeLessThan(timeline.events[1].time);
expect(timeline.events[1].time).toBeLessThan(timeline.events[2].time);

// Events should be linked temporally
const sequence = graph.getEventSequence();
expect(sequence.some(e => e.type === 'battle')).toBe(true);
expect(sequence.some(e => e.type === 'death')).toBe(true);
```

**Test 6-11: Knowledge Completion**
```typescript
const text = `Harry defeated Voldemort in 1998. This event happened at Hogwarts.
              Hermione participated in the battle. Ron was also there.`;

const graph = await processText(text);

// Given: Harry defeated Voldemort
// Inferred: Hermione and Ron also fought Voldemort (participated in same event)
const whoFought = graph.inferEntitySet('fought Voldemort');

expect(whoFought).toContain('Harry');
expect(whoFought).toContain('Hermione'); // inferred
expect(whoFought).toContain('Ron');      // inferred
```

**Test 6-12: Influence Graph**
```typescript
const text = `Dumbledore's decisions influenced Harry. Harry's actions influenced the war outcome.
              The war outcome determined the future of the wizarding world.`;

const graph = await processText(text);

// Build influence graph
const influences = graph.buildInfluenceGraph();

// Dumbledore → Harry → War Outcome → Future
expect(influences.hasPath('Dumbledore', 'war outcome')).toBe(true);
expect(influences.hasPath('Harry', 'future')).toBe(true);

// Transitive influence
const transitiveInfluence = influences.getTransitiveInfluence('Dumbledore', 'future');
expect(transitiveInfluence).toBeDefined();
expect(transitiveInfluence!.strength).toBeLessThan(1.0); // Weakens with distance
```

---

## Implementation Plan

### Phase 1: Design & Architecture (2 hours)

**Task 1.1: Event Data Structures**

```typescript
interface Event {
  id: string;
  type: 'birth' | 'death' | 'action' | 'communication' | 'state_change' | string;

  // Temporal
  startTime?: string; // ISO 8601 or relative
  endTime?: string;

  // Participants
  agents: string[];      // Who/what caused it
  patients: string[];    // Who/what was affected
  location?: string;

  // Relations
  causes?: string[];     // What this event caused
  causedBy?: string[];   // What caused this event

  confidence: number;
  source: string;
}

interface TemporalRelation {
  event1: string;
  event2: string;
  type: 'before' | 'after' | 'simultaneous' | 'overlaps' | 'contains';
  confidence: number;
}

interface CausalRelation extends Relation {
  type: 'caused' | 'led_to' | 'triggered' | 'resulted_in';
  strength: number; // 0-1: how direct is the causation
  path?: string[];  // Intermediate steps
}

interface InferenceResult {
  relation: Relation;
  type: 'direct' | 'inferred';
  confidence: number;
  path?: string[]; // Entities in the chain
  reasoning: string; // Explanation of inference
}
```

**Task 1.2: Temporal Reasoning Module**

```typescript
// File: /Users/corygilford/ares/app/engine/temporal-reasoning.ts

export class TemporalReasoner {
  // Parse and convert dates to comparable format
  parseTemporalExpression(text: string): {
    value: Date | null;
    relative?: string;
    confidence: number;
  }

  // Compare event timestamps
  compareEvents(event1: Event, event2: Event):
    'before' | 'after' | 'simultaneous' | 'unknown'

  // Build timeline from events
  buildTimeline(events: Event[]): TimelineEntry[]

  // Find temporal gaps or inconsistencies
  analyzeTemporalConsistency(events: Event[]): {
    consistent: boolean;
    gaps: string[];
    contradictions: string[];
  }
}
```

**Task 1.3: Causal Reasoning Module**

```typescript
// File: /Users/corygilford/ares/app/engine/causal-reasoning.ts

export class CausalReasoner {
  // Extract cause-effect pairs
  extractCausalPairs(text: string): CausalRelation[]

  // Build causal chains
  buildCausalChain(startEntity: string, endEntity: string):
    CausalRelation[] | null

  // Compute causal strength
  computeCausalStrength(cause: string, effect: string): number

  // Infer indirect causation
  inferIndirectCausation(entity1: string, entity2: string):
    { exists: boolean; path: string[]; strength: number }
}
```

**Task 1.4: Multi-hop Inference Module**

```typescript
// File: /Users/corygilford/ares/app/engine/inference-engine.ts

export class InferenceEngine {
  // Basic inference: same attribute → inferred relation
  inferCommonAttribute(entities: string[], attribute: string):
    InferenceResult[]

  // Transitive inference: A→B, B→C ⟹ A→C (possibly)
  inferTransitive(relation: string, maxHops: number):
    InferenceResult[]

  // Multi-hop path finding
  findRelationPath(from: string, to: string, maxHops: number):
    { path: string[]; relations: Relation[]; confidence: number } | null

  // Symmetrical inference: if A→B exists, sometimes B→A
  inferSymmetrical(relation: string):
    InferenceResult[]

  // Existential inference: if A mentions B but B not found, infer B exists
  inferMissingEntities(mention: string): Entity[]
}
```

### Phase 2: Implement Core Modules (5 hours)

**Task 2.1: Temporal Event Extraction**

```typescript
// In entities.ts or new file: extract-events.ts

function extractTemporalEvents(text: string, entities: Entity[]): Event[] {
  const events: Event[] = [];

  // Pattern 1: "In YEAR, EVENT happened"
  // Pattern 2: "X VERB'd at TIME"
  // Pattern 3: "DATE: ACTION, RESULT"

  // Use NLP to identify event predicates
  const eventPredicates = [
    'was born', 'died', 'married', 'divorced',
    'worked', 'studied', 'taught',
    'defeated', 'killed', 'saved',
    'traveled', 'arrived', 'left',
    'started', 'ended', 'began',
    'happened', 'occurred', 'took place'
  ];

  // Extract temporal expressions
  const timeExpressions = extractTimeExpressions(text);

  // Match events to times and entities
  for (const expr of timeExpressions) {
    // Find events near this time
    const nearbyEvents = findEventsNear(text, expr.position);

    for (const event of nearbyEvents) {
      events.push({
        id: uuid(),
        type: classifyEventType(event.predicate),
        startTime: expr.value,
        agents: event.agents,
        patients: event.patients,
        confidence: expr.confidence
      });
    }
  }

  return events;
}

function extractTimeExpressions(text: string): TimeExpression[] {
  const expressions: TimeExpression[] = [];

  // Regex patterns
  const patterns = [
    { regex: /in (\d{4})/i, format: 'year' },
    { regex: /on (\w+ \d+,? \d{4})/i, format: 'date' },
    { regex: /(\w+day), (\w+ \d+)/i, format: 'weekday' },
  ];

  // Apply patterns
  for (const pattern of patterns) {
    const matches = text.matchAll(pattern.regex);
    for (const match of matches) {
      expressions.push({
        text: match[0],
        value: parseTemporalExpression(match[1], pattern.format),
        position: match.index!,
        confidence: 0.9
      });
    }
  }

  return expressions;
}
```

**Task 2.2: Causal Relation Extraction**

```typescript
// In narrative-relations.ts or new file: causal-relations.ts

export function extractCausalRelations(text: string, entities: Entity[]): CausalRelation[] {
  const relations: CausalRelation[] = [];

  // Causal verbs and phrases
  const causalPatterns = [
    { pattern: /(\w+) caused (\w+)/i, type: 'caused' },
    { pattern: /(\w+) led to (\w+)/i, type: 'led_to' },
    { pattern: /because of (\w+), (\w+)/i, type: 'caused_by' },
    { pattern: /(\w+) resulted in (\w+)/i, type: 'resulted_in' },
    { pattern: /(\w+),? which (\w+)/i, type: 'caused' },
  ];

  for (const { pattern, type } of causalPatterns) {
    const matches = text.matchAll(pattern);

    for (const match of matches) {
      const cause = match[1];
      const effect = match[2];

      // Find matching entities
      const causeEntity = findEntityByText(cause, entities);
      const effectEntity = findEntityByText(effect, entities);

      if (causeEntity && effectEntity) {
        relations.push({
          id: uuid(),
          subj: causeEntity.id,
          pred: type,
          obj: effectEntity.id,
          confidence: 0.85,
          strength: computeStrength(cause, effect),
          evidence: [{
            doc_id: 'current',
            span: { start: match.index!, end: match.index! + match[0].length, text: match[0] },
            sentence_index: 0,
            source: 'RULE'
          }]
        });
      }
    }
  }

  return relations;
}
```

**Task 2.3: Multi-hop Inference**

```typescript
// File: /Users/corygilford/ares/app/engine/inference-engine.ts

export class InferenceEngine {
  constructor(private graph: GlobalKnowledgeGraph) {}

  /**
   * Find if two entities are connected via path
   */
  findRelationPath(
    fromId: string,
    toId: string,
    maxHops: number = 3,
    relationTypes?: string[]
  ): { path: string[]; relations: Relation[]; confidence: number } | null {
    // BFS to find shortest path
    const queue: Array<{
      current: string;
      path: string[];
      relations: Relation[];
      confidence: number;
    }> = [{ current: fromId, path: [fromId], relations: [], confidence: 1.0 }];

    const visited = new Set<string>([fromId]);

    while (queue.length > 0) {
      const { current, path, relations, confidence } = queue.shift()!;

      if (current === toId) {
        return { path, relations, confidence };
      }

      if (path.length - 1 >= maxHops) continue;

      // Get outgoing relations
      const outgoing = this.graph.getRelations(current, 'outbound');

      for (const rel of outgoing) {
        if (relationTypes && !relationTypes.includes(rel.type)) continue;

        const next = rel.obj;
        if (!visited.has(next)) {
          visited.add(next);
          queue.push({
            current: next,
            path: [...path, next],
            relations: [...relations, rel],
            confidence: confidence * rel.confidence
          });
        }
      }
    }

    return null;
  }

  /**
   * Infer relationships via shared attributes
   */
  inferCommonLocation(entities: string[]): InferenceResult[] {
    const results: InferenceResult[] = [];

    // Find entities that share location
    const locationMap = new Map<string, string[]>();

    for (const entityId of entities) {
      const rels = this.graph.getRelations(entityId);
      const locRel = rels.find(r => r.type === 'lives_in' || r.type === 'located_in');

      if (locRel) {
        if (!locationMap.has(locRel.obj)) {
          locationMap.set(locRel.obj, []);
        }
        locationMap.get(locRel.obj)!.push(entityId);
      }
    }

    // Infer cohabitation
    for (const [location, residents] of locationMap) {
      for (let i = 0; i < residents.length; i++) {
        for (let j = i + 1; j < residents.length; j++) {
          results.push({
            relation: {
              id: `${residents[i]}::cohabits::${residents[j]}`,
              subj: residents[i],
              pred: 'cohabits_with',
              obj: residents[j],
              evidence: [],
              confidence: 0.9
            },
            type: 'inferred',
            confidence: 0.9,
            path: [residents[i], location, residents[j]],
            reasoning: `Both ${residents[i]} and ${residents[j]} live in ${location}`
          });
        }
      }
    }

    return results;
  }

  /**
   * Infer transitive relations: if A→B and B→C, infer A→C
   */
  inferTransitiveRelations(relationTypes: string[]): InferenceResult[] {
    const results: InferenceResult[] = [];
    const entities = this.graph.export().entities;

    for (const entity of entities) {
      const outgoing = this.graph.getRelations(entity.id, 'outbound');

      for (const rel of outgoing) {
        if (!relationTypes.includes(rel.type)) continue;

        // Find relations from the target entity
        const targetOutgoing = this.graph.getRelations(rel.obj, 'outbound');

        for (const rel2 of targetOutgoing) {
          if (rel2.type !== rel.type) continue;

          // Found transitive chain: entity1 → entity2 → entity3
          const inferred = {
            relation: {
              id: `${entity.id}::${rel.type}::${rel2.obj}::transitive`,
              subj: entity.id,
              pred: rel.type,
              obj: rel2.obj,
              evidence: [],
              confidence: rel.confidence * rel2.confidence * 0.9 // Reduce confidence for inference
            },
            type: 'inferred' as const,
            confidence: rel.confidence * rel2.confidence * 0.9,
            path: [entity.id, rel.obj, rel2.obj],
            reasoning: `Transitive: ${entity.canonical} → ${this.graph.export().entities.find(e => e.id === rel.obj)?.canonical} → ...`
          };

          results.push(inferred);
        }
      }
    }

    return results;
  }
}
```

**Task 2.4: Temporal Reasoning**

```typescript
// File: /Users/corygilford/ares/app/engine/temporal-reasoning.ts

export class TemporalReasoner {
  /**
   * Convert various date formats to comparable value
   */
  parseTemporalExpression(text: string): Date | null {
    // Handle patterns like:
    // - "1980"
    // - "May 1, 1998"
    // - "1998-05-01"
    // - "summer of 1980"

    text = text.toLowerCase().trim();

    // Try ISO format first
    const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);
    }

    // Try "Month DD, YYYY"
    const monthMatch = text.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (monthMatch) {
      const months: Record<string, number> = {
        january: 0, february: 1, march: 2, april: 3,
        may: 4, june: 5, july: 6, august: 7,
        september: 8, october: 9, november: 10, december: 11
      };
      const month = months[monthMatch[1]];
      const day = parseInt(monthMatch[2]);
      const year = parseInt(monthMatch[3]);
      return new Date(year, month, day);
    }

    // Try year only
    const yearMatch = text.match(/\b(\d{4})\b/);
    if (yearMatch) {
      return new Date(parseInt(yearMatch[1]), 0, 1);
    }

    return null;
  }

  /**
   * Compare two events temporally
   */
  compareEvents(event1: Event, event2: Event): 'before' | 'after' | 'simultaneous' | 'unknown' {
    const time1 = event1.startTime ? this.parseTemporalExpression(event1.startTime) : null;
    const time2 = event2.startTime ? this.parseTemporalExpression(event2.startTime) : null;

    if (!time1 || !time2) return 'unknown';

    if (time1.getTime() < time2.getTime()) return 'before';
    if (time1.getTime() > time2.getTime()) return 'after';
    return 'simultaneous';
  }

  /**
   * Build chronological timeline
   */
  buildTimeline(events: Event[]): Array<{ event: Event; date: Date }> {
    const timeline: Array<{ event: Event; date: Date }> = [];

    for (const event of events) {
      if (event.startTime) {
        const date = this.parseTemporalExpression(event.startTime);
        if (date) {
          timeline.push({ event, date });
        }
      }
    }

    return timeline.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}
```

### Phase 3: Integration & Testing (3 hours)

**Task 3.1: Create Test File**

**File**: `/Users/corygilford/ares/tests/ladder/level-6-advanced.spec.ts`

Create 12 tests as specified above (see Test Structure section)

**Task 3.2: Run Tests & Debug**

```bash
npm test -- tests/ladder/level-6-advanced.spec.ts
```

Expected progression:
- First run: 4-6 tests passing
- After event extraction: 7-8 tests passing
- After causal extraction: 9-10 tests passing
- After inference: 11-12 tests passing

**Task 3.3: Add to Orchestrator**

Integrate new modules into extraction pipeline:

```typescript
// In orchestrator.ts

const events = extractTemporalEvents(fullText, entities);
const causalRelations = extractCausalRelations(fullText, entities);
const inferredRelations = inferenceEngine.inferRelations(entities, relations);

return {
  entities,
  relations: [...relations, ...causalRelations, ...inferredRelations],
  events,  // NEW
  // ... rest
};
```

---

## Success Metrics

```
Temporal Reasoning:
  Event extraction accuracy: ≥85%
  Date parsing: ≥90%
  Timeline consistency: ≥80%

Causal Relations:
  Cause detection: ≥80%
  Chain accuracy: ≥75%
  Transitive causation: ≥70%

Multi-hop Inference:
  Common attribute: ≥90%
  Transitive relations: ≥75%
  Path finding: ≥80%
  Path length ≤ 4 hops

Test Results:
  Target: 12/12 tests passing (100%)
  Minimum: 10/12 tests passing (83%)
```

---

## Files to Create/Modify

### New Files
- `/Users/corygilford/ares/tests/ladder/level-6-advanced.spec.ts` (600 lines)
- `/Users/corygilford/ares/app/engine/temporal-reasoning.ts` (300 lines)
- `/Users/corygilford/ares/app/engine/causal-reasoning.ts` (350 lines)
- `/Users/corygilford/ares/app/engine/inference-engine.ts` (400 lines)
- `/Users/corygilford/ares/app/engine/event-extraction.ts` (250 lines)

### Modified Files
- `/Users/corygilford/ares/app/engine/extract/orchestrator.ts` (integrate modules)
- `/Users/corygilford/ares/app/engine/schema.ts` (add Event type)

---

## Validation

### After Implementation

```bash
npm test -- tests/ladder/

# Expected output:
# ✅ Level 1-5: All passing (52/52)
# ✅ Level 6: 12/12 passing (NEW)
# Total: 64/64 tests
```

---

## Next Steps After Level 6

### Option 1: Level 7 (Semantic Enrichment)
- Knowledge base integration
- Property inference
- Entity linking to external databases

### Option 2: Level 5C (Distributed)
- Multi-machine knowledge graphs
- Network synchronization

### Option 3: Application Layer
- Build applications on top of ARES
- Chat/Q&A systems
- Knowledge browsing interface

---

## Ready to Implement Level 6?

This prompt provides:
- ✅ Complete architecture design
- ✅ 12 test cases with clear expectations
- ✅ Code examples for all modules
- ✅ Integration points
- ✅ Success metrics

**You have everything needed to implement Level 6: Advanced Features!** 🚀

