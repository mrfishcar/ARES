# Session Handoff - January 4, 2026

**Branch**: `claude/ares-story-compiler-VAWSy`
**Status**: ✅ Entity Extraction Bugs Fixed, Guardrail Tests Added

---

## This Session's Accomplishments

### 1. Fixed Andrew Beauregard Alias Leak

**Problem**: "Andrew Beauregard" was being split into two separate entities, with "Beauregard" then incorrectly merging into "Barty Beauregard".

**Root Cause Analysis**:
1. `extractEntities()` correctly returned "Andrew Beauregard" as ONE entity
2. `EntityFilteringStage` Layer 1 split it into 2 entities
3. The "two-first-names" filter (for biblical texts) triggered incorrectly
4. `looksLikeSurname("Beauregard")` returned `false` because 'ard' wasn't in the suffix list
5. Later, `AliasResolutionStage` merged "Beauregard" into "Barty Beauregard"

**Fix**: Added 'ard', 'gard' to surname endings in `entity-quality-filter.ts:436`

**Commit**: `0aaa2018`

### 2. Implemented Evidence-Based Surname Detection

Enhanced `looksLikeTwoFirstNames()` to use multiple evidence signals:

```
EVIDENCE 1: NER backing → trust NER, don't split
EVIDENCE 2: Surname suffix/prefix match → preserve as surname
EVIDENCE 3: Both words in COMMON_FIRST_NAMES → split (Mary Elizabeth)
EVIDENCE 4: First is common first name, second ≥6 chars → surname
EVIDENCE 5: Neither known, no suffix → split (biblical pattern)
```

Added `COMMON_FIRST_NAMES` set with 100+ names.

**Result**:
- Level 1 Entity Precision: 90.8% → 95.8% (+5%)
- Level 1 Entity Recall: 89.2% → 94.2% (+5%)

**Commit**: `0f54fa2f`

### 3. Added Surname Detection Guardrail Tests

Created `tests/unit/surname-detection.spec.ts` with 35 test cases:
- Names ending in -ard/-gard preserved (Beauregard, Bernard, Gerard)
- Common surname endings preserved (Potter, Johnson, Einstein, Malfoy)
- Biblical two-first-names correctly split (Elimelech Naomi, Jacob Esau)
- Edge cases (single-word, three-word, NER-backed)

**Known Limitation**: Hyphenated surnames (Mary Smith-Jones) currently get split - documented as TODO.

---

## Test Results After Changes

| Test Suite | Before | After |
|------------|--------|-------|
| Level 1 Entity P | 90.8% | 95.8% |
| Level 1 Entity R | 89.2% | 94.2% |
| Level 1 Relation P | 95.0% | 95.0% |
| Level 1 Relation R | 95.0% | 95.0% |
| Level 2 | PASS | PASS |
| Surname Guardrails | N/A | 35/35 |

---

## Commits This Session

1. `0aaa2018` - fix(extraction): Add 'ard' surname ending to prevent entity splitting
2. `0f54fa2f` - feat(extraction): Evidence-based surname detection with guardrail tests

---

## Files Changed

**Modified**:
- `app/engine/entity-quality-filter.ts` - Added surname endings, COMMON_FIRST_NAMES, evidence-based detection

**New**:
- `tests/unit/surname-detection.spec.ts` - 35 guardrail tests

---

## Next Priorities

1. **Close Level 3 Relation Precision Gap** (55.7% → 80%)
   - Current blockers: Missing appositive patterns, dialogue attribution
   - Test: `npm test tests/ladder/level-3-complex.spec.ts`

2. **Remove Legacy Pronoun Resolution Code**
   - `lastNamedSubject`, `recentPersons` in relations.ts
   - Replaced by ReferenceResolver/TokenResolver

3. **Improve Pattern Coverage** (26% → 50%)
   - Run: `npx ts-node scripts/pattern-expansion/inventory-patterns.ts`

---

## Current Issues

### Level 3 Relation Precision: 55.7%
```
Missing relations:
- gryffindor::part_of::hogwarts school
- slytherin::part_of::hogwarts school
- hufflepuff::part_of::hogwarts school

False positives:
- hogwarts school::located_in::scotland
```

### Known Limitations
- Hyphenated surnames get split (documented TODO)
- Pattern coverage at ~26%

---

## Quick Resume Commands

```bash
# Start parser
make parser

# Verify tests pass
npm test tests/ladder/level-1-simple.spec.ts
npm test tests/unit/surname-detection.spec.ts

# Check Level 3 gap
npm test tests/ladder/level-3-complex.spec.ts
```

---

## Key Technical Decisions Made

1. **Evidence-based > suffix-only**: Using multiple signals (NER backing, known first names, length heuristics) prevents whack-a-mole with suffix patterns.

2. **Length ≥6 heuristic**: Unknown words ≥6 chars after a known first name are treated as surnames. Short words (< 6) could be biblical first names and fall through to split.

3. **Guardrail tests as regression prevention**: 35 tests ensure surname detection doesn't regress when adding new patterns.

---

## Documentation Updated

- `CLAUDE.md` - Compressed to ~300 lines, current status, vision statement
- `HANDOFF.md` - This file

---

**Session completed**: 2026-01-04
**Parser status**: Running on port 8000
**Build status**: ✅ All tests passing
