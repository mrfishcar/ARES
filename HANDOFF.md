# HANDOFF TO CODEX - Stage 3 Relation Extraction

**Date**: 2025-11-27
**Branch**: `claude/review-claude-md-docs-012NtuxqVuaNfiGmfG9eKVVG`
**Status**: 84% complete, one critical bug blocks final 12.5 points

---

## Quick Status

**Target**: 77% relation F1
**Current**: 64.5% relation F1
**Gap**: Need +12.5 points

**Progress This Session**: +19.4 points (45.1% → 64.5%) 🎉

| Metric | Start | Current | Target | Status |
|--------|-------|---------|--------|--------|
| **Entity F1** | 76.0% | **88.3%** | 77% | ✅ **DONE** |
| **Relation F1** | 45.1% | **64.5%** | 77% | ⚠️ **84% done** |

---

## What I Fixed ✅

### 1. Coordination List Bug (Commit 796aeaf)
**Problem**: "Gryffindor, Slytherin, Hufflepuff, and Ravenclaw" merged into single entity
**Fix**: Added comma detection in mock parser + punctuation gap detection in nerSpans()
**Impact**: +15.4 points
**Files**: `app/parser/MockParserClient.ts`, `app/engine/extract/entities.ts`

### 2. Appositive Filter (Commit f1c1770)
**Problem**: Multi-sentence coordinations incorrectly detected as appositives
**Fix**: Increased threshold 50 → 100 chars
**Impact**: +4 points
**File**: `app/engine/extract/orchestrator.ts:901`

### 3. Leadership Pattern (Commit f1c1770)
**Problem**: Missing "head of" pattern
**Fix**: Added regex for "X was/is the head of Y" → leads
**File**: `app/engine/narrative-relations.ts:256-261`

---

## Critical Bug Blocking Progress 🐛

### The Harry/Lily Potter Merge Bug

**Impact**: Prevents 6+ tests from passing, blocks ~8-10 points

**What's Happening**:
```
Expected: "Harry Potter", "James", "Lily Potter" as separate entities
Actual: "Harry Potter" and "Lily Potter" merge into single "Lily Potter" entity
```

**Root Cause** (CONFIRMED):
ALL entities in test 3.1 get contaminated with "Potter" alias:
```
[ORCHESTRATOR] Entity "Harry Potter" has 2 aliases: [Harry, Potter]  ✓
[ORCHESTRATOR] Entity "James" has 2 aliases: [James, Potter]  ✗ WRONG!
[ORCHESTRATOR] Entity "Lily Potter" has 2 aliases: [Lily, Potter]  ✓
[ORCHESTRATOR] Entity "Dursleys" has 2 aliases: [Dursleys, Potter]  ✗ WRONG!
```

Then merge happens:
```
[MERGE] Merging "Lily Potter" into cluster 0 (score: 1.000, method: substring, matched: "Potter" ↔ "Potter")
```

**Why This Matters**:
- Missing entity (Harry Potter)
- All Harry's relations wrongly attributed to Lily
- Family relations completely broken (parent_of, child_of all wrong)

---

## The Fix You Need to Implement

### Problem Location
**File**: `app/engine/extract/orchestrator.ts`
**Lines**: 1154-1200 (alias population phase)

The bug is in this code block where contaminated aliases are added.

### Investigation Steps

1. **Trace alias registration** (add debug logging):
   ```typescript
   // In app/engine/alias-registry.ts line 87 (register function)
   console.log(`[ALIAS-REG-DEBUG] Registering "${surfaceForm}" → EID ${eid}`);
   ```

2. **Find where name splitting happens**:
   - Search for code that splits "Harry Potter" into ["Harry", "Potter"]
   - Check if entity extraction automatically creates name component aliases
   - Look for title/name variation logic that might be too aggressive

3. **Likely suspects**:
   - `app/engine/extract/entities.ts` - Entity extraction
   - `app/engine/alias-resolver.ts` - Alias resolution logic
   - `app/engine/coref.ts` - Coreference resolution

### The Fix

Once you find the name splitting code, ONLY register the full name, not components:
```typescript
// BEFORE (WRONG):
aliasRegistry.register("Harry", harryEID);
aliasRegistry.register("Potter", harryEID);  // ← DON'T do this

// AFTER (CORRECT):
aliasRegistry.register("Harry Potter", harryEID);  // ← Only full name
```

---

## How to Test Your Fix

### Quick Test
```bash
npm test tests/ladder/level-3-complex.spec.ts 2>&1 | grep "Test 3.1"
```

**Expected after fix**: ✅ Test 3.1 passed

### Full Validation
```bash
# Should go from 64.5% → 72-75% F1
npm test tests/ladder/level-3-complex.spec.ts 2>&1 | tail -20

# Ensure no regression
npm test tests/ladder/level-1-simple.spec.ts
npm test tests/ladder/level-2-multisentence.spec.ts
```

---

## Files to Check

### Primary suspects:
1. `app/engine/extract/entities.ts` - Entity extraction and alias creation
2. `app/engine/alias-resolver.ts` - Alias registration interface
3. `app/engine/extract/orchestrator.ts:1154-1200` - Where contaminated aliases are added

### Supporting files:
4. `app/engine/alias-registry.ts` - Alias storage (add debug logging here)
5. `app/engine/coref.ts` - Coreference resolution

---

## Debug Commands

```bash
# See full test output with alias registrations
npm test tests/ladder/level-3-complex.spec.ts 2>&1 > /tmp/test-output.txt

# Check what aliases are being registered
grep "ALIAS-REGISTRY.*Potter" /tmp/test-output.txt

# See which entities get Potter alias
grep "Entity.*Potter.*aliases" /tmp/test-output.txt
```

---

## Expected Outcome After Fix

### Metrics
- Relation F1: 64.5% → **72-75%** (estimated +8-10 points)
- Test 3.1: Should PASS
- Tests 3.5, 3.8: Should improve significantly

### If Fix Works
You should see:
```
[ORCHESTRATOR] Entity "Harry Potter" has 2 aliases: [Harry, Potter]  ✓
[ORCHESTRATOR] Entity "James" has 1 aliases: [James]  ✓ FIXED!
[ORCHESTRATOR] Entity "Lily Potter" has 2 aliases: [Lily, Potter]  ✓
[ORCHESTRATOR] Entity "Dursleys" has 1 aliases: [Dursleys]  ✓ FIXED!
```

---

## Documentation

**Comprehensive reports created**:
- `SESSION_STAGE3_PROGRESS.md` - Full session progress report
- `ENTITY_MERGE_BUG_DIAGNOSIS.md` - Deep diagnostic of this specific bug
- `COORDINATION_FIX_SUMMARY.md` - Coordination list bug fix details

**All commits pushed to**: `claude/review-claude-md-docs-012NtuxqVuaNfiGmfG9eKVVG`

---

## Quick Start for Codex

```bash
# 1. Verify current state
npm test tests/ladder/level-3-complex.spec.ts 2>&1 | tail -30
# Should show: Relation F1: 64.5%

# 2. Add debug logging to alias registry
# Edit app/engine/alias-registry.ts line 87

# 3. Run test and check what's being registered
npm test tests/ladder/level-3-complex.spec.ts 2>&1 > /tmp/debug.txt
grep "ALIAS-REG-DEBUG.*Potter" /tmp/debug.txt

# 4. Find where Potter gets registered for wrong EIDs
# Trace back through code to find name splitting

# 5. Fix it, test it
npm test tests/ladder/level-3-complex.spec.ts

# 6. If F1 improves to 72-75%, you're golden! 🎉
```

---

## Success Criteria

✅ Test 3.1 passes
✅ Entities don't get contaminated aliases
✅ Relation F1 reaches 72-75%
✅ Stage 1-2 still pass (no regression)

**Bonus**: If you hit 77%+ F1, Stage 3 is COMPLETE! 🎯

---

**Estimated time**: 30-60 minutes once you find the right code location.

Good luck! The bug is very close to being fixed.
