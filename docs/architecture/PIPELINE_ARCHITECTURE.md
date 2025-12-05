# ARES Pipeline Architecture

**Version:** 1.0
**Date:** 2025-12-04
**Status:** Design Document

## Overview

This document describes the refactored ARES extraction pipeline, transforming the monolithic orchestrator into a modular, composable system of discrete stages with well-defined inputs, outputs, and responsibilities.

## Goals

1. **Separation of Concerns** - Each stage has a single, clear responsibility
2. **Testability** - Each stage can be tested independently
3. **Composability** - Stages can be mixed, matched, or parallelized
4. **Observability** - Clear boundaries for logging, metrics, and debugging
5. **Maintainability** - Easier to understand, modify, and extend

## Architecture Principles

- **Stateless Stages** - No hidden globals; all state passed explicitly
- **Typed Boundaries** - Each stage has explicit input/output types
- **Configuration Injection** - All config passed as parameters, not env reads
- **Preserve Behavior** - Refactor maintains existing extraction quality
- **Backward Compatible** - Existing tests pass without modification

## Pipeline Stages

### Stage Flow Diagram

```
RawTextInput
    │
    ▼
┌─────────────────────────┐
│ 1. DocumentParseStage   │  Parse text → tokens, sentences, deps
│ (spaCy service)         │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ 2. EntityExtractionStage│  Extract entities from parsed text
│ Multi-source:           │  - spaCy NER
│  - NER                  │  - LLM enhancement (optional)
│  - Patterns             │  - Pattern library (optional)
│  - LLM (optional)       │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ 3. EntityFilteringStage │  Filter low-quality entities
│ (Precision Defense L1)  │  - Pronouns, common words
└──────────┬──────────────┘  - Confidence thresholds
           │
           ▼
┌─────────────────────────┐
│ 4. EntityProfilingStage │  Build entity profiles
│ (Adaptive Learning)     │  - Mention frequency
└──────────┬──────────────┘  - Context patterns
           │
           ▼
┌─────────────────────────┐
│ 5. CoreferenceStage     │  Resolve pronouns → entities
│ Resolution              │  - Recency-based
└──────────┬──────────────┘  - Descriptor matching
           │
           ▼
┌─────────────────────────┐
│ 6. DeicticResolutionStage│ Resolve spatial references
│ ("there" → place)       │  - "there" → recent location
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ 7. RelationExtractionStage│ Extract relations
│ Multi-source:            │ - Dependency paths
│  - Dependency patterns   │ - Narrative patterns
│  - Narrative patterns    │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ 8. RelationFilteringStage│ Filter false positives
│ (Precision Defense L2)   │ - Married_to suppression
└──────────┬──────────────┘ - Sibling detection
           │                 - Appositive filtering
           ▼
┌─────────────────────────┐
│ 9. InverseGenerationStage│ Generate inverse relations
│                          │ - parent_of ↔ child_of
└──────────┬──────────────┘ - founded ↔ founded_by
           │
           ▼
┌─────────────────────────┐
│ 10. DeduplicationStage   │ Merge duplicate relations
│ (Precision Defense L3)   │ - Same (subj, pred, obj)
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ 11. AliasResolutionStage │ Resolve aliases → EIDs
│ (HERT Phase 1-3)         │ - EID assignment
└──────────┬──────────────┘ - Alias registry
           │                 - Sense disambiguation
           ▼
┌─────────────────────────┐
│ 12. KnowledgeGraphStage  │ Build final KG structure
│                          │ - Alias population
└──────────┬──────────────┘ - Canonical selection
           │                 - Post-merge hygiene
           ▼
┌─────────────────────────┐
│ 13. HERTGenerationStage  │ Generate HERT IDs (optional)
│ (Optional)               │ - Encode entity occurrences
└──────────┬──────────────┘
           │
           ▼
    KnowledgeGraph
    (entities + relations + provenance)
```

## Stage Specifications

### 1. DocumentParseStage

**Responsibility:** Parse raw text into structured linguistic representation

**Input:**
```typescript
interface ParseStageInput {
  docId: string;
  fullText: string;
  config: EngineConfig;
}
```

**Output:**
```typescript
interface ParseStageOutput {
  docId: string;
  fullText: string;
  segments: Segment[];        // Document segments with context windows
  sentences: Sentence[];      // Sentence boundaries
  parseCache: Map<string, ParsedSentence>;  // spaCy parse results
}
```

**Operations:**
- Segment document into chunks (segmentDocument)
- Split into sentences (splitIntoSentences)
- Call spaCy parser service (parseWithService)
- Build parse cache for efficiency

**External Calls:**
- spaCy parser service (HTTP)

**Location:** `app/engine/pipeline/parse-stage.ts`

---

### 2. EntityExtractionStage

**Responsibility:** Extract entity candidates from parsed text

**Input:**
```typescript
interface EntityExtractionInput extends ParseStageOutput {
  llmConfig?: LLMConfig;
  patternLibrary?: PatternLibrary;
}
```

**Output:**
```typescript
interface EntityExtractionOutput {
  entities: Entity[];         // Raw entity candidates
  spans: Span[];              // Character offsets
  entityMap: Map<string, Entity>;  // type::canonical -> entity
}
```

**Operations:**
- Process each segment with context window
- Extract from spaCy NER (extractEntities)
- Optional: LLM enhancement (hybridExtraction)
- Optional: Pattern-based extraction (applyPatterns)
- Merge entities across segments
- Entity type correction (correctEntityType)

**External Calls:**
- spaCy parser (via extractEntities)
- LLM service (optional, via hybridExtraction)

**Location:** `app/engine/pipeline/entity-extraction-stage.ts`

---

### 3. EntityFilteringStage

**Responsibility:** Filter low-quality entity candidates (Precision Defense Layer 1)

**Input:**
```typescript
interface EntityFilteringInput {
  entities: Entity[];
  spans: Span[];
  entityMap: Map<string, Entity>;
  config: EntityFilterConfig;
}
```

**Output:**
```typescript
interface EntityFilteringOutput {
  entities: Entity[];
  spans: Span[];
  entityMap: Map<string, Entity>;
  filterStats: FilterStats;
}
```

**Operations:**
- Filter by confidence threshold
- Remove pronouns and common words
- Remove too-short entities
- Remove blocked tokens
- Remove invalid characters
- Validate dates
- Update spans and entityMap

**External Calls:** None

**Location:** `app/engine/pipeline/entity-filtering-stage.ts`

---

### 4. EntityProfilingStage

**Responsibility:** Build entity profiles for adaptive learning

**Input:**
```typescript
interface EntityProfilingInput {
  entities: Entity[];
  spans: Span[];
  sentences: Sentence[];
  docId: string;
  existingProfiles?: Map<string, EntityProfile>;
}
```

**Output:**
```typescript
interface EntityProfilingOutput {
  profiles: Map<string, EntityProfile>;
}
```

**Operations:**
- Count entity mentions
- Track context patterns
- Build descriptors
- Merge with existing profiles

**External Calls:** None

**Location:** `app/engine/pipeline/entity-profiling-stage.ts`

---

### 5. CoreferenceStage

**Responsibility:** Resolve pronouns and descriptive mentions to entities

**Input:**
```typescript
interface CoreferenceInput {
  sentences: Sentence[];
  entities: Entity[];
  spans: Span[];
  fullText: string;
  profiles: Map<string, EntityProfile>;
}
```

**Output:**
```typescript
interface CoreferenceOutput {
  corefLinks: CorefLink[];
  virtualSpans: Span[];     // Pronoun spans mapped to entities
}
```

**Operations:**
- Resolve pronouns (recency-based)
- Resolve descriptors ("the wizard" → Gandalf)
- Create virtual spans for pronoun mentions

**External Calls:** None

**Location:** `app/engine/pipeline/coreference-stage.ts`

---

### 6. DeicticResolutionStage

**Responsibility:** Resolve spatial/locative references ("there", "here")

**Input:**
```typescript
interface DeicticResolutionInput {
  fullText: string;
  entities: Entity[];
  spans: Span[];
}
```

**Output:**
```typescript
interface DeicticResolutionOutput {
  processedText: string;     // Text with deictic references resolved
  deicticSpans: DeicticSpan[];
}
```

**Operations:**
- Find location-like entities (PLACE, ORG, HOUSE)
- Find "there" occurrences
- Replace with most recent location

**External Calls:** None

**Location:** `app/engine/pipeline/deictic-resolution-stage.ts`

---

### 7. RelationExtractionStage

**Responsibility:** Extract relation candidates

**Input:**
```typescript
interface RelationExtractionInput {
  segments: Segment[];
  entities: Entity[];
  spans: Span[];           // Real + virtual (coref) spans
  processedText: string;   // After deictic resolution
  docId: string;
  corefLinks: CorefLink[];
  entityLookup: EntityLookup[];
}
```

**Output:**
```typescript
interface RelationExtractionOutput {
  relations: Relation[];    // All relation candidates
}
```

**Operations:**
- Extract from dependency paths (extractRelations)
- Extract from narrative patterns (extractAllNarrativeRelations)
- Remap evidence spans to absolute coordinates
- Attach sentence indices for proximity filtering

**External Calls:** None (uses pre-parsed data)

**Location:** `app/engine/pipeline/relation-extraction-stage.ts`

---

### 8. RelationFilteringStage

**Responsibility:** Filter false positive relations (Precision Defense Layer 2)

**Input:**
```typescript
interface RelationFilteringInput {
  relations: Relation[];
  entities: Entity[];
  spans: Span[];
  fullText: string;
  sentences: Sentence[];
}
```

**Output:**
```typescript
interface RelationFilteringOutput {
  relations: Relation[];
  filterStats: RelationFilterStats;
}
```

**Operations:**
- Married_to proximity suppression
- Sibling detection (Pattern FM-1)
- Appositive filtering
- Coordination detection
- Confidence thresholding

**External Calls:** None

**Location:** `app/engine/pipeline/relation-filtering-stage.ts`

---

### 9. InverseGenerationStage

**Responsibility:** Generate inverse relations

**Input:**
```typescript
interface InverseGenerationInput {
  relations: Relation[];
}
```

**Output:**
```typescript
interface InverseGenerationOutput {
  relations: Relation[];    // Original + generated inverses
}
```

**Operations:**
- For each relation with inverse predicate
- Generate inverse relation (swap subj/obj)
- Keep same evidence

**External Calls:** None

**Location:** `app/engine/pipeline/inverse-generation-stage.ts`

---

### 10. DeduplicationStage

**Responsibility:** Merge duplicate relations (Precision Defense Layer 3)

**Input:**
```typescript
interface DeduplicationInput {
  relations: Relation[];
  config: DeduplicationConfig;
}
```

**Output:**
```typescript
interface DeduplicationOutput {
  relations: Relation[];
  deduplicationStats: DeduplicationStats;
}
```

**Operations:**
- Group by (subj, pred, obj)
- Merge duplicate evidence
- Keep highest confidence

**External Calls:** None

**Location:** `app/engine/pipeline/deduplication-stage.ts`

---

### 11. AliasResolutionStage

**Responsibility:** Resolve aliases and assign HERT IDs (Phase 1-3)

**Input:**
```typescript
interface AliasResolutionInput {
  entities: Entity[];
  profiles: Map<string, EntityProfile>;
  corefLinks: CorefLink[];
}
```

**Output:**
```typescript
interface AliasResolutionOutput {
  entities: Entity[];       // With EID, AID, SP assigned
}
```

**Operations:**
- EID assignment (eidRegistry)
- Alias resolution (aliasResolver)
- Sense disambiguation (senseRegistry)
- Populate entity.aliases from coref links

**External Calls:** None

**Location:** `app/engine/pipeline/alias-resolution-stage.ts`

---

### 12. KnowledgeGraphStage

**Responsibility:** Build final knowledge graph structure

**Input:**
```typescript
interface KnowledgeGraphInput {
  entities: Entity[];
  spans: Span[];
  relations: Relation[];
  profiles: Map<string, EntityProfile>;
}
```

**Output:**
```typescript
interface KnowledgeGraphOutput {
  entities: Entity[];
  spans: Span[];
  relations: Relation[];
  fictionEntities: FictionEntity[];
}
```

**Operations:**
- Choose best canonical names
- Post-merge hygiene (heading names, event-ish persons)
- Filter entities not in relations (for dense narratives)
- Filter relations with invalid entities
- Extract fiction entities

**External Calls:** None

**Location:** `app/engine/pipeline/knowledge-graph-stage.ts`

---

### 13. HERTGenerationStage (Optional)

**Responsibility:** Generate HERT IDs for entity occurrences

**Input:**
```typescript
interface HERTGenerationInput {
  entities: Entity[];
  spans: Span[];
  fullText: string;
  docId: string;
  options: {
    generateHERTs: boolean;
    autoSaveHERTs: boolean;
  };
}
```

**Output:**
```typescript
interface HERTGenerationOutput {
  herts: string[];
}
```

**Operations:**
- Generate content hash
- Generate DID
- Create HERT for each span
- Encode HERT to string
- Optional: Save to HERT store

**External Calls:**
- HERT store (optional, if autoSaveHERTs)

**Location:** `app/engine/pipeline/hert-generation-stage.ts`

---

## Shared Types

All stages share a common type system defined in `app/engine/pipeline/types.ts`:

```typescript
// Core pipeline types
export interface EngineConfig {
  llmConfig?: LLMConfig;
  entityFilterConfig: EntityFilterConfig;
  deduplicationConfig: DeduplicationConfig;
  relationFilterConfig: RelationFilterConfig;
  hertOptions?: HERTOptions;
}

export interface Segment {
  paraIndex: number;
  sentIndex: number;
  start: number;
  end: number;
  text: string;
}

export interface Sentence {
  start: number;
  end: number;
  text: string;
}

export interface Span {
  entity_id: string;
  start: number;
  end: number;
}

export interface EntityLookup {
  id: string;
  canonical: string;
  type: EntityType;
  aliases: string[];
}

export interface CorefLink {
  entity_id: string;
  mention: { text: string; start: number; end: number };
  method: string;
  confidence: number;
}

export interface DeicticSpan {
  start: number;
  end: number;
  replacement: string;
}

// Statistics types
export interface FilterStats {
  original: number;
  filtered: number;
  removed: number;
  removalRate: number;
  removedByReason: Record<string, number>;
}

export interface RelationFilterStats {
  original: number;
  filtered: number;
  removed: number;
  removedByReason: {
    marriedToSuppression: number;
    siblingDetection: number;
    appositiveFiltering: number;
    confidenceThreshold: number;
  };
}

export interface DeduplicationStats {
  original: number;
  deduplicated: number;
  removed: number;
  removalRate: number;
  duplicateGroups: number;
  avgGroupSize: number;
  maxGroupSize: number;
}
```

---

## Orchestrator Composition Layer

The new orchestrator (`app/engine/pipeline/orchestrator.ts`) wires stages together:

```typescript
export async function extractFromSegments(
  docId: string,
  fullText: string,
  existingProfiles?: Map<string, EntityProfile>,
  llmConfig: LLMConfig = DEFAULT_LLM_CONFIG,
  patternLibrary?: PatternLibrary,
  options?: {
    generateHERTs?: boolean;
    autoSaveHERTs?: boolean;
  }
): Promise<{
  entities: Entity[];
  spans: Span[];
  relations: Relation[];
  fictionEntities: FictionEntity[];
  profiles: Map<string, EntityProfile>;
  herts?: string[];
}> {
  // Build configuration
  const config: EngineConfig = buildEngineConfig(llmConfig, options);

  // Stage 1: Parse
  const parseOutput = await runDocumentParseStage({
    docId,
    fullText,
    config
  });

  // Stage 2: Entity Extraction
  const entityOutput = await runEntityExtractionStage({
    ...parseOutput,
    llmConfig,
    patternLibrary
  });

  // Stage 3: Entity Filtering
  const filterOutput = await runEntityFilteringStage({
    ...entityOutput,
    config: config.entityFilterConfig
  });

  // Stage 4: Entity Profiling
  const profilingOutput = await runEntityProfilingStage({
    entities: filterOutput.entities,
    spans: filterOutput.spans,
    sentences: parseOutput.sentences,
    docId,
    existingProfiles
  });

  // Stage 5: Coreference
  const corefOutput = await runCoreferenceStage({
    sentences: parseOutput.sentences,
    entities: filterOutput.entities,
    spans: filterOutput.spans,
    fullText,
    profiles: profilingOutput.profiles
  });

  // Stage 6: Deictic Resolution
  const deicticOutput = await runDeicticResolutionStage({
    fullText,
    entities: filterOutput.entities,
    spans: filterOutput.spans
  });

  // Stage 7: Relation Extraction
  const relationOutput = await runRelationExtractionStage({
    segments: parseOutput.segments,
    entities: filterOutput.entities,
    spans: [...filterOutput.spans, ...corefOutput.virtualSpans],
    processedText: deicticOutput.processedText,
    docId,
    corefLinks: corefOutput.corefLinks,
    entityLookup: filterOutput.entities.map(e => ({
      id: e.id,
      canonical: e.canonical,
      type: e.type,
      aliases: e.aliases
    }))
  });

  // Stage 8: Relation Filtering
  const filteredRelations = await runRelationFilteringStage({
    relations: relationOutput.relations,
    entities: filterOutput.entities,
    spans: filterOutput.spans,
    fullText,
    sentences: parseOutput.sentences
  });

  // Stage 9: Inverse Generation
  const inverseOutput = await runInverseGenerationStage({
    relations: filteredRelations.relations
  });

  // Stage 10: Deduplication
  const dedupedOutput = await runDeduplicationStage({
    relations: inverseOutput.relations,
    config: config.deduplicationConfig
  });

  // Stage 11: Alias Resolution
  const aliasOutput = await runAliasResolutionStage({
    entities: filterOutput.entities,
    profiles: profilingOutput.profiles,
    corefLinks: corefOutput.corefLinks
  });

  // Stage 12: Knowledge Graph
  const kgOutput = await runKnowledgeGraphStage({
    entities: aliasOutput.entities,
    spans: filterOutput.spans,
    relations: dedupedOutput.relations,
    profiles: profilingOutput.profiles
  });

  // Stage 13: HERT Generation (optional)
  let herts: string[] | undefined;
  if (options?.generateHERTs) {
    const hertOutput = await runHERTGenerationStage({
      entities: kgOutput.entities,
      spans: kgOutput.spans,
      fullText,
      docId,
      options: {
        generateHERTs: true,
        autoSaveHERTs: options.autoSaveHERTs || false
      }
    });
    herts = hertOutput.herts;
  }

  return {
    entities: kgOutput.entities,
    spans: kgOutput.spans,
    relations: kgOutput.relations,
    fictionEntities: kgOutput.fictionEntities,
    profiles: profilingOutput.profiles,
    herts
  };
}
```

---

## Logging Strategy

Each stage logs:

1. **Entry** - Stage name, input size
2. **Exit** - Stage name, output size, duration
3. **Errors** - Stage name, error type, context

Example:
```typescript
console.log(`[${stageName}] Starting (${inputSize} entities)`);
const start = Date.now();

// ... stage logic ...

const duration = Date.now() - start;
console.log(`[${stageName}] Complete in ${duration}ms (${outputSize} entities)`);
```

---

## Error Handling

Each stage:

1. **Validates Input** - Check required fields exist
2. **Propagates Errors** - Let orchestrator handle failures
3. **Provides Context** - Include stage name in error

Example:
```typescript
export async function runEntityExtractionStage(
  input: EntityExtractionInput
): Promise<EntityExtractionOutput> {
  try {
    validateEntityExtractionInput(input);
    // ... extraction logic ...
  } catch (error) {
    throw new Error(`[EntityExtractionStage] ${error.message}`, {
      cause: error
    });
  }
}
```

---

## Testing Strategy

Each stage:

1. **Unit Tests** - Test stage logic in isolation
2. **Integration Tests** - Test stage composition
3. **Regression Tests** - Existing ladder tests

Example:
```typescript
// Unit test
describe('EntityExtractionStage', () => {
  it('should extract entities from parsed text', async () => {
    const input = createMockParseOutput();
    const output = await runEntityExtractionStage(input);
    expect(output.entities).toHaveLength(3);
  });
});

// Integration test
describe('Pipeline Integration', () => {
  it('should extract entities and relations', async () => {
    const result = await extractFromSegments(
      'test-doc',
      'Alice married Bob.',
      undefined,
      DEFAULT_LLM_CONFIG
    );
    expect(result.entities).toHaveLength(2);
    expect(result.relations).toHaveLength(2); // married_to + inverse
  });
});
```

---

## Migration Plan

1. **Phase 1 (Current)** - Design document (this file)
2. **Phase 2** - Create shared types (`app/engine/pipeline/types.ts`)
3. **Phase 3** - Implement stages (one at a time)
4. **Phase 4** - Refactor orchestrator to compose stages
5. **Phase 5** - Run tests, fix regressions
6. **Phase 6** - Remove old orchestrator code
7. **Phase 7** - Update documentation

---

## Benefits

1. **Easier Testing** - Test each stage independently
2. **Better Debugging** - Clear stage boundaries for logs
3. **Parallelization** - Run independent stages concurrently
4. **Flexibility** - Mix and match stages for different use cases
5. **Maintainability** - Easier to understand and modify

---

## Future Enhancements

1. **Parallelization** - Run independent stages concurrently
2. **Caching** - Cache stage outputs for repeated runs
3. **Metrics** - Track stage performance and quality
4. **Retries** - Retry failed stages with exponential backoff
5. **Streaming** - Stream results as stages complete

---

## References

- Current orchestrator: `app/engine/extract/orchestrator.ts`
- Entity extraction: `app/engine/extract/entities.ts`
- Relation extraction: `app/engine/extract/relations.ts`
- Coreference resolution: `app/engine/coref.ts`
- HERT system: `app/engine/hert/`
- Testing strategy: `INTEGRATED_TESTING_STRATEGY.md`

---

**End of Document**
