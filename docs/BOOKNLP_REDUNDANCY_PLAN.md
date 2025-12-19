# BookNLP Integration: Redundancy Cleanup Plan

## Overview

With BookNLP as the baseline extraction engine, several ARES modules become redundant.
This document identifies which components to KEEP, REPLACE, or DEPRECATE.

## Module Status

### REPLACE (BookNLP provides this better)

| Module | File(s) | What BookNLP Replaces | Action |
|--------|---------|----------------------|--------|
| **Entity/Mention Nomination** | `app/engine/extract/pipeline.ts` (nomination) | BookNLP's entity tagger | Disable in booknlp/hybrid mode |
| **Character Clustering** | `app/engine/extract/mention-cluster.ts` | BookNLP's character clustering is superior | Skip in booknlp/hybrid mode |
| **Basic Coreference** | `app/engine/coref.ts` | BookNLP's coref (LitBank+PreCo trained) | Disable in booknlp/hybrid mode |
| **Pronoun Resolution** | `app/engine/pronoun-utils.ts` | BookNLP handles this | Use BookNLP's resolution |
| **Quote Attribution** | N/A (ARES didn't have this) | BookNLP provides this | New capability from BookNLP |

### KEEP (ARES adds value on top)

| Module | File(s) | Why Keep | Notes |
|--------|---------|----------|-------|
| **Meaning Gate** | `app/engine/extract/meaning-gate.ts` | Structural junk filtering | Run AFTER BookNLP for non-character entities |
| **Entity Type Refinement** | `app/engine/entity-filter.ts` | ARES has richer taxonomy | Apply to BookNLP entities |
| **Relation Extraction** | `app/engine/extract/relations.ts`, `narrative-relations.ts` | BookNLP doesn't extract relations | Layer on top of BookNLP entities |
| **Graph Projection** | `app/engine/global-graph.ts` | ARES-specific graph format | Build from BookNLP entities |
| **HERT System** | `app/engine/hert/` | Stable entity references | Generate HERTs from BookNLP IDs |
| **Entity Quality Filter** | `app/engine/entity-quality-filter.ts` | Precision defense | Apply to final output |
| **UI/Editor** | `app/ui/`, `app/editor/` | User-facing components | Wire to BookNLP entities |
| **Storage** | `app/storage/` | SQLite persistence | Store BookNLP results |
| **API** | `app/api/` | GraphQL interface | Serve BookNLP-derived data |

### DEPRECATE (Move to legacy/)

| Module | File(s) | Reason | Timeline |
|--------|---------|--------|----------|
| **spaCy-only NER** | `app/engine/extract/entities.ts` (NER sections) | BookNLP's NER is better | Keep for fallback |
| **JUNK_PERSON_SINGLETONS** | `app/engine/extract/orchestrator.ts` | BookNLP's clustering handles this | Remove after validation |
| **Alias Resolution (basic)** | `app/engine/alias-resolver.ts` | BookNLP's clustering replaces this | Keep for non-character entities |
| **Pattern-based entity detection** | `app/engine/narrative-relations.ts` (entity parts) | BookNLP handles characters | Keep for non-character patterns |

## Data Flow Comparison

### Before (Legacy Mode)
```
Text → spaCy NER → Alias Resolution → Coref → Entity Dedup → Output
                                     ↓
                              [Massive Blocklists]
```

### After (BookNLP Mode)
```
Text → BookNLP → Adapter → ARES Entities → Output
         ↓
    [Characters + Coref + Quotes]
```

### After (Hybrid Mode)
```
Text → BookNLP → Adapter → Character Entities ─┬→ Merged Entities → Output
                                               │
Text → Pipeline → Non-Character Entities ──────┘
                    ↓
             [Meaning Gate Filtering]
```

## Implementation Phases

### Phase 1: BookNLP Baseline (DONE)
- [x] BookNLP runner with clean JSON contract
- [x] TypeScript adapter
- [x] Orchestrator wiring for `booknlp` mode
- [x] Basic entity conversion

### Phase 2: Hybrid Mode
- [ ] Run Pipeline for non-character entities
- [ ] Merge BookNLP characters + Pipeline non-characters
- [ ] Apply Meaning Gate to non-BookNLP entities only
- [ ] Relation extraction on merged entity set

### Phase 3: Deprecation
- [ ] Move legacy NER to `app/engine/legacy/`
- [ ] Remove redundant blocklists from orchestrator
- [ ] Clean up unused alias resolution code
- [ ] Archive old coref implementation

### Phase 4: Enhancement
- [ ] Use BookNLP quotes for dialogue relations
- [ ] Build speaker-addressee graph
- [ ] Integrate BookNLP supersense tags
- [ ] Profile-based entity enrichment

## Configuration

```bash
# BookNLP-only mode (recommended for fiction)
ARES_MODE=booknlp npm run gold:barty:booknlp

# Hybrid mode (BookNLP + ARES for non-characters)
ARES_MODE=hybrid npm run gold:barty:hybrid

# Pipeline-only mode (no BookNLP, uses grammar-first pipeline)
ARES_PIPELINE=true npm run gold:barty:pipeline

# Legacy mode (original ARES, gradually deprecated)
npm run gold:barty
```

## Metrics to Track

1. **Character Precision**: % of BookNLP characters that are real characters
2. **Quote Attribution Accuracy**: % of quotes with correct speaker
3. **Junk Suppression**: % of junk candidates NOT becoming entities
4. **Coref Accuracy**: % of mention chains correctly linked

## Known Limitations

1. **BookNLP is slow**: ~10-30 seconds for a chapter
2. **BookNLP requires Python**: Subprocess overhead
3. **BookNLP model size**: ~500MB download
4. **Fiction-focused**: May not work as well on non-fiction

## Migration Guide

### For Downstream Code

**Before (Legacy)**:
```typescript
const result = await extractFromSegments(docId, text);
// result.entities may contain junk
```

**After (BookNLP)**:
```typescript
process.env.ARES_MODE = 'booknlp';
const result = await extractFromSegments(docId, text);
// result.entities are BookNLP character clusters
// result.booknlpStats has processing details
```

### For UI Code

No changes needed - the adapter converts BookNLP output to the same
`Entity[]` format the UI already expects. Entity IDs are stable
(generated from BookNLP cluster IDs).

## References

- [BookNLP GitHub](https://github.com/booknlp/booknlp)
- [BookNLP Paper](https://aclanthology.org/P14-1068/)
- [LitBank Corpus](https://github.com/dbamman/litbank)
