# Stage 3 Relation Extraction - Progress Report

**Date**: 2025-11-27
**Session**: claude/review-claude-md-docs-012NtuxqVuaNfiGmfG9eKVVG
**Status**: ⚠️ Major Progress, Target Not Yet Reached

---

## Summary

Fixed critical coordination list bug and improved appositive filtering, bringing Stage 3 relation F1 from 45.1% to 64.5% (+19.4 points). Entity extraction now exceeds targets. Still need +12.5 points to reach relation F1 target of 77%.

---

## Metrics Progress

### Before Session (Start)
- Entity F1: 76.0% (target ≥77%) ❌
- Relation F1: 45.1% (target ≥77%) ❌

### After All Fixes (Current)
- **Entity F1: 88.3%** (target ≥77%) ✅ **TARGET MET!**
- **Relation F1: 64.5%** (target ≥77%) ⚠️ **Need +12.5 points**

### Breakdown
| Metric | Before | After | Δ | Target | Status |
|--------|--------|-------|---|--------|--------|
| **Entity P** | 80.2% | 90.2% | +10.0 | ≥80% | ✅ |
| **Entity R** | 72.2% | 86.5% | +14.3 | ≥75% | ✅ |
| **Entity F1** | 76.0% | 88.3% | **+12.3** | ≥77% | ✅ |
| **Relation P** | 51.6% | 67.0% | +15.4 | ≥80% | ⚠️ |
| **Relation R** | 40.1% | 62.2% | +22.1 | ≥75% | ⚠️ |
| **Relation F1** | 45.1% | 64.5% | **+19.4** | ≥77% | ⚠️ |

---

## Fixes Implemented

### 1. Coordination List Bug Fix (Commit 796aeaf)

**Problem**: Coordination lists like "Gryffindor, Slytherin, Hufflepuff, and Ravenclaw" were being merged into single entity "Gryffindor Slytherin Hufflepuff"

**Root Cause**: Two grouping functions were concatenating consecutive capitalized words without checking for punctuation between them:
1. Mock parser's `annotateNamedEntities()` function
2. Entity extraction's `nerSpans()` function

**Solution**:
- **Mock parser**: Added comma detection before grouping tokens
  - Added `hasCommaBetween()` helper function
  - Pass `fullText` parameter through pipeline to enable comma checking
- **Entity extraction**: Added punctuation gap detection in `nerSpans()`
  - Break grouping if gap between tokens > 1 char (comma, semicolon, etc.)

**Impact**:
- Entity F1: 76.0% → 88.3% (+12.3 points) ✅
- Relation F1: 45.1% → 60.5% (+15.4 points)
- Test 3.10 now correctly extracts 4 separate house entities

**Files**:
- `app/parser/MockParserClient.ts`
- `app/engine/extract/entities.ts`

---

### 2. Appositive Filter Threshold Fix (Commit f1c1770)

**Problem**: Appositive filter was incorrectly identifying multi-sentence coordinations as appositives, dropping all but the first subject.

**Example**:
```
"Hermione Granger was sorted into Gryffindor House. Harry Potter and Ron Weasley were also in Gryffindor."
```
- Expected: Extract member_of for all three (Hermione, Harry, Ron)
- Actual: Only extracted member_of for Hermione (first subject), dropped Harry & Ron

**Root Cause**: Coordination detection threshold was 50 characters, but "Hermione...House. Harry Potter" = 51 chars

**Solution**: Increased threshold from 50 → 100 characters to handle multi-sentence coordinations

**Impact**:
- Relation F1: 60.5% → 64.5% (+4.0 points)
- Relation P: 65.3% → 67.0%
- Relation R: 56.4% → 62.2%

**File**: `app/engine/extract/orchestrator.ts` (line 901)

---

### 3. Added "Head of" Leadership Pattern (Commit f1c1770)

**Problem**: Missing pattern for "X was/is the head of Y" → leads relation

**Test Case**: "She was also the head of Gryffindor House" (Test 3.9)

**Solution**: Added new regex pattern in narrative-relations.ts:
```typescript
{
  regex: /\b([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)\s+(?:was|is)\s+(?:also\s+)?the\s+head\s+of\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*)/g,
  predicate: 'leads',
  typeGuard: { subj: ['PERSON'], obj: ['ORG', 'HOUSE'] }
}
```

**Impact**: Pattern added but score unchanged (64.5%), indicating other issues blocking relation extraction

**File**: `app/engine/narrative-relations.ts` (line 256-261)

---

## Regression Testing

✅ **Stage 1**: Entity F1=93.3%, Relation F1=93.7% (PASSING, no regression)
✅ **Stage 2**: Entity F1=93.9%, Relation F1=92.5% (PASSING, no regression)

---

## Commits Summary

1. **`2e760cc`** - debug: Add rawSpans debug logging to trace entity sources
2. **`796aeaf`** - fix: Prevent coordination list merging in NER span extraction
3. **`88ae470`** - docs: Add coordination list bug fix summary report
4. **`f1c1770`** - fix: Improve Stage 3 relation extraction with coordination and leadership patterns

All commits pushed to: `claude/review-claude-md-docs-012NtuxqVuaNfiGmfG9eKVVG`

---

## Current Failing Tests (All 6 Tests Still Failing)

### Test 3.1 - Family Relations
- **Issue**: Entity merging bug - "Harry Potter" merged with "Lily Potter"
- **Impact**: Wrong parent/child relations extracted
- **Missing**: harry potter::child_of::james, james::parent_of::harry potter, harry potter::child_of::lily potter
- **False Positives**: lily potter::child_of::james, james::parent_of::lily potter

### Test 3.2 - member_of Relations ⚠️ PARTIALLY FIXED
- **Issue**: Only Hermione gets member_of, Harry & Ron are dropped (despite threshold fix!)
- **Text**: "Hermione Granger was sorted into Gryffindor House. Harry Potter and Ron Weasley were also in Gryffindor."
- **Missing**: harry potter::member_of::gryffindor, ron weasley::member_of::gryffindor, draco malfoy::member_of::slytherin
- **Pattern exists**: Line 579 in narrative-relations.ts ("X and Y were also in Z")
- **Needs investigation**: Why is appositive filter still dropping coordinated subjects?

### Test 3.3 - Leadership (leads)
- **Status**: ✅ Relation P/R: 100%/100% - PASSING!

### Test 3.5 - Marriage (Possessive)
- **Issue**: Possessive pattern "was Arthur's wife" not extracting
- **Missing**: molly weasley::married_to::arthur, molly weasley::lives_in::burrow, arthur::lives_in::burrow
- **Pattern exists**: Line 87 ("X was Y's wife/husband")
- **Needs investigation**: Why isn't possessive pattern matching?

### Test 3.8 - Marriage (Direct)
- **Issue**: Marriage patterns extracting wrong pairings
- **Missing**: harry potter::married_to::ginny weasley, ron weasley::married_to::hermione granger
- **False Positive**: harry potter::married_to::ron weasley (WRONG PAIRING!)
- **Pattern exists**: Line 94 ("X married Y")
- **Needs investigation**: Entity resolution issue causing wrong object

### Test 3.9 - Teaching Relations
- **Issue**: Teaching patterns not extracting despite pattern existence
- **Missing**: professor mcgonagall::teaches_at::hogwarts, professor snape::teaches_at::hogwarts
- **Pattern exists**: Line 240, 392 ("X taught/teaches at Y")
- **Needs investigation**: Why aren't teaching patterns matching?

---

## Root Cause Analysis

Despite patterns existing for most missing relations, they're not extracting. Key issues:

### 1. Appositive Filter Still Too Aggressive
- Threshold increase helped, but test 3.2 shows Harry & Ron still being dropped
- May need additional coordination detection heuristics beyond just distance

### 2. Entity Merging Issues (Test 3.1)
- "Harry Potter" and "Lily Potter" being merged into single entity
- Breaking family relations
- Need to investigate merge logic in `app/engine/merge.ts`

### 3. Pattern Matching Failures
- Tests 3.5, 3.8, 3.9 have existing patterns but 0% extraction
- Possible issues:
  - Entity type mismatches (PERSON vs ORG)
  - Regex not matching due to capitalization/formatting
  - Entity resolution failing (finding wrong entity for object)

### 4. Wrong Entity Pairing (Test 3.8)
- "Harry Potter married Ginny Weasley" extracting as harry::married_to::ron
- Indicates entity resolution bug in narrative-relations extraction

---

## Next Steps to Reach 77% Target

### Immediate Priority (Estimated +8-10 points)

1. **Fix Entity Merging Bug (Test 3.1)**
   - Investigate why "Harry Potter" and "Lily Potter" merge
   - Check merge logic for substring matching threshold
   - May need stricter merging rules for PERSONs

2. **Debug Appositive Filter (Test 3.2)**
   - Add more debug logging to understand why coordinated subjects still dropped
   - Consider additional heuristics:
     - Check for "and" between subjects
     - Check if subjects appear in different sentences
     - Lower threshold for entity types (PERSON + PERSON more likely coordination)

3. **Investigate Pattern Matching Failures (Tests 3.5, 3.8, 3.9)**
   - Add debug logging to narrative-relations.ts to show:
     - Which patterns are matching text
     - Which entities are being resolved for subject/object
     - Why type guards might be failing
   - Test patterns directly against failing test text

### Secondary Priority (Estimated +2-4 points)

4. **Fix Entity Resolution in Marriage Patterns (Test 3.8)**
   - Debug why "Harry married Ginny" resolves to harry::married_to::ron
   - Check entity lookup logic in extractNarrativeRelations()
   - May need proximity-based entity resolution

5. **Add Missing Patterns** (if any discovered during debug)
   - Audit test cases vs existing patterns
   - Add any genuinely missing patterns

### Validation

6. **Run Stage 3 Tests After Each Fix**
   - Incremental testing to validate each fix
   - Track F1 improvement per fix
   - Ensure no regression in Stage 1-2

---

## Estimated Effort

**Current Gap**: Need +12.5 points (64.5% → 77%)

**Estimated Breakdown**:
- Entity merging fix: +3-4 points
- Appositive filter refinement: +3-4 points
- Pattern matching fixes: +4-6 points
- Entity resolution fix: +2-3 points

**Total Estimated**: +12-17 points (should reach or exceed 77% target)

**Time Estimate**: 2-3 hours of focused debugging and iterative fixes

---

## Key Learnings

1. **Coordination Detection is Hard**: Multiple systems (mock parser, entity extraction, appositive filter) all need to agree on what constitutes a coordination vs appositive

2. **Pattern Existence ≠ Pattern Working**: Many patterns exist but fail due to:
   - Entity type mismatches
   - Entity resolution issues
   - Filter logic being too aggressive

3. **Entity Merging is Fragile**: Overly aggressive merging creates cascading failures in relation extraction

4. **Debug Logging is Critical**: Without detailed logging, impossible to diagnose why patterns aren't matching

---

## Files Modified

- `app/parser/MockParserClient.ts` - Comma detection in NER tagging
- `app/engine/extract/entities.ts` - Punctuation gap check in nerSpans()
- `app/engine/extract/orchestrator.ts` - Increased coordination threshold (50 → 100)
- `app/engine/narrative-relations.ts` - Added "head of" pattern
- `COORDINATION_FIX_SUMMARY.md` - Detailed coordination bug fix documentation
- `SESSION_STAGE3_PROGRESS.md` - This file

---

## Branch Status

**Branch**: `claude/review-claude-md-docs-012NtuxqVuaNfiGmfG9eKVVG`
**Status**: All changes committed and pushed to remote ✅
**Working Tree**: Clean ✅

**Ready for**: Next debugging session to close remaining 12.5 point gap
