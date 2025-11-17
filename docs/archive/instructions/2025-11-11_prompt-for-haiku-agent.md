---
archived: true
archived_date: 2025-11-13
replaced_by: /docs/FOR_AGENTS.md
reason: Model-specific prompt superseded by general onboarding guide
original_date: 2025-11-11
---

# Task: Add Coordination Patterns for Stage 2/3 Improvement

## Context

We just fixed Stage 2 by adding coordination patterns for "X and Y verb Z" structures. This improved recall from 76.7% to 83.3% (+6.6%).

**Your mission**: Extend this fix to 5 more common relations.

---

## Step 1: Pull the Latest Code

```bash
cd /home/user/ARES
git fetch origin claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd
git checkout claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd
git pull origin claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd
```

**Verify you're on the right branch:**
```bash
git branch --show-current
# Should output: claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd
```

---

## Step 2: Read Your Task Document

```bash
cat HAIKU_TASK_COORDINATION_PATTERNS.md
```

**This file contains:**
- Detailed explanation of what to do
- Exact code patterns to add
- Where to add them in the file
- Testing instructions
- Expected results

**⚠️ IMPORTANT**: Read the ENTIRE document before starting. It has critical details about handling symmetric relations.

---

## Step 3: Quick Summary of What You're Doing

**File to edit**: `app/engine/narrative-relations.ts`

**Add 5 coordination patterns:**
1. `friends_with`: "Harry and Ron were friends"
2. `lives_in`: "Harry and Dudley lived in Privet Drive"
3. `married_to`: Add coordination flag to existing pattern
4. `member_of`: "Harry and Ron were members of Gryffindor"
5. `works_at`: "Alice and Bob worked at NASA"

**Plus**: Update the coordination handler to support symmetric relations (where both captures are subjects, not subject→object).

---

## Step 4: Create Your Working Branch

```bash
git checkout -b claude/add-coordination-patterns-YOUR_SESSION_ID

# Example:
# git checkout -b claude/add-coordination-patterns-011CXyZ1234abcdef
```

**Replace `YOUR_SESSION_ID`** with your actual session ID (check your environment or use any unique identifier).

---

## Step 5: Make the Changes

Follow the instructions in `HAIKU_TASK_COORDINATION_PATTERNS.md` exactly.

**Key sections to modify:**

1. **Add patterns** (5 new patterns + 1 flag update)
2. **Update coordination handler** (around line 593) to support symmetric relations

**Tips:**
- Keep patterns in order by specificity (more specific first)
- Test incrementally if you get stuck
- The existing coordination code (for `studies_at`) is your reference

---

## Step 6: Test Your Changes

### Test Stage 2 (Must Still Pass)
```bash
npm test tests/ladder/level-2-multisentence.spec.ts
```

**Expected result:**
```
Relations:
  Precision: ≥86% ✅
  Recall: ≥83% ✅
  F1: ≥85% ✅

✓ LEVEL 2 PASSED
```

### Test Stage 3 (May Improve)
```bash
npm test tests/ladder/level-3-complex.spec.ts
```

**Expected**: May see slight improvement in recall (e.g., 9.7% → 15-20%). Won't pass yet - that needs architectural work.

---

## Step 7: Commit and Push

```bash
# Stage your changes
git add app/engine/narrative-relations.ts

# Check what you're committing
git diff --cached

# Commit with detailed message
git commit -m "feat: add coordination patterns for friends_with, lives_in, member_of, works_at

Extends coordination fix from studies_at/traveled_to to cover more relations.

New patterns handle:
- \"Harry and Ron were friends\" (friends_with)
- \"Harry and Dudley lived in Privet Drive\" (lives_in)
- \"Harry and Ron were members of Gryffindor\" (member_of)
- \"Alice and Bob worked at NASA\" (works_at)
- \"Arthur and Molly married\" (married_to - added coordination flag)

Updated coordination handler to support symmetric relations where
both captures are subjects (not subject→object pattern).

Test results:
- Stage 2: Still passing ✅
- Stage 3: [report your metrics here]

Closes coordination pattern expansion task."

# Push to your branch
git push -u origin claude/add-coordination-patterns-YOUR_SESSION_ID
```

---

## Step 8: Report Results

After pushing, report:

1. **Stage 2 test results** (should still pass)
2. **Stage 3 test results** (before and after metrics)
3. **Any issues encountered**
4. **Commit hash and branch name**

Example:
```
✅ Task Complete

Stage 2: Still passing (83.3% recall, 86.7% precision)
Stage 3 Improvement:
  - Relation Recall: 9.7% → 18.5% (+8.8%)
  - Relation Precision: 20.0% → 25.3% (+5.3%)

Branch: claude/add-coordination-patterns-011CXyZ123
Commit: abc123def

Notes: All patterns added successfully. Symmetric relation handler
works correctly for friends_with and married_to patterns.
```

---

## If You Get Stuck

### Issue: TypeScript errors
**Fix**: Make sure you added the handler update from the task doc (around line 593). The new symmetric logic is required.

### Issue: Tests fail after changes
**Debug**:
```bash
# Run with debug output
npm test tests/ladder/level-2-multisentence.spec.ts 2>&1 | grep -A 10 "Test 2.7"
```

Look for which test case is failing and why.

### Issue: Pattern not matching
**Check**:
- Regex syntax correct?
- Added `coordination: true` flag?
- Pattern placed BEFORE the non-coordination version?

### Issue: Can't push (403 error)
**Cause**: Branch name doesn't match your session ID
**Fix**: Use `git push -u origin YOUR_BRANCH_NAME` with your actual branch name

---

## Success Criteria

✅ Stage 2 tests still pass (83%+ recall)
✅ 5 new coordination patterns added
✅ Coordination handler supports symmetric relations
✅ Code pushed to your branch
✅ Clean commit message with results

---

## Time Estimate

**2 hours total**
- Reading task doc: 15 min
- Adding patterns: 45 min
- Updating handler: 30 min
- Testing: 20 min
- Committing/pushing: 10 min

---

## Quick Start Commands

```bash
# Pull code
cd /home/user/ARES
git fetch origin claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd
git checkout claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd
git pull origin claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd

# Read task
cat HAIKU_TASK_COORDINATION_PATTERNS.md

# Create working branch (replace YOUR_SESSION_ID)
git checkout -b claude/add-coordination-patterns-YOUR_SESSION_ID

# Make changes to app/engine/narrative-relations.ts
# ... (follow HAIKU_TASK_COORDINATION_PATTERNS.md) ...

# Test
npm test tests/ladder/level-2-multisentence.spec.ts
npm test tests/ladder/level-3-complex.spec.ts

# Commit
git add app/engine/narrative-relations.ts
git commit -m "feat: add coordination patterns for friends_with, lives_in, member_of, works_at

[... full commit message from Step 7 ...]"

# Push
git push -u origin claude/add-coordination-patterns-YOUR_SESSION_ID

# Report results
```

---

**Good luck! This is straightforward repetitive work that builds on the coordination fix we just completed.** 🚀
