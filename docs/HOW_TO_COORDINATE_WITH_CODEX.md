# How to Coordinate Claude + Codex

**Date**: 2025-11-15
**Workflow**: Claude (architect/supervisor) + ChatGPT Codex (tester/debugger)

---

## Quick Start for Cory

### Step 1: Give Codex the Context

Send Codex these files in order:

1. **`docs/INSTRUCTIONS_FOR_CODEX.md`** - General instructions and lab setup
2. **`docs/CODEX_HANDOFF_BRIEFING.md`** - Current debugging tasks

**Suggested message to Codex**:
```
Hi Codex! You're joining the ARES project to help debug entity extraction.

Please read these two files carefully:
1. INSTRUCTIONS_FOR_CODEX.md - Your onboarding guide
2. CODEX_HANDOFF_BRIEFING.md - Specific debugging tasks

Start with Task 1 in the briefing and report your findings.
Claude (Anthropic) is supervising and will guide you.

The lab is already running - services are up on ports 4000 and 8000.
```

### Step 2: Codex Debugging Loop

Codex will work through 4 debug tasks:

1. **Task 1**: Add logging to APPOS-FILTER (5 min)
2. **Task 2**: Trace coreference relation creation (10 min)
3. **Task 3**: Check entity ID registry (5 min)
4. **Task 4**: Run simple isolated test (10 min)

After each task, Codex should report findings to you/Claude.

### Step 3: Relay Findings to Claude

Copy Codex's findings and paste them into this chat with Claude.

**Format**:
```
Codex completed Task [N]:

[paste Codex's output]

Claude - what should we investigate next?
```

### Step 4: Claude Provides Guidance

Claude will analyze Codex's findings and provide:
- Interpretation of what's happening
- Next debugging steps
- Code fix suggestions if root cause is found

### Step 5: Iterate Until Fixed

Repeat Steps 2-4 until the bug is identified and fixed.

---

## Division of Labor

### Claude (Anthropic) - Architect & Supervisor

**Responsibilities**:
- Analyze complex issues
- Interpret debug results
- Design fixes
- Review code changes
- Make architectural decisions

**Limitations**:
- Expensive tokens (use sparingly)
- Should minimize exploratory debugging
- Better suited for analysis than trial-and-error

### Codex (ChatGPT) - Tester & Debugger

**Responsibilities**:
- Run tests repeatedly
- Add debug logging
- Try different input combinations
- Report observations
- Execute mechanical debugging tasks

**Limitations**:
- Needs clear instructions
- Works under Claude's supervision
- Should ask Claude before making major changes

---

## Example Workflow

### Iteration 1

**You → Codex**:
> "Start Task 1 from CODEX_HANDOFF_BRIEFING.md"

**Codex → You**:
> "Task 1 Results:
> - Relations before filter show: subj='', obj='cadc7a94-...'
> - Subjects are empty strings, objects are UUIDs
> - Hypothesis: Entity ID not being set for subjects"

**You → Claude**:
> "Codex found subjects are empty strings but objects are UUIDs. What does this mean?"

**Claude → You**:
> "This indicates the coreference resolver is setting object IDs but not subject IDs. Check coreference.ts line 220 where subjects should be assigned. Tell Codex to add logging there."

**You → Codex**:
> "Add logging in coreference.ts line 220 to see what's happening with subject assignment"

### Iteration 2

(Continue this loop until bug is found and fixed)

---

## Communication Protocol

### When Codex Reports Results

Codex should use this format:

```
Task [N] Completed

What I found:
- [observation 1]
- [observation 2]

Log output:
```
[paste logs]
```

Hypothesis:
[what Codex thinks is happening]

Questions for Claude:
- [question 1]
- [question 2]
```

### When Claude Responds

Claude will provide:

```
Analysis:
[interpretation of findings]

Root Cause:
[what's actually happening]

Next Steps:
1. [specific instruction for Codex]
2. [specific instruction for Codex]

Or if fix is identified:

Fix:
[code changes needed]
[files to modify]
```

---

## Current Debug Mission

**Problem**: Relations have empty subject IDs
- Entities: ✅ Working perfectly
- Relation detection: ✅ Working
- Subject/object IDs: ❌ Empty or "UNKNOWN"
- Meaning records: ❌ 0 (because no valid relations)

**Goal**: Find why relation.subj is empty and fix it

**Start Point**: Task 1 in CODEX_HANDOFF_BRIEFING.md

---

## Lab Status

All services running and ready:
- ✅ Parser (Python): Port 8000
- ✅ GraphQL API (Node): Port 4000
- ✅ Frontend (Vite): Port 3002
- ✅ TypeScript: Compiled
- ✅ Test files: Ready

---

## Expected Timeline

- **Task 1-4**: 30-40 minutes (Codex debugging)
- **Analysis**: 5-10 minutes (Claude interpreting)
- **Fix**: 10-20 minutes (Codex implementing under Claude's guidance)
- **Validation**: 5 minutes (final testing)

**Total**: ~1-1.5 hours to debug and fix

---

## Success Indicators

You'll know it's fixed when:

1. ✅ Test output shows: `subj: "entity-id-123" obj: "entity-id-456"`
2. ✅ No "empty subject" warnings
3. ✅ Meaning records: 2 (not 0)
4. ✅ Web UI shows: "Frederick → rules → Gondor" (not "UNKNOWN → UNKNOWN")

---

## Tips for Smooth Coordination

1. **Be specific**: Give Codex exact file paths and line numbers
2. **Small steps**: One task at a time
3. **Copy full output**: More context is better
4. **Ask Claude to interpret**: Don't try to fix without Claude's guidance
5. **Validate changes**: Run tests after each fix

---

## Quick Commands Reference

```bash
# Codex will use these frequently:
npx tsc                              # Compile
npx ts-node test-meaning-layer.ts    # Run test
npx ts-node test-simple-relation.ts  # Run simple test (Codex will create this)

# Check services:
lsof -i :4000 -i :8000

# View logs:
tail -100 /tmp/ares-pronoun-test.log
```

---

**Ready to coordinate!**

Send Codex the two files and let Claude know when Codex reports findings.
