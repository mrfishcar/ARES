# Level 4 Strategy: Division of Labor

**Date**: November 20, 2025
**Status**: Ready for Haiku implementation

---

## Your Question Answered

> "At what point do we build the 6 filter types?"

**Answer**: Build **NOW** for #1 and #2. Defer the rest.

---

## Build NOW (Critical Blockers) ⚡

### 1. Lexical Sanity Filter
**Status**: ✅ Partially exists, needs enhancement
**File**: `entity-quality-filter.ts`
**What to add**:
- Reject role-based names ("young man", "the messenger")
- Expand blocked tokens list
**Impact**: Prevents generic terms from becoming entities
**Time**: ~30 min

### 2. Multi-Token Classifier
**Status**: ❌ Doesn't exist
**File**: `entity-quality-filter.ts`
**What to add**:
- Detect "two first names" pattern (e.g., "Elimelech Naomi")
- Use surname detection heuristics
- Reject PERSON entities that are two first names mashed together
**Impact**: **Unlocks 2 of 3 failing tests** ⭐
**Time**: ~45 min

**Why now?** These solve the #1 blocking issue preventing Level 4 completion.

---

## Defer (Not Blocking) ⏸️

### 3. Biblical/Ancient Domain Dictionary
**Status**: Working ad-hoc (Moab whitelisted)
**Why defer**: No evidence of widespread place name issues
**When to build**: If you see systematic failures with biblical place names

### 4. Role/Titles Override System
**Status**: Not needed yet
**Why defer**: No evidence of role misclassification
**When to build**: If "Master", "Messenger" get extracted as PERSON (filter #1 handles this)

### 5. Entity Type Re-Evaluator
**Status**: Helpful but not critical
**Why defer**: Quality issue, not a test blocker
**Example**: "Ephrathites of Bethlehem-judah" should be ORG/TRIBE, not PERSON
**When to build**: After Level 4 passes, as quality improvement

### 6. Deductive Override Rules
**Status**: Interesting but not urgent
**Why defer**: No concrete test failures requiring this
**Examples**: "said X" → PERSON, "God of X" → ORG, "X-ites" → TRIBE
**When to build**: If you see systematic extraction failures needing contextual rules

---

## What I (Sonnet) Did

### Architectural Analysis ✅
- Read entity-quality-filter.ts (existing filter framework)
- Read schema.ts (Entity structure)
- Read parse-types.ts (Token structure)
- Analyzed test failures (identified "Elimelech Naomi" as blocker)
- Designed name-based filtering strategy (no token access needed)

### Strategic Design ✅
- Identified that filters #1 and #2 solve the critical path
- Designed surname detection algorithm (distinguish "Harry Potter" from "Elimelech Naomi")
- Designed role-name detection (reject "young man", "the messenger")
- Mapped integration points in existing code

### Prompt Engineering ✅
- Created `/LEVEL_4_ENTITY_FILTERS_PROMPT.md` (comprehensive implementation guide)
- Includes exact code snippets
- Includes test commands
- Includes validation checklist
- Includes debug strategies

---

## What Haiku Will Do

### Implementation (~90 min) 🔨

**File**: `/Users/corygilford/ares/app/engine/entity-quality-filter.ts`

**Tasks**:
1. Add 3 helper functions (surname detection, two-first-names detection, role detection)
2. Integrate filters into `filterLowQualityEntities` function
3. Update stats tracking to count filter hits
4. Compile TypeScript
5. Test incrementally with debug logging
6. Validate against Level 4 tests

**Expected Outcome**:
- "Elimelech Naomi" → REJECTED
- "Elimelech" → extracted separately
- "Naomi" → extracted separately
- Archaic relation patterns (already added) can now work
- **2 more tests pass** (family members + family relationships)

---

## Why This Division Works

### Sonnet's Strengths (Architecture)
- Deep analysis of existing code structure
- Understanding integration points
- Strategic prioritization (which filters matter most)
- Designing algorithms that fit existing patterns
- Risk assessment (what breaks, what doesn't)

### Haiku's Strengths (Implementation)
- Surgical code changes (proven in Level 3)
- Iterative testing and refinement
- Pattern matching and threshold tuning
- Debug log analysis
- Quick compile-test-fix cycles

---

## Success Metrics

### Current State
```
Level 4 Tests: 4 of 7 passing (57%)

Failing:
❌ should extract dates from real literature (DATE pipeline issue)
❌ should extract family members from Ruth (entity separation issue)
❌ should extract family relationships (blocked by entity separation)
```

### After Haiku's Work
```
Level 4 Tests: 6 of 7 passing (86%)

Passing:
✅ should extract family members from Ruth  ⭐ FIXED
✅ should extract family relationships      ⭐ FIXED

Still Failing:
❌ should extract dates from real literature (separate task - DATE storage debugging)
```

---

## What Happens Next

### Immediate (After Haiku Completes)
1. Validate Level 4 at 86% (6 of 7 tests)
2. Run full test ladder (ensure no regression in L1-L3)
3. Document Haiku's filter implementation

### Short-Term (DATE Issue)
The remaining test failure is a **different** issue:
- DATE entities extracted correctly
- DATE entities filtered correctly
- DATE entities **lost in storage/aggregation pipeline**
- Requires pipeline debugging, not filtering

### Medium-Term (Quality Improvements)
Once Level 4 is passing:
- Consider filter #5 (entity type re-evaluator) for quality
- Consider filter #3 (biblical dictionary) if more place names fail
- Monitor precision/recall metrics on broader corpus

---

## The Prompt

**File**: `/Users/corygilford/ares/LEVEL_4_ENTITY_FILTERS_PROMPT.md`

**Contents**:
- Problem statement with exact test failures
- Root cause analysis
- Filter algorithms (with code snippets)
- Step-by-step implementation guide
- Test commands and validation checklist
- Expected results
- Debug strategies

**Ready for**: Haiku session to start immediately

---

## Key Insight

The filters you listed are excellent long-term tools, but **not all are critical for Level 4**.

**Critical now**: #1 (lexical sanity) + #2 (multi-token classifier)
**Nice to have**: #5 (entity type re-evaluator)
**Future**: #3, #4, #6 (when you see concrete failures needing them)

This follows the **Level 3 success pattern**:
- Identify the minimal fix that unlocks tests
- Implement surgically
- Don't over-engineer
- Iterate when needed

---

**Bottom line**: Haiku can implement filters #1 and #2 in ~90 minutes and unlock 2 failing tests. The other filters are strategic reserves for when you encounter specific failures that need them.
