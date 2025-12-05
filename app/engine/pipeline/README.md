# ARES Pipeline Stages

This directory contains the modular, composable extraction pipeline for ARES.

## Overview

The pipeline breaks down the monolithic orchestrator into discrete stages with clear responsibilities, typed interfaces, and explicit data flow.

## Architecture

### Design Principles

1. **Separation of Concerns** - Each stage has one clear responsibility
2. **Typed Boundaries** - Explicit input/output types for type safety
3. **Stateless** - No hidden globals, all state passed explicitly
4. **Observability** - Logging at stage boundaries with timing
5. **Composability** - Stages can be mixed, matched, or parallelized

### Stage Flow

```
Raw Text Input
    ↓
1. DocumentParseStage     → Parse text into tokens, sentences, dependencies
    ↓
2. EntityExtractionStage  → Extract entity candidates (NER, patterns, LLM)
    ↓
3. EntityFilteringStage   → Filter low-quality entities (Layer 1 defense)
    ↓
4. EntityProfilingStage   → Build entity profiles for adaptive learning ✅
    ↓
5. CoreferenceStage       → Resolve pronouns → entities
    ↓
6. DeicticResolutionStage → Resolve "there" → locations ✅
    ↓
7. RelationExtractionStage → Extract relation candidates
    ↓
8. RelationFilteringStage → Filter false positives (Layer 2 defense)
    ↓
9. InverseGenerationStage → Generate inverse relations ✅
    ↓
10. DeduplicationStage    → Merge duplicate relations (Layer 3 defense) ✅
    ↓
11. AliasResolutionStage  → Resolve aliases, assign EIDs/AIDs/SPs
    ↓
12. KnowledgeGraphStage   → Final assembly and hygiene
    ↓
13. HERTGenerationStage   → Generate HERT IDs (optional) ✅
    ↓
Knowledge Graph Output
```

✅ = Implemented as separate module

## File Structure

```
pipeline/
├── README.md                        # This file
├── types.ts                         # Shared types for all stages ✅
├── index.ts                         # Stage exports ✅
│
├── entity-profiling-stage.ts        # Stage 4 ✅
├── deictic-resolution-stage.ts      # Stage 6 ✅
├── inverse-generation-stage.ts      # Stage 9 ✅
├── deduplication-stage.ts           # Stage 10 ✅
├── hert-generation-stage.ts         # Stage 13 ✅
│
└── TODO: Implement remaining stages
    ├── parse-stage.ts               # Stage 1
    ├── entity-extraction-stage.ts   # Stage 2
    ├── entity-filtering-stage.ts    # Stage 3
    ├── coreference-stage.ts         # Stage 5
    ├── relation-extraction-stage.ts # Stage 7
    ├── relation-filtering-stage.ts  # Stage 8
    ├── alias-resolution-stage.ts    # Stage 11
    └── knowledge-graph-stage.ts     # Stage 12
```

## Usage

### Individual Stage

```typescript
import { runDeicticResolutionStage } from './pipeline';

const output = await runDeicticResolutionStage({
  fullText: "Frodo studied at Rivendell. He lived there for many years.",
  entities: [...],
  spans: [...]
});

console.log(output.processedText);
// "Frodo studied at Rivendell. He lived in Rivendell for many years."
```

### Composed Pipeline

```typescript
import {
  runEntityProfilingStage,
  runDeicticResolutionStage,
  runInverseGenerationStage,
  runDeduplicationStage,
  runHERTGenerationStage
} from './pipeline';

// Stage 4: Entity Profiling
const profilingOutput = await runEntityProfilingStage({
  entities,
  spans,
  sentences,
  docId,
  existingProfiles
});

// Stage 6: Deictic Resolution
const deicticOutput = await runDeicticResolutionStage({
  fullText,
  entities,
  spans
});

// ... more stages ...

// Stage 9: Inverse Generation
const inverseOutput = await runInverseGenerationStage({
  relations
});

// Stage 10: Deduplication
const dedupedOutput = await runDeduplicationStage({
  relations: inverseOutput.relations,
  config: deduplicationConfig
});

// Stage 13: HERT Generation (optional)
if (options.generateHERTs) {
  const hertOutput = await runHERTGenerationStage({
    entities,
    spans,
    fullText,
    docId,
    options: hertOptions
  });
}
```

## Stage Implementation Pattern

Each stage follows this pattern:

```typescript
import type { XxxInput, XxxOutput } from './types';

const STAGE_NAME = 'XxxStage';

export async function runXxxStage(
  input: XxxInput
): Promise<XxxOutput> {
  const startTime = Date.now();
  console.log(`[${STAGE_NAME}] Starting with ${input.xxx.length} items`);

  try {
    // 1. Validate input
    if (!input.xxx) {
      throw new Error('Invalid input: xxx is required');
    }

    // 2. Execute stage logic
    const output = processXxx(input);

    // 3. Log completion
    const duration = Date.now() - startTime;
    console.log(
      `[${STAGE_NAME}] Complete in ${duration}ms: ${output.yyy.length} items`
    );

    return output;
  } catch (error) {
    // 4. Wrap errors with stage name
    const duration = Date.now() - startTime;
    console.error(`[${STAGE_NAME}] Failed after ${duration}ms:`, error);
    throw new Error(`[${STAGE_NAME}] ${(error as Error).message}`, {
      cause: error
    });
  }
}
```

## Benefits

### 1. Testability

Each stage can be tested in isolation:

```typescript
describe('DeicticResolutionStage', () => {
  it('should resolve "there" to most recent location', async () => {
    const input = {
      fullText: 'Alice went to Paris. She lived there.',
      entities: [createMockEntity('Paris', 'PLACE')],
      spans: [{ entity_id: 'paris-id', start: 14, end: 19 }]
    };

    const output = await runDeicticResolutionStage(input);

    expect(output.processedText).toContain('lived in Paris');
  });
});
```

### 2. Debugging

Clear stage boundaries make debugging easier:

```
[EntityProfilingStage] Starting with 10 entities
[EntityProfilingStage] Complete in 5ms: Built 10 entity profiles
[DeicticResolutionStage] Starting with 10 entities
[DeicticResolutionStage] Resolved "there" at position 45 to "Rivendell"
[DeicticResolutionStage] Complete in 2ms: Resolved 1 deictic references
[InverseGenerationStage] Starting with 8 relations
[InverseGenerationStage] Generated inverse: child_of(Bob, Alice)
[InverseGenerationStage] Complete in 1ms: 8 → 12 relations (+4 inverses)
```

### 3. Flexibility

Stages can be composed in different ways:

```typescript
// Standard pipeline
const result = await runFullPipeline(input);

// Skip HERT generation
const resultNoHERTs = await runPipelineWithoutHERTs(input);

// Debug mode: stop at specific stage
const partialResult = await runPipelineUntilStage(input, 'deictic');

// Parallel execution for independent stages
const [profilesOutput, deicticOutput] = await Promise.all([
  runEntityProfilingStage(profileInput),
  runDeicticResolutionStage(deicticInput)
]);
```

### 4. Maintainability

- Each stage is ~100-200 lines vs 1500+ line orchestrator
- Easy to locate and fix bugs
- Clear ownership of functionality
- Easier to onboard new developers

## Migration Strategy

### Phase 1: Design ✅ COMPLETE

- [x] Create architecture document
- [x] Define shared types
- [x] Document stage responsibilities

### Phase 2: Implement Simple Stages ✅ COMPLETE

- [x] Stage 4: Entity Profiling
- [x] Stage 6: Deictic Resolution
- [x] Stage 9: Inverse Generation
- [x] Stage 10: Deduplication
- [x] Stage 13: HERT Generation

### Phase 3: Implement Complex Stages 🚧 IN PROGRESS

- [ ] Stage 1: Document Parse
- [ ] Stage 2: Entity Extraction
- [ ] Stage 3: Entity Filtering
- [ ] Stage 5: Coreference
- [ ] Stage 7: Relation Extraction
- [ ] Stage 8: Relation Filtering
- [ ] Stage 11: Alias Resolution
- [ ] Stage 12: Knowledge Graph

### Phase 4: Orchestrator Refactor 📋 TODO

- [ ] Create new pipeline orchestrator
- [ ] Wire stages together
- [ ] Add logging and error handling
- [ ] Test with existing ladder tests

### Phase 5: Cleanup 📋 TODO

- [ ] Remove old orchestrator code
- [ ] Update documentation
- [ ] Verify all tests pass

## Next Steps

1. **Implement remaining stages** - Extract logic from orchestrator.ts into stage modules
2. **Create new orchestrator** - Compose stages in pipeline/orchestrator.ts
3. **Run tests** - Verify behavior unchanged with ladder tests
4. **Iterate** - Refine stages based on test results

## Documentation

- **Architecture**: `/docs/architecture/PIPELINE_ARCHITECTURE.md`
- **Types**: `./types.ts`
- **Existing Orchestrator**: `../extract/orchestrator.ts` (to be refactored)

## Questions?

See `/docs/architecture/PIPELINE_ARCHITECTURE.md` for detailed stage specifications, data flow diagrams, and migration plan.
