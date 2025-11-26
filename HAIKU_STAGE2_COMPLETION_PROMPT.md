# Haiku Agent: Complete Stage 2 Testing

**Date**: 2025-11-26
**Task**: Verify Stage 2 completion after merging critical fixes
**Branch**: `claude/review-claude-md-docs-012NtuxqVuaNfiGmfG9eKVVG`
**Status**: Stage 2 at 99% - blocked on test 2.12 (appositive parsing)

---

## Context

Three critical fixes have just been merged:
1. **Appositive subject resolution fix** - Should unblock test 2.12
2. **56 new relation patterns** - Employment and location relations
3. **Makefile improvements** - Offline parser installation

**Your job**: Run Stage 2 tests and verify we've achieved 100% completion.

---

## Task Checklist

### Step 1: Verify Parser is Running
```bash
# Check parser health
curl -s http://127.0.0.1:8000/health

# If not running, start it (Terminal 1 - keep running)
make parser
```

**Expected**: `{"status": "ok"}`

---

### Step 2: Run Stage 2 Tests

```bash
# Run multi-sentence extraction tests
npm test tests/ladder/level-2-multisentence.spec.ts
```

**Success Criteria**:
- ✅ All 15 test cases passing
- ✅ Precision ≥ 85%
- ✅ Recall ≥ 80%
- ✅ F1 ≥ 82%
- ✅ Test 2.12 specifically passes (appositive: "Aragorn, son of Arathorn, traveled to Gondor")

**Current Baseline**:
- Precision: 84.4% (need +0.6%)
- Recall: 80%
- F1: 82%
- Status: 14/15 passing (test 2.12 fails)

---

### Step 3: Verify Stage 1 Stability

```bash
# Ensure Stage 1 still passes
npm test tests/ladder/level-1-simple.spec.ts
```

**Success Criteria**:
- ✅ All 20 test cases passing
- ✅ Precision ≥ 90%
- ✅ Recall ≥ 85%

**This must remain stable** - we can't break lower stages while fixing higher ones.

---

### Step 4: Check Pattern Coverage

```bash
# Verify pattern coverage improved
npx ts-node scripts/pattern-expansion/inventory-patterns.ts
```

**Expected**:
- Previous: 26% (480/1827 patterns)
- Target: ≥30%
- With new patterns: ~30-32%

**Output Location**: `reports/rung1_pattern_coverage_summary.md`

---

### Step 5: Run Component Health Checks

```bash
# Synthetic baseline
npx tsx scripts/pattern-expansion/evaluate-coverage.ts

# Precision guardrails
npx tsx scripts/pattern-expansion/evaluate-coverage.ts --precision_guardrails
```

**Expected**:
- Baseline F1: ≥10% (currently 4.3%)
- Guardrails: Should show improvement vs baseline

---

## If Tests Fail

### Test 2.12 Still Failing?
**Problem**: "Aragorn, son of Arathorn, traveled to Gondor" extracts wrong subject

**Debug**:
```bash
# Run debug runner
npx ts-node tests/ladder/run-level-2.ts

# Check specific test
npx ts-node tests/ladder/test-2.12-only.ts

# Enable verbose logging
L3_DEBUG=1 npm test tests/ladder/level-2-multisentence.spec.ts -t "2.12"
```

**Check**:
- Is the appositive fix in `app/engine/extract/relations.ts:490-510`?
- Look for `resolveSubjectToken()` function
- Should have logic: `chosen.dep === 'appos' && chosen.head === direct.i ? direct : chosen`

---

### Stage 1 Broke?
**Problem**: Merges broke baseline tests

**Debug**:
```bash
# Run Stage 1 with debug
L3_DEBUG=1 npm test tests/ladder/level-1-simple.spec.ts

# Check which test failed
npx ts-node tests/ladder/run-level-1.ts
```

**Fix**: May need to revert one of the merges if it introduced regressions.

---

### Pattern Coverage Still Low?
**Problem**: Didn't reach 30%

**Check**:
```bash
# Verify patterns were added
wc -l patterns/new_surface_patterns.json

# Should see 56 new entries (1809 lines total)
```

---

## Success Report Format

When Stage 2 passes, report:

```
✅ STAGE 2 COMPLETE

Test Results:
- Level 2 Multi-Sentence: [X/15] passing
- Precision: [X]%
- Recall: [X]%
- F1: [X]%
- Test 2.12 Status: [PASS/FAIL]

Pattern Coverage: [X]% ([Y]/1827 patterns)

Stage 1 Stability: [PASS/FAIL]
- Level 1 Simple: [X/20] passing
- Precision: [X]%
- Recall: [X]%

Next Action: Update INTEGRATED_TESTING_STRATEGY.md to mark Stage 2 as COMPLETE ✅
Ready to advance to Stage 3.
```

---

## If Stage 2 Fails

Report:

```
⚠️ STAGE 2 INCOMPLETE

Failing Tests:
- Test 2.12: [PASS/FAIL] - [specific issue]
- Other failures: [list]

Metrics:
- Precision: [X]% (target: ≥85%)
- Recall: [X]% (target: ≥80%)
- F1: [X]% (target: ≥82%)

Root Cause: [your analysis]

Recommended Fix: [specific action needed]
```

---

## Critical Files

**Test Files**:
- `tests/ladder/level-2-multisentence.spec.ts` - Main test suite
- `tests/ladder/test-2.12-only.ts` - Focused test for blocker
- `tests/ladder/run-level-2.ts` - Debug runner

**Code Files**:
- `app/engine/extract/relations.ts` - Appositive fix (lines 490-510)
- `patterns/new_surface_patterns.json` - New patterns (56 added)
- `Makefile` - Parser installation improvements

**Documentation**:
- `INTEGRATED_TESTING_STRATEGY.md` - Testing ladder status
- `CLAUDE.md` - Project guide

---

## Important Notes

1. **Don't skip tests** - Run all 3 stages (2.1, 2.2, 2.3)
2. **Parser must be running** - Tests will fail with ECONNREFUSED if not
3. **Check Stage 1 stability** - Can't advance if we broke baseline
4. **Be thorough** - Report exact metrics, not just pass/fail

---

## Time Estimate

- Step 1 (Parser): 30 seconds
- Step 2 (Stage 2 tests): 2-3 minutes
- Step 3 (Stage 1 tests): 1-2 minutes
- Step 4 (Pattern coverage): 1 minute
- Step 5 (Component checks): 2-3 minutes

**Total**: ~7-10 minutes

---

## After Completion

If Stage 2 passes:
1. Update `INTEGRATED_TESTING_STRATEGY.md`:
   - Change "⚠️ 99% COMPLETE" → "✅ COMPLETE"
   - Update status table
   - Mark test 2.12 as passing
2. Commit documentation updates
3. Report success to user
4. Ready to begin Stage 3 planning

---

**Good luck! Focus on accuracy over speed. We need solid metrics to advance.**
