# Ladder Test Improvement Report

## Executive Summary

**Mission:** Systematically fix entity and relation extraction to achieve 100% on long-form texts.

**Results:**
- ✅ **Level 1:** ACHIEVED 90% relation precision target (20/20 tests passing)
- ⚠️ **Level 2:** 80% relation precision (need 85% - gap: 5%)
- ⚠️ **Level 3:** 69% relation precision (need 80% - gap: 11%)

---

## Level 1: Simple Sentences ✅ PASSED

**Target:** P≥90%, R≥85%, F1≥87%
**Achieved:** P=90.0%, R=90.0%, F1=90.0%

### Fixes Applied (4 systematic improvements):

#### 1. Allow Traveling to Organizations
**File:** `app/engine/schema.ts`
**Change:** Added 'ORG' to `traveled_to` object types
**Fixes:** "Hermione went to Hogwarts" where Hogwarts is ORG, not PLACE

```typescript
// Before:
traveled_to: { subj: ['PERSON', 'ORG'], obj: ['PLACE'] },

// After:
traveled_to: { subj: ['PERSON', 'ORG'], obj: ['PLACE', 'ORG'] },
```

#### 2. Extract Fantasy/Sci-Fi Dates
**File:** `app/engine/extract/entities.ts`
**Change:** Extended year pattern to match 3000-9999
**Fixes:** "in 3019" dates in fantasy narratives

```typescript
// Before: Only 1600-2099
const yearPattern = /\b(1[6-9]\d{2}|20\d{2})\b/g;

// After: Includes 3000-9999
const yearPattern = /\b(1[6-9]\d{2}|20\d{2}|[3-9]\d{3})\b/g;
```

#### 3. Classify "Battle of X" as EVENT
**File:** `app/engine/extract/entities.ts`
**Change:** Improved event detection for battle/war/conflict keywords
**Fixes:** "Battle of Pelennor Fields" misclassified as PERSON

```typescript
// Before: Only checked WORK type
if (type === "WORK" && /\b(battle|war|conflict|siege|skirmish|fight)\b/i.test(text)) {
  return "EVENT";
}

// After: Checks PERSON and WORK types
if (/\b(battle|war|conflict|siege|skirmish|fight)\b/i.test(text)) {
  if (type === "WORK" || type === "PERSON") {
    return "EVENT";
  }
}
```

#### 4. Add "fought_in" Dependency Pattern
**File:** `app/engine/extract/relations/dependency-paths.ts`
**Change:** New pattern for combat participation
**Fixes:** "Eowyn fought in the Battle of Pelennor Fields"

```typescript
// Pattern: X:↑nsubj:fight:↓prep:in:↓pobj:Y
{ signature: /^(\w+):↑nsubj:fight:↓prep:in:↓pobj:(\w+)$/, predicate: 'fought_in', subjectFirst: true }
```

### Test Results Before/After:

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Entity Precision | 97.5% | 97.5% | — |
| Entity Recall | 94.2% | 94.2% | — |
| **Relation Precision** | **85%** | **90%** | **+5%** ✅ |
| **Relation Recall** | **85%** | **90%** | **+5%** ✅ |
| Failed Tests | 4/20 | 0/20 | -4 ✅ |

---

## Level 2: Multi-Sentence Narratives ⚠️ PARTIAL

**Target:** P≥85%, R≥80%, F1≥82%
**Current:** P=80%, R=?, F1=?
**Gap:** 5% precision shortfall

### What's Working ✅

Spot-checked these patterns and confirmed they work:

1. **Pronoun + Deictic Resolution:**
   - "Harry went to Hogwarts. He studied magic there."
   - ✅ Extracts: `traveled_to` and `studies_at` (with "there" → Hogwarts)

2. **Coordination:**
   - "Harry and Ron studied at Hogwarts."
   - ✅ Extracts relations for both Harry and Ron

3. **Title Back-links:**
   - "Dumbledore is a wizard. The wizard teaches at Hogwarts."
   - ✅ Resolves "the wizard" → Dumbledore

### Additional Improvements Applied:

#### 1. Add "dwell" Verb to lives_in
**File:** `app/engine/extract/relations/dependency-paths.ts`

```typescript
// Before:
{ signature: /^(\w+):↑nsubj:(live|reside):↓prep:in:↓pobj:(\w+)$/, predicate: 'lives_in' }

// After:
{ signature: /^(\w+):↑nsubj:(live|reside|dwell):↓prep:in:↓pobj:(\w+)$/, predicate: 'lives_in' }
```

#### 2. Add Governance Dependency Pattern
**File:** `app/engine/extract/relations/dependency-paths.ts`

```typescript
// Pattern: X ruled/reigned/governed Y
{ signature: /^(\w+):↑nsubj:(rule|reign|govern):↓(dobj|obj):(\w+)$/, predicate: 'rules' }
```

### Why Still at 80%?

**Hypothesis:** False positives rather than missing patterns

Since core pronoun resolution, coordination, and deictic patterns work, the 5% precision gap likely comes from:

1. **Over-broad fallback patterns** creating spurious relations
2. **Coreference errors** where pronouns resolve to wrong entities in complex narratives
3. **Coordination edge cases** extracting relations when they shouldn't

**Unable to diagnose specifically** due to:
- Vitest suppressing console output in test runs
- Test execution timeouts preventing full diagnostic runs
- Need for more granular logging infrastructure

---

## Level 3: Complex Multi-Paragraph Narratives ⚠️ NEEDS WORK

**Target:** P≥80%, R≥75%, F1≥77%
**Current:** P=69%, R=?, F1=?
**Gap:** 11% precision shortfall

### Challenge:

Level 3 involves complex Harry Potter narratives with:
- Long coreference chains across paragraphs
- Multiple entity mentions and pronoun types
- Complex narrative structures

### Issues:

Similar to Level 2 but amplified:
1. **Longer coreference chains** increase error propagation
2. **More entities** increase chance of pronoun misresolution
3. **Paragraph boundaries** may break some coreference logic

**Diagnostic limitation:** Could not run full Level 3 diagnostics to identify specific failure patterns.

---

## Top 5 Failure Patterns Identified

Based on analysis and testing:

### 1. ✅ FIXED: Traveling to Organizations
- **Pattern:** "X went to Y" where Y is ORG (like Hogwarts)
- **Issue:** Type guard only allowed PLACE
- **Fix:** Added ORG to traveled_to obj types

### 2. ✅ FIXED: Fantasy Dates
- **Pattern:** Years outside 1600-2099 (e.g., "3019")
- **Issue:** Regex pattern too restrictive
- **Fix:** Extended to 3000-9999

### 3. ✅ FIXED: Event Classification
- **Pattern:** "Battle of X" recognized as PERSON
- **Issue:** Battle keyword only checked WORK type
- **Fix:** Also check PERSON type for battle/war/conflict

### 4. ✅ FIXED: Combat Participation
- **Pattern:** "X fought in Y"
- **Issue:** No dependency pattern for this structure
- **Fix:** Added fought_in dependency pattern

### 5. ⚠️ UNRESOLVED: Multi-sentence False Positives
- **Pattern:** Unknown (diagnostics incomplete)
- **Issue:** ~5-11% precision gap in L2/L3
- **Hypothesis:** Over-broad fallback patterns or coreference errors

---

## Recommendations for Next Steps

### Short-term (to reach targets):

1. **Enhanced Diagnostics:**
   - Create custom test runner that bypasses vitest console suppression
   - Add detailed relation-level logging to show extraction provenance
   - Build per-test breakdown showing expected vs actual

2. **Precision Analysis:**
   - Run Level 2/3 tests with full output capture
   - Identify the 3-5 most common false positive patterns
   - Add filtering or tighten overly broad patterns

3. **Coreference Debugging:**
   - Check pronoun resolution in complex cases
   - Verify deictic resolution across sentence boundaries
   - Test gender-based pronoun matching

### Long-term (for production):

1. **Add Pattern Confidence Scores:**
   - Weight dependency patterns higher than regex patterns
   - Implement precision-based thresholding

2. **Improve Type Guards:**
   - Add semantic filtering beyond just entity types
   - Check for logical consistency (e.g., person can't live in abstract concept)

3. **Test Infrastructure:**
   - Build visualization tool for extraction results
   - Create regression test suite with known edge cases
   - Add performance benchmarks

---

## Files Modified

### Core Extraction:
- `app/engine/schema.ts` - Type guard updates
- `app/engine/extract/entities.ts` - Year patterns, event classification
- `app/engine/extract/relations/dependency-paths.ts` - New patterns (fought_in, rules, dwell)

### Test/Debug (not committed):
- Various diagnostic scripts created for debugging
- Test output captured for analysis

---

## Summary

**Achievements:**
- ✅ Level 1 fully passing (90% precision achieved)
- ✅ 4 systematic fixes applied and documented
- ✅ Additional robustness improvements for L2/L3

**Remaining Gaps:**
- ⚠️ Level 2: 5% precision gap (80% vs 85% target)
- ⚠️ Level 3: 11% precision gap (69% vs 80% target)

**Root Cause:**
- Likely false positives from over-broad patterns or coreference errors
- Need better diagnostic infrastructure to identify specific failures

**Next Actions:**
- Build custom test runner with full output
- Analyze false positive patterns
- Tighten overly broad fallback patterns

The system is production-ready for simple sentences and shows strong performance on core patterns. Multi-sentence narratives need targeted precision improvements.
