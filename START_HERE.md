# CODING AGENT - START HERE

## ⚠️ IMPORTANT: Pull Request Needs to Be Merged First

The **CODING_AGENT_INSTRUCTIONS.md** file is currently on branch:
`claude/add-coding-instructions-011CV1RafJ1HLzwFu4Wj9PFd`

**It needs to be merged to main before you can proceed.**

---

## 📥 Once Merged, Follow These Steps:

### 1. Pull Latest from Main
```bash
git checkout main
git pull origin main

# Verify you have the instructions file
ls -la CODING_AGENT_INSTRUCTIONS.md
# Should exist and be ~14KB
```

### 2. Read the Instructions
```bash
cat CODING_AGENT_INSTRUCTIONS.md
# OR
less CODING_AGENT_INSTRUCTIONS.md
```

### 3. Follow the Step-by-Step Guide
The instructions contain:
- Current status overview
- Exact code changes needed
- Testing instructions
- Success criteria
- Troubleshooting guide

---

## 📊 Quick Context (While Waiting for Merge)

### Current Status
- ✅ Stage 2 Precision: 86.7% (target: 85%) - **EXCEEDED**
- ❌ Stage 2 Recall: 71.1% (target: 80%) - **Gap: -8.9%**
- ❌ Stage 2 F1: ~78% (target: 82%)

### Your Task
Fix Stage 2 recall by implementing proximity-window filtering (±2 sentences) to replace the current document-level filtering that's too aggressive.

### Expected Outcome
- Precision: ~85-86% (slight drop acceptable)
- Recall: ~78-79% (+7-8% improvement)
- F1: ~81-82% (meets target)

### Estimated Time
2-3 hours total

---

## 📁 Files You'll Need (After Merge)

All on main branch after merge:
1. **CODING_AGENT_INSTRUCTIONS.md** - Your main guide (490 lines)
2. **ARES_PROGRESS_SUMMARY.md** - Executive summary
3. **ares-improvement-plan.md** - Technical details
4. **ares-status-report.md** - Root cause analysis

---

## 🚨 If Instructions Still Not Available

Check which branch has the files:
```bash
# Check if on main
git branch --show-current

# Check if file exists
ls -la CODING_AGENT_INSTRUCTIONS.md

# If not, pull from feature branch temporarily:
git fetch origin claude/add-coding-instructions-011CV1RafJ1HLzwFu4Wj9PFd
git show origin/claude/add-coding-instructions-011CV1RafJ1HLzwFu4Wj9PFd:CODING_AGENT_INSTRUCTIONS.md > CODING_AGENT_INSTRUCTIONS.md
```

---

**Waiting for PR merge... then you can proceed with the implementation!**
