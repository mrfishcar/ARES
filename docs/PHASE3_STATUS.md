# Phase 3 Status - Battle Entity Merging

**Date**: 2025-11-16
**Status**: Fix attempted but not working yet
**Issue**: "Battle of Pelennor Fields" still splitting into 2 entities

---

## 🎯 Goal

Fix test 1.19 to merge "Battle" + "of" + "Pelennor Fields" → "Battle of Pelennor Fields" (EVENT)

---

## ✅ What Was Done

### Code Changes

**Files Modified**:
1. `app/engine/extract/entities.ts` (lines 1344-1404, 1440-1443, 1446)
2. `dist/app/engine/extract/entities.js` (lines 1166-1213, 1295-1297, 1299)

**Changes**:
- Added `mergeOfPatterns()` function to merge "X of Y" patterns
- Called function after dedupe but before validation
- Updated validation to use merged spans

### Test Results

**Before**:
- Entities: P=89.2%, R=86.7%, F1=87.9%
- Test 1.19: ❌ FAIL (splits into "Battle" + "Pelennor Fields")

**After**:
- Entities: P=89.2%, R=86.7%, F1=87.9% (NO CHANGE!)
- Test 1.19: ❌ STILL FAILS (still splits!)

**Issue**: Fix didn't work - entities still being split

---

## 🐛 Debugging Findings

### From Test Log

```
Input: "Eowyn fought in the Battle of Pelennor Fields."

Extracted:
- PERSON::Eowyn ✅
- EVENT::Battle ❌ (should be "Battle of Pelennor Fields")
- PERSON::Pelennor Fields ❌ (shouldn't exist)

Expected:
- PERSON::Eowyn
- EVENT::Battle of Pelennor Fields
```

### Mystery Issue

There's also a strange entity appearing:
```
EVENT::Battle of Helm's Deep
```

This is NOT in the input text! Possible cross-contamination from another test or entity registry?

---

## 🔍 Next Steps to Debug

### Step 1: Verify Function is Being Called

Added debug logging at line 1352 of entities.ts:
```typescript
console.log(`[MERGE-DEBUG] mergeOfPatterns called with ${spans.length} spans, text: "${fullText.substring(0, 100)}"`);
```

**Run test and check**:
```bash
npx vitest run tests/ladder/level-1-simple.spec.ts 2>&1 | grep "MERGE-DEBUG"
```

**Expected**: Should see log lines showing the function is called

**If NO logs appear**: Function not being called - check why

**If logs appear**: Function is called but logic is wrong

### Step 2: Add More Debug Logging

If function is being called, add logging inside the merge logic:

```typescript
if (isEventKeyword) {
  console.log(`[MERGE-DEBUG] Found event keyword: "${span1Text}"`);
  const afterSpan1 = fullText.slice(span1.end).trim();
  console.log(`[MERGE-DEBUG] Text after span: "${afterSpan1.substring(0, 50)}"`);

  if (afterSpan1.startsWith('of ')) {
    console.log(`[MERGE-DEBUG] Found "of " after event keyword`);
    // ... rest of logic
  }
}
```

This will show exactly where the merge logic is failing.

### Step 3: Check Span Positions

The issue might be that "Battle" and "Pelennor Fields" aren't the right spans to merge. Maybe:
- They're not adjacent
- The text between them isn't exactly "of "
- The positions are off

Add logging to see all spans:
```typescript
sorted.forEach((s, idx) => {
  console.log(`[MERGE-DEBUG] Span ${idx}: "${s.text}" [${s.start}-${s.end}] type=${s.type}`);
});
```

### Step 4: Alternative Fix Strategy

If merging after extraction doesn't work, try fixing it DURING extraction:

**Option A**: Modify spaCy parser to return full "Battle of X" entities

**Option B**: Add post-processing in `refineEntityType()` to detect and merge

**Option C**: Modify entity boundary detection to not split on "of"

---

## 📊 Current Metrics

**Entities**:
- Precision: 89.2% (need 90.0%) - **0.8% away!**
- Recall: 86.7% (need 85.0%) ✅
- F1: 87.9% (need 87.0%) ✅

**Relations**:
- Precision: 75.0% (need 90.0%) - 15% away
- Recall: 77.5% (need 85.0%) - 7.5% away
- F1: 76.2% (need 87.0%) - 10.8% away

**Impact of fixing test 1.19**:
- Would reduce false positives (removes "Pelennor Fields" PERSON entity)
- Would increase precision by ~1-2%
- Should push entity precision over 90% threshold!

---

## 🎯 What Success Looks Like

After fix works:
```
Test 1.19: ✅ PASS
Entities extracted:
- PERSON::Eowyn
- EVENT::Battle of Pelennor Fields (merged!)

Metrics:
- Entities: P≥90%, R≥86%, F1≥88%
- Level 1: PASSING threshold!
```

---

## 🔧 Files to Check

**Main files**:
- `/Users/corygilford/ares/app/engine/extract/entities.ts:1344-1404`
- `/Users/corygilford/ares/dist/app/engine/extract/entities.js:1166-1213`

**Test file**:
- `/Users/corygilford/ares/tests/ladder/level-1-simple.spec.ts` (test 1.19)

**Test logs**:
- `/tmp/ladder_after_fix.log` (current results)

---

## 💡 Quick Test Command

```bash
# Run just test 1.19
npx vitest run tests/ladder/level-1-simple.spec.ts 2>&1 | grep -B5 -A30 "test 1.19\|Eowyn fought"

# Check for debug logs
npx vitest run tests/ladder/level-1-simple.spec.ts 2>&1 | grep "MERGE-DEBUG" | head -20
```

---

**Status**: Ready for debugging - debug logging added, needs test run to see where logic fails
