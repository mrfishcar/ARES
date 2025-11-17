# Codex Session 2 - Handoff Brief

**Date**: 2025-11-16
**Status**: Level 1 Ladder Test - Phase 2 (DATE extraction)
**Previous Session**: Successfully fixed 3 bugs + completed Phase 1

---

## ✅ What Was Accomplished (Session 1)

### Major Bugs Fixed

1. **Empty Subject IDs** - Relations had valid entity IDs but lost during remapping
   - **Fix**: Added `registerWindowEntity()` helper in orchestrator.ts
   - **File**: `app/engine/extract/orchestrator.ts` (lines 95-128, 248-307)

2. **Entity Type Misclassification** - POS enhancement downgrading GPE to PERSON
   - **Fix**: Preserved spaCy's GPE typing for capitalized locations
   - **File**: `app/engine/extract/entities.ts` (enhanceEntityTypeWithPOS)

3. **Deduplication Bug** - Map iterator consumed twice, dropping all relations
   - **Fix**: Use `Array.from(groups.entries())` instead of direct iteration
   - **File**: `app/engine/relation-deduplicator.ts`

### Meaning Layer

- ✅ **test-meaning-layer.ts** passing (2 entities, 2 relations, 2 meaning records)
- ✅ Debug logging cleaned up
- ✅ Production-ready state

### Level 1 Ladder - Phase 1 Completed

**Canonicalization Fix**:
- **Problem**: Registry added honorifics ("Prince Aragorn" instead of "Aragorn")
- **Fix**: Modified `app/engine/merge.ts:274-307` to prefer shorter names without titles
- **Impact**:
  - Entities: P=0.892, R=0.867, F1=0.879 (✅ near threshold!)
  - Relations: P=0.800, R=0.775, F1=0.787 (❌ still below threshold)
  - Tests passing: 12/20

---

## 🎯 Current Mission: Level 1 Ladder Test

**Goal**: Achieve P≥0.90, R≥0.85, F1≥0.87 on all metrics

**Current Status**:
- Entities: ✅ 0.879 F1 (almost there!)
- Relations: ❌ 0.787 F1 (need +0.08)
- Tests passing: 12/20 (need 18+/20)

### Remaining Failures

**High Priority** (blocking multiple tests):

1. **DATE Extraction** (Tests 1.13, 1.14)
   - "in 3019" not creating DATE entities
   - Impact: -2 tests, -0.05 recall

2. **Entity Type Issues** (Tests 1.6, 1.19)
   - "Hogwarts" → ORG (should be PLACE)
   - "Battle of Pelennor Fields" → PERSON + EVENT (should be EVENT only)
   - Impact: -2 tests, false positives

3. **Relation Pattern Issues** (Tests 1.1, 1.2, 1.3, 1.9)
   - Entities correct now, but relations still failing
   - May need relation pattern tuning

---

## 🚀 Your Immediate Task: Phase 2 - DATE Extraction

### Objective

Fix tests 1.13 and 1.14 by extracting DATE entities.

**Test cases**:
```
1.13: "Aragorn married Arwen in 3019."
      Expected: DATE entity "3019"
      Current: Missing

1.14: "Gandalf traveled to Minas Tirith in 3019."
      Expected: DATE entity "3019"
      Current: Missing
```

### Step-by-Step Instructions

#### Step 1: Find Where DATEs Are Filtered

**File**: `app/engine/extract/entities.ts`

Search for DATE filtering logic:
```bash
grep -n "DATE" app/engine/extract/entities.ts | head -20
```

Look for one of these patterns:
- Entity quality filter removing DATEs
- Confidence threshold filter
- "Too short" filter catching 4-character strings
- Type-specific removal logic

#### Step 2: Add Year Preservation Logic

**Add this code** wherever DATE entities are being filtered out:

```typescript
// Preserve 4-digit years (e.g., "3019", "2024")
if (entity.type === 'DATE') {
  const text = entity.canonical.trim();

  // Keep 4-digit years - these are always valid
  if (/^\d{4}$/.test(text)) {
    // Skip removal - this is a year
    continue; // or return false; depending on filter structure
  }

  // Keep standard date formats
  if (/\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/.test(text)) {
    continue;
  }
}
```

**If you can't find explicit DATE filtering**, add debug logging:

```typescript
// In the entity quality filter loop
if (entity.type === 'DATE') {
  console.log(`[DATE-DEBUG] Checking DATE entity: "${entity.canonical}"`);
  console.log(`  Confidence: ${entity.confidence}`);
  console.log(`  Length: ${entity.canonical.length}`);
  console.log(`  Will remove: ${shouldRemove}`);
}
```

Run the test and see where dates are disappearing.

#### Step 3: Mirror Changes to .js

After editing `app/engine/extract/entities.ts`, copy the same changes to:
- `dist/app/engine/extract/entities.js` (if it exists)

#### Step 4: Test

```bash
# Verify meaning layer still works
npx ts-node test-meaning-layer.ts

# Run Level 1 ladder
npx vitest run tests/ladder/level-1-simple.spec.ts > /tmp/ladder_phase2.log 2>&1

# Check results
cat /tmp/ladder_phase2.log | grep -A 10 "SUMMARY"
```

#### Step 5: Report Results

Use this format:

```
Phase 2 Results - DATE Extraction

Code Changed:
- File: app/engine/extract/entities.ts
- Lines: XXX-YYY
- Description: [what you changed]

Tests:
- npx ts-node test-meaning-layer.ts: PASS/FAIL
- npx vitest run tests/ladder/level-1-simple.spec.ts

Metrics:
- Entities: P=X.XX, R=X.XX, F1=X.XX
- Relations: P=X.XX, R=X.XX, F1=X.XX
- Tests passing: XX/20 (was 12/20)

Specific Test Impact:
- Test 1.13: PASS/FAIL (DATE entity found: YES/NO)
- Test 1.14: PASS/FAIL (DATE entity found: YES/NO)

Next Steps:
[What should happen next]
```

---

## 📁 Files Modified So Far

**Session 1 Changes** (already applied):

1. `app/engine/extract/orchestrator.ts` + `.js`
   - Added registerWindowEntity helper
   - Fixed entity remapping

2. `app/engine/extract/entities.ts` + `.js`
   - Enhanced POS type preservation

3. `app/engine/relation-deduplicator.ts` + `.js`
   - Fixed Map iterator bug

4. `app/engine/merge.ts`
   - Fixed canonicalization to prefer shorter names

**DO NOT modify these again** - they're working correctly.

---

## 🎯 Success Criteria

You've completed Phase 2 when:

1. ✅ Code changes documented
2. ✅ `test-meaning-layer.ts` still passes
3. ✅ Level 1 test shows DATE entities in tests 1.13, 1.14
4. ✅ Metrics reported (hopefully improved recall)
5. ✅ Next steps identified

---

## 📞 Communication Protocol

**Report findings immediately if**:
- You can't find where DATEs are filtered
- The fix doesn't work (dates still missing)
- Tests start failing unexpectedly

**Don't try to**:
- Fix other issues (stick to Phase 2: DATEs only)
- Modify already-fixed files
- Make multiple changes at once

---

## 🔧 Quick Reference Commands

```bash
# Find DATE filter
grep -n "DATE" app/engine/extract/entities.ts | head -20

# Test meaning layer
npx ts-node test-meaning-layer.ts

# Run Level 1 ladder
npx vitest run tests/ladder/level-1-simple.spec.ts

# Save output
npx vitest run tests/ladder/level-1-simple.spec.ts > /tmp/ladder_phase2.log 2>&1

# Check metrics
cat /tmp/ladder_phase2.log | grep -A 10 "Entities\|Relations"
```

---

## 🎬 Ready to Start

Your mission:
1. Find DATE filter in entities.ts
2. Add year preservation logic
3. Test and report results

Claude is standing by to help interpret results and guide Phase 3 (entity types).

Good luck!
