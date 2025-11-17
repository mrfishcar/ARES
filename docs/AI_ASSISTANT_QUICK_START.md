# AI Assistant Quick Start Guide

**Purpose**: Quick reference for AI assistants starting work on ARES
**Audience**: Claude, GPT, or any AI assistant working on entity extraction
**Last Updated**: 2025-11-17

---

## Current Status

**Phase 1**: ✅ COMPLETE (100%/100%)
**Phase 2**: 🟡 In Progress (Day 2 - Coordination splitting)

**Level 1 Test**: ✅ PASSING (20/20 tests, perfect score)
**Level 2 Test**: 🟡 In Progress (compound sentences)

**Current Metrics** (Level 1):
- Entities: 92.5% P/R
- Relations: 100% P/R

---

## Essential Documents (Read These First)

### For Understanding
1. **GROUND_TRUTHS.md** - What "correct" extraction looks like (READ THIS FIRST)
2. **DEV_LOOP.md** - How to make changes and test them
3. **ENTITY_EXTRACTION_MASTER_PLAN.md** - 9-phase roadmap (68 days)

### For Current Work
4. **AI_ASSISTANT_PHASE2_START.md** - Phase 2 implementation guide
5. **CLAUSE_DETECTOR_GUIDE.md** - Clause detection implementation

### For Context
6. **PHASE1_COMPLETE.md** - What was accomplished in Phase 1
7. **MERGE_FIX_COMPLETE.md** - Entity merging success story

### Archives (Completed Tasks)
- **archive/CODEX_IMMEDIATE_FIX.md** - Historical: Relation fix
- **archive/CODEX_RELATIONS_TASK.md** - Historical: Relation workflow

---

## Quick Start Workflow

### 1. Orient Yourself

**Check current phase**:
```bash
cat docs/ENTITY_EXTRACTION_MASTER_PLAN.md | grep -A10 "Phase 2"
```

**Check test status**:
```bash
npx vitest run tests/ladder/level-1-simple.spec.ts > /tmp/latest_test.log 2>&1
tail -30 /tmp/latest_test.log | grep -A10 "LEVEL 1 RESULTS"
```

### 2. Read Ground Truths

**Understand expected behavior**:
```bash
cat docs/GROUND_TRUTHS.md | head -100
```

Key questions to answer:
- What entity types exist?
- What relation types are supported?
- What does a "correct" extraction look like?
- What are common edge cases?

### 3. Review Development Loop

**Learn the workflow**:
```bash
cat docs/DEV_LOOP.md | head -100
```

Key sections:
- The development cycle (7 steps)
- Common workflows
- Testing strategy
- Debugging techniques

### 4. Start Working

**Follow current phase guide**:
```bash
cat docs/AI_ASSISTANT_PHASE2_START.md
```

**Create working directory**:
```bash
# Use /tmp/ for analysis and test files
mkdir -p /tmp/ares_work
```

---

## Important Paths Reference

### Source Code
- **Entities**: `/Users/corygilford/ares/app/engine/extract/entities.ts`
- **Relations**: `/Users/corygilford/ares/app/engine/extract/relations.ts`
- **Orchestrator**: `/Users/corygilford/ares/app/engine/extract/orchestrator.ts`
- **Clause Detector**: `/Users/corygilford/ares/app/engine/extract/clause-detector.ts`

### Tests
- **Level 1**: `/Users/corygilford/ares/tests/ladder/level-1-simple.spec.ts`
- **Level 2**: `/Users/corygilford/ares/tests/ladder/level-2-multisentence.spec.ts`
- **Level 3**: `/Users/corygilford/ares/tests/ladder/level-3-complex.spec.ts`

### Documentation
- **All docs**: `/Users/corygilford/ares/docs/`
- **Archives**: `/Users/corygilford/ares/docs/archive/`

### Working Directory
- **Temp files**: `/tmp/` (your workspace for analysis and tests)

---

## Essential Commands

### Testing
```bash
# Run Level 1 (simple sentences)
npx vitest run tests/ladder/level-1-simple.spec.ts

# Run Level 2 (multi-sentence)
npx vitest run tests/ladder/level-2-multisentence.spec.ts

# Run all tests
npx vitest run tests/ladder/

# Run with verbose output
npx vitest run tests/ladder/level-1-simple.spec.ts --reporter=verbose
```

### Searching Code
```bash
# Find function definitions
grep -rn "function extractEntities" app/

# Find uses of a pattern
grep -rn "canonical" app/engine/extract/

# Search specific file
grep -n "pattern" app/engine/extract/entities.ts
```

### Debugging
```bash
# Create test script
cat > /tmp/test_extraction.ts << 'EOF'
import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const text = "Your test sentence here.";
  const result = await extractFromSegments("test", text);
  console.log("Entities:", result.entities.map(e => e.canonical));
  console.log("Relations:", result.relations.map(r => r.pred));
}
test();
EOF

# Run it
npx ts-node /tmp/test_extraction.ts
```

### File Management
```bash
# Clean stale compiled JavaScript files
find /Users/corygilford/ares/app -name "*.js" -type f -delete

# Read file with line numbers
cat -n app/engine/extract/entities.ts | head -50

# View specific lines
sed -n '100,200p' app/engine/extract/entities.ts
```

---

## Daily Workflow

### Morning Routine
1. Read current phase documentation
2. Check test status (run Level 1 at minimum)
3. Review any previous day's notes in `/tmp/`
4. Identify today's tasks

### During Development
1. Make ONE change at a time
2. Test after EACH change
3. Document findings in `/tmp/<task>_analysis.md`
4. Ask clarifying questions if stuck >30 minutes

### Before Finishing
1. Run full test suite
2. Verify no regressions
3. Document what was accomplished
4. Update relevant documentation
5. Clean up debug logging

---

## Working with the Test Ladder

### Test Levels Overview
- **Level 1**: 20 simple sentences (Target: P≥90%, R≥85%)
- **Level 2**: 15 multi-sentence narratives (Target: P≥85%, R≥80%)
- **Level 3**: 10 complex narratives (Target: P≥80%, R≥75%)

### Interpreting Test Results

**Success**:
```
🎉 LEVEL 1 PASSED! Unlock Level 2.

Entities:
  Precision: 92.5% (target: ≥90%) ✓
  Recall: 92.5% (target: ≥85%) ✓
```

**Failure**:
```
❌ Test 1.19 failed:
   Entity P/R: 66.7% / 66.7%
   Gold entities: event::battle of pelennor fields, person::eowyn
   Extracted entities: event::battle, person::eowyn, place::pelennor fields
```

**Action**: Check GROUND_TRUTHS.md for Test 1.19 details

---

## Common Workflows

### Workflow 1: Fixing a Failing Test

1. **Identify the failure**:
```bash
npx vitest run tests/ladder/level-1-simple.spec.ts 2>&1 | grep "❌"
```

2. **Check ground truth**:
```bash
cat docs/GROUND_TRUTHS.md | grep -A20 "Test 1.19"
```

3. **Reproduce in isolation**:
```bash
# Create test script in /tmp/
npx ts-node /tmp/test_reproduction.ts
```

4. **Analyze root cause**:
```bash
# Document in /tmp/issue_analysis.md
# Include: problem, hypothesis, evidence
```

5. **Implement fix**:
```bash
# Edit relevant .ts file
# Add comments explaining the fix
```

6. **Verify fix**:
```bash
npx vitest run tests/ladder/level-1-simple.spec.ts
```

7. **Check for regressions**:
```bash
npx vitest run tests/ladder/
```

---

### Workflow 2: Implementing a New Feature

1. **Read feature requirements**:
```bash
cat docs/ENTITY_EXTRACTION_MASTER_PLAN.md | grep -A30 "Feature name"
```

2. **Study examples**:
```bash
cat docs/GROUND_TRUTHS.md | grep -A10 "pattern description"
```

3. **Create test cases**:
```bash
# Add to appropriate test file
# Or create in /tmp/ for testing
```

4. **Implement incrementally**:
- Start with simplest case
- Add complexity gradually
- Test after each addition

5. **Document**:
```bash
# Create /tmp/feature_implementation.md
# Include: approach, files modified, results
```

---

## Tips for Success

### General Guidelines
1. **Read documentation first** - Don't code blindly
2. **Test frequently** - After every change
3. **Document everything** - Future you will thank present you
4. **Ask questions** - Better to clarify than assume
5. **Small changes** - Easier to debug and verify

### AI Assistant-Specific Tips
1. **Use /tmp/ liberally** - Create analysis files for your thought process
2. **Run tests yourself** - Don't just theorize, verify
3. **Read actual code** - Don't assume implementation details
4. **Check edge cases** - Test boundary conditions
5. **Verify no regressions** - Always run Level 1 tests

### Code Quality
1. **Add comments** - Explain WHY, not just WHAT
2. **Keep functions small** - One purpose per function
3. **Use descriptive names** - No cryptic abbreviations
4. **Follow existing patterns** - Consistency matters
5. **Clean up debug logs** - Before finishing

---

## Understanding ARES Architecture

### Extraction Pipeline
```
Input Text
    ↓
Parse (spaCy)
    ↓
Extract Entities (NER + patterns)
    ↓
Merge Entities (deduplicate)
    ↓
Extract Relations (pattern matching)
    ↓
Store in Graph (JSON)
    ↓
Output
```

### Key Components

**Orchestrator** (`orchestrator.ts`):
- Entry point for extraction
- Coordinates all extraction steps
- Handles document chunking

**Entities** (`entities.ts`):
- NER (Named Entity Recognition)
- Entity type classification
- Entity merging and deduplication
- Coordination splitting ("A and B")

**Relations** (`relations.ts`):
- Pattern-based relation extraction
- Dependency parsing
- Temporal qualifiers
- Relation validation

**Storage** (`storage.ts`):
- Graph persistence (JSON)
- Entity/relation serialization
- Incremental updates

---

## Getting Help

### When Stuck
1. **After 30 minutes**: Document what you've tried
2. **After 1 hour**: Ask for help with your analysis
3. **Include**: Problem, attempts, relevant logs/output

### Resources
- **Ground Truths**: Expected behavior reference
- **Dev Loop**: Step-by-step workflows
- **Master Plan**: High-level roadmap
- **Test Files**: Concrete examples of correct extraction

### Debugging Checklist
- [ ] Read relevant documentation?
- [ ] Checked ground truths for expected behavior?
- [ ] Created minimal reproduction?
- [ ] Added debug logging?
- [ ] Tested in isolation?
- [ ] Checked for stale .js files?
- [ ] Reviewed related code?

---

## Success Metrics by Phase

### Phase 1 (Complete)
- ✅ Entity Precision: 92.5% (target: ≥90%)
- ✅ Entity Recall: 92.5% (target: ≥85%)
- ✅ Relation Precision: 100% (target: ≥90%)
- ✅ Relation Recall: 100% (target: ≥85%)

### Phase 2 (In Progress)
- Target Entity Precision: ≥88%
- Target Entity Recall: ≥83%
- Target Relation Precision: ≥88%
- Target Relation Recall: ≥83%

### Phase 3 (Planned)
- Target Entity Precision: ≥85%
- Target Entity Recall: ≥80%
- Target Relation Precision: ≥85%
- Target Relation Recall: ≥80%

---

## Next Steps

1. **Read GROUND_TRUTHS.md** - Understand expected behavior
2. **Read DEV_LOOP.md** - Learn the development workflow
3. **Run tests** - See current status
4. **Check phase guide** - Start current phase tasks
5. **Make incremental progress** - One step at a time

---

## Related Documentation

- **GROUND_TRUTHS.md** - Expected extraction behavior
- **DEV_LOOP.md** - Development workflow guide
- **ENTITY_EXTRACTION_MASTER_PLAN.md** - Complete roadmap
- **AI_ASSISTANT_PHASE2_START.md** - Phase 2 tasks
- **CLAUSE_DETECTOR_GUIDE.md** - Clause detection details
- **FOR_AGENTS.md** - Additional guidance for AI assistants

---

**Last Updated**: 2025-11-17
**Maintainer**: ARES Project Team
**Format**: Model-agnostic (works with Claude, GPT, or any AI assistant)
