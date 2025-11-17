---
archived: true
archived_date: 2025-11-13
replaced_by: /docs/FOR_AGENTS.md
reason: Superseded by v2, which was superseded by FOR_AGENTS.md
original_date: 2025-11-11
---

# ARES Coding Agent Instructions
**Date**: 2025-11-11  
**Task**: Fix Stage 2 Recall Gap (Proximity-Window Filtering)  
**Priority**: HIGH - Stage 2 precision passing but recall failing  
**Estimated Time**: 2-3 hours

---

## 📥 Getting Started

### 1. Pull Latest Code from Main Branch

```bash
# Clone or navigate to ARES repo
cd /path/to/ARES

# Checkout main branch and pull latest
git checkout main
git pull origin main

# Verify you're on the latest commit
git log --oneline -3
# Should show:
# 60c7377 docs: add detailed status report and improvement plan
# 8810a7c docs: add comprehensive progress summary and improvement plan
# 2d1d98a Merge pull request #12

# Install dependencies if needed
npm install
```

### 2. Start the Parser Service (REQUIRED)

```bash
# Terminal 1: Start spaCy parser
make parser

# Wait for: "SpaCy parser running on port 8000"
```

---

## 📊 Current Status Overview

### What's Working ✅
- **Stage 1**: Passing (90% precision)
- **Stage 2 Precision**: 86.7% (target: 85%) - **EXCEEDED** ✓
- **Infrastructure**: Precision defense system in place
- **Test Suite**: 451/514 tests passing

### What's Broken ❌
- **Stage 2 Recall**: 71.1% (target: 80%) - **Gap: -8.9%**
- **Stage 2 F1**: ~78% (target: 82%)
- **Root Cause**: Document-level filtering too aggressive

### Key Metrics

| Metric | Current | Target | Gap | Status |
|--------|---------|--------|-----|--------|
| Stage 2 Precision | 86.7% | 85% | +1.7% | ✅ |
| Stage 2 Recall | 71.1% | 80% | -8.9% | ❌ |
| Stage 2 F1 | ~78% | 82% | -4% | ❌ |

---

## 📚 Required Reading (15 minutes)

**MUST READ** before coding:

1. **`ARES_PROGRESS_SUMMARY.md`** (5 min)
   - Executive summary
   - Current status
   - Recommended solution

2. **`ares-status-report.md`** (5 min)
   - Root cause analysis
   - Precision/recall tradeoff explanation
   - Example of over-filtering

3. **`ares-improvement-plan.md`** (5 min)
   - Implementation details for Option A (proximity-window)
   - Expected impact
   - Testing strategy

---

## 🎯 Your Mission: Fix Recall Gap

### Problem Statement

**Current filtering** (commit 9a23388):
```typescript
// Suppresses if married_to exists ANYWHERE in document
if (marriedToRelations.has(`${rel.subj}:${rel.obj}`)) {
  return false;  // Always suppress
}
```

**Result**: Over-aggressive filtering suppresses valid relations in distant contexts

**Example**:
```
Paragraph 1: "Aragorn married Arwen"
Paragraph 5: "Aragorn, son of Arathorn, was a ranger"

Current: ❌ Suppresses parent_of(Arathorn, Aragorn)
Desired: ✅ Keep it - different context
```

### Solution: Proximity-Window Filtering

**Concept**: Only suppress if `married_to` within ±2 sentences

**Expected Impact**:
- Precision: ~85-86% (slight drop, still above target)
- Recall: ~78-79% (+7-8% improvement)
- F1: ~81-82% (meets target)

---

## 🔧 Implementation Instructions

### Step 1: Understand Current Code (15 min)

**Key File**: `/home/user/ARES/app/engine/extract/orchestrator.ts`

**Locate these sections** (around lines 575-625):

1. **Main relations filtering** (~line 575-595)
2. **Coref relations filtering** (~line 597-613)
3. **Narrative relations filtering** (~line 614-630)

**Current filtering logic**:
```typescript
// Step 3: Filter coref-enhanced relations with document-level matching
const filteredCorefRelations = corefRelations.filter(rel => {
  if ((rel.pred === 'parent_of' || rel.pred === 'child_of') &&
      marriedToRelations.has(`${rel.subj}:${rel.obj}`)) {
    
    // Document-level: Always suppress
    const subj = allEntities.find(e => e.id === rel.subj);
    const obj = allEntities.find(e => e.id === rel.obj);
    console.log(`[COREF-FILTER] Suppressing ${rel.pred}: ${subj?.canonical} -> ${obj?.canonical}`);
    return false;  // ← THIS IS THE PROBLEM
  }
  return true;
});
```

### Step 2: Implement Proximity Helper Function (20 min)

**Add this function** before the filtering sections (~line 560):

```typescript
/**
 * Check if a relation has married_to conflict within proximity window
 * @param rel - The relation to check
 * @param marriedToRelations - Set of married pairs "subjId:objId"
 * @param marriedToSentences - Map of pair -> Set of sentence indices with married_to
 * @param proximityWindow - Number of sentences to check before/after (default: 2)
 * @returns true if married_to exists within window
 */
function hasMarriedToInProximity(
  rel: Relation,
  marriedToRelations: Set<string>,
  marriedToSentences: Map<string, Set<number>>,
  proximityWindow: number = 2
): boolean {
  // Check if this pair has married_to at all
  const key = `${rel.subj}:${rel.obj}`;
  if (!marriedToRelations.has(key)) {
    return false;  // No married_to for this pair
  }

  // Get sentence indices for this relation
  const relationSentences = new Set(rel.evidence.map(e => e.sentence_index));
  
  // Get sentence indices where married_to appears for this pair
  const marriedSentences = marriedToSentences.get(key);
  if (!marriedSentences) {
    return false;
  }

  // Check if any relation sentence has married_to within proximity window
  for (const sentIdx of relationSentences) {
    // Check sentences in window: [sentIdx - window, sentIdx + window]
    for (let offset = -proximityWindow; offset <= proximityWindow; offset++) {
      const checkIdx = sentIdx + offset;
      if (marriedSentences.has(checkIdx)) {
        return true;  // Conflict found within proximity
      }
    }
  }

  return false;  // No conflict within proximity
}
```

### Step 3: Update Filtering Logic (30 min)

**Replace the document-level filtering** with proximity-based filtering:

**BEFORE** (lines ~597-613):
```typescript
const filteredCorefRelations = corefRelations.filter(rel => {
  if ((rel.pred === 'parent_of' || rel.pred === 'child_of') &&
      marriedToRelations.has(`${rel.subj}:${rel.obj}`)) {
    
    // Document-level filtering
    const subj = allEntities.find(e => e.id === rel.subj);
    const obj = allEntities.find(e => e.id === rel.obj);
    console.log(`[COREF-FILTER] Suppressing ${rel.pred}: ${subj?.canonical} -> ${obj?.canonical} (married_to exists)`);
    return false;
  }
  return true;
});
```

**AFTER**:
```typescript
const filteredCorefRelations = corefRelations.filter(rel => {
  if ((rel.pred === 'parent_of' || rel.pred === 'child_of') &&
      hasMarriedToInProximity(rel, marriedToRelations, marriedToSentences, 2)) {
    
    // Proximity-based filtering: Only suppress if married_to within ±2 sentences
    const subj = allEntities.find(e => e.id === rel.subj);
    const obj = allEntities.find(e => e.id === rel.obj);
    console.log(`[COREF-FILTER] Suppressing ${rel.pred}: ${subj?.canonical} -> ${obj?.canonical} (married_to in proximity)`);
    return false;
  }
  return true;
});
```

**Do the same for narrative relations** (~lines 614-630):

```typescript
const filteredNarrativeRelations = narrativeRelations.filter(rel => {
  if ((rel.pred === 'parent_of' || rel.pred === 'child_of') &&
      hasMarriedToInProximity(rel, marriedToRelations, marriedToSentences, 2)) {
    
    const subj = allEntities.find(e => e.id === rel.subj);
    const obj = allEntities.find(e => e.id === rel.obj);
    console.log(`[NARRATIVE-FILTER] Suppressing ${rel.pred}: ${subj?.canonical} -> ${obj?.canonical} (married_to in proximity)`);
    return false;
  }
  return true;
});
```

### Step 4: Verify TypeScript Compiles (5 min)

```bash
# Check for compilation errors
npx tsc --noEmit

# Should output: no errors
```

---

## 🧪 Testing Instructions

### Phase 1: Quick Smoke Test (5 min)

```bash
# Run Stage 2 test
npm test tests/ladder/level-2-multisentence.spec.ts
```

**Check output for**:
- `avgRelationP` (precision) - Should be ~85-86%
- `avgRelationR` (recall) - Should be ~78-79% (IMPROVED from 71%)
- Test should PASS or be much closer to passing

### Phase 2: Full Test Suite (10 min)

```bash
# Run all tests
make test

# Check results
# Expected: 451+ passing, 16 or fewer failing
```

### Phase 3: Detailed Diagnostics (Optional - 10 min)

```bash
# Run detailed Stage 2 diagnostics
npx ts-node tests/ladder/run-level-2.ts

# Analyze output:
# - Which test cases improved?
# - Are there any new false positives?
# - What's the exact precision/recall/F1?
```

---

## ✅ Success Criteria

### Minimum Success (Required)
- ✅ Code compiles without errors
- ✅ Stage 2 recall improves from 71.1% to ≥75% (+3.9% minimum)
- ✅ Stage 2 precision stays ≥83% (slight drop acceptable)
- ✅ No new test failures introduced

### Target Success (Ideal)
- ✅ Stage 2 recall ≥78% (+6.9% from baseline)
- ✅ Stage 2 precision ≥85% (stays above target)
- ✅ Stage 2 F1 ≥81% (improves from 78%)
- ✅ Stage 2 test passes

### Excellent Success (Stretch)
- ✅ Stage 2 recall ≥80% (meets target)
- ✅ Stage 2 precision ≥85%
- ✅ Stage 2 F1 ≥82% (meets target)
- ✅ **Stage 2 test fully passes** ✓

---

## 🐛 Troubleshooting

### Issue: Recall didn't improve

**Check**:
1. Is `marriedToSentences` Map populated correctly?
2. Are sentence indices being tracked in evidence?
3. Is the proximity window too small? Try `window = 3`

**Debug**:
```typescript
// Add logging to see what's happening
console.log(`[DEBUG] marriedToSentences:`, marriedToSentences);
console.log(`[DEBUG] Checking rel at sentences:`, relationSentences);
console.log(`[DEBUG] Proximity result:`, hasMarriedToInProximity(...));
```

### Issue: Precision dropped too much

**Solution**: Tighten the window
```typescript
// Try window = 1 (same sentence only)
hasMarriedToInProximity(rel, marriedToRelations, marriedToSentences, 1)
```

### Issue: TypeScript errors

**Common issues**:
- Missing imports: Add `import type { Relation } from '../schema';`
- Type mismatches: Check that `sentence_index` exists in evidence
- Map type: Verify `marriedToSentences` is `Map<string, Set<number>>`

---

## 📤 Commit and Push

### When Ready to Commit

```bash
# Create feature branch
git checkout -b claude/fix-stage2-recall-proximity-filter-[SESSION_ID]

# Stage changes
git add app/engine/extract/orchestrator.ts

# Commit with descriptive message
git commit -m "fix: implement proximity-window filtering for Stage 2 recall improvement

Changed from document-level to proximity-based filtering (±2 sentences) for
parent_of/child_of conflicts with married_to relations.

Previous filtering was too aggressive, suppressing valid family relations in
distant contexts. New approach only suppresses conflicts when married_to
appears within ±2 sentences of the parent/child relation.

Implementation:
- Added hasMarriedToInProximity() helper function
- Updated coref relations filtering to use proximity check
- Updated narrative relations filtering to use proximity check
- Maintains main relations confidence-based filtering

Results:
- Stage 2 Recall: [OLD]% → [NEW]% (+[DELTA]%)
- Stage 2 Precision: [OLD]% → [NEW]%
- Stage 2 F1: [OLD]% → [NEW]%

Fixes Stage 2 recall gap while preserving precision improvements.
Test results: [PASS/FAIL]"

# Push to remote
git push -u origin claude/fix-stage2-recall-proximity-filter-[SESSION_ID]
```

### Commit Message Template

Fill in the bracketed values with actual test results:
- `[OLD]` and `[NEW]` with actual percentages
- `[DELTA]` with improvement
- `[PASS/FAIL]` with test status

---

## 📊 Expected Results

### Before (Current Main)
```
Stage 2: Multi-Sentence Narratives
├─ Relation Precision: 86.7% ✓
├─ Relation Recall: 71.1% ✗
└─ Relation F1: ~78% ✗
```

### After (With Proximity Filtering)
```
Stage 2: Multi-Sentence Narratives
├─ Relation Precision: ~85-86% ✓
├─ Relation Recall: ~78-79% ✓
└─ Relation F1: ~81-82% ✓
```

### Explanation of Trade-off

You'll likely see:
- Precision drops slightly (86.7% → 85-86%) because we're keeping more relations
- Recall improves significantly (71.1% → 78-79%) because we stop over-filtering
- F1 improves overall (~78% → ~81-82%) because recall gain > precision loss

This is the **sweet spot** - both metrics above target!

---

## 🎯 If You Get Stuck

### Can't find the code?
- Check you're on main branch: `git branch --show-current`
- Verify latest commit: `git log --oneline -1` should show `60c7377`
- File location: `app/engine/extract/orchestrator.ts`
- Search for: `[COREF-FILTER]` or `marriedToRelations`

### Not sure if it's working?
- Run tests: `npm test tests/ladder/level-2-multisentence.spec.ts`
- Look for recall number: should be >75%
- Check console logs: should say "in proximity" not "exists"

### Tests still failing?
- Try different window sizes: 1, 2, or 3 sentences
- Add debug logging to see what's being filtered
- Share test results and I'll help analyze

---

## 📁 Important Files Reference

### Implementation Files
- **`app/engine/extract/orchestrator.ts`** - Main file to modify (~lines 560-630)
- **`app/engine/narrative-relations.ts`** - No changes needed (for context only)
- **`app/engine/coref.ts`** - No changes needed (for context only)

### Test Files
- **`tests/ladder/level-2-multisentence.spec.ts`** - Stage 2 test suite
- **`tests/ladder/run-level-2.ts`** - Detailed diagnostics runner

### Documentation Files (Already Read)
- **`ARES_PROGRESS_SUMMARY.md`** - Executive summary
- **`ares-status-report.md`** - Detailed analysis
- **`ares-improvement-plan.md`** - Full technical plan
- **`INTEGRATED_TESTING_STRATEGY.md`** - Testing ladder overview

---

## 🚀 Ready to Code!

You have:
- ✅ Latest code from main branch
- ✅ Clear problem statement
- ✅ Detailed implementation plan
- ✅ Testing instructions
- ✅ Success criteria
- ✅ Troubleshooting guide

**Estimated Time**: 2-3 hours total
- Reading/setup: 30 min
- Implementation: 1 hour
- Testing/validation: 30 min
- Commit/document: 30 min

**Confidence**: HIGH - Clear path, low risk, easy to validate

**Go fix that recall gap!** 🎯
