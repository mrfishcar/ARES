# Stage 3: Entity Merge Fix - SUCCESS ✅

**Date**: 2025-11-26
**Fix Applied**: Coordination list detection in entity merging
**Status**: Entity merging fixed, but relations still need work

---

## The Problem (SOLVED ✅)

**Issue**: Distinct entities being merged into coordination lists

```
Before Fix:
- "Gryffindor Slytherin Hufflepuff" (combined entity) ❌
- "Ravenclaw" (separate)

[MERGE] Merging "Hufflepuff" into cluster 1 (score: 1.000, method: substring)
```

**Root Cause**: `isSubstringMatch()` was matching "Slytherin" as substring of "Gryffindor Slytherin Hufflepuff"

---

## The Fix

**File**: `app/engine/merge.ts` (lines 158-171)

**Added**: Coordination list detection

```typescript
// Count capitalized words in each entity name
const countCapitalizedWords = (str: string) => {
  return str.split(/\s+/).filter(word => /^[A-Z]/.test(word)).length;
};

const cap1 = countCapitalizedWords(name1);
const cap2 = countCapitalizedWords(name2);

// If one has 3+ capitalized words and the other has 1-2, likely a coordination list
if ((cap1 >= 3 && cap2 <= 2) || (cap2 >= 3 && cap1 <= 2)) {
  return false;  // Don't merge distinct entities into lists
}
```

**Logic**:
- "Slytherin" (1 cap word) vs "Gryffindor Slytherin Hufflepuff" (3 cap words)
- Cap1=1, Cap2=3 → Coordination list detected → Don't merge ✅

---

## Test Results

### After Fix (Current Run)

```
[MERGE] Type ORG: 5 clusters from 5 entities
  Cluster 0: [Hogwarts School]
  Cluster 1: [Gryffindor]     ✅ SEPARATE
  Cluster 2: [Slytherin]      ✅ SEPARATE
  Cluster 3: [Hufflepuff]     ✅ SEPARATE
  Cluster 4: [Ravenclaw]      ✅ SEPARATE
```

**Entities**: 88.4% F1 ✅ (target: ≥77%)
- Precision: 89.2%
- Recall: 87.6%

**Relations**: 66.2% F1 ❌ (target: ≥77%)
- Precision: 63.7% (need ≥80%)
- Recall: 68.9% (need ≥75%)

---

## Success Metrics

✅ **Entity merging fixed**: Houses no longer merged
✅ **Entities pass target**: 88.4% vs 77% target
❌ **Relations still below target**: 66.2% vs 77% target

---

## What's Still Broken

### Issue: Relations at 66.2% F1 (need 77%)

**Precision**: 63.7% (extracting too many false relations)
**Recall**: 68.9% (missing ~31% of relations)

**Next Investigation Needed**:
1. Which test cases are failing?
2. Test 3.3 (Dumbledore/Hogwarts) - is it passing now?
3. Test 3.5 (family relations) - still at 22%?
4. Are type guards still rejecting valid relations?

---

## Next Steps

### Priority 1: Identify Failing Tests (15 min)

```bash
# Run with verbose output to see which tests fail
L3_DEBUG=1 npm test tests/ladder/level-3-complex.spec.ts > stage3_debug.log 2>&1

# Check test-by-test results
grep "Test 3\." stage3_debug.log
```

**Expected**: Identify which specific tests drag down metrics

### Priority 2: Fix Precision Issues (30-60 min)

**Problem**: 63.7% precision (extracting false positives)

**Possible Causes**:
1. Overly broad narrative patterns
2. Type guards not strict enough
3. Coreference creating false relations
4. Pattern overlap causing duplicates

### Priority 3: Fix Recall Issues (30-60 min)

**Problem**: 68.9% recall (missing 31% of relations)

**Possible Causes**:
1. Missing patterns for complex constructions
2. Type guards too strict (rejecting valid relations)
3. Family relation patterns not matching (Test 3.5)
4. Cross-paragraph dependencies not handled

---

## Commit Message

```bash
git add app/engine/merge.ts
git commit -m "$(cat <<'EOF'
fix: Prevent merging distinct entities from coordination lists

**Problem**: Entities like "Gryffindor", "Slytherin", "Hufflepuff" were
being merged into combined entity "Gryffindor Slytherin Hufflepuff" due
to substring matching.

**Solution**: Added coordination list detection to isSubstringMatch():
- Count capitalized words in each entity name
- If one has 3+ caps and other has 1-2, it's likely a list → don't merge

**Impact**:
- Entity merging: FIXED ✅
- Stage 3 entities: 88.4% F1 (target: 77%) ✅
- Stage 3 relations: Still at 66.2% F1 (target: 77%) ❌

Next: Debug relation extraction (precision 63.7%, recall 68.9%)

File: app/engine/merge.ts:158-171
Stage: 3 (Complex Extraction)
EOF
)"
```

---

## Summary

### What Worked ✅
- Coordination list detection prevents entity merging
- Houses now kept separate (no more "Gryffindor Slytherin Hufflepuff")
- Entity quality excellent (88.4% F1)

### What's Broken ❌
- Relations at 66.2% F1 (need 77%)
- Precision too low (63.7% vs 80% target)
- Recall too low (68.9% vs 75% target)

### Critical Path to Stage 3 Completion
1. Debug test failures (identify which tests fail)
2. Fix precision (reduce false positives)
3. Fix recall (capture missing relations)

**Time Estimate**: 1-2 hours to complete Stage 3

---

**Prepared by**: Claude Code (Sonnet 4.5)
**Fix Applied**: 2025-11-26
**Status**: Partial success - entity merging fixed, relations need work
