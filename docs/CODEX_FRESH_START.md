# Fresh Start - Debug Battle Entity Merging

**Status**: 0.8% away from passing Level 1!
**Blocker**: Test 1.19 - "Battle of Pelennor Fields" splitting into 2 entities
**Your mission**: Debug and fix the entity merge logic

---

## 🎯 Current Situation

**Metrics**:
- Entities: P=89.2%, R=86.7%, F1=87.9%
- **Need**: P≥90.0% (only 0.8% away!)
- **Blocker**: Test 1.19 failing

**Problem**:
```
Input: "Eowyn fought in the Battle of Pelennor Fields."

Current (WRONG):
- EVENT::Battle
- PERSON::Pelennor Fields

Expected (CORRECT):
- EVENT::Battle of Pelennor Fields
```

**Fix attempted**: Added `mergeOfPatterns()` function but it's not working yet.

---

## 🔍 Your Task

### Step 1: Run Debug Test (2 min)

```bash
npx vitest run tests/ladder/level-1-simple.spec.ts 2>&1 | grep "MERGE-DEBUG" > /tmp/merge_debug.log
cat /tmp/merge_debug.log
```

**Look for**: Debug logs from the `mergeOfPatterns()` function

---

### Step 2: Analyze Results

#### Scenario A: NO debug logs appear

**Meaning**: Function not being called at all

**Fix location**: `app/engine/extract/entities.ts` line ~1443

Check that this code exists:
```typescript
const deduped = dedupe(rawSpans);
const merged = mergeOfPatterns(deduped, text);  // ← Should be here
const validated = merged.filter(span => {       // ← Should use 'merged', not 'deduped'
```

If missing, the code wasn't mirrored to `.js` correctly.

#### Scenario B: Debug logs appear

**Meaning**: Function is being called but logic is failing

**Next**: Add more debug inside the merge function at line ~1364:

```typescript
if (isEventKeyword) {
  console.log(`[MERGE-DEBUG] Found event: "${span1Text}" at [${span1.start}-${span1.end}]`);
  const afterSpan1 = fullText.slice(span1.end);
  console.log(`[MERGE-DEBUG] After text: "${afterSpan1.substring(0, 30)}"`);

  if (afterSpan1.trim().startsWith('of ')) {
    console.log(`[MERGE-DEBUG] Has "of" after it!`);
    // ... rest of logic
  } else {
    console.log(`[MERGE-DEBUG] NO "of" found, afterSpan1="${afterSpan1.substring(0, 30)}"`);
  }
}
```

Then rerun test and report what you see.

---

## 🔧 Files to Check

**TypeScript**: `/Users/corygilford/ares/app/engine/extract/entities.ts`
- Line 1348-1404: `mergeOfPatterns()` function
- Line 1443: Where it's called

**JavaScript** (compiled): `/Users/corygilford/ares/dist/app/engine/extract/entities.js`
- Line 1170-1213: `mergeOfPatterns()` function
- Line 1297: Where it's called

**IMPORTANT**: Any changes to `.ts` must be manually copied to `.js` (tsc doesn't complete)

---

## 📊 Test Commands

```bash
# Run full Level 1 test
npx vitest run tests/ladder/level-1-simple.spec.ts > /tmp/ladder_debug.log 2>&1

# Check metrics
tail -50 /tmp/ladder_debug.log | grep -A10 "Entities:"

# Debug test 1.19 specifically
grep -B5 -A30 "Eowyn fought" /tmp/ladder_debug.log

# Look for debug logs
grep "MERGE-DEBUG" /tmp/ladder_debug.log
```

---

## ✅ Success Criteria

You've succeeded when:

1. Debug logs show the merge logic is executing
2. You identify WHY it's not merging (wrong positions? missing "of"? etc.)
3. You fix the logic
4. Test 1.19 extracts: `EVENT::Battle of Pelennor Fields` (single entity)
5. Entity precision reaches ≥90.0%

---

## 🎯 Report Format

After Step 1, report:

```
Debug Test Results:

Scenario: A or B (logs present or not)

Debug Output:
[paste any MERGE-DEBUG logs]

Analysis:
[what you found]

Next Step:
[what you'll do to fix it]
```

---

## 📁 Reference Docs

- **PHASE3_STATUS.md** - Detailed status of this fix attempt
- **PHASE2_CHECKPOINT.md** - Previous phase completion
- **RESTART_HERE.md** - Quick overview

---

**Start here**: Run Step 1 debug command and report what you see!

Claude is standing by to analyze results and guide the fix.
