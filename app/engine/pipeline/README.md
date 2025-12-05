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
1. DocumentParseStage     → Parse text into tokens, sentences, dependencies ✅
    ↓
2. EntityExtractionStage  → Extract entity candidates (NER, patterns, LLM) ✅
    ↓
3. EntityFilteringStage   → Filter low-quality entities (Layer 1 defense) ✅
    ↓
4. EntityProfilingStage   → Build entity profiles for adaptive learning ✅
    ↓
5. CoreferenceStage       → Resolve pronouns → entities ✅
    ↓
6. DeicticResolutionStage → Resolve "there" → locations ✅
    ↓
7. RelationExtractionStage → Extract relation candidates ✅
    ↓
8. RelationFilteringStage → Filter false positives (Layer 2 defense) ✅
    ↓
9. InverseGenerationStage → Generate inverse relations ✅
    ↓
10. DeduplicationStage    → Merge duplicate relations (Layer 3 defense) ✅
    ↓
11. AliasResolutionStage  → Resolve aliases, assign EIDs/AIDs/SPs ✅
    ↓
12. KnowledgeGraphStage   → Final assembly and hygiene ✅
    ↓
13. HERTGenerationStage   → Generate HERT IDs (optional) ✅
    ↓
Knowledge Graph Output
```

✅ = **ALL 13 STAGES IMPLEMENTED** 🎉

## File Structure

```
pipeline/
├── README.md                        # This file
├── types.ts                         # Shared types for all stages ✅
├── index.ts                         # Stage exports ✅
├── orchestrator.ts                  # Pipeline composition layer ✅
│
├── parse-stage.ts                   # Stage 1 ✅
├── entity-extraction-stage.ts       # Stage 2 ✅
├── entity-filtering-stage.ts        # Stage 3 ✅
├── entity-profiling-stage.ts        # Stage 4 ✅
├── coreference-stage.ts             # Stage 5 ✅
├── deictic-resolution-stage.ts      # Stage 6 ✅
├── relation-extraction-stage.ts     # Stage 7 ✅
├── relation-filtering-stage.ts      # Stage 8 ✅
├── inverse-generation-stage.ts      # Stage 9 ✅
├── deduplication-stage.ts           # Stage 10 ✅
├── alias-resolution-stage.ts        # Stage 11 ✅
├── knowledge-graph-stage.ts         # Stage 12 ✅
└── hert-generation-stage.ts         # Stage 13 ✅
```

**Total:** 14 files, ~4,500 lines of modular, testable code

## Usage

### Full Pipeline (Recommended)

```typescript
import { extractFromSegments } from './pipeline/orchestrator';

const result = await extractFromSegments(
  'doc-123',
  'Aragorn married Arwen. They ruled Gondor together.',
  undefined,           // existingProfiles
  undefined,           // llmConfig (uses DEFAULT_LLM_CONFIG)
  undefined,           // patternLibrary
  { generateHERTs: true, autoSaveHERTs: false }
);

console.log(result.entities);   // [{ canonical: 'Aragorn', ... }, ...]
console.log(result.relations);  // [{ pred: 'married_to', ... }, ...]
console.log(result.herts);      // ['HERTv1:...', ...]
```

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

### Manual Composition

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

### Phase 3: Implement Complex Stages ✅ COMPLETE

- [x] Stage 1: Document Parse
- [x] Stage 2: Entity Extraction
- [x] Stage 3: Entity Filtering
- [x] Stage 5: Coreference
- [x] Stage 7: Relation Extraction
- [x] Stage 8: Relation Filtering
- [x] Stage 11: Alias Resolution
- [x] Stage 12: Knowledge Graph

### Phase 4: Orchestrator Refactor ✅ COMPLETE

- [x] Create new pipeline orchestrator
- [x] Wire stages together
- [x] Add logging and error handling
- [x] Ready for testing with existing ladder tests

### Phase 5: Testing & Integration 📋 NEXT

- [ ] Run ladder tests (Level 1-5)
- [ ] Verify behavior matches original orchestrator
- [ ] Update imports in existing code
- [ ] Optional: Remove old orchestrator (keep as reference)
- [ ] Update main documentation

## Next Steps

**🎉 All stages implemented! Ready for testing.**

1. **Test the new pipeline** - Validate behavior matches original:
   ```bash
   make parser  # Terminal 1
   npm test tests/ladder/level-1-simple.spec.ts  # Terminal 2
   npm test tests/ladder/level-2-multisentence.spec.ts
   npm test tests/ladder/level-3-complex.spec.ts
   ```

2. **Integration (Optional)** - Update existing code to use new pipeline:
   ```typescript
   // Old import
   import { extractFromSegments } from '../engine/extract/orchestrator';

   // New import
   import { extractFromSegments } from '../engine/pipeline/orchestrator';
   ```

3. **Iterate** - Refine based on test results and performance metrics

## Documentation

- **Architecture**: `/docs/architecture/PIPELINE_ARCHITECTURE.md`
- **Types**: `./types.ts`
- **Existing Orchestrator**: `../extract/orchestrator.ts` (to be refactored)

## Questions?

See `/docs/architecture/PIPELINE_ARCHITECTURE.md` for detailed stage specifications, data flow diagrams, and migration plan.
