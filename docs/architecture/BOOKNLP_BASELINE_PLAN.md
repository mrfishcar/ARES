# BookNLP as Baseline Minimum: Implementation Plan

**Version:** 1.0
**Date:** 2025-12-27
**Status:** Implementation Plan
**Branch:** `claude/optimize-booknlp-integration-zGkPa`

---

## Executive Summary

This document outlines the plan to implement BookNLP as the **baseline minimum extraction layer** for ARES. The goal is to use BookNLP's character clustering as the canonical identity foundation, with all other extraction components (spaCy NER, dependency parsing, pattern matching) building on top of this stable base.

### Vision

```
                    ┌─────────────────────────────────────────────────┐
                    │           USER OVERRIDE LAYER                    │
                    │  Manual corrections, merges, type changes        │
                    └─────────────────────────────────────────────────┘
                                          │
                                          ▼
                    ┌─────────────────────────────────────────────────┐
                    │           MEANING LAYER                          │
                    │  Conflict resolution, confidence weighting,      │
                    │  pattern learning, tier assignment               │
                    └─────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌───────────────────────────────────────────────────────────────────┐
    │                    EXTRACTION LAYER                               │
    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
    │  │ Relation │  │ Narrative│  │  spaCy   │  │ Pattern Library  │  │
    │  │ Patterns │  │ Patterns │  │   NER    │  │ (Learned Rules)  │  │
    │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │
    └───────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
    ┌───────────────────────────────────────────────────────────────────┐
    │                    BOOKNLP BASELINE LAYER                         │
    │                                                                   │
    │  ┌──────────────────────────────────────────────────────────────┐│
    │  │ Character Clusters (PERSON)      │ global_booknlp_* IDs      ││
    │  │ - Coreference chains             │ Stable identity anchors   ││
    │  │ - Gender, agent scores           │                           ││
    │  │ - Quote attribution              │                           ││
    │  └──────────────────────────────────────────────────────────────┘│
    │  ┌──────────────────────────────────────────────────────────────┐│
    │  │ Non-Character NER (LOC, ORG, FAC, GPE, VEH)                  ││
    │  │ - booknlp_loc_*, booknlp_org_* IDs                           ││
    │  └──────────────────────────────────────────────────────────────┘│
    │  ┌──────────────────────────────────────────────────────────────┐│
    │  │ Tokens, Sentences, Paragraphs                                ││
    │  │ - Token-aligned spans                                        ││
    │  │ - Sentence boundaries for relation extraction                ││
    │  └──────────────────────────────────────────────────────────────┘│
    └───────────────────────────────────────────────────────────────────┘
```

---

## Current State Analysis

### Existing BookNLP Integration (Completed)

| Component | File | Status |
|-----------|------|--------|
| Types | `app/engine/booknlp/types.ts` | ✅ Complete |
| Adapter | `app/engine/booknlp/adapter.ts` | ✅ Complete (extracts LOC, ORG, etc.) |
| Runner | `app/engine/booknlp/runner.ts` | ✅ Complete (subprocess + HTTP) |
| Graph Projection | `app/engine/booknlp/graph-projection.ts` | ✅ Complete |
| Enhanced Extraction | `app/engine/booknlp/enhanced-extraction.ts` | ✅ Complete (Phase 5) |
| Identity Helpers | `app/engine/booknlp/identity.ts` | ✅ Complete |

### Existing Pipeline Stages

The 13-stage pipeline in `app/engine/pipeline/` currently:
1. Uses spaCy for parsing and NER (Stage 1-2)
2. Has no BookNLP integration point
3. Entities are extracted fresh each run
4. No persistence of BookNLP identity anchors

### Gap Analysis

| Requirement | Current State | Target State |
|-------------|---------------|--------------|
| Stable PERSON IDs | Generated fresh each run | `global_booknlp_*` IDs persist |
| BookNLP in pipeline | Standalone (not integrated) | Stage 0 - runs before spaCy |
| Non-char entities | spaCy NER only | BookNLP NER + spaCy fallback |
| Coreference | Basic recency-based | BookNLP chains + spaCy enhancement |
| Quote attribution | Not used | BookNLP speaker IDs for relations |
| Relation anchoring | Arbitrary entity IDs | Anchored to BookNLP IDs |

---

## Implementation Plan

### Phase 1: BookNLP as Pipeline Stage 0 (Foundation)

**Goal:** Insert BookNLP as the first stage, providing baseline entities before any other extraction.

#### 1.1 Create BookNLP Stage

```typescript
// app/engine/pipeline/booknlp-stage.ts

export interface BookNLPStageInput {
  docId: string;
  fullText: string;
  config: BookNLPStageConfig;
}

export interface BookNLPStageOutput {
  // Baseline entities from BookNLP
  baselineEntities: Entity[];           // Characters + LOC/ORG/FAC
  baselineSpans: Span[];                // All mention spans

  // BookNLP-specific data for downstream stages
  characterProfiles: CharacterProfile[];
  quoteRelations: QuoteRelation[];
  corefChains: BookNLPCorefChain[];
  tokens: BookNLPToken[];

  // Identity mapping for downstream merging
  booknlpIdMap: Map<string, string>;    // booknlp_id -> global_booknlp_* ID

  // Skip BookNLP if unavailable
  booknlpAvailable: boolean;
}

export async function runBookNLPStage(
  input: BookNLPStageInput
): Promise<BookNLPStageOutput>;
```

#### 1.2 Integrate into Orchestrator

```typescript
// app/engine/pipeline/orchestrator.ts (modified)

export async function extractFromSegments(...) {
  // ========================================================================
  // STAGE 0: BOOKNLP BASELINE (NEW - runs before parse)
  // ========================================================================

  const booknlpOutput = await runBookNLPStage({
    docId,
    fullText,
    config: { enabled: true, model: 'small', minMentionCount: 2 }
  });

  // If BookNLP succeeded, pass its entities to downstream stages
  const baselineEntities = booknlpOutput.booknlpAvailable
    ? booknlpOutput.baselineEntities
    : [];

  // Stage 1: Parse (now receives BookNLP tokens for alignment)
  const parseOutput = await runDocumentParseStage({
    docId,
    fullText,
    config,
    booknlpTokens: booknlpOutput.tokens  // NEW: for token alignment
  });

  // Stage 2: Entity Extraction (now merges with baseline)
  const entityOutput = await runEntityExtractionStage({
    ...parseOutput,
    baselineEntities,                     // NEW: BookNLP baseline
    booknlpIdMap: booknlpOutput.booknlpIdMap,
    llmConfig,
    patternLibrary
  });

  // ... rest of pipeline
}
```

**Tasks:**
- [ ] Create `app/engine/pipeline/booknlp-stage.ts`
- [ ] Modify orchestrator to call BookNLP stage first
- [ ] Add graceful fallback when BookNLP unavailable
- [ ] Add caching for BookNLP results (via runner.ts)

---

### Phase 2: Entity Merging Strategy (Identity Stability)

**Goal:** Ensure spaCy-extracted entities merge correctly with BookNLP baseline.

#### 2.1 Merge Rules

```typescript
// app/engine/pipeline/entity-merging.ts

export interface MergeDecision {
  action: 'keep_booknlp' | 'keep_spacy' | 'merge' | 'create_new';
  reason: string;
  confidence: number;
}

export function shouldMergeEntity(
  booknlpEntity: Entity | null,
  spacyEntity: Entity,
  context: MergeContext
): MergeDecision {
  // Rule 1: Exact canonical match → keep BookNLP ID
  if (booknlpEntity && normalizedMatch(booknlpEntity.canonical, spacyEntity.canonical)) {
    return { action: 'keep_booknlp', reason: 'canonical_match', confidence: 0.95 };
  }

  // Rule 2: Alias match → merge with BookNLP
  if (booknlpEntity && aliasMatch(booknlpEntity.aliases, spacyEntity.canonical)) {
    return { action: 'merge', reason: 'alias_match', confidence: 0.85 };
  }

  // Rule 3: PERSON from spaCy not in BookNLP → suspicious (BookNLP missed it?)
  if (spacyEntity.type === 'PERSON' && !booknlpEntity) {
    return { action: 'create_new', reason: 'spacy_only_person', confidence: 0.6 };
  }

  // Rule 4: Non-PERSON from spaCy → use booknlp_* ID if available
  if (!isPerson(spacyEntity) && booknlpEntity) {
    return { action: 'keep_booknlp', reason: 'nonchar_booknlp_match', confidence: 0.8 };
  }

  // Default: create new entity with fresh ID
  return { action: 'create_new', reason: 'no_match', confidence: 0.7 };
}
```

#### 2.2 ID Stability Rules

| Entity Source | ID Format | Stability |
|---------------|-----------|-----------|
| BookNLP Character | `global_booknlp_{cluster}` | Stable across runs |
| BookNLP Non-Char | `booknlp_{type}_{text}` | Stable (text-derived) |
| spaCy-only PERSON | `spacy_person_{hash}` | Semi-stable (hash-based) |
| spaCy Non-PERSON | `ares_{type}_{hash}` | Semi-stable |

**Tasks:**
- [ ] Create `app/engine/pipeline/entity-merging.ts`
- [ ] Implement merge decision logic
- [ ] Modify entity-extraction-stage to use merge rules
- [ ] Add unit tests for merge scenarios

---

### Phase 3: Coreference Chain Integration

**Goal:** Use BookNLP coreference chains as primary, with spaCy enhancement for gaps.

#### 3.1 Coreference Strategy

```typescript
// app/engine/pipeline/coreference-stage.ts (enhanced)

export async function runCoreferenceStage(
  input: CoreferenceInput & {
    booknlpCorefChains?: BookNLPCorefChain[];
  }
): Promise<CoreferenceOutput> {
  const corefLinks: CorefLink[] = [];

  // Step 1: Import BookNLP coreference chains (high confidence)
  if (input.booknlpCorefChains) {
    for (const chain of input.booknlpCorefChains) {
      for (const mentionId of chain.mentions) {
        corefLinks.push({
          entity_id: chain.character_id,
          mention: getMentionById(mentionId),
          method: 'booknlp_coref',
          confidence: 0.95
        });
      }
    }
  }

  // Step 2: spaCy-based pronoun resolution for gaps
  const spacyLinks = resolvePronounsWithSpacy(input);

  // Step 3: Merge, preferring BookNLP
  return mergeCorefLinks(corefLinks, spacyLinks);
}
```

**Tasks:**
- [ ] Modify coreference-stage to accept BookNLP chains
- [ ] Implement chain merging logic
- [ ] Add confidence weighting (BookNLP > spaCy)
- [ ] Test with complex coreference scenarios

---

### Phase 4: Quote-Based Relation Integration

**Goal:** Use BookNLP quote attribution for dialogue relations.

#### 4.1 Quote Relations in Pipeline

```typescript
// app/engine/pipeline/relation-extraction-stage.ts (enhanced)

export async function runRelationExtractionStage(
  input: RelationExtractionInput & {
    quoteRelations?: QuoteRelation[];
  }
): Promise<RelationExtractionOutput> {
  const relations: Relation[] = [];

  // Step 1: Import quote-based relations (spoke_to, asked, replied)
  if (input.quoteRelations) {
    for (const qr of input.quoteRelations) {
      if (qr.addresseeId) {  // Only create relation if addressee known
        relations.push({
          id: uuid(),
          subj: qr.speakerId,
          pred: qr.predicate,
          obj: qr.addresseeId,
          confidence: qr.confidence,
          evidence: [{ doc_id: input.docId, span: { text: qr.quoteText } }],
          extractor: 'booknlp-dialogue'
        });
      }
    }
  }

  // Step 2: Dependency-based extraction
  const depRelations = extractFromDependencies(input);

  // Step 3: Narrative pattern extraction
  const narrativeRelations = extractFromNarrativePatterns(input);

  // Step 4: Merge all sources
  return {
    relations: [...relations, ...depRelations, ...narrativeRelations]
  };
}
```

**Tasks:**
- [ ] Modify relation-extraction-stage to accept quote relations
- [ ] Add confidence calibration for different sources
- [ ] Test dialogue-heavy fiction texts

---

### Phase 5: User Override Persistence

**Goal:** Ensure user corrections survive document reprocessing.

#### 5.1 Override Application

```typescript
// app/engine/override-manager.ts (enhanced)

export async function applyOverridesAfterReprocessing(
  freshEntities: Entity[],
  freshRelations: Relation[],
  storedOverrides: Override[]
): Promise<{ entities: Entity[]; relations: Relation[] }> {

  // Map fresh entities to stored overrides via stable BookNLP IDs
  for (const override of storedOverrides) {
    if (override.type === 'entity_type_change') {
      // Find entity by booknlp_id (stable) or canonical (fallback)
      const target = freshEntities.find(e =>
        e.attrs?.booknlp_id === override.targetBooknlpId ||
        e.canonical === override.targetCanonical
      );
      if (target) {
        target.type = override.newType;
        target.attrs = { ...target.attrs, overridden: true, overrideId: override.id };
      }
    }

    if (override.type === 'entity_merge') {
      // Merge entities, keeping the override's preferred canonical
      mergeEntities(freshEntities, override.sourceId, override.targetId, override.preferredCanonical);
    }

    // ... handle other override types
  }

  return { entities: freshEntities, relations: freshRelations };
}
```

#### 5.2 Override Storage Schema

```typescript
interface StoredOverride {
  id: string;
  documentId: string;
  createdAt: string;

  // Target identification (stable across reprocessing)
  targetBooknlpId?: string;        // Preferred: stable BookNLP ID
  targetCanonical?: string;        // Fallback: canonical text
  targetType?: EntityType;         // For disambiguation

  // Override data
  type: 'entity_type_change' | 'entity_merge' | 'entity_reject' | 'relation_add' | 'relation_remove';
  before: Record<string, any>;
  after: Record<string, any>;

  // Audit trail
  reason?: string;
  userId?: string;
}
```

**Tasks:**
- [ ] Enhance override-manager for stable ID matching
- [ ] Add override storage to SQLite schema
- [ ] Wire overrides into pipeline post-processing
- [ ] Test reprocessing with overrides

---

### Phase 6: Graceful Degradation

**Goal:** Pipeline works when BookNLP is unavailable, just with reduced quality.

#### 6.1 Fallback Strategy

```typescript
// app/engine/pipeline/booknlp-stage.ts

export async function runBookNLPStage(input: BookNLPStageInput): Promise<BookNLPStageOutput> {
  // Check if BookNLP is available
  const availability = await isBookNLPAvailable(input.config);

  if (!availability.available) {
    console.warn(`[BookNLP] Not available: ${availability.error}`);
    console.warn(`[BookNLP] Falling back to spaCy-only extraction`);

    return {
      baselineEntities: [],
      baselineSpans: [],
      characterProfiles: [],
      quoteRelations: [],
      corefChains: [],
      tokens: [],
      booknlpIdMap: new Map(),
      booknlpAvailable: false
    };
  }

  // BookNLP available - run full extraction
  // ...
}
```

#### 6.2 Quality Indicators

Add metadata to indicate extraction quality level:

```typescript
interface PipelineOutput {
  // ... existing fields ...

  qualityIndicators: {
    booknlpUsed: boolean;
    characterClusterCount: number;
    corefChainSource: 'booknlp' | 'spacy' | 'hybrid';
    quoteAttributionAvailable: boolean;
    estimatedPersonPrecision: number;  // Higher with BookNLP
  };
}
```

**Tasks:**
- [ ] Add availability check before BookNLP execution
- [ ] Implement graceful fallback
- [ ] Add quality indicators to output
- [ ] Log degradation warnings

---

## Implementation Order

### Sprint 1: Foundation (Week 1)
1. Create `booknlp-stage.ts` with full extraction
2. Integrate into orchestrator as Stage 0
3. Test with existing BookNLP fixtures
4. Verify baseline metrics don't regress

### Sprint 2: Entity Merging (Week 2)
1. Implement entity-merging.ts
2. Modify entity-extraction-stage for merge logic
3. Add comprehensive unit tests
4. Test ID stability across runs

### Sprint 3: Coreference & Quotes (Week 3)
1. Enhance coreference-stage with BookNLP chains
2. Add quote relations to relation-extraction-stage
3. Test dialogue-heavy texts
4. Measure relation recall improvement

### Sprint 4: Overrides & Polish (Week 4)
1. Enhance override-manager for stable IDs
2. Wire override persistence
3. Add graceful degradation
4. Full regression testing

---

## Success Metrics

| Metric | Current | Target | Rationale |
|--------|---------|--------|-----------|
| PERSON Precision | ~75% | ≥90% | BookNLP clustering reduces false positives |
| PERSON Recall | ~85% | ≥95% | BookNLP finds more character variants |
| Coreference Accuracy | ~60% | ≥85% | BookNLP chains are high quality |
| Dialogue Relations | 0 | ≥50 per novel | Quote attribution enables spoke_to |
| ID Stability | 0% | 100% | Same text → same entity IDs |
| Override Survival | N/A | 100% | Overrides persist across reprocessing |

---

## Files to Create/Modify

### New Files
- `app/engine/pipeline/booknlp-stage.ts` - BookNLP as Stage 0
- `app/engine/pipeline/entity-merging.ts` - Merge strategy

### Modified Files
- `app/engine/pipeline/orchestrator.ts` - Add Stage 0 call
- `app/engine/pipeline/entity-extraction-stage.ts` - Use baseline entities
- `app/engine/pipeline/coreference-stage.ts` - Accept BookNLP chains
- `app/engine/pipeline/relation-extraction-stage.ts` - Accept quote relations
- `app/engine/override-manager.ts` - Stable ID matching

### Test Files
- `tests/booknlp/stage-integration.spec.ts`
- `tests/booknlp/entity-merging.spec.ts`
- `tests/booknlp/id-stability.spec.ts`
- `tests/booknlp/override-survival.spec.ts`

---

## Dependencies

### Runtime
- BookNLP Python package (`booknlp`)
- Python 3.8+ with spaCy models
- Sufficient memory for BookNLP (~4GB for small model)

### Development
- Test fixtures with BookNLP contract JSON files
- Sample fiction texts for regression testing

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| BookNLP slow on long texts | UX degradation | Cache results, async processing |
| BookNLP misses characters | Lower recall | Fallback to spaCy for gaps |
| ID format changes | Break existing data | Version IDs, migration script |
| Complex merge conflicts | Data loss | Conservative merge, manual review queue |

---

## Next Steps

1. **Immediate**: Review this plan with the team
2. **Week 1**: Implement Sprint 1 (Foundation)
3. **Ongoing**: Track metrics against targets
4. **Future**: Consider BookNLP model fine-tuning for specific genres

---

**Document Status:** Ready for implementation
**Author:** Claude (AI Assistant)
**Approved By:** [Pending review]
