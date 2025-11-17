---
archived: true
archived_date: 2025-11-13
replaced_by: /docs/FOR_AGENTS.md
reason: Task handoff instructions superseded by general onboarding guide
original_date: 2025-11-11
---

# 🚀 START HERE - Stage 2 Recall Fix

## Step 1: Pull the Latest Instructions

The correct instructions and analysis are on branch `claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd`.

```bash
# Fetch and checkout the branch with v2 instructions
git fetch origin claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd
git checkout claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd

# Verify you have the critical files
ls -la CODING_AGENT_INSTRUCTIONS_v2.md LESSONS_LEARNED.md
```

## Step 2: Read the Documentation

**CRITICAL**: Read these files in order:

1. **LESSONS_LEARNED.md** (5 min read)
   - Explains why proximity filtering doesn't work
   - Documents the wrong diagnosis we made
   - Identifies the real problem: under-extraction

2. **CODING_AGENT_INSTRUCTIONS_v2.md** (10 min read)
   - Provides the CORRECT approach
   - Quick Win: Test confidence threshold adjustment (30 min)
   - Proper Fix: Expand pattern coverage (4-6 hours)

```bash
cat LESSONS_LEARNED.md
cat CODING_AGENT_INSTRUCTIONS_v2.md
```

## Step 3: Create Your Own Working Branch

You need a branch with YOUR session ID to push changes.

```bash
# Create a new branch from current position
# Replace <YOUR_SESSION_ID> with your actual session ID
git checkout -b claude/fix-stage2-recall-<YOUR_SESSION_ID>

# Example:
# git checkout -b claude/fix-stage2-recall-011CXyZ1234567890abcdef
```

## Step 4: Follow the Instructions

The v2 instructions provide two approaches:

### Quick Win (Try This First - 30 minutes)
Test if lowering the confidence threshold helps:
```bash
ARES_MIN_CONFIDENCE=0.65 npm test tests/ladder/level-2-multisentence.spec.ts
ARES_MIN_CONFIDENCE=0.60 npm test tests/ladder/level-2-multisentence.spec.ts
```

### Proper Fix (If Quick Win Doesn't Work - 4-6 hours)
Expand pattern coverage from 26% to 40%+:
- Add 50+ patterns from `patterns/new_dependency_patterns.json`
- Focus on low-coverage families: LOCATION, PART_WHOLE, EMPLOYMENT
- Test incrementally

**Full details are in CODING_AGENT_INSTRUCTIONS_v2.md**

## Step 5: Test and Commit

```bash
# Run the test
npm test tests/ladder/level-2-multisentence.spec.ts

# If successful, commit your changes
git add .
git commit -m "fix: improve Stage 2 recall via [your approach]"

# Push to YOUR branch (with your session ID)
git push -u origin claude/fix-stage2-recall-<YOUR_SESSION_ID>
```

---

## Current Status

- ✅ Stage 2 Precision: **86.7%** (target: 85%) - EXCEEDED
- ❌ Stage 2 Recall: **71.1%** (target: 80%) - Gap: -8.9%
- ❌ Stage 2 F1: **~78%** (target: 82%)

**Your Goal**: Increase recall from 71.1% to 80%+ while maintaining precision above 85%.

---

## Why Not Proximity Filtering?

Previous agent tried proximity-window filtering - **it doesn't work**:
- Recall stayed at 71.1% (no improvement)
- Filtering is rarely triggered (no conflicts to resolve)
- Problem is **under-extraction**, not **over-filtering**

Read LESSONS_LEARNED.md for the full analysis.

---

## Key Files You'll Work With

- `app/engine/extract/orchestrator.ts` - Main extraction pipeline
- `patterns/new_dependency_patterns.json` - 2315 patterns to integrate
- `patterns/new_surface_patterns.json` - 1754 patterns to integrate
- `reports/rung1_pattern_coverage_summary.md` - Coverage analysis

---

## Questions?

All technical details are in **CODING_AGENT_INSTRUCTIONS_v2.md**.

**Good luck! The solution is pattern expansion + confidence tuning.** 🎯
