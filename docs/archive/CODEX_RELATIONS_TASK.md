# Task for Codex: Fix Level 1 Relation Precision

**Date**: 2025-11-16
**Status**: Entities ✅ PASSING | Relations ❌ FAILING
**Your Mission**: Improve relation precision from 82.5% → ≥90%

---

## 🎯 Current Situation

**Level 1 Test Results**:
- Entity Precision: 92.5% ✅ (target: ≥90%)
- Entity Recall: 92.5% ✅ (target: ≥85%)
- **Relation Precision: 82.5%** ❌ (target: ≥90%) - **7.5% gap**
- **Relation Recall: 82.5%** ❌ (target: ≥85%) - **2.5% gap**

**Gap Analysis**:
- Need to reduce false positives by ~7.5% (precision)
- Need to add missing relations by ~2.5% (recall)

---

## 📋 Your Tasks (Execute in Order)

### Task 1: Identify Failing Tests (15 min)

**Run this command**:
```bash
npx vitest run tests/ladder/level-1-simple.spec.ts 2>&1 | tee /tmp/relation_failures.log
```

**Extract failure details**:
```bash
grep -E "❌ Test [0-9.]+|Gold relations:|Extracted relations:" /tmp/relation_failures.log > /tmp/relation_errors.txt
cat /tmp/relation_errors.txt
```

**Create a summary file** at `/tmp/relation_analysis.md` with:
- Which tests are failing on relations (test numbers)
- For each failing test:
  - Input text
  - Expected relations (gold standard)
  - Actual relations extracted
  - Error type: False Positive (FP) or False Negative (FN)

**Example format**:
```markdown
## Test 1.3 FAIL
Text: "Gandalf traveled to Rivendell."
Gold: gandalf::traveled_to::rivendell
Extracted: gandalf::went::rivendell
Error: Wrong predicate (traveled_to vs went)
Type: FP (extracted wrong pred) + FN (missing correct pred)

## Test 1.5 PASS
(no issues)
```

---

### Task 2: Categorize Errors (10 min)

**Analyze `/tmp/relation_analysis.md` and group errors**:

Create `/tmp/error_categories.md`:

```markdown
## False Positives (Relations that shouldn't exist)

### Category: Wrong Predicate
- Test X.X: Expected "traveled_to", got "went"
- Test X.X: Expected "ruled", got "was_king_of"
Count: X tests

### Category: Wrong Subject/Object
- Test X.X: Linked wrong entities
Count: X tests

### Category: Hallucinated Relations
- Test X.X: Extracted relation not in gold standard
Count: X tests

## False Negatives (Missing Relations)

### Category: Missed Simple Relations
- Test X.X: "X ruled Y" → missed "ruled" relation
Count: X tests

### Category: Complex Syntax
- Test X.X: Passive voice, subordinate clauses
Count: X tests
```

**Provide counts**:
- Total FP errors: __
- Total FN errors: __
- Most common error category: __

---

### Task 3: Find Root Cause Patterns (20 min)

For the **most common error category** from Task 2:

**Investigate the code**:

1. **Relation extraction files**:
   - `/Users/corygilford/ares/app/engine/extract/relations.ts`
   - `/Users/corygilford/ares/app/engine/patterns/narrative-relations.ts`

2. **Look for**:
   - Pattern matching logic
   - Predicate normalization
   - Entity linking logic
   - Confidence thresholds

3. **Create** `/tmp/root_cause.md`:
```markdown
## Root Cause Analysis

**Error Category**: [most common from Task 2]

**Code Location**: `file.ts:line`

**Current Logic**:
```typescript
// Paste the relevant code snippet
```

**Problem**:
[Why this is causing the error]

**Hypothesis**:
[What change might fix it]

**Test Case**:
Text: "..."
Expected: ...
Current: ...
```

---

### Task 4: Propose Fixes (15 min)

Based on Task 3 analysis, create `/tmp/proposed_fixes.md`:

```markdown
## Fix Proposal

### Fix #1: [Name of fix]

**Problem**: [Brief description]

**Solution**: [Specific code change]

**Files to modify**:
- `file.ts:line-range`

**Estimated Impact**: Should fix X tests (~Y% improvement)

**Code Change**:
```typescript
// Before:
[current code]

// After:
[proposed code]
```

### Fix #2: [If multiple issues found]
...
```

**Priority ranking**:
1. [Fix with highest estimated impact]
2. [Next highest]
3. [...]

---

### Task 5: Implement Top Fix (20 min)

Implement **Fix #1** from Task 4:

1. **Make the code change**
2. **Run tests**:
   ```bash
   npx vitest run tests/ladder/level-1-simple.spec.ts > /tmp/after_fix1.log 2>&1
   ```
3. **Compare results**:
   ```bash
   tail -30 /tmp/after_fix1.log | grep -A10 "Relations:"
   ```

4. **Report**:
   Create `/tmp/fix1_results.md`:
   ```markdown
   ## Fix #1 Results

   **Change Made**: [description]

   **Before**:
   - Relation P: 82.5%
   - Relation R: 82.5%

   **After**:
   - Relation P: ___%
   - Relation R: ___%

   **Impact**: [+X% or -X%]

   **Tests Fixed**: [list test numbers that now pass]
   **Tests Broken**: [list any regressions]

   **Next Step**: [Implement Fix #2 | Investigate new issues | etc.]
   ```

---

## 📊 Success Criteria

You've succeeded when:

1. ✅ All 5 tasks completed
2. ✅ Relation precision ≥90%
3. ✅ Relation recall ≥85%
4. ✅ No entity regressions (still ≥92%)

**If not at 90% after Fix #1**:
- Iterate through Fix #2, #3, etc.
- Update analysis with new test results
- Continue until threshold met

---

## 🚨 Important Notes

- **Don't break entities**: Verify entity metrics stay ≥92% after each change
- **Test frequently**: Run full test after each code change
- **Document everything**: Keep analysis files updated
- **Ask if stuck**: If root cause unclear after 30min, report findings and ask for guidance

---

## 📁 Deliverables

At completion, provide:
1. `/tmp/relation_analysis.md` - Full test failure breakdown
2. `/tmp/error_categories.md` - Categorized errors with counts
3. `/tmp/root_cause.md` - Root cause analysis
4. `/tmp/proposed_fixes.md` - Ranked fix proposals
5. `/tmp/fix1_results.md` (and fix2, fix3, etc. as needed)
6. **Final test results** showing relations ≥90%

---

**Start with Task 1 and report back with `/tmp/relation_analysis.md`**

Good luck! 🚀
