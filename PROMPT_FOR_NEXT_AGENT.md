# Prompt for Next Agent

Copy and paste this to start the next coding session:

---

## Task: Fix Stage 2 Recall for ARES Knowledge Graph Extraction

### Current Status
- ✅ Precision: 86.7% (exceeds 85% target)
- ❌ Recall: 71.1% (below 80% target - **need +8.9% improvement**)
- ❌ F1: ~78% (below 82% target)

### Your Mission
Increase Stage 2 recall from 71.1% to 80%+ while maintaining precision above 85%.

### Important Context
A previous agent tried implementing proximity-window filtering to fix recall. **This approach doesn't work** - recall stayed at 71.1%. The real problem is **under-extraction** (only 26% pattern coverage, need 40%+), not over-filtering.

### Instructions Location
All instructions and analysis are ready on branch `claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd`.

**Start by reading NEXT_AGENT_START_HERE.md:**

```bash
git fetch origin claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd
git checkout claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd
cat NEXT_AGENT_START_HERE.md
```

This file will guide you through:
1. Reading the critical documentation (LESSONS_LEARNED.md + CODING_AGENT_INSTRUCTIONS_v2.md)
2. Creating your own working branch
3. Two approaches to fix recall (Quick Win vs Proper Fix)
4. Testing and committing your work

### Expected Timeline
- **Quick Win approach**: 30 minutes (test confidence threshold adjustment)
- **Proper Fix approach**: 4-6 hours (expand pattern coverage to 40%+)

### Success Criteria
```bash
npm test tests/ladder/level-2-multisentence.spec.ts
```

Should show:
- Precision: ≥85%
- Recall: ≥80%
- F1: ≥82%

### Repository
Working directory: `/home/user/ARES`
Branch to pull from: `claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd`

**Start by reading NEXT_AGENT_START_HERE.md - it has everything you need!** 📖

---

### Quick Start Command
```bash
cd /home/user/ARES && \
git fetch origin claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd && \
git checkout claude/review-main-branch-011CV1RafJ1HLzwFu4Wj9PFd && \
cat NEXT_AGENT_START_HERE.md
```
