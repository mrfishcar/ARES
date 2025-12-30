# ARES Project Roadmap

**Version**: 1.0
**Date**: 2025-12-20
**Status**: Active Development

---

## Executive Summary

ARES (Advanced Relation Extraction System) aims to build stable, identity-preserving knowledge graphs from narrative text. This roadmap aligns implementation priorities with the core vision:

> *BookNLP character clusters establish stable identity anchors that serve as the canonical PERSON layer. All subsequent extraction stages attach evidence to these identities rather than creating parallel entities. The pipeline branches into core extraction and enrichment routes, with a meaning layer that resolves conflicts and applies user/editor overrides as first-class deltas.*

---

## Current State Assessment

### What Works Well

| Component | Status | Quality |
|-----------|--------|---------|
| BookNLP Integration | ✅ Optimized | Extracts ALL entity types (PER, LOC, ORG, FAC, GPE, VEH) |
| Graph Projection | ✅ Wired | Generates dialogue + co-occurrence relations |
| Entity Quality Filter | ✅ Robust | Multi-tier (A/B/C) with sophisticated filtering |
| Merge System | ✅ Strong | Jaro-Winkler with surname protection |
| Conflict Detection | ✅ Working | Detects single-valued, cycle conflicts |
| UI Console | ✅ Building | Entity review sidebar, filters, navigation |

### Critical Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| No user override system | User corrections lost on reprocessing | **P0** |
| Redundant entity filters | Inconsistent quality thresholds | **P1** |
| TIER_C isolation too strict | Valid entities rejected | **P1** |
| No feedback validation | Merged entities skip quality checks | **P2** |
| No learning system | Manual patterns not extracted | **P2** |

---

## Architecture Vision

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TEXT INPUT                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: LINGUISTIC ANALYSIS                                                │
│ ├─ BookNLP: characters, quotes, coreference                                │
│ └─ spaCy: tokens, NER, dependencies                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────────┐
│ PHASE 2a: CORE EXTRACTION       │   │ PHASE 2b: ENRICHMENT                │
│ ├─ PERSON entities (BookNLP)    │   │ ├─ LOC/ORG/FAC entities             │
│ ├─ Quote attributions           │   │ ├─ ARES relation patterns           │
│ └─ Primary identity anchors     │   │ └─ Secondary entity types           │
└─────────────────────────────────┘   └─────────────────────────────────────┘
              │                                           │
              └─────────────────────┬─────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: QUALITY GATES                                                      │
│ ├─ Unified Entity Quality Filter (consolidate 2 systems)                   │
│ ├─ Tier Assignment (A/B/C with evidence scoring)                           │
│ ├─ Merge with Feedback Validation                                          │
│ └─ Relation Deduplication                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: MEANING LAYER (NEW)                                                │
│ ├─ Conflict Detection & Resolution                                         │
│ ├─ User Override Application (first-class deltas)                          │
│ ├─ Pattern Learning from Corrections                                       │
│ └─ Canonical Representation Derivation                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: PERSISTENCE & OUTPUT                                               │
│ ├─ Knowledge Graph with Version History                                    │
│ ├─ Override Delta Storage                                                  │
│ ├─ Entity Profiles with Learning Data                                      │
│ └─ Wiki Generation with Citations                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation Stabilization (Week 1)

**Goal**: Eliminate redundancy, consolidate quality systems

#### 1.1 Consolidate Entity Quality Filters
**Files**: `entity-quality-filter.ts`, `entity-filter.ts`

Current state: Two overlapping filter systems with different thresholds.

**Actions**:
- [x] Audit all imports of both files across codebase
- [x] Choose `entity-quality-filter.ts` as primary (more sophisticated)
- [x] Migrate unique logic from `entity-filter.ts` to primary
- [x] Update all imports to use consolidated system
- [x] Deprecate `entity-filter.ts`

**Success Metric**: Single source of truth for entity quality decisions. ✅

#### 1.2 Reconcile Confidence Scoring
**Files**: `entity-quality-filter.ts`, `entity-tier-assignment.ts`

Current state: Different scoring systems (0.55/0.75 confidence vs 0/2/3 namehood).

**Actions**:
- [x] Map namehood scores to confidence values
- [x] Create unified `EntityQualityScore` interface
- [x] Ensure TIER assignment aligns with filter thresholds
- [x] Add validation: no entity passes tier but fails filter

#### 1.3 Add Merge Feedback Validation
**File**: `merge.ts`

Current state: Merged entities not re-validated.

**Actions**:
- [x] After merge, run quality filter on result
- [x] If merged entity fails, log warning and flag for review
- [x] Preserve individual entity tiers, compute merged tier

---

### Phase 2: User Override System (Week 2-3)

**Goal**: Implement first-class user corrections that survive reprocessing

#### 2.1 Data Model Extension
**Files**: `schema.ts`, `storage.ts`

**New Types**:
```typescript
interface Correction {
  id: string;
  type: 'entity_type' | 'entity_merge' | 'entity_split' | 'relation_edit' | 'alias_add';
  timestamp: Date;
  entityId?: string;
  before: any;
  after: any;
  reason?: string;
  learned: boolean;  // Did we extract a pattern from this?
}

interface KnowledgeGraph {
  // ... existing fields
  corrections: Correction[];
  versions: VersionSnapshot[];
}
```

**Actions**:
- [x] Add `corrections` array to KnowledgeGraph
- [x] Add `manualOverride` flag to Entity interface
- [x] Add `manualOverride` flag to Relation interface
- [x] Implement version snapshot on each correction

#### 2.2 GraphQL Mutations
**File**: `app/api/schema.graphql`, `app/api/resolvers/corrections.ts`

**New Mutations**:
```graphql
type Mutation {
  correctEntityType(entityId: ID!, newType: EntityType!, reason: String): Entity!
  mergeEntities(entityIds: [ID!]!, canonicalName: String!, reason: String): Entity!
  splitEntity(entityId: ID!, splits: [EntitySplitInput!]!): [Entity!]!
  updateRelation(relationId: ID, subjectId: ID!, predicate: String!, objectId: ID!, reason: String): Relation!
  rollbackCorrection(correctionId: ID!, reason: String): VersionSnapshot!
}
```

**Actions**:
- [x] Define schema types
- [x] Implement resolvers with validation
- [x] Persist corrections to graph
- [x] Generate version snapshots

#### 2.3 Override Application Layer
**File**: `app/engine/override-manager.ts` (NEW) ✅ Created

**Core Logic**:
```typescript
export async function applyOverrides(
  extractedGraph: KnowledgeGraph,
  savedCorrections: Correction[]
): Promise<KnowledgeGraph> {
  // 1. Apply entity type corrections
  // 2. Apply entity merges/splits
  // 3. Apply relation edits
  // 4. Preserve override flags
  return correctedGraph;
}
```

**Actions**:
- [x] Create override manager module
- [x] Implement each correction type application
- [x] Call from orchestrator after extraction, before storage
- [x] Handle conflicts between extraction and corrections

#### 2.4 UI Integration
**Files**: `EntityReviewSidebar.tsx`, `EntityPage.tsx`

**Actions**:
- [ ] Add "Correct Type" dropdown with reason field
- [ ] Add "Merge With..." modal
- [ ] Add "Split Entity" modal
- [ ] Show correction history on entity page
- [ ] Add rollback button for recent corrections

---

### Phase 3: Entity Quality Improvements (Week 3-4)

**Goal**: Improve stability and reduce false positives/negatives

#### 3.1 Soften TIER_C Isolation
**File**: `alias-resolver.ts`

Current state: TIER_C entities never merge (line 280 returns null).

**Actions**:
- [x] Allow TIER_C → TIER_A merge if confidence > 0.85
- [x] Allow TIER_C → TIER_B merge if same document + type
- [x] Block TIER_C → TIER_C merges (preserve isolation for garbage)
- [x] Add test cases for tier merge behavior

#### 3.2 Context-Aware Quality Filtering
**Files**: `entity-quality-filter.ts`, `entity-tier-assignment.ts`

Current state: Dialogue/appositive context mentioned but not integrated.

**Actions**:
- [x] Pass dialogue context flag to quality filter
- [x] Boost confidence for entities in appositive context
- [x] Reduce sentence-initial penalty for dialogue speakers
- [x] Add context-aware test cases

#### 3.3 Unify Type-Specific Validators
**File**: `entity-type-validators.ts` (NEW) ✅ Created

Current state: PERSON validation scattered across 3+ files.

**Actions**:
- [x] Create single source for type validation rules
- [x] Move all type blocklists to one location
- [x] Centralize `isPersonLikeName`, `isPlaceLikeName`, etc.
- [x] Update imports across codebase

#### 3.4 Add Quality Provenance
**Files**: `entity-quality-filter.ts`, `schema.ts`

Current state: Quality decisions logged but not stored.

**Actions**:
- [x] Add `qualityDecision` field to Entity attrs
- [x] Store reason for tier assignment
- [x] Store which filter rules triggered
- [x] Enable post-hoc debugging of quality issues

---

### Phase 4: Learning System (Week 4-5)

**Goal**: Extract patterns from user corrections for automatic application

#### 4.1 Pattern Extraction
**File**: `app/engine/learning-engine.ts` (NEW) ✅ Created

**Pattern Types**:
```typescript
interface LearnedPattern {
  id: string;
  type: 'entity_type' | 'entity_name' | 'relation' | 'confidence';
  pattern: string;  // Regex or rule
  condition: { textPattern?: string; contextPattern?: string; entityType?: string };
  action: { setType?: string; setConfidence?: number; merge?: boolean };
  stats: { timesApplied: number; confidence: number };
  active: boolean;
}
```

**Actions**:
- [x] On correction, analyze context (surrounding text, entity type, NER label)
- [x] Extract generalizable patterns (e.g., "Kingdom of X" → PLACE)
- [x] Store patterns with confidence based on correction frequency
- [x] Implement pattern matching in extraction pipeline

#### 4.2 Pattern Application
**File**: `app/engine/pattern-applier.ts` (NEW) ✅ Created

**Actions**:
- [x] During extraction, check entities against learned patterns
- [x] Apply type corrections from high-confidence patterns
- [x] Boost/reduce confidence based on pattern matches
- [x] Track pattern application stats

#### 4.3 Learning Dashboard
**File**: `app/ui/console/src/pages/LearningPage.tsx` (NEW) ✅ Created

**Actions**:
- [x] Show all learned patterns with stats
- [x] Allow enable/disable individual patterns
- [x] Show pattern application log
- [x] Allow manual pattern creation

---

### Phase 5: Enhanced BookNLP Integration (Week 5-6)

**Goal**: Fully leverage BookNLP's capabilities

#### 5.1 Token-Based Structure
**Files**: `adapter.ts`, `types.ts`, `token-analyzer.ts` (NEW) ✅ Created

Current state: Tokens array unused.

**Actions**:
- [x] Extract paragraph structure from `paragraph_idx`
- [x] Extract sentence boundaries from `sentence_idx`
- [x] Use lemmas for better entity matching
- [x] Pass POS tags to quality filter for structural analysis

#### 5.2 Enhanced Entity Profiles
**File**: `entity-profiler.ts`

Current state: Profiles exist but not enriched from BookNLP.

**Actions**:
- [x] Add BookNLP mention_count to profiles
- [x] Add gender prediction from BookNLP
- [x] Add agent_score from BookNLP
- [x] Track quote attributions per entity

#### 5.3 Quote Integration
**Files**: `wiki.ts`, entity UI components

Current state: Quotes stored but not surfaced.

**Actions**:
- [x] Show quote attributions with confidence (via ARESEntity.quote_count/quote_ids)
- [x] Link quotes to evidence spans
- [ ] Add "Quotes" section to entity wiki pages (UI work pending)
- [ ] Add quote browser to entity page (UI work pending)

---

## Success Metrics

### Phase 1: Foundation ✅ COMPLETE
- [x] Single entity quality filter (1 file, not 2)
- [x] Zero entities that pass tier but fail filter
- [x] All merged entities re-validated

### Phase 2: Override System ✅ COMPLETE
- [x] User corrections survive reprocessing
- [x] Version history available for all entities
- [x] Rollback functionality working

### Phase 3: Quality ✅ COMPLETE
- [x] TIER_C entities can merge when appropriate
- [x] Context signals integrated into quality
- [x] Quality decisions traceable per entity

### Phase 4: Learning ✅ COMPLETE
- [x] Patterns extracted from corrections
- [x] Patterns automatically applied
- [x] Pattern effectiveness tracked

### Phase 5: BookNLP ✅ COMPLETE (core features)
- [x] All token data utilized
- [x] Entity profiles enriched
- [ ] Quotes surfaced in UI (pending wiki.ts updates)

---

## File Change Summary

### Modify
| File | Changes |
|------|---------|
| `app/engine/schema.ts` | Add Correction, manualOverride fields |
| `app/storage/storage.ts` | Add corrections, versions to KnowledgeGraph |
| `app/engine/entity-quality-filter.ts` | Consolidate, add context awareness |
| `app/engine/merge.ts` | Add feedback validation |
| `app/engine/alias-resolver.ts` | Soften TIER_C isolation |
| `app/engine/entity-profiler.ts` | Add BookNLP enrichment |
| `app/engine/booknlp/adapter.ts` | Use token data |
| `app/api/schema.graphql` | Add correction mutations |
| `app/generate/wiki.ts` | Add quote sections |

### Create
| File | Purpose |
|------|---------|
| `app/engine/override-manager.ts` | Apply corrections to extracted graphs |
| `app/engine/learning-engine.ts` | Extract patterns from corrections |
| `app/engine/pattern-applier.ts` | Apply learned patterns |
| `app/engine/entity-type-validators.ts` | Unified type validation |
| `app/api/resolvers/corrections.ts` | GraphQL correction resolvers |
| `app/ui/console/src/pages/LearningPage.tsx` | Pattern dashboard |

### Deprecate
| File | Reason |
|------|--------|
| `app/engine/entity-filter.ts` | Consolidated into entity-quality-filter.ts |

---

## Immediate Next Steps

1. **Fix build** ✅ (EntityReviewSidebar.tsx fixed)
2. **Create this roadmap** ✅
3. **Start Phase 1.1**: Audit entity filter usage across codebase
4. **Start Phase 2.1**: Add Correction type to schema

---

## Notes

- All phases can run in parallel where dependencies allow
- UI work can proceed alongside backend changes
- Tests should be added for each new component
- Document threshold values with comments explaining rationale

---

*Last Updated: 2025-12-20*
