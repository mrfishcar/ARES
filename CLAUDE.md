# CLAUDE.md - ARES Story World Compiler

**Version**: 2.0
**Last Updated**: 2026-01-04
**Mission**: Build the most powerful deterministic story world compiler in existence.

---

## Quick Status (January 2026)

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Entity Precision | 95.8% | ≥90% | ✅ |
| Entity Recall | 94.2% | ≥85% | ✅ |
| Relation Precision | 95.0% | ≥90% | ✅ |
| Relation Recall | 95.0% | ≥85% | ✅ |
| Level 1 Tests | PASSING | - | ✅ |
| Level 2 Tests | PASSING | - | ✅ |
| Level 3 Relations | 55.7% | ≥80% | ⚠️ |
| Guardrail Tests | 35/35 | - | ✅ |

---

## Recent Work (This Session)

### ✅ Fixed: Andrew Beauregard Alias Leak

**Problem**: "Andrew Beauregard" was being split into two entities ("Andrew", "Beauregard"), then "Beauregard" incorrectly merged into "Barty Beauregard".

**Root Cause**: The `looksLikeSurname()` function was missing `'ard'` in its surname endings list. The "two-first-names" filter (for biblical texts like "Elimelech Naomi") incorrectly triggered because "Beauregard" didn't match any known surname pattern.

**Fix Applied** (`entity-quality-filter.ts:436`):
```typescript
'ard', 'gard',  // Beauregard, Bernard, Gerard, Blanchard, Richard, etc.
```

### ✅ Implemented: Evidence-Based Surname Detection

Enhanced `looksLikeTwoFirstNames()` with three-tier logic:

```
EVIDENCE 1: NER backing → trust it, don't split
EVIDENCE 2: Surname suffix/prefix → preserve as surname
EVIDENCE 3: Both words in COMMON_FIRST_NAMES → split (Mary Elizabeth)
EVIDENCE 4: First is common, second is ≥6 chars → surname (Andrew Beauregard)
EVIDENCE 5: Neither is known, no suffix → split (Elimelech Naomi)
```

**Added**: `COMMON_FIRST_NAMES` set with 100+ names for evidence-based detection.

### ✅ Added: Guardrail Tests

Created `tests/unit/surname-detection.spec.ts` with 35 test cases:
- 10 tests for -ard/-gard endings (Beauregard, Bernard, Gerard)
- 17 tests for common surname endings (Potter, Johnson, Einstein)
- 3 tests for biblical splits (Elimelech Naomi, Abraham Isaac, Jacob Esau)
- 4 edge cases (single-word, three-word, NER-backed)

**Commits**:
- `0aaa2018` - fix: Add 'ard' surname ending to prevent entity splitting
- `0f54fa2f` - feat: Evidence-based surname detection with guardrail tests

---

## What is ARES?

ARES (Advanced Relation Extraction System) is a **local-first, deterministic story world compiler** that extracts entities and relationships from narrative text with full provenance tracking.

**Core Philosophy**:
- **Deterministic**: Rule-based extraction with transparent, testable patterns (no black boxes)
- **Local-first**: No cloud dependencies, runs entirely offline
- **Provenance-first**: Every fact includes source text evidence
- **Progressive quality**: 5-stage testing ladder from simple to production

**Key Capabilities**:
- Multi-pass extraction: Dependency parsing + pattern matching + NER + coreference
- HERT System: Stable, compact entity references with precise locations
- Alias resolution: Maps name variations to single entities
- Cross-document identity: Maintains entity identity across documents

---

## Architecture (Compressed)

```
Raw Text → spaCy Parser (port 8000) → Entity Extraction → Relation Extraction → Knowledge Graph
```

### Pipeline Stages
1. **DocumentParseStage** - Tokenization, POS tagging, dependency parsing
2. **EntityExtractionStage** - Pattern-based + NER extraction
3. **EntityFilteringStage** - Quality filter, surname detection, junk removal
4. **EntityProfilingStage** - Build entity profiles
5. **CoreferenceStage** - Pronoun resolution via ReferenceResolver
6. **RelationExtractionStage** - Dependency + narrative patterns
7. **AliasResolutionStage** - Merge name variants
8. **KnowledgeGraphStage** - Final assembly

### Key Files
| File | Purpose |
|------|---------|
| `app/engine/entity-quality-filter.ts` | Surname detection, two-first-names filter |
| `app/engine/reference-resolver.ts` | Unified pronoun resolution (930+ lines) |
| `app/engine/narrative-relations.ts` | Narrative pattern extraction |
| `app/engine/pipeline/orchestrator.ts` | Pipeline coordination |
| `tests/unit/surname-detection.spec.ts` | Surname guardrail tests |

---

## Quick Start

```bash
# 1. Start parser (Terminal 1)
make parser
# Wait for: "Application startup complete"

# 2. Run tests (Terminal 2)
npm test tests/ladder/level-1-simple.spec.ts  # Should pass ≥90% P, ≥85% R

# 3. Check health
curl -s http://127.0.0.1:8000/health  # {"status": "ok"}
```

---

## Key Bugs Fixed (Reference)

### Andrew Beauregard Bug (January 2026)
- **Symptom**: Names like "Andrew Beauregard" split into separate entities
- **Root Cause**: Missing 'ard' suffix in `looksLikeSurname()`
- **Fix**: Added 'ard', 'gard' to surname endings + evidence-based detection
- **Test**: `tests/unit/surname-detection.spec.ts`

### Sentence-Initial Entity Bug (December 2025)
- **Symptom**: Names at sentence start rejected (e.g., "Saul appeared")
- **Root Cause**: Missing 'appeared' in COMMON_VERBS whitelist
- **Fix**: Added to `shared-vocabulary.ts`

### Markdown Header Bug (December 2025)
- **Symptom**: `##` headers blocking entity extraction
- **Root Cause**: Treated as incomplete entity tags
- **Fix**: Skip markdown header sequences at line start

---

## Active Directives

### Pipeline Consolidation (ACTIVE)
- **ONE pipeline only** — spaCy-based pipeline is canonical
- **Unified ReferenceResolver** — all pronoun resolution through one service
- **No env flags for pipeline switching** — `ARES_MODE` is legacy only

### Evidence-Based Detection (NEW)
- Surname detection uses suffix patterns + known first names + NER backing
- Don't rely solely on suffix matching (prevents whack-a-mole)
- Length heuristic: unknown words ≥6 chars after first name → likely surname

---

## Current Issues

### Level 3 Relation Precision: 55.7% (Target: ≥80%)
- Missing patterns for complex relations
- Need appositive patterns ("X, the son of Y")
- Need dialogue attribution patterns
- **Next**: Focus on closing this precision gap

### Known Limitations
- Hyphenated surnames get split (e.g., "Mary Smith-Jones")
- Biblical names with unusual spellings may not be recognized
- Pattern coverage at ~26% (target ≥50% for Stage 3)

---

## Next Steps (Priority Order)

1. **Close Level 3 Relation Precision Gap** (55.7% → 80%)
   - Add appositive relation patterns
   - Add dialogue attribution patterns
   - Improve pattern coverage

2. **Remove Legacy Pronoun Resolution Code**
   - `lastNamedSubject`, `recentPersons` in relations.ts
   - Now replaced by ReferenceResolver/TokenResolver

3. **Improve Pattern Coverage** (26% → 50%)
   - Inventory gaps: `scripts/pattern-expansion/inventory-patterns.ts`
   - Add missing narrative patterns

4. **UI Integration** (Lower Priority)
   - Wire Entity Review Sidebar to graph visualization
   - Persist entity overrides
   - Add entity type picker to selection menu

---

## Testing Commands

```bash
# Core tests
npm test tests/ladder/level-1-simple.spec.ts      # Stage 1
npm test tests/ladder/level-2-multisentence.spec.ts  # Stage 2
npm test tests/ladder/level-3-complex.spec.ts     # Stage 3 (relation gap here)
npm test tests/unit/surname-detection.spec.ts     # Surname guardrails

# Debug output
L3_DEBUG=1 npm test tests/ladder/level-2-multisentence.spec.ts

# Pattern coverage
npx ts-node scripts/pattern-expansion/inventory-patterns.ts
```

---

## Debugging Protocol

### When Stuck on Linguistic Issues (>30 min)

**ASK THE USER** — they are an English language expert.

```markdown
I'm stuck on [specific bug]. Here's the example:

Text: "[exact sentence from test]"
Expected: [what should happen]
Actual: [what's happening]

Question: What's the linguistic rule for [the ambiguous situation]?
```

### Debug Fast Path (For Entity Leaks)

```bash
# Quick trace without full pipeline
npx ts-node scripts/debug-fast-path.ts

# Full pipeline trace (needs parser running)
npx ts-node scripts/trace-andrew-simple.ts
```

---

## Key Conventions

1. **HERT IDs** — Use stable entity IDs, not names
2. **Evidence Provenance** — Every extraction includes source text span
3. **Deterministic** — No randomness, alphabetical sorting for consistency
4. **Local-first** — No cloud dependencies for core functionality
5. **Inverse Relations** — Auto-generate (parent_of ↔ child_of)

---

## Git Workflow

```bash
# Branch naming
git checkout -b claude/feature-name-SESSION_ID

# Commit format
git commit -m "$(cat <<'EOF'
feat: Description

- Detail 1
- Detail 2
EOF
)"

# Push
git push -u origin branch-name
```

---

## The Vision

We're building the most powerful deterministic story world compiler in existence.

**No shortcuts. No moving goalposts.**

Every entity correctly identified. Every relationship accurately extracted. Every piece of evidence tracked to its source. The engine should understand narrative structure the way a careful human reader does — but faster, more consistently, and at scale.

This is about enabling writers, researchers, and storytellers to build rich, interconnected fictional universes with tooling that actually works.

---

## Files Changed This Session

- `app/engine/entity-quality-filter.ts` — Added 'ard'/'gard' suffixes, COMMON_FIRST_NAMES, evidence-based detection
- `tests/unit/surname-detection.spec.ts` — 35 guardrail tests (NEW)

---

## Contact & Resources

- **Repository**: https://github.com/mrfishcar/ARES
- **Current Branch**: `claude/ares-story-compiler-VAWSy`
- **Documentation**: See `docs/LINGUISTIC_REFERENCE.md` for pattern details

---

**Ownership Note**: This project benefits from AI agents who take personal investment in its success. Trace bugs to root causes. Add guardrail tests. Build durability, not band-aids. The goal is a system that works so well it feels like magic — but is actually transparent, testable engineering.
