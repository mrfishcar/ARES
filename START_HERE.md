# Coding Agent – Start Here

## Prerequisite
Merge `claude/add-coding-instructions-011CV1RafJ1HLzwFu4Wj9PFd` so `CODING_AGENT_INSTRUCTIONS.md` exists on main.

## After Merge
1. Update main:
```bash
git checkout main
git pull origin main
ls -la CODING_AGENT_INSTRUCTIONS.md  # should exist (~14KB)
```
2. Read the guide:
```bash
less CODING_AGENT_INSTRUCTIONS.md
```
3. Follow it for status, required changes, tests, success criteria, troubleshooting.

## Context (pre-merge)
- Stage 2 precision 86.7% (goal 85%) ✅
- Stage 2 recall 71.1% (goal 80%) ❌ → implement ±2 sentence proximity filtering to boost recall.
- Expected outcome: precision ~85–86%; recall ~78–79%; F1 ~81–82%.
- Time estimate: 2–3 hours.

## Files (on main after merge)
1. CODING_AGENT_INSTRUCTIONS.md – primary guide
2. ARES_PROGRESS_SUMMARY.md – executive summary
3. ares-improvement-plan.md – technical plan
4. ares-status-report.md – root-cause analysis

## If instructions are missing
```bash
git branch --show-current
ls -la CODING_AGENT_INSTRUCTIONS.md
git fetch origin claude/add-coding-instructions-011CV1RafJ1HLzwFu4Wj9PFd
git show origin/claude/add-coding-instructions-011CV1RafJ1HLzwFu4Wj9PFd:CODING_AGENT_INSTRUCTIONS.md > CODING_AGENT_INSTRUCTIONS.md
```

Proceed once the PR is merged.
