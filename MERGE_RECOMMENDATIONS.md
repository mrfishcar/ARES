# Merge Request Recommendations

**Date**: 2025-11-26
**Reviewer**: Claude Code
**Current Main**: d194ca8 (Merge pull request #33)
**Analysis**: 6 open Codex branches

---

## Executive Summary

**CRITICAL:** Branch `codex/run-focused-tests-and-adjust-dependencies` contains the fix for **Stage 2.12 blocker** (appositive parsing issue). This should be merged immediately to unblock Stage 2 completion.

**Recommendation**: Merge 3 branches immediately, 2 after conflict resolution, 1 needs review.

---

## Immediate Merge (High Priority) ✅

### 1. codex/run-focused-tests-and-adjust-dependencies 🔴 **CRITICAL**

**Status**: ✅ **MERGE NOW**

**Branch**: `origin/codex/run-focused-tests-and-adjust-dependencies`
**Commit**: 224c50f "Fix subject resolution for appositive subjects"
**Base**: 1074452 (behind main by ~4 commits)
**Files Changed**: 1 file, +6/-1 lines (`app/engine/extract/relations.ts`)

**Why Merge**:
- **Unblocks Stage 2**: Fixes test 2.12 appositive parsing issue
- **Complements existing fix**: Main has 7b732e3 which added `resolveAppositiveSubject()`, this improves `resolveSubjectToken()`
- **Targeted fix**: Only 6 lines changed, low risk
- **Critical path**: Stage 2 is 99% complete, blocked only on test 2.12

**What It Fixes**:
```typescript
// Problem: "Aragorn, son of Arathorn, traveled to Gondor"
// Was extracting: "Arathorn traveled_to Gondor" ❌
// Should extract: "Aragorn traveled_to Gondor" ✅
```

**Merge Command**:
```bash
git checkout main
git merge --no-ff origin/codex/run-focused-tests-and-adjust-dependencies -m "Merge: Fix appositive subject resolution for Stage 2.12"
```

**Expected Impact**: Stage 2.12 test passes → Stage 2 100% complete → Advance to Stage 3

---

### 2. codex/audit-and-add-patterns-for-coverage ✅ **HIGH VALUE**

**Status**: ✅ **MERGE AFTER #1**

**Branch**: `origin/codex/audit-and-add-patterns-for-coverage`
**Commit**: df5a97c "Add coverage patterns for employment and location relations"
**Base**: 1074452 (behind main by ~4 commits)
**Files Changed**: 4 files (+123/-65 lines)
- `patterns/new_surface_patterns.json` (+56 patterns)
- `reports/relation_coverage.json` (updated metrics)
- `reports/top_fn_fp.json` (updated metrics)
- `reports/uncovered_phrases.json` (updated metrics)

**Why Merge**:
- **Improves pattern coverage**: Adds 56 new surface patterns for employment/location relations
- **Aligns with Stage 1 goals**: Target is ≥30% coverage, currently at 26%
- **Foundation for Stage 3**: Stage 3 requires ≥50% pattern coverage
- **Low risk**: Patterns are additive, won't break existing functionality

**Merge Command**:
```bash
git checkout main
git merge --no-ff origin/codex/audit-and-add-patterns-for-coverage -m "Merge: Add 56 patterns for employment and location relations"
```

**Expected Impact**: Pattern coverage 26% → ~30-32%

---

### 3. codex/run-tests-and-capture-logs ✅ **LOW RISK**

**Status**: ✅ **MERGE AFTER #2**

**Branch**: `origin/codex/run-tests-and-capture-logs`
**Commit**: 1c1b41e "Improve parser install flow for offline environments"
**Base**: 1074452 (behind main by ~4 commits)
**Files Changed**: 1 file, +5/-4 lines (`Makefile`)

**Why Merge**:
- **Improves setup experience**: Better offline environment support
- **Infrastructure improvement**: Helps new contributors
- **No functional changes**: Only Makefile adjustments
- **Zero risk**: Can't break extraction logic

**Merge Command**:
```bash
git checkout main
git merge --no-ff origin/codex/run-tests-and-capture-logs -m "Merge: Improve parser install flow for offline environments"
```

**Expected Impact**: Easier setup for offline development

---

## Conditional Merge (Medium Priority) ⚠️

### 4. codex/capture-p/r/f1-metrics-and-log-results ⚠️ **DOCUMENTATION ONLY**

**Status**: ⚠️ **MERGE IF NEEDED**

**Branch**: `origin/codex/capture-p/r/f1-metrics-and-log-results`
**Commit**: 36501ac "docs: record stage 2 metrics run"
**Base**: 1074452 (behind main by ~4 commits)
**Files Changed**: 1 file, +20/-2 lines (`docs/AI_HANDOFF.md`)

**Why Merge**:
- **Documentation update**: Records Stage 2 metrics
- **Historical record**: Captures test results
- **Low value**: Main already has recent docs updates

**Why Skip**:
- `docs/AI_HANDOFF.md` might have conflicts with main
- Information may be redundant with CLAUDE.md and ARES_PROJECT_BRIEFING.md
- Can cherry-pick useful metrics into current docs instead

**Recommendation**: **SKIP** - Information is outdated, main has better docs now

---

## Needs Review (Low Priority) 🔍

### 5. codex/refine-console-editor-ui-visuals 🔍 **UI REFINEMENT**

**Status**: 🔍 **REVIEW NEEDED**

**Branch**: `origin/codex/refine-console-editor-ui-visuals`
**Commits**: 2 commits
- 1849a24 "Fix CodeMirror editor theme colors"
- e3098b5 "Add prompt to locate prior magical minimal UI changes"

**Base**: 1074452 (behind main by ~4 commits)

**Why Review**:
- UI changes might conflict with recent main updates
- Main has extensive UI work merged (mobile-adaptive, dark mode, etc.)
- Need to verify these changes don't regress current UI
- Prompt documentation might be useful

**Recommendation**: **REVIEW CHANGES** - Check if UI fixes are still needed after main's recent UI work

**Review Command**:
```bash
git diff origin/main...origin/codex/refine-console-editor-ui-visuals -- app/ui/console/src/index.css
```

---

### 6. codex/add-ui-change-locator-prompt-documentation 🔍 **MASSIVE UI HISTORY**

**Status**: 🔍 **DO NOT MERGE**

**Branch**: `origin/codex/add-ui-change-locator-prompt-documentation`
**Commit**: 621232d "Restore entity highlight contrast and themes"
**Base**: Has 200+ commits from Extraction Lab development history

**Why NOT Merge**:
- This branch contains the **entire Extraction Lab development history**
- All meaningful changes have already been merged to main via PR #1, #3, #5, #6, #7, #8, etc.
- Would create massive merge conflicts
- The single commit "Restore entity highlight contrast and themes" is likely redundant

**Recommendation**: **DO NOT MERGE** - Extract only if there's a specific UI fix not in main

---

## Merge Strategy

### Step 1: Merge Critical Fixes (Today)
```bash
# 1. Ensure you're on main and up to date
git checkout main
git pull origin main

# 2. Merge appositive fix (CRITICAL)
git merge --no-ff origin/codex/run-focused-tests-and-adjust-dependencies
git push origin main

# 3. Verify Stage 2.12 test passes
npm test tests/ladder/level-2-multisentence.spec.ts

# 4. If passing, merge pattern coverage
git merge --no-ff origin/codex/audit-and-add-patterns-for-coverage
git push origin main

# 5. Merge Makefile improvement
git merge --no-ff origin/codex/run-tests-and-capture-logs
git push origin main
```

### Step 2: Verify System Health (After Merges)
```bash
# Run full test suite
make parser  # Terminal 1
npm test tests/ladder/level-1-simple.spec.ts  # Stage 1
npm test tests/ladder/level-2-multisentence.spec.ts  # Stage 2

# Check pattern coverage
npx ts-node scripts/pattern-expansion/inventory-patterns.ts
```

### Step 3: Review UI Branches (Later)
```bash
# Review UI refinements
git diff origin/main...origin/codex/refine-console-editor-ui-visuals

# If useful changes found, cherry-pick specific commits
git cherry-pick <commit-hash>
```

---

## Conflict Resolution

### Potential Conflicts

**app/engine/extract/relations.ts**:
- `codex/run-focused-tests-and-adjust-dependencies` modifies `resolveSubjectToken()`
- Main has recent changes from 7b732e3 (appositive fix)
- **Resolution**: These are complementary changes, should merge cleanly

**patterns/new_surface_patterns.json**:
- `codex/audit-and-add-patterns-for-coverage` adds patterns
- Main might have added different patterns
- **Resolution**: JSON merge, keep all patterns

**Makefile**:
- `codex/run-tests-and-capture-logs` modifies parser install
- Main might have other Makefile changes
- **Resolution**: Review manually, keep best of both

### If Conflicts Occur
```bash
# Check what's conflicting
git status

# For each file:
git show :1:path/to/file  # Common ancestor
git show :2:path/to/file  # Main
git show :3:path/to/file  # Branch being merged

# Edit file to resolve
vim path/to/file

# Mark as resolved
git add path/to/file

# Complete merge
git commit
```

---

## Testing After Merge

### Mandatory Tests
```bash
# 1. TypeScript compilation
npx tsc --noEmit

# 2. Stage 1 baseline (must stay passing)
npm test tests/ladder/level-1-simple.spec.ts

# 3. Stage 2 (should now be 100%)
npm test tests/ladder/level-2-multisentence.spec.ts

# 4. Pattern coverage (should improve)
npx ts-node scripts/pattern-expansion/inventory-patterns.ts
```

### Success Criteria
- ✅ Stage 1: P≥90%, R≥85% (should remain stable)
- ✅ Stage 2: P≥85%, R≥80% (should now include test 2.12)
- ✅ Pattern coverage: ≥30% (up from 26%)
- ✅ No TypeScript errors
- ✅ Parser starts successfully

---

## Summary

### Merge Immediately
1. ✅ **codex/run-focused-tests-and-adjust-dependencies** - Fixes Stage 2.12 blocker
2. ✅ **codex/audit-and-add-patterns-for-coverage** - Adds 56 patterns
3. ✅ **codex/run-tests-and-capture-logs** - Makefile improvement

### Skip
4. ❌ **codex/capture-p/r/f1-metrics-and-log-results** - Outdated docs
5. ❌ **codex/add-ui-change-locator-prompt-documentation** - Already merged

### Review Later
6. 🔍 **codex/refine-console-editor-ui-visuals** - Check if UI fixes needed

### Expected Outcome
- **Stage 2**: 99% → **100% COMPLETE** ✅
- **Pattern Coverage**: 26% → ~30-32%
- **Next Milestone**: Ready to start Stage 3

---

## Risk Assessment

**Low Risk** (Merge #1-3):
- Small, focused changes
- No breaking changes expected
- Easy to revert if needed

**Medium Risk** (Review #5):
- UI changes might conflict
- Need visual testing

**High Risk** (Don't Merge #6):
- Massive history
- Guaranteed conflicts
- Already merged content

---

## Action Items

**For Repository Owner**:
1. Review and approve this analysis
2. Decide on merge order (recommend #1 → #2 → #3)
3. Execute merges or delegate to Codex
4. Run post-merge tests
5. Update INTEGRATED_TESTING_STRATEGY.md to reflect Stage 2 completion

**For Next Claude Session**:
1. Verify Stage 2 is 100% complete
2. Begin Stage 3 implementation
3. Continue pattern coverage expansion toward 50%

---

**Prepared by**: Claude Code (Sonnet 4.5)
**Date**: 2025-11-26
**Branch**: claude/review-claude-md-docs-012NtuxqVuaNfiGmfG9eKVVG
