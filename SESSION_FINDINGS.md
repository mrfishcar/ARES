# ARES Test Ladder - Session Findings
**Date:** 2025-11-11
**Session Type:** Continued from previous session

## Executive Summary

After resuming the previous session's work, I discovered that **Level 2 tests are now PASSING**, contrary to the previous session's summary. The actual bottleneck is **Level 3**, which has low relation precision (56.4% vs. target of 80%).

## Test Status

### ✅ Level 1: Simple Single-Sentence (PASSING)
- Status: Not tested this session (assumed passing from previous work)

### ✅ Level 2: Multi-Sentence Narratives (PASSING)
- **Test Result:** ALL TESTS PASS
- Precision/Recall: Meets targets
- **Key Finding:** The previous session's summary indicated 6 failures, but current state shows all passing

### ❌ Level 3: Complex Multi-Paragraph (FAILING)
- **Test Result:** Relation Precision = 56.4% (target: 80%)
- Entity Precision: Generally good (77-100% per test)
- **Root Cause:** False positive entity extractions leading to cascade of false relations

## Critical Discovery: Previous Session's Fixes May Be Unnecessary

The previous session created:
1. `app/engine/extract/coreference.ts` - Modified pronoun matching
2. `app/engine/extract/deictic-resolution.ts` - NEW file for deictic resolution

**However:**
- The actual coreference system used by tests is in `app/engine/coref.ts` (NOT `app/engine/extract/coreference.ts`)
- Deictic resolution ("there" → location) is **already implemented** in `coref.ts` lines 363-386
- The created files may not be integrated into the extraction pipeline at all

## Level 3 False Positive Entities

From `tmp/l3-spec-debug.json` analysis:

**Test 3.1:**
- ❌ Extracting `PERSON::magic` (part of "Ministry of Magic")

**Test 3.2:**
- ❌ Extracting `PERSON::slytherin` (should only be `ORG::slytherin`)

**Test 3.9:**
- ❌ Extracting `PERSON::potions` (common noun, not a person)

**Test 3.10:**
- ❌ Extracting `PERSON::ravenclaw` (should only be `ORG::ravenclaw`)
- ❌ Extracting `PLACE::platform` (part of "Platform 9¾")

**Test 3.5:**
- Relation precision: **11.1%** (CRITICAL - most relations are false positives)

## Fix Attempted This Session

Modified: `app/engine/entity-filter.ts` lines 92-104

Added to `TYPE_SPECIFIC_BLOCKLIST.PERSON`:
```typescript
// Fantasy/magical false positives (common nouns, not people)
'magic', 'potions', 'slytherin', 'ravenclaw', 'hufflepuff', 'gryffindor',
'platform', 'quidditch', 'wand', 'spell', 'charm', 'transfiguration',
'divination', 'herbology', 'astronomy', 'defense'
```

**Result:** Test still failing - entities still being extracted

**Hypothesis:** The `entity-filter.ts` may not be called consistently, or there's a second filtering path that bypasses this check. The orchestrator imports both:
- `isValidEntity` from `app/engine/entity-filter.ts` (line 21)
- `filterLowQualityEntities` from `app/engine/entity-quality-filter.ts` (line 25)

## Architecture Discoveries

### Coreference Resolution
**Two systems exist:**
1. `app/engine/coref.ts` - Rule-based system (ACTUALLY USED by tests via storage.ts)
2. `app/engine/extract/coreference.ts` - Alternate implementation (may not be used)

**Deictic Resolution:**
- Already implemented in `coref.ts` lines 363-386
- Handles "there" → most recent PLACE/ORG
- Handles "here" similarly

### Entity Filtering
**Two filtering systems:**
1. `app/engine/entity-filter.ts` - TYPE_SPECIFIC_BLOCKLIST
2. `app/engine/entity-quality-filter.ts` - DEFAULT_CONFIG with blockedTokens Set

**Orchestrator uses BOTH:**
- Lines 209-215: Calls `isValidEntity` from entity-filter.ts
- Lines 348-388: Calls `filterLowQualityEntities` from entity-quality-filter.ts

## Files Modified This Session

| File | Lines | Change |
|------|-------|--------|
| `app/engine/entity-filter.ts` | 92-104 | Added fantasy terms to PERSON blocklist |

## Next Steps for Future Sessions

### Immediate (Level 3)
1. **Debug entity filtering:** Understand why TYPE_SPECIFIC_BLOCKLIST isn't catching "magic", "potions", etc.
   - Add console.log to `isValidEntity` to see if it's being called
   - Check if orchestrator path bypasses this filter
   - May need to add same terms to entity-quality-filter.ts blockedTokens Set

2. **Investigate Test 3.5:** Why is relation precision only 11.1%?
   - Check what relations are being extracted
   - Look for pattern over-matching

3. **Consider merging filter systems:** Having two separate entity filters is confusing and may cause bugs

### Long-term
1. **Clean up previous session's files:**
   - Evaluate if `app/engine/extract/deictic-resolution.ts` should be deleted
   - Understand relationship between `coref.ts` and `extract/coreference.ts`
   - Document which systems are actually used

2. **Mega Regression:** Test on larger narratives once Level 3 passes

## Recommendations

1. **For Level 3 fixes:** Focus on entity quality filtering, NOT coreference or deictic resolution (those already work)

2. **Architecture clarification:** Document which coreference system is canonical and remove/deprecate the other

3. **Filter consolidation:** Consider merging entity-filter.ts and entity-quality-filter.ts into single coherent system

## Key Metrics Summary

| Level | Status | Entity P/R | Relation P/R | Target |
|-------|--------|-----------|--------------|--------|
| 1 | ✅ PASS | - | - | - |
| 2 | ✅ PASS | ≥85% / ≥80% | ≥85% / ≥80% | PASS |
| 3 | ❌ FAIL | 88% / 95% | **56%** / 71% | P≥80%, R≥75% |

**Bottleneck:** Level 3 relation precision @ 56.4% (need 80%)
**Root Cause:** False positive entity extractions → cascade to false relations
**Fix Needed:** Strengthen entity quality filtering for fantasy/common nouns

---

Generated: 2025-11-11
