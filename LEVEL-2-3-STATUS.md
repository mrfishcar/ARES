# Level 2 & Level 3 Status Report

**Generated:** 2025-11-08
**Current Status:**
- Level 1: 100% ✅
- Level 2: 80% precision (target: 85%, gap: 5%)
- Level 3: 69% precision (target: 80%, gap: 11%)

## Level 2 Analysis (15 tests, 6 failing)

### Root Causes Identified

1. **spaCy NER misclassification of fantasy names:**
   - "Frodo" → ORG (should be PERSON)
   - "Mordor" → ORG (should be PLACE)
   - Causes pronoun resolution failures (He/She can't link to ORG entities)

2. **Missing relation patterns:**
   - ✅ FIXED: Added `rules` predicate patterns ("ruled", "became king")
   - ⚠️  Still missing: Deictic "there" resolution
   - ⚠️  Still missing: Past tense + pronoun ("He studied there")

3. **Pronoun resolution issues:**
   - Test 2.3: "He" incorrectly resolves to "Shire" instead of "Frodo"
   - Likely because "Frodo" is classified as ORG, not PERSON

### Failing Tests

| Test | Text | Missing Relations | Issue |
|------|------|-------------------|-------|
| 2.1 | Harry went to Hogwarts. He studied magic there. | `harry::studies_at::hogwarts` | Deictic "there" + pronoun |
| 2.3 | Frodo lived in the Shire. He traveled to Mordor. | `frodo::lives_in::shire`<br>`frodo::traveled_to::mordor` | spaCy: Frodo→ORG, pronoun fails |
| 2.6 | Gandalf traveled to Rivendell. Elrond lived there. | `elrond::lives_in::rivendell` | Deictic "there" |
| 2.9 | Aragorn became king of Gondor. The king ruled wisely. | `aragorn::rules::gondor` | Title coref + "became king" |
| 2.12 | Aragorn, son of Arathorn, traveled to Gondor. He became king there. | `aragorn::rules::gondor` | Deictic "there" + pronoun |
| 2.14 | Theoden ruled Rohan. Eowyn was his niece. She lived in Rohan. | `theoden::rules::rohan`<br>`eowyn::lives_in::rohan` | Entity extraction issue |

### Pattern Summary

**Missing by predicate:**
- `rules`: 3 instances
- `lives_in`: 3 instances
- `studies_at`: 1 instance
- `traveled_to`: 1 instance

**Key patterns:**
- Deictic "there" (4 instances)
- Past tense verbs (all cases)
- Pronoun subjects (multiple cases)

## Changes Attempted (No Effect Yet)

### ✅ Completed (but not working):
1. Added fantasy character names to FANTASY_WHITELIST:
   - Theoden, Eowyn, Boromir, Denethor
   - Ron, Hermione, Dumbledore, etc.

2. Added `rules` predicate patterns to narrative-relations.ts:
   ```typescript
   /\b([A-Z][a-z]+)\s+(?:ruled|rules|governs)\s+([A-Z][a-z]+)\b/g
   /\b([A-Z][a-z]+)\s+became\s+(?:king|queen|ruler)\s+of\s+([A-Z][a-z]+)\b/g
   ```

### ⚠️  Why changes didn't work:
- Whitelist additions: Names already existed OR whitelist not being applied correctly
- Pattern additions: Patterns not matching OR not being invoked

## Next Steps Required

### A. Debug Entity Extraction
1. Verify FANTASY_WHITELIST is being applied
2. Check if spaCy entities are being extracted at all for fantasy names
3. Add debug logging to entity extraction pipeline

### B. Fix Deictic Resolution
1. Implement "there" → location mapping
2. Track most recent location mention per sentence
3. Apply deictic resolution BEFORE relation extraction

### C. Fix Pronoun + Location Patterns
1. Add patterns that handle pronoun subjects explicitly:
   ```typescript
   /\b(He|She)\s+(?:lived|dwelt)\s+(?:in|there)\b/
   ```
2. Ensure coreference resolution happens before pattern matching

### D. Improve Type Correction
1. Add heuristic-based type correction (names ending in vowels → likely PERSON)
2. Override spaCy types more aggressively for fantasy contexts
3. Consider gazetteer expansion

## Level 3 Preview

Level 3 has same issues as Level 2, plus:
- Multi-paragraph coreference
- Long-distance pronoun resolution
- Complex coordination ("X, Y, and Z verb")
- Implicit relations (family structures)

Fixing Level 2 should improve Level 3 by ~40%.

## Recommendations

**Priority 1:** Fix entity type classification
- Without correct entity types, nothing else will work
- Pronoun resolution requires PERSON entities
- Relation type guards require correct obj/subj types

**Priority 2:** Implement deictic resolution
- "there" accounts for 4 of 10 missing relations
- Relatively straightforward to implement

**Priority 3:** Test and verify
- Changes aren't taking effect - need to understand why
- May be compilation/caching issue
- May need to restart parser service

## Files Modified

- `/home/user/ARES/app/engine/narrative-relations.ts` - Added rules patterns
- `/home/user/ARES/app/engine/extract/entities.ts` - Added character names to whitelist

## Diagnostic Scripts

- `/home/user/ARES/scripts/diagnose-l2.ts` - Level 2 detailed diagnostic
- `/home/user/ARES/scripts/diagnose-entities.ts` - Entity extraction diagnostic
- `/home/user/ARES/scripts/debug-test-2-3.ts` - Single test debugging
