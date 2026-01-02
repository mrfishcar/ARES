# Pipeline Consolidation Directive

**Version:** 1.0
**Date:** 2025-12-31
**Status:** ACTIVE DIRECTIVE

---

## Executive Summary

ARES will have **ONE canonical extraction pipeline**. BookNLP is a **reference implementation only**, not a runtime option. There are no "two pipelines" — there is one pipeline with optional modules.

---

## The Problem: Dual Pipeline Complexity

The codebase currently behaves like it has two pipelines because:

1. **Env flag switching** (`ARES_MODE=legacy` vs default) changes the extraction path
2. **Code paths branch**: `if BookNLP, else legacy` scattered throughout
3. **Tests accidentally exercise both**, leading to "works on my machine" failures
4. **Features built during BookNLP experiments** were partially mirrored to legacy, creating inconsistent behavior

This creates:
- Maintenance burden (two codepaths to fix)
- Test confusion (tests fail when BookNLP isn't installed)
- Integration points that are "optional" and therefore under-tested

---

## The Solution: One Pipeline + Optional Modules

### Target Architecture

```
Text → Parse → Mentions/Entities → Coref → Assertions → Events → Facts → Renderers
         │           │              │         │
         └───────────┴──────────────┴─────────┘
                     │
              Optional Modules:
              ├── Token Analysis
              ├── Pattern Learning
              ├── Quote Attribution
              ├── Supersense Tagging
              └── etc.
```

**Key principle:** Modules plug INTO the pipeline. They do not create parallel paths.

---

## Consolidation Actions

### 1. Pick One Orchestrator (DONE)

The **legacy spaCy pipeline** (`app/engine/pipeline/`) is the canonical runtime path.

### 2. BookNLP: Reference Only

| Action | Implementation |
|--------|----------------|
| Move to quarantine | `app/engine/booknlp/` → `app/engine/experimental/booknlp_reference/` |
| Make unreachable | Hard fail if called at runtime; label as reference-only |
| Keep as golden source | Check in sample outputs as static fixtures for regression tests |

### 3. Remove Pipeline-Switching Env Flags

| Remove | Replace With |
|--------|--------------|
| `ARES_MODE=legacy` / `ARES_MODE=booknlp` | Nothing — one pipeline only |
| Pipeline switching | Module flags: `ENABLE_TOKEN_ANALYSIS`, `ENABLE_PATTERN_LEARNING` |

### 4. Fix Tests

- **No conditional "if BookNLP installed"** — tests always run the canonical pipeline
- **No skipped tests** — if a test requires BookNLP features, use static fixtures
- **BookNLP parity tests** — become fixture-based, not runtime BookNLP calls

---

## Priority Hammer: Unified Reference Resolution

### The Problem

Coreference is **duplicated across components**:

| Component | Resolves |
|-----------|----------|
| `coref.ts` | Pronoun stack, title matching |
| `narrative-relations.ts` | Own pronoun resolution map |
| `relations.ts` | `lastNamedSubject` tracking |
| `coref-enhanced.ts` | Appositive/possessive detection |

When four subsystems each resolve "he" differently, you get **pronoun roulette**. This poisons:
- Relation extraction
- Quote attribution
- Event participant binding
- Summaries and wiki sentences

### The Solution: Single Reference Resolution Service

Create `ReferenceResolver` as the **ONLY** way anything resolves:
- Pronouns (he, she, they)
- Nominal mentions ("the boy", "the king")
- `lastNamedSubject`
- Quote speaker heuristics
- Appositives / possessives

**API:**
```typescript
interface ReferenceResolver {
  resolveMention(span: Span, context: Context): EntityId | null;
  getDiscourseCenter(paragraphId: string): EntityId | null;
  getActiveEntities(window: CharRange): RankedEntity[];
}
```

**Delete or neuter:**
- `lastNamedSubject` tracking in `relations.ts`
- Pronoun map in `narrative-relations.ts`
- Multiple coref helpers maintaining separate state

When this exists, extraction becomes a compiler with a symbol table.

---

## Renderers Are Pure Consumers

Renderers should:
- Pull from IR / facts / queries
- Never re-derive truth
- Never contain resolution logic

If renderer code is "re-deriving" entity references, that's a smell. The answer is to fix the IR, not to add logic to renderers.

---

## Implementation Order

| Phase | Action | Rationale | Status |
|-------|--------|-----------|--------|
| 1 | Create `ReferenceResolver` service | Multiplier — fixes all downstream | ✅ DONE |
| 2 | Migrate all coref calls to single service | Eliminate pronoun roulette | 🔄 In Progress |
| 3 | Quarantine BookNLP code | Remove dual-path confusion | ⏳ Pending |
| 4 | Remove env flags | One pipeline only | ⏳ Pending |
| 5 | Convert BookNLP tests to fixtures | No runtime dependency | ⏳ Pending |

### Phase 1 Implementation (COMPLETED 2025-12-31)

**Location:** `app/engine/reference-resolver.ts`

**Key Features:**
- Unified pronoun resolution API
- Position-aware resolution (not just text matching)
- Gender inference from names, titles, and context
- Cross-paragraph resolution with topic continuity
- Support for subject vs. possessive pronoun patterns

**Test Coverage:** 62 tests passing
- 32 unit tests (`tests/reference-resolver/reference-resolver.spec.ts`)
- 30 stress tests (`tests/reference-resolver/stress-tests.spec.ts`)

**Integration:**
- `narrative-relations.ts` now uses ReferenceResolver for pronoun resolution
- `coref.ts` patterns inform ReferenceResolver but don't replace it
- `relations.ts` still uses legacy `lastNamedSubject` (Phase 2 migration)

---

## Success Criteria

- [ ] No code paths that branch on "BookNLP vs legacy"
- [ ] No env flags that switch pipelines
- [x] Single `ReferenceResolver` service created (Phase 1)
- [x] ReferenceResolver integrated with narrative-relations.ts
- [ ] ReferenceResolver integrated with relations.ts (Phase 2)
- [x] Tests pass without BookNLP installed (using ARES_MODE=legacy)
- [ ] BookNLP code is clearly labeled "reference only"

---

## For AI Agents

When working on ARES:

1. **Do NOT say "dual pipeline complexity"** — instead, execute consolidation
2. **Do NOT add new coref logic** — use the `ReferenceResolver` service
3. **Do NOT branch on BookNLP** — there is only one pipeline
4. **When you see scattered pronoun resolution** — migrate it to the unified service

---

**Author:** Architecture Decision
**Approved:** 2025-12-31
