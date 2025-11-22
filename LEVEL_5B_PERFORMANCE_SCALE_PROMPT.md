# Level 5B: Cross-Document Performance & Scale

**Date**: November 21, 2025
**Status**: Ready to implement
**Time Estimate**: 6-8 hours
**Goal**: Handle large-scale knowledge graph construction with optimal performance

---

## Mission

Optimize ARES for real-world scenarios:
1. Process 100+ documents without performance degradation
2. Handle entities spanning 50,000+ character documents
3. Maintain sub-second matching times
4. Support incremental knowledge graph updates
5. Implement intelligent caching and indexing

---

## Current State

**Level 5A Complete**: ✅ Cross-document linking working
- ✅ Entity matching (confidence scoring)
- ✅ Disambiguation logic
- ✅ Relation merging
- ✅ All 10 tests passing

**Limitations**:
- Linear matching (O(n²) for n entities)
- No indexing or caching
- No batch processing optimization
- No streaming/incremental support
- All entities checked against all existing entities

---

## Level 5B Objectives

### 1. Performance Optimization
**Goal**: Sub-second matching even with 1000+ entities

**Targets**:
- Single entity match: < 10ms
- Full document (100 entities): < 500ms
- Batch (1000 entities): < 5 seconds
- Match accuracy: No decrease from naive approach

**Approach**:
- Index by type + first letter (fast filtering)
- Canonical name normalization for quick comparisons
- Memoization of computed values
- Early termination for high-confidence matches

### 2. Memory Optimization
**Goal**: Support 100+ documents without memory bloat

**Targets**:
- Per-document overhead: < 50KB
- Per-entity overhead: < 5KB
- Total for 100 docs (1000 entities): < 10MB
- No memory leaks in iterative processing

**Approach**:
- Efficient data structures (Map vs Object)
- Lazy attribute loading
- Garbage collection hints
- Memory pooling for temporary objects

### 3. Incremental Updates
**Goal**: Add documents to existing graph without reprocessing

**Approach**:
- Preserve existing global IDs
- Delta-based merging
- Rollback capability
- Transaction-like semantics

### 4. Batch Processing
**Goal**: Process multiple documents in optimized order

**Approach**:
- Smart document ordering
- Parallel entity matching
- Chunked processing
- Progress tracking

### 5. Query & Export
**Goal**: Efficient graph traversal and export

**Approach**:
- Entity lookup by ID (O(1))
- Entity search by canonical name
- Relation traversal (subject → objects)
- Export filtering (by type, date range, etc.)

---

## Test Structure (8 Tests)

### Test Group 1: Performance Benchmarks (3 tests)

**Test 5B-1: Single Document Performance**
```typescript
const doc = largeText(10000); // 10KB text, ~50 entities

const start = performance.now();
const { entities, relations } = await extractFromSegments('doc1', doc);
const graph = new GlobalKnowledgeGraph();
graph.addDocument('doc1', doc, entities, relations);
const elapsed = performance.now() - start;

// Should complete in < 500ms
expect(elapsed).toBeLessThan(500);
```

**Test 5B-2: Batch Document Performance**
```typescript
const docs = Array(50).fill(0).map((_, i) => ({
  id: `doc${i}`,
  text: largeText(5000)
}));

const graph = new GlobalKnowledgeGraph();
const start = performance.now();

for (const doc of docs) {
  const { entities, relations } = await extractFromSegments(doc.id, doc.text);
  graph.addDocument(doc.id, doc.text, entities, relations);
}

const elapsed = performance.now() - start;

// 50 documents should take < 10 seconds total
expect(elapsed).toBeLessThan(10000);
expect(graph.export().entities.length).toBeGreaterThan(100);
```

**Test 5B-3: Memory Usage**
```typescript
const initialMemory = process.memoryUsage().heapUsed;

const docs = Array(100).fill(0).map((_, i) => ({
  id: `doc${i}`,
  text: largeText(3000)
}));

const graph = new GlobalKnowledgeGraph();

for (const doc of docs) {
  const { entities, relations } = await extractFromSegments(doc.id, doc.text);
  graph.addDocument(doc.id, doc.text, entities, relations);
}

const finalMemory = process.memoryUsage().heapUsed;
const memoryUsed = finalMemory - initialMemory;

// 100 documents should use < 100MB
expect(memoryUsed).toBeLessThan(100 * 1024 * 1024);
```

### Test Group 2: Scale & Stress (3 tests)

**Test 5B-4: Large Entity Count**
```typescript
// Simulate document with many unique entities
const doc = "Person1 met Person2. Person2 met Person3. ... (1000 mentions)";

const graph = new GlobalKnowledgeGraph();
const { entities, relations } = await extractFromSegments('large', doc);

const start = performance.now();
graph.addDocument('large', doc, entities, relations);
const elapsed = performance.now() - start;

expect(elapsed).toBeLessThan(1000); // 1 second for 1000+ entities
expect(graph.export().entities.length).toBeGreaterThan(500);
```

**Test 5B-5: Deep Nesting (many aliases)**
```typescript
// Multiple documents with many aliases for same entity
const docs = [
  "Harry Potter attended Hogwarts.",
  "Potter defeated Voldemort.",
  "The boy who lived survived.",
  "Harry is the hero.",
  "Young Potter was brave.",
];

const graph = new GlobalKnowledgeGraph();

for (const [i, text] of docs.entries()) {
  const { entities, relations } = await extractFromSegments(`doc${i}`, text);
  graph.addDocument(`doc${i}`, text, entities, relations);
}

const exported = graph.export();
const harryEntities = exported.entities.filter(e =>
  e.canonical.toLowerCase().includes('potter') ||
  e.canonical.toLowerCase().includes('harry')
);

// All should merge to single entity with many aliases
expect(harryEntities.length).toBeLessThanOrEqual(2); // May have one per doc initially
expect(harryEntities[0].aliases.length).toBeGreaterThanOrEqual(3);
```

**Test 5B-6: Cross-cutting Relations**
```typescript
// Relations across many documents
const docs = Array(20).fill(0).map((_, i) => {
  const entityA = `Entity${i}`;
  const entityB = `Entity${(i + 1) % 20}`;
  return `${entityA} worked with ${entityB}.`;
});

const graph = new GlobalKnowledgeGraph();

for (const [i, text] of docs.entries()) {
  const { entities, relations } = await extractFromSegments(`doc${i}`, text);
  graph.addDocument(`doc${i}`, text, entities, relations);
}

const exported = graph.export();

// Should have ~20 unique entities
expect(exported.entities.length).toBeGreaterThanOrEqual(15);
// Relations should be properly merged
expect(exported.relations.length).toBeGreaterThan(0);
```

### Test Group 3: Incremental Updates (2 tests)

**Test 5B-7: Add to Existing Graph**
```typescript
// Initial graph with some documents
const graph = new GlobalKnowledgeGraph();

const doc1 = "Harry Potter attended Hogwarts.";
const result1 = await extractFromSegments('doc1', doc1);
graph.addDocument('doc1', doc1, result1.entities, result1.relations);

let exported = graph.export();
const initialCount = exported.entities.length;

// Add new document that mentions same entity
const doc2 = "Potter defeated Voldemort.";
const result2 = await extractFromSegments('doc2', doc2);

const start = performance.now();
graph.addDocument('doc2', doc2, result2.entities, result2.relations);
const elapsed = performance.now() - start;

// Should be fast (O(n) where n = entities in new doc)
expect(elapsed).toBeLessThan(100);

exported = graph.export();
const finalCount = exported.entities.length;

// Should have merged duplicates, not added new
expect(finalCount).toBeLessThanOrEqual(initialCount + 3);
```

**Test 5B-8: Batch Insert Efficiency**
```typescript
// Compare adding documents one-by-one vs batch
const docs = Array(10).fill(0).map((_, i) => ({
  id: `doc${i}`,
  text: `Person${i} met Person${(i+1) % 10}.`
}));

// Sequential insertion
const graph1 = new GlobalKnowledgeGraph();
const start1 = performance.now();
for (const doc of docs) {
  const result = await extractFromSegments(doc.id, doc.text);
  graph1.addDocument(doc.id, doc.text, result.entities, result.relations);
}
const elapsed1 = performance.now() - start1;

// Future: Could add batch API
// const graph2 = new GlobalKnowledgeGraph();
// const start2 = performance.now();
// await graph2.batchAddDocuments(docs);
// const elapsed2 = performance.now() - start2;

expect(elapsed1).toBeLessThan(2000); // Should be reasonably fast
expect(graph1.export().entities.length).toBeGreaterThan(5);
```

---

## Implementation Plan

### Phase 1: Profiling & Analysis (1.5 hours)

**Task 1.1: Benchmark Current Implementation**
```typescript
// Create benchmark suite
function benchmarkEntityMatching(existingCount: number, newEntity: Entity) {
  const entities = generateMockEntities(existingCount);
  const map = new Map(entities.map((e, i) => [e.id, { ...e, id: i.toString() }]));

  const start = performance.now();
  for (const [id, existing] of map) {
    calculateMatchConfidence(existing, newEntity);
  }
  const elapsed = performance.now() - start;

  return {
    existingCount,
    newEntity,
    timeMs: elapsed,
    timePerEntity: elapsed / existingCount
  };
}

// Test at different scales
const results = [10, 100, 500, 1000].map(count =>
  benchmarkEntityMatching(count, mockEntity)
);

// Results: O(n) behavior visible
// 10 entities: ~1ms (0.1ms per)
// 100 entities: ~10ms (0.1ms per)
// 500 entities: ~50ms (0.1ms per)
// 1000 entities: ~100ms (0.1ms per)
```

**Task 1.2: Identify Bottlenecks**
- Linear matching in `mergeEntity()`
- Full canonical comparison for every entity
- No early termination
- String operations repeated

**Task 1.3: Design Optimization Strategy**
- Implement type-based filtering (quick elimination)
- Implement first-letter index (pre-filter by name)
- Add confidence threshold fast-path
- Cache normalized names

### Phase 2: Implement Optimizations (3.5 hours)

**Task 2.1: Add Indexing to GlobalKnowledgeGraph**

```typescript
interface GlobalKnowledgeGraph {
  private entities: Map<string, GlobalEntity>;

  // NEW: Indices for fast lookup
  private byType: Map<EntityType, Set<string>>; // Type → entity IDs
  private byFirstLetter: Map<string, Set<string>>; // "type:P" → entity IDs
  private canonicalIndex: Map<string, string>; // Normalized canonical → entity ID
}

function addIndexes(entity: GlobalEntity) {
  // Index by type
  if (!this.byType.has(entity.type)) {
    this.byType.set(entity.type, new Set());
  }
  this.byType.get(entity.type)!.add(entity.id);

  // Index by first letter
  const firstLetter = entity.canonical[0]?.toLowerCase() || '';
  const key = `${entity.type}:${firstLetter}`;
  if (!this.byFirstLetter.has(key)) {
    this.byFirstLetter.set(key, new Set());
  }
  this.byFirstLetter.get(key)!.add(entity.id);

  // Canonical index
  this.canonicalIndex.set(
    `${entity.type}::${entity.canonical.toLowerCase()}`,
    entity.id
  );
}

function getCandidateMatches(newEntity: Entity): GlobalEntity[] {
  // Quick filters
  const candidates = new Set<GlobalEntity>();

  // Same type only
  const sameType = this.byType.get(newEntity.type) || new Set();

  // Add by first letter
  const firstLetter = newEntity.canonical[0]?.toLowerCase() || '';
  const byLetter = this.byFirstLetter.get(`${newEntity.type}:${firstLetter}`) || new Set();

  // Combine and fetch entities
  for (const id of new Set([...sameType, ...byLetter])) {
    const entity = this.entities.get(id);
    if (entity) candidates.add(entity);
  }

  return Array.from(candidates);
}
```

**Task 2.2: Optimize Matching Algorithm**

```typescript
private mergeEntity(newEntity: Entity, docId: string): string {
  // OPTIMIZATION 1: Quick exact match via canonical index
  const exactKey = `${newEntity.type}::${newEntity.canonical.toLowerCase()}`;
  const exactMatch = this.canonicalIndex.get(exactKey);

  if (exactMatch) {
    const existing = this.entities.get(exactMatch)!;
    existing.mentionCount += 1;
    existing.documents.push(docId);
    return existing.id;
  }

  // OPTIMIZATION 2: Only check candidates (filtered by type/letter)
  const candidates = this.getCandidateMatches(newEntity);

  if (candidates.length === 0) {
    // Create new entity
    return this.createNewEntity(newEntity, docId);
  }

  // OPTIMIZATION 3: Score only candidates
  const matches = candidates
    .map(existing => ({
      entity: existing,
      score: calculateMatchConfidence(existing, newEntity)
    }))
    .filter(m => m.score.confidence >= 0.80);

  if (matches.length === 0) {
    return this.createNewEntity(newEntity, docId);
  }

  // Merge with best match
  const best = matches.sort((a, b) => b.score.confidence - a.score.confidence)[0];
  this.updateExistingEntity(best.entity, newEntity, docId);

  return best.entity.id;
}
```

**Task 2.3: Implement Caching**

```typescript
interface CachedMatchResult {
  entity1Id: string;
  entity2Id: string;
  confidence: number;
  matchType: string;
  timestamp: number;
}

interface GlobalKnowledgeGraph {
  // ... existing ...
  private matchCache: Map<string, CachedMatchResult> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;

  private getCachedMatch(e1Id: string, e2Id: string): CachedMatchResult | null {
    const key = `${e1Id}::${e2Id}`;
    if (this.matchCache.has(key)) {
      this.cacheHits++;
      return this.matchCache.get(key)!;
    }
    this.cacheMisses++;
    return null;
  }

  private cacheMatch(e1Id: string, e2Id: string, result: CachedMatchResult) {
    const key = `${e1Id}::${e2Id}`;
    this.matchCache.set(key, result);

    // Clear old cache entries if too large
    if (this.matchCache.size > 10000) {
      // Remove oldest 10%
      const toDelete = Math.floor(10000 * 0.1);
      for (const k of Array.from(this.matchCache.keys()).slice(0, toDelete)) {
        this.matchCache.delete(k);
      }
    }
  }

  getStats() {
    return {
      entities: this.entities.size,
      relations: this.relations.size,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      hitRate: this.cacheHits / (this.cacheHits + this.cacheMisses)
    };
  }
}
```

**Task 2.4: Add Normalization Cache**

```typescript
interface GlobalKnowledgeGraph {
  private normalizedCache: Map<string, string> = new Map();

  private getNormalizedName(name: string): string {
    if (this.normalizedCache.has(name)) {
      return this.normalizedCache.get(name)!;
    }

    const normalized = name.toLowerCase().trim();
    this.normalizedCache.set(name, normalized);
    return normalized;
  }
}
```

### Phase 3: Testing & Optimization (2.5 hours)

**Task 3.1: Run Performance Tests**

```bash
npm test -- tests/ladder/level-5b-performance.spec.ts
```

Expected progression:
- First run: Some tests may timeout
- After indexing: All tests pass, good timing
- After caching: Faster with cache hits
- After normalization cache: Fastest

**Task 3.2: Profile Memory**

```typescript
// In test
const memStart = process.memoryUsage().heapUsed;

// ... add 100 documents ...

const memEnd = process.memoryUsage().heapUsed;
const used = (memEnd - memStart) / 1024 / 1024;

console.log(`Memory used: ${used.toFixed(2)}MB`);
expect(used).toBeLessThan(100);
```

**Task 3.3: Debug Slowdowns**

For each test:
1. Run with profiler
2. Identify slow operations
3. Apply targeted optimization
4. Re-test

Example slowdowns:
- String comparison too slow → use cached normalized
- Entity lookup too slow → use indices
- Array operations too slow → use Set/Map

**Task 3.4: Document Results**

Create performance report:
```
Optimization | Before | After | Improvement
-------------------------------------------
Type indexing | 100ms | 50ms | 50%
First-letter filter | 50ms | 20ms | 60%
Match caching | 20ms | 5ms | 75%
Norm caching | 5ms | 3ms | 40%
```

### Phase 4: Add Advanced Features (1.5 hours)

**Task 4.1: Query API**

```typescript
export interface QueryResult {
  entities: GlobalEntity[];
  relations: GlobalRelation[];
  statistics: {
    entityCount: number;
    relationCount: number;
    documentCount: number;
  };
}

class GlobalKnowledgeGraph {
  // Query by exact ID
  getEntity(id: string): GlobalEntity | undefined {
    return this.entities.get(id);
  }

  // Query by canonical name (type-safe)
  findEntitiesByName(name: string, type?: EntityType): GlobalEntity[] {
    const needle = name.toLowerCase();
    const candidates = Array.from(this.entities.values());

    return candidates.filter(e => {
      if (type && e.type !== type) return false;
      return e.canonical.toLowerCase().includes(needle) ||
             e.aliases.some(a => a.toLowerCase().includes(needle));
    });
  }

  // Query by type
  getEntitiesByType(type: EntityType): GlobalEntity[] {
    const ids = this.byType.get(type) || new Set();
    return Array.from(ids)
      .map(id => this.entities.get(id))
      .filter((e): e is GlobalEntity => e !== undefined);
  }

  // Get related entities
  getRelations(entityId: string, direction?: 'inbound' | 'outbound'): GlobalRelation[] {
    return Array.from(this.relations.values()).filter(r => {
      if (direction === 'inbound') return r.obj === entityId;
      if (direction === 'outbound') return r.subj === entityId;
      return r.subj === entityId || r.obj === entityId;
    });
  }

  // Export filtered
  export(options?: {
    entityTypes?: EntityType[];
    documentIds?: string[];
  }): ExportedGraph {
    let entities = Array.from(this.entities.values());

    if (options?.entityTypes) {
      entities = entities.filter(e => options.entityTypes!.includes(e.type));
    }

    if (options?.documentIds) {
      const docSet = new Set(options.documentIds);
      entities = entities.filter(e =>
        e.documents.some(d => docSet.has(d))
      );
    }

    // Filter relations to only included entities
    const entityIds = new Set(entities.map(e => e.id));
    const relations = Array.from(this.relations.values()).filter(r =>
      entityIds.has(r.subj) && entityIds.has(r.obj)
    );

    return {
      entities,
      relations,
      documents: Array.from(this.documents.values())
    };
  }
}
```

**Task 4.2: Batch Operations**

```typescript
export interface BatchAddOptions {
  parallel?: boolean; // Use Promise.all for faster processing
  chunkSize?: number; // Process in chunks to manage memory
  progressCallback?: (progress: number, total: number) => void;
}

class GlobalKnowledgeGraph {
  async batchAddDocuments(
    docs: Array<{ id: string; text: string }>,
    extractFn: (id: string, text: string) => Promise<{ entities: Entity[]; relations: Relation[] }>,
    options: BatchAddOptions = {}
  ): Promise<void> {
    const chunkSize = options.chunkSize || 10;
    const total = docs.length;

    for (let i = 0; i < docs.length; i += chunkSize) {
      const chunk = docs.slice(i, Math.min(i + chunkSize, docs.length));

      // Extract in parallel for chunk
      const results = await Promise.all(
        chunk.map(doc => extractFn(doc.id, doc.text))
      );

      // Add documents sequentially (to avoid race conditions)
      for (let j = 0; j < chunk.length; j++) {
        this.addDocument(
          chunk[j].id,
          chunk[j].text,
          results[j].entities,
          results[j].relations
        );
      }

      // Progress callback
      if (options.progressCallback) {
        options.progressCallback(Math.min(i + chunkSize, total), total);
      }
    }
  }
}
```

---

## Success Metrics

```
Performance:
  Single document (100 entities): < 500ms
  Batch (1000 entities): < 5 seconds
  Memory per document: < 50KB
  Cache hit rate: > 70%

Scalability:
  Support 100+ documents: ✓
  Support 1000+ entities: ✓
  Linear time complexity for batch: ✓
  No memory leaks: ✓

Test Results:
  Target: 8/8 tests passing (100%)
  Minimum: 6/8 tests passing (75%)
```

---

## Validation

### After Implementation

```bash
# Run Level 5B tests
npm test -- tests/ladder/level-5b-performance.spec.ts

# Expected: 8/8 passing

# Check for regressions
npm test -- tests/ladder/

# Expected: All Level 1-5A tests still passing
```

### Benchmarking

```bash
# Optional: Run benchmark suite
NODE_ENV=benchmark npm test -- tests/benchmarks/level-5b.benchmark.ts
```

---

## Files to Create/Modify

### New Files
- `/Users/corygilford/ares/tests/ladder/level-5b-performance.spec.ts` (480 lines)

### Modified Files
- `/Users/corygilford/ares/app/engine/global-graph.ts` (add indices, caching, query API)

---

## Troubleshooting

### Issue: Tests Still Slow

**Symptom**: Performance tests timeout even after optimization

**Solutions**:
1. Check if indices are being used
2. Verify normalization cache is working
3. Profile with `console.time()`
4. Consider reducing test document sizes

### Issue: Memory Usage High

**Symptom**: Memory grows beyond 100MB

**Solutions**:
1. Check cache size (should be capped)
2. Verify no circular references
3. Call `gc()` in tests if available
4. Use weak maps for caches

### Issue: Cache Hit Rate Low

**Symptom**: Cache hits < 50%

**Solutions**:
1. Increase cache size limit
2. Check if same matches are being computed
3. Verify cache key generation
4. Profile match computation frequency

---

## Next Steps After Level 5B

Once performance is optimized, you can:

**Option 1**: Level 5C (Distributed)
- Multi-machine knowledge graphs
- Network communication
- Consensus algorithms

**Option 2**: Level 6 (Advanced Features)
- Temporal reasoning
- Causal relations
- Multi-hop inference

**Option 3**: Level 7 (Semantic Enrichment)
- Knowledge base integration
- Property inference
- Contextual disambiguation

---

## Implementation Checklist

- ☐ Profiling complete (identify bottlenecks)
- ☐ Type-based indexing added
- ☐ First-letter filtering added
- ☐ Canonical matching fast-path
- ☐ Match result caching
- ☐ Normalization caching
- ☐ Query API implemented
- ☐ Batch operations implemented
- ☐ Performance tests created (8 tests)
- ☐ All tests passing
- ☐ No regressions in Level 1-5A
- ☐ Performance report generated
- ☐ Documentation updated

---

**Ready to optimize ARES for production scale!** 🚀

