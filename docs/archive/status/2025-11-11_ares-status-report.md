---
archived: true
archived_date: 2025-11-13
replaced_by: /docs/STATUS.md
reason: Consolidated into STATUS.md during Week 2 cleanup - outdated test metrics
original_date: 2025-11-11
---

# ARES Project Status Report
**Date**: 2025-11-11
**Branch**: main (commit 2d1d98a)

## Current Test Results

### Stage 2: Multi-Sentence Narratives
- **Precision**: 86.7% ✅ (target: 85%) - **EXCEEDED by +1.7%**
- **Recall**: 71.1% ❌ (target: 80%) - **Missing -8.9%**
- **F1**: ~78% (target: 82%)
- **Status**: ⚠️ **PARTIAL SUCCESS** - Precision target met, but recall dropped

### Stage 3: Complex Narratives  
- **Entity Precision**: 74.4% (target: 80%)
- **Status**: ❌ **FAILING** - Still 5.6% gap

### Overall Test Suite
- 451 passing / 16 failing / 47 skipped (514 total)
- Stage 1: ✅ Passing (90% precision)
- Stage 2: ⚠️ Precision passed, Recall failed
- Stage 3: ❌ Failing

## What Changed (PR #12)

### Precision Improvements (Good)
Added three-layer conflict resolution to suppress false positive parent_of/child_of:

1. **Main relations**: Confidence-based filtering (>0.75 threshold)
2. **Coref relations**: Document-level married_to conflict detection
3. **Narrative relations**: Document-level married_to conflict detection

**Impact**: Precision improved from ~79% → 86.7% (+7.7%)

### Recall Drop (Bad)
Changed from sentence-level to document-level filtering:

**BEFORE** (commit 39b9b7b):
```typescript
// Only suppress if married_to in SAME SENTENCE
const hasConflictInSameSentence = marriedSentences &&
  Array.from(relationSentences).some(s => marriedSentences.has(s));
```

**AFTER** (commit 9a23388):
```typescript
// Suppress if married_to exists ANYWHERE in document
if (marriedToRelations.has(`${rel.subj}:${rel.obj}`)) {
  return false;  // Always suppress
}
```

**Problem**: This is too aggressive!
- If "Aragorn married Arwen" appears in paragraph 1
- Then "Aragorn, son of Arathorn" in paragraph 5 gets suppressed
- Even though they're unrelated contexts

**Impact**: Recall dropped from ~80% → 71.1% (-8.9%)

## The Precision/Recall Dilemma

```
Metric        | Before | After  | Target | Status
--------------|--------|--------|--------|--------
Precision     | 79%    | 86.7%  | 85%    | ✅ +1.7%
Recall        | 80%    | 71.1%  | 80%    | ❌ -8.9%
F1 Score      | 79.5%  | 78.0%  | 82%    | ❌ Regressed
```

**Analysis**: We traded recall for precision, but F1 got worse!
- Gained 7.7% precision
- Lost 8.9% recall
- Net result: -1.5% F1 score

## Root Cause

**The filtering is context-blind:**
1. ✅ GOOD: Suppress `parent_of(Aragorn, Arwen)` if `married_to(Aragorn, Arwen)` in same sentence
2. ❌ BAD: Suppress `parent_of(Arathorn, Aragorn)` just because `married_to(Aragorn, Arwen)` exists somewhere

**The fix was targeted at Test 2.4** (Aragorn/Arwen married couple being misclassified as parent/child) but it's now over-filtering valid relations in unrelated contexts.

