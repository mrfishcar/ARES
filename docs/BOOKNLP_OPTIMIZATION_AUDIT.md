# BookNLP Integration Optimization Audit

**Date**: 2025-12-20
**Auditor**: Claude (Opus 4.5)
**Status**: Audit Complete, Fixes In Progress

---

## Executive Summary

ARES has a solid BookNLP integration foundation, but **significant data is being dropped** between what BookNLP provides and what ARES consumes. This audit identifies 10 gaps, prioritizes them, and provides an implementation roadmap.

**Key Finding**: BookNLP provides rich data (characters, mentions for ALL entity types, quotes, coreference, tokens with POS/NER), but ARES currently only extracts PERSON entities from character clusters, dropping locations, organizations, and other entities entirely.

---

## User's Vision (Reference)

> *ARES ingests raw narrative text and runs deterministic linguistic analyzers (spaCy and BookNLP) to produce token-aligned evidence artifacts (tokens, spans, mentions, quotes, and coreference clusters). BookNLP character clusters establish stable identity anchors (global_booknlp_* IDs) that serve as the canonical PERSON layer. All subsequent extraction stages attach evidence to these identities rather than creating parallel entities. The pipeline then branches into a core extraction route (high-confidence narrative facts such as characters, quotes, and primary relations) and an enrichment route (secondary entity types and relations), both emitting evidence-backed facts into a unified identity-stable graph. A meaning layer resolves conflicts, applies user/editor overrides as first-class deltas, and derives canonical representations. Persisted outputs include the graph, evidence links (spans with offsets), and versioned wiki-style entity pages containing summaries, attributes, relations, and citation-grade mention sources, with reprocessing designed to preserve identity and overrides across runs.*

---

## What BookNLP Provides (Schema v1.0)

| Data Type | Fields | Count in Contract |
|-----------|--------|-------------------|
| **characters** | id, canonical_name, aliases, mention_count, gender, agent_score | Cluster-based |
| **mentions** | id, character_id, text, start/end_char, mention_type, **entity_type** (PER/LOC/ORG/FAC/GPE/VEH) | All mentions |
| **coref_chains** | chain_id, character_id, mentions[] | Per character |
| **quotes** | id, text, start/end_char, speaker_id, speaker_name, quote_type | Dialogue |
| **tokens** | idx, text, lemma, pos, ner, start/end_char, sentence_idx, paragraph_idx | Every token |

---

## Gap Analysis

### 🔴 CRITICAL GAPS (Data Loss)

#### Gap 1: Non-Character Entities Dropped
**Location**: `app/engine/booknlp/adapter.ts:83-84`
```typescript
.filter(m => m.character_id)  // Only include resolved mentions
```

**Impact**: BookNLP mentions include entity_type for LOC, ORG, FAC, GPE, VEH - ALL are dropped!

**Current Flow**:
```
BookNLP mentions (PER, LOC, ORG, FAC, GPE, VEH)
    ↓
Filter: character_id only
    ↓
Only PER entities survive ❌
```

**Fix**: Extract non-character mentions as separate entities by entity_type.

---

#### Gap 2: Tokens Array Completely Unused
**Location**: `app/engine/booknlp/adapter.ts` - no token consumption

**Impact**:
- paragraph_idx available but not used for document structure
- POS tags available but not used
- NER tags on every token available but not used
- Lemmas available for better matching but not used

**Current Flow**:
```
BookNLP tokens[] (full linguistic analysis)
    ↓
Ignored completely ❌
```

**Fix**: Use tokens for paragraph structure, sentence boundaries, and supplementary NER.

---

#### Gap 3: Hybrid Mode Is Stubbed
**Location**: `app/engine/extract/orchestrator.ts:410-413`
```typescript
if (extractionMode === 'hybrid') {
  console.log(`[HYBRID] TODO: Layer ARES refinements on top of BookNLP baseline`);
  // Future: Run pipeline meaning gate, add non-character entities, extract relations
}
```

**Impact**: No way to combine BookNLP's superior character clustering with ARES's relation extraction.

**Fix**: Implement hybrid mode per the BOOKNLP_REDUNDANCY_PLAN.md specification.

---

#### Gap 4: Graph Projection Not Called From Orchestrator
**Location**: `app/engine/booknlp/graph-projection.ts` exists but never called

**Impact**:
- `projectDialogueRelations()` - never called → no spoke_to relations
- `projectCoOccurrenceRelations()` - never called → no met relations
- No relations generated in BookNLP mode!

**Current Flow**:
```
BookNLP quotes[]
    ↓
Stored but not processed ❌
```

**Fix**: Call `projectToGraph()` from orchestrator in booknlp/hybrid mode.

---

#### Gap 5: No User Override System
**Location**: No infrastructure exists

**Impact**: User edits (corrections, merges, type changes) are lost on reprocessing.

**User Vision Requirement**:
> *"applies user/editor overrides as first-class deltas... reprocessing designed to preserve identity and overrides across runs"*

**Fix**: Design and implement override/delta layer.

---

### 🟠 HIGH PRIORITY GAPS

#### Gap 6: BookNLP gender/agent_score Not Extracted
**Location**: `scripts/booknlp_runner.py:257-258`
```python
"gender": None,  # TODO: extract from BookNLP if available
"agent_score": 0.0,  # TODO: calculate from syntax
```

**Impact**: Valuable character attributes not passed through.

**Fix**: Extract from BookNLP's character analysis (it does provide gender predictions).

---

#### Gap 7: Entity Profiles Not Enriched From BookNLP
**Location**: `app/engine/entity-profiler.ts` - standalone, not integrated with BookNLP

**Impact**: EntityProfile doesn't include:
- BookNLP's mention_count
- BookNLP's gender
- BookNLP's agent_score
- Quote attributions

**Fix**: Enrich profiles during BookNLP adaptation.

---

### 🟡 MEDIUM PRIORITY GAPS

#### Gap 8: Quote Data Not Surfaced in UI/Wiki
**Location**: `app/generate/wiki.ts`, `app/ui/console/`

**Impact**: Quote attributions stored but not displayed meaningfully.

**Fix**: Add quote section to wiki pages and entity views.

---

#### Gap 9: UI Shows Raw JSON Only
**Location**: `app/ui/console/src/pages/BookNLPPage.tsx`

**Impact**: No structured view of characters, mentions, quotes.

**Fix**: Create tabbed view with Characters, Quotes, Mentions panels.

---

#### Gap 10: Relations Empty in BookNLP Mode
**Location**: `app/engine/extract/orchestrator.ts:418`
```typescript
relations: [],  // TODO: Extract relations in hybrid mode
```

**Impact**: Even with hybrid mode, relation extraction not wired up.

**Fix**: Use ARES relation patterns on BookNLP entity set.

---

## Current Data Flow (As-Is)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ TEXT INPUT                                                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ BOOKNLP RUNNER (Python)                                                 │
│ ├─ Produces: characters, mentions, quotes, coref_chains, tokens         │
│ └─ All entity_types: PER, LOC, ORG, FAC, GPE, VEH                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ADAPTER (TypeScript) ⚠️ DATA LOSS HERE                                  │
│ ├─ adaptCharacters()   → PERSON entities only                           │
│ ├─ adaptMentions()     → FILTERS to character_id only! ❌               │
│ ├─ adaptQuotes()       → Stored but not used                            │
│ ├─ adaptCorefChains()  → Links stored but not used                      │
│ └─ tokens[]            → COMPLETELY IGNORED ❌                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ORCHESTRATOR                                                            │
│ ├─ Returns: entities (PERSON only), spans, relations: [] ❌             │
│ └─ graph-projection.ts NOT CALLED ❌                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STORAGE                                                                 │
│ ├─ entities: PERSON only                                                │
│ ├─ relations: empty                                                     │
│ ├─ booknlp: { quotes, characters, mentions } (raw, not integrated)      │
│ └─ profiles: not enriched from BookNLP                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Target Data Flow (To-Be)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ TEXT INPUT                                                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ BOOKNLP RUNNER (Python) ✅ Enhanced                                     │
│ ├─ Extract gender from BookNLP character analysis                       │
│ ├─ Calculate agent_score from syntax                                    │
│ └─ Full contract with all data types                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ADAPTER (TypeScript) ✅ Enhanced                                        │
│ ├─ adaptCharacters()   → PERSON entities with gender, agent_score       │
│ ├─ adaptNonCharacterEntities() → LOC, ORG, FAC, GPE, VEH ✅ NEW        │
│ ├─ adaptMentions()     → ALL mentions, linked by entity_id              │
│ ├─ adaptQuotes()       → Quotes with evidence links                     │
│ ├─ adaptCorefChains()  → Full coreference                               │
│ └─ adaptTokens()       → Paragraph/sentence structure ✅ NEW            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
┌─────────────────────────────┐         ┌─────────────────────────────────┐
│ CORE EXTRACTION ROUTE       │         │ ENRICHMENT ROUTE                │
│ ├─ Character entities       │         │ ├─ Non-character entities       │
│ ├─ Quote relations          │         │ ├─ ARES relation extraction     │
│ └─ Primary facts            │         │ └─ Secondary relations          │
└─────────────────────────────┘         └─────────────────────────────────┘
              │                                           │
              └─────────────────────┬─────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ GRAPH PROJECTION ✅                                                     │
│ ├─ projectEntities()            → All entity types                      │
│ ├─ projectDialogueRelations()   → spoke_to from quotes                  │
│ ├─ projectCoOccurrenceRelations() → met from proximity                  │
│ └─ projectARESRelations()       → family, work, location relations ✅   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ MEANING LAYER ✅ NEW                                                    │
│ ├─ Conflict detection/resolution                                        │
│ ├─ User override application (first-class deltas)                       │
│ └─ Canonical representation derivation                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STORAGE ✅ Enhanced                                                     │
│ ├─ entities: ALL types with stable IDs                                  │
│ ├─ relations: dialogue + co-occurrence + extracted                      │
│ ├─ overrides: user edits preserved across runs ✅ NEW                   │
│ ├─ profiles: enriched from BookNLP                                      │
│ └─ provenance: citation-grade evidence links                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ WIKI GENERATION ✅ Enhanced                                             │
│ ├─ Entity pages with quotes                                             │
│ ├─ Citation-grade mention sources                                       │
│ └─ Relationship graphs                                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Stop Data Loss (CRITICAL) - Estimated: 1-2 sessions

1. **Fix adapter.ts** - Extract non-character entities
   - Add `adaptNonCharacterEntities()` function
   - Map entity_type → ARES EntityType (LOC→PLACE, ORG→ORG, etc.)
   - Generate stable IDs: `booknlp_loc_{mention_id}`

2. **Fix orchestrator.ts** - Wire up graph projection
   - Import and call `projectToGraph()`
   - Generate dialogue and co-occurrence relations
   - Return non-empty relations array

3. **Fix adapter.ts** - Use token data
   - Extract paragraph structure from paragraph_idx
   - Extract sentence structure from sentence_idx
   - Pass through to storage

### Phase 2: Enrich Data (HIGH) - Estimated: 1 session

4. **Fix booknlp_runner.py** - Extract gender/agent_score
   - Parse BookNLP's gender predictions from .entities file
   - Calculate agent_score from subject frequency

5. **Enrich entity profiles** - Connect to BookNLP data
   - Add BookNLP attributes to EntityProfile
   - Include quote attributions in profile

### Phase 3: Hybrid Mode (HIGH) - Estimated: 1-2 sessions

6. **Implement hybrid mode** in orchestrator.ts
   - BookNLP for characters → stable PERSON layer
   - ARES pipeline for non-character entities
   - Merge entity sets with proper ID mapping
   - Run ARES relation extraction on merged set

### Phase 4: User Overrides (MEDIUM) - Estimated: 2-3 sessions

7. **Design override system**
   - Override types: merge, split, type_change, relation_add, relation_remove
   - Storage format: delta log with timestamps
   - Application: apply overrides after extraction, before storage

8. **Implement override layer**
   - Add override storage to KnowledgeGraph
   - Add apply_overrides() function
   - Preserve overrides across reprocessing

### Phase 5: UI Improvements (MEDIUM) - Estimated: 1-2 sessions

9. **Improve BookNLPPage.tsx**
   - Add tabs: Characters, Quotes, Mentions, Tokens
   - Show structured data instead of raw JSON
   - Add character cards with mention counts

10. **Add quote display to wiki**
    - Quote section on entity pages
    - Quote attribution in relationships

---

## Files to Modify

| File | Changes |
|------|---------|
| `app/engine/booknlp/adapter.ts` | Add adaptNonCharacterEntities(), fix filter, add token processing |
| `app/engine/extract/orchestrator.ts` | Wire graph projection, implement hybrid mode |
| `app/engine/booknlp/graph-projection.ts` | Enhance with ARES relation extraction |
| `scripts/booknlp_runner.py` | Extract gender, calculate agent_score |
| `app/engine/entity-profiler.ts` | Add BookNLP enrichment |
| `app/storage/storage.ts` | Add override storage |
| `app/ui/console/src/pages/BookNLPPage.tsx` | Structured data display |
| `app/generate/wiki.ts` | Add quote sections |

---

## Success Metrics

1. **Entity Coverage**: All BookNLP entity_types converted to ARES entities
2. **Relation Generation**: Non-empty relations from BookNLP mode
3. **Data Utilization**: All 5 BookNLP data types used (characters, mentions, quotes, coref, tokens)
4. **Profile Enrichment**: EntityProfile includes gender, agent_score, quote_count
5. **Override Preservation**: User edits survive reprocessing

---

## Next Steps

Begin with Phase 1 (Stop Data Loss) as these are critical blockers for the user's vision.
