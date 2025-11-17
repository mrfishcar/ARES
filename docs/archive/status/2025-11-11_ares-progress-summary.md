---
archived: true
archived_date: 2025-11-13
replaced_by: /docs/STATUS.md
reason: Consolidated into STATUS.md - historical precision/recall tradeoff analysis
original_date: 2025-11-11
---

# ARES Project Progress Summary
**Date**: 2025-11-11
**Branch**: main (commit b3318f9)
**Session**: Merged Level 2/3 Test Fixes + Architectural Review
**Latest Update**: Integrated pronoun coreference fixes and entity filtering improvements

---

## 🎯 Executive Summary

**Achievement**: ✅ **Phase 2 Precision Target EXCEEDED** (86.7% vs 85% target)
**Challenge**: ❌ **Recall Below Target** (71.1% vs 80% target)
**Status**: ⚠️ **Precision/Recall Tradeoff** - Need to balance both metrics

### Latest Update (Commit b3318f9)

**Merged**: fix/level-2-test-failures branch → main

**New Fixes Integrated:**
1. ✅ **Pronoun Coreference Fix** - Prevents "he/she" from resolving to PLACE entities (app/engine/extract/coreference.ts:84-91)
2. ✅ **Entity Filter Enhancements** - Added fantasy/magical term blocklist (app/engine/entity-filter.ts:100-103)
3. ✅ **Deictic Resolution Module** - New module for "there/here" resolution (app/engine/extract/deictic-resolution.ts)
4. 📄 **Documentation** - SESSION_FINDINGS.md and LEVEL2_FIXES_SUMMARY.md

**Impact on Test Ladder:**
- Level 2: ✅ PASSING (all tests)
- Level 3 Entities: ✅ PASSING (P: 92.5%, R: 86.4%, F1: 89.3%)
- Level 3 Relations: ❌ FAILING (P: 56.7%, R: 33.6%, F1: 42.2%)

**Root Cause Identified**: Relation deduplication too aggressive (77.8% removal rate)

### Key Metrics (Stage 2 - Different from Level 2)

| Metric | Current | Target | Status | Gap |
|--------|---------|--------|--------|-----|
| **Stage 2 Precision** | 86.7% | 85% | ✅ EXCEEDED | +1.7% |
| **Stage 2 Recall** | 71.1% | 80% | ❌ BELOW | -8.9% |
| **Stage 2 F1** | ~78% | 82% | ❌ BELOW | -4% |
| **Stage 3 Entity P** | 74.4% | 80% | ❌ BELOW | -5.6% |

**Note:** "Stage 2" (narrative relation extraction) is different from "Level 2" (test ladder). Both need attention.

---

## 📊 What Was Achieved (PR #12)

### ✅ Successes

1. **Precision Target Met**: 86.7% (exceeded 85% target by 1.7%)
2. **False Positive Reduction**: Implemented three-layer conflict resolution
3. **Test Case Fixed**: Test 2.4 (Aragorn/Arwen misclassification) resolved
4. **Infrastructure**: Robust filtering system in place

### ⚠️ Tradeoffs

1. **Recall Dropped**: 80% → 71.1% (-8.9%)
2. **F1 Score Regressed**: ~79.5% → 78% (-1.5%)
3. **Over-filtering**: Valid relations suppressed in distant contexts

---

## 🔍 Root Cause Analysis

### The Filtering Evolution

**Commit 39b9b7b** (Sentence-level filtering):
```typescript
// Only suppress if married_to in SAME SENTENCE
const hasConflictInSameSentence = marriedSentences &&
  Array.from(relationSentences).some(s => marriedSentences.has(s));
```
- **Result**: Precision ~79%, Recall ~80%
- **Issue**: Still had some false positives

**Commit 9a23388** (Document-level filtering):
```typescript
// Suppress if married_to exists ANYWHERE in document
if (marriedToRelations.has(`${rel.subj}:${rel.obj}`)) {
  return false;  // Always suppress
}
```
- **Result**: Precision 86.7%, Recall 71.1%
- **Issue**: TOO AGGRESSIVE - suppresses valid relations

### Example of Over-Filtering

```
Paragraph 1: "Aragorn married Arwen in Gondor."
Paragraph 5: "Aragorn, son of Arathorn, was a ranger."

Current behavior:
❌ Suppresses parent_of(Arathorn, Aragorn) because married_to(Aragorn, Arwen) exists

Desired behavior:
✅ Keep parent_of(Arathorn, Aragorn) - different context, different entity pair
```

---

## 🛠️ Recommended Solutions

### **Option A: Proximity-Window Filtering** (Recommended)

**Concept**: Only suppress if married_to within ±2 sentences

```typescript
function hasMarriedToInProximity(rel, marriedToSentences, window = 2) {
  for (const sentIdx of relationSentences) {
    for (let offset = -window; offset <= window; offset++) {
      if (marriedToSentences?.has(sentIdx + offset)) {
        return true;  // Suppress - conflict is nearby
      }
    }
  }
  return false;  // Keep - no nearby conflict
}
```

**Expected Impact**:
- Precision: ~85-86% (slight drop acceptable)
- Recall: ~78-79% (+7-8% improvement)
- F1: ~81-82% (meets target)

**Risk**: Low (easy to adjust window size)

### **Option B: Entity-Pair Analysis** (Alternative)

**Concept**: Only suppress if EXACT same entity pair in married_to

```typescript
// parent_of(Arathorn, Aragorn) OK even if married_to(Aragorn, Arwen)
// because Arathorn ≠ Arwen (different entities)
```

**Expected Impact**:
- Precision: ~84-85%
- Recall: ~79-80%
- F1: ~81-82%

**Risk**: Medium (more complex logic)

---

## 📅 Development Roadmap

### **Week 1: Fix Recall Gap** (Priority 1)

**Goal**: Get Stage 2 fully passing (both precision AND recall)

**Tasks**:
1. Implement proximity-window filtering (Option A)
2. Test on full Stage 2 ladder
3. Verify: Precision ≥85%, Recall ≥80%, F1 ≥82%
4. Commit and merge

**Success Criteria**: Stage 2 tests passing

### **Week 2: Pattern Quality & Coverage** (Priority 2)

**Goal**: Improve pattern reliability and coverage

**Tasks**:
1. Implement pattern confidence scoring
2. Integrate 25-30 high-quality patterns (40% coverage target)
3. Measure performance on test ladder

**Success Criteria**: 
- Pattern coverage ≥40%
- Stage 2 F1 ≥85%

### **Week 3: Entity Classification** (Priority 3)

**Goal**: Fix Stage 3 entity precision gap

**Tasks**:
1. Add place name gazetteer
2. Implement context-based type correction
3. Test on Stage 3 ladder

**Success Criteria**: Stage 3 entity precision ≥80%

---

## 📈 Progress Tracking

### Completed ✅
- Stage 1 passing (90% precision)
- Precision defense system implemented
- Document-level filtering working
- Test infrastructure complete
- **Pronoun coreference entity type filtering** (commit b3318f9)
- **Entity quality filter enhancements** (fantasy term blocklist)
- **Level 2 test ladder** - ALL TESTS PASSING
- **Level 3 entity extraction** - PASSING (92.5% P, 86.4% R, 89.3% F1)

### In Progress 🔄
- Balancing precision/recall (Stage 2 recall: 71.1% → 80% target)
- Pattern coverage expansion (26% → 40%)
- **Level 3 relation extraction fixes** (current: 56.7% P, 33.6% R - CRITICAL)

### Upcoming 📋
- Proximity-window filtering (Stage 2 recall improvement)
- Pattern confidence scoring
- **Fix relation deduplication** (currently removing 77.8% of relations)
- Full test ladder passing (Levels 1-5)

---

## 🎯 Next Steps

### Immediate (Priority 1 - Level 3 Relations)
1. **Fix relation deduplication logic** - Currently removing 77.8% of relations (too aggressive)
   - File: `app/engine/relation-deduplicator.ts`
   - Target: Keep valid unique relations, only remove true duplicates
   - Expected improvement: Recall 33.6% → 60%+

2. **Improve relation extraction patterns** for complex narratives
   - Add/improve patterns for "part_of" (house membership)
   - Review coordination patterns from recent merge
   - Test on Level 3 narratives

3. **Test Level 3 until passing** (Target: P≥80%, R≥75%, F1≥77%)

### Priority 2 (Stage 2 Recall)
4. **Implement proximity-window filtering** to restore Stage 2 recall
   - Replace document-level filtering with ±2 sentence window
   - Expected: Recall 71.1% → 78-79%

5. **Test on Stage 2 ladder** to verify both precision AND recall pass

### Short-Term (Next 2 Weeks)
6. **Add pattern confidence scoring** for better quality
7. **Integrate 25-30 high-quality patterns** to improve coverage (target: 40%)
8. **Push to GitHub** (commit b3318f9 currently local only)

### Long-Term (Month 1)
9. **Complete testing ladder** (all 5 levels)
10. **Production readiness** checks
11. **Performance optimization** (if needed)

---

## 📝 Key Insights

### What We Learned

1. **Precision vs Recall is Real**: Can't maximize both without smart tradeoffs
2. **Context Matters**: Document-level filtering is too broad
3. **Sentence Proximity Works**: Local context is key for conflict detection
4. **Metrics Tell the Story**: F1 regressed despite precision gain
5. **Infrastructure is Solid**: System is working, just needs tuning

### Best Practices Going Forward

1. **Always measure F1**: Don't optimize one metric at the expense of the other
2. **Test incrementally**: Small changes, immediate validation
3. **Use proximity, not global**: Context-aware filtering > blanket rules
4. **Track patterns**: Know which patterns are reliable
5. **Validate on full ladder**: Single test case fixes can hurt overall performance

---

## 🚀 Ready to Execute

**Confidence Level**: HIGH  
**Estimated Time**: 2-3 hours to implement and validate proximity-window filtering  
**Expected Outcome**: Stage 2 fully passing (precision AND recall)  
**Risk**: Low (can revert if needed)

The path forward is clear. Ready to proceed when you are! 🎯
