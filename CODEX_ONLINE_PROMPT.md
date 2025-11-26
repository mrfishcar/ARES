# Codex Online - Continue ARES Development

**Date**: 2025-11-25
**Project**: Advanced Relation Extraction System (ARES)
**Your Role**: Implementation and debugging agent
**Session Type**: Continuation of Iteration 37 work

---

## 🎯 Mission

You are Codex, the implementation agent for ARES. Your mission is to **complete the entity extraction improvements** and **unblock Stage 2 testing** to advance the system toward production readiness.

---

## 📊 Current Status (Iteration 37)

### Test Results
- ✅ **Stage 1 (Foundation)**: PASSED - 119/119 tests passing
- ⚠️ **Stage 2 (Components)**: 99% complete - **blocked on test 2.12** (appositive parsing issue)
- ⏸️ **Stage 3-5**: Not started (blocked on Stage 2)

### Entity Extraction
- **Current**: 7/28 tests passing (25%)
- **Target**: 18-22/28 tests (65-79%)
- **Recent work**: Partial name variant matching implemented (Iteration 37)

### Pattern Coverage
- **Current**: 26% (480/1827 patterns)
- **Target**: ≥30% for Stage 1, ≥50% for Stage 3

### Recent Accomplishments
1. ✅ Partial name variant matching for compound names
2. ✅ Pronoun filtering from coreference-resolved aliases
3. ✅ Name decomposition (Sarah Johnson-Smith → Sarah, Johnson, Smith)
4. ✅ Proximity gating (~500 chars) to prevent false positives
5. ✅ Entity merging for abbreviated names (Mike → Michael)

---

## 🚨 Current Blocker: Test 2.12 - Appositive Parsing

### The Problem

**Test case**: "Aragorn, son of Arathorn, traveled to Gondor"

**Expected**:
- `Aragorn --[traveled_to]--> Gondor`
- `Aragorn --[child_of]--> Arathorn`

**Actual**:
- `Arathorn --[traveled_to]--> Gondor` ❌ (wrong subject!)
- `Aragorn --[child_of]--> Arathorn` ✅ (correct)

### Root Cause

The appositive phrase "son of Arathorn" is interfering with dependency parsing. The parser incorrectly assigns "Arathorn" as the subject of "traveled" instead of "Aragorn".

**Location**: `app/engine/extract/relations.ts` - dependency path extraction
**Impact**: Blocks Stage 2 completion (need P≥85%, R≥80%)

### Files to Investigate

1. **app/engine/extract/relations.ts** - Dependency path patterns (line ~400-800)
2. **app/engine/extract/clause-detector.ts** - Clause boundary detection
3. **app/parser/parse-types.ts** - Dependency type definitions
4. **tests/ladder/test-2.12-only.ts** - Isolated test for this case

---

## 🎯 Your Tasks (Prioritized)

### Task 1: Fix Test 2.12 Appositive Parsing ⚠️ CRITICAL

**Goal**: Correctly extract "Aragorn traveled_to Gondor" from appositive sentences

**Steps**:

1. **Understand the issue** (10 minutes)
   ```bash
   # Run isolated test
   npx ts-node tests/ladder/test-2.12-only.ts

   # Run debug runner
   L3_DEBUG=1 npx ts-node tests/ladder/run-level-2.ts

   # Look for: Which entity is being selected as subject?
   ```

2. **Check dependency parse** (10 minutes)
   ```bash
   # Test parser directly
   curl -X POST http://127.0.0.1:8000/parse \
     -H "Content-Type: application/json" \
     -d '{"text": "Aragorn, son of Arathorn, traveled to Gondor."}'

   # Look for: What are the nsubj/nsubjpass dependencies?
   # Expected: Aragorn should be nsubj of "traveled"
   ```

3. **Add appositive handling** (30 minutes)

   In `app/engine/extract/relations.ts`, add logic to skip over appositive clauses:

   ```typescript
   function findActualSubject(tokens: Token[], verbIndex: number): Token | null {
     // Find nsubj or nsubjpass
     let subject = tokens.find(t =>
       (t.dep === 'nsubj' || t.dep === 'nsubjpass') && t.head === verbIndex
     );

     if (!subject) return null;

     // Check if subject is inside an appositive clause
     // Appositives have dep='appos' and should be skipped
     const appositiveParent = tokens.find(t =>
       t.dep === 'appos' && t.head === subject.i
     );

     if (appositiveParent) {
       // Subject is in appositive, use the appositive's head instead
       subject = tokens[appositiveParent.head];
     }

     return subject;
   }
   ```

4. **Test the fix** (10 minutes)
   ```bash
   npx ts-node tests/ladder/test-2.12-only.ts
   # Should now extract: Aragorn --[traveled_to]--> Gondor

   # Verify Stage 2 passes
   npm test tests/ladder/level-2-multisentence.spec.ts
   # Target: P≥85%, R≥80%
   ```

**Success Criteria**:
- ✅ Test 2.12 passes
- ✅ Stage 2 precision ≥85%
- ✅ Stage 2 recall ≥80%
- ✅ No regressions in Stage 1

---

### Task 2: Improve Entity Extraction Test Coverage

**Goal**: Increase entity extraction tests from 7/28 (25%) to 18-22/28 (65-79%)

**Steps**:

1. **Run entity extraction tests** (5 minutes)
   ```bash
   npx vitest tests/entity-extraction/extraction.spec.ts

   # Look for failing tests:
   # - complex-person-002 (multi-person with informal refs)
   # - historical-context (persons in historical text)
   # - multilingual (non-English names)
   # - organization-* (missing ORG entities)
   # - location-* (missing PLACE entities)
   ```

2. **Fix complex-person-002** (20 minutes)

   **Test case**: Multiple persons with informal references
   - Expected: Sarah Johnson-Smith (aliases: ["Sarah"]), Michael Smith (aliases: ["Mike"]), Emma Smith (aliases: ["Em"])

   **Check**: Recent partial name matching should handle this

   ```bash
   npx vitest tests/entity-extraction/extraction.spec.ts -t "complex-person-002"
   ```

   If failing, check `app/engine/extract/entities.ts` lines 2891+ (partial name variant matching)

3. **Add missing entity types** (30 minutes)

   **Organizations**: Apple, TechCrunch, FBI, CIA, NSA
   - File: `app/engine/extract/entities.ts`
   - Add organization detection patterns

   **Locations**: New York City, Silicon Valley
   - Improve GPE/LOC classification

   **Items**: iPhone 15 Pro, React.js
   - Add technology product patterns

4. **Test improvements** (10 minutes)
   ```bash
   npx vitest tests/entity-extraction/extraction.spec.ts
   # Target: 18-22 tests passing (65-79%)
   ```

**Success Criteria**:
- ✅ complex-person-002 passes (partial name matching validated)
- ✅ At least 3 new organization tests pass
- ✅ At least 2 new location tests pass
- ✅ Overall: 18+ tests passing (65%+)

---

### Task 3: Increase Pattern Coverage (If Time Permits)

**Goal**: Increase pattern coverage from 26% to 30%+

**Steps**:

1. **Check current coverage** (5 minutes)
   ```bash
   npx ts-node scripts/pattern-expansion/inventory-patterns.ts
   # Output: reports/rung1_pattern_coverage_summary.md
   ```

2. **Identify high-value patterns** (10 minutes)
   ```bash
   cat reports/rung1_pattern_coverage_summary.md
   # Look for: Relation families with <20% coverage
   ```

3. **Add dependency patterns** (20 minutes)

   File: `app/engine/extract/relations.ts`

   Add patterns for common relations:
   ```typescript
   // Example: "founded" relation
   {
     subj: 'nsubj',
     obj: 'dobj',
     pred: 'founded',
     tokens: ['founded', 'established', 'created', 'started']
   },

   // Example: "located_in" relation
   {
     subj: 'nsubj',
     obj: 'pobj',
     pred: 'located_in',
     tokens: ['located', 'situated', 'based']
   }
   ```

4. **Validate improvement** (5 minutes)
   ```bash
   npx tsx scripts/pattern-expansion/evaluate-coverage.ts
   # Check: Coverage should increase toward 30%
   ```

**Success Criteria**:
- ✅ Pattern coverage ≥30%
- ✅ No decrease in precision/recall
- ✅ At least 3 new pattern families covered

---

## 🛠️ Development Environment Setup

### Start Services

```bash
# Terminal 1: Start spaCy parser (REQUIRED)
make parser
# Wait for: "Application startup complete"
# Runs on: http://127.0.0.1:8000

# Terminal 2: Your working terminal
# Run tests, make changes, etc.
```

### Verify Services Running

```bash
# Check parser
curl -s http://127.0.0.1:8000/health
# Expected: {"status": "ok"}

# If parser not running:
# 1. Check if port 8000 is already in use: lsof -i :8000
# 2. Kill existing process: kill -9 <PID>
# 3. Restart: make parser
```

### Install Dependencies (If Needed)

```bash
# Node dependencies
npm install

# Python dependencies
python3 -m venv .venv
. .venv/bin/activate
pip install -r scripts/requirements.txt
```

---

## 📋 Testing Commands

### Run Specific Tests

```bash
# Stage 1 (should always pass)
npm test tests/ladder/level-1-simple.spec.ts

# Stage 2 (currently blocked on 2.12)
npm test tests/ladder/level-2-multisentence.spec.ts

# Test 2.12 only (appositive issue)
npx ts-node tests/ladder/test-2.12-only.ts

# Entity extraction tests
npx vitest tests/entity-extraction/extraction.spec.ts

# Specific entity test
npx vitest tests/entity-extraction/extraction.spec.ts -t "complex-person-002"
```

### Debug Tests

```bash
# Verbose output
L3_DEBUG=1 npm test tests/ladder/level-2-multisentence.spec.ts

# Debug runner with detailed output
npx ts-node tests/ladder/run-level-2.ts

# Debug specific test
L3_DEBUG=1 npx ts-node tests/ladder/test-2.12-only.ts
```

### Component Health Checks

```bash
# Pattern coverage
npx ts-node scripts/pattern-expansion/inventory-patterns.ts

# Extraction metrics
npx tsx scripts/pattern-expansion/evaluate-coverage.ts

# With precision guardrails
npx tsx scripts/pattern-expansion/evaluate-coverage.ts --precision_guardrails
```

---

## 📁 Key Files Reference

### Core Extraction
- **app/engine/extract/entities.ts** (2898 lines) - Entity extraction with 3-stage alias matching
- **app/engine/extract/relations.ts** - Dependency path patterns, relation extraction
- **app/engine/extract/orchestrator.ts** - Main coordinator, inverse relations
- **app/engine/extract/coreference.ts** - Pronoun resolution

### Testing
- **tests/ladder/level-2-multisentence.spec.ts** - Stage 2 tests (15 test cases)
- **tests/ladder/test-2.12-only.ts** - Isolated appositive test
- **tests/entity-extraction/extraction.spec.ts** - Entity extraction regression (28 tests)

### Configuration
- **app/engine/schema.ts** - Types, predicates, INVERSE mapping
- **app/parser/parse-types.ts** - spaCy dependency types

### Documentation
- **CLAUDE.md** - Comprehensive AI assistant guide (just created!)
- **INTEGRATED_TESTING_STRATEGY.md** - 5-stage testing ladder
- **docs/ARES_PROJECT_BRIEFING.md** - Iteration 37 status

---

## 🐛 Common Issues & Solutions

### Issue 1: Parser Not Running

**Symptoms**: `ECONNREFUSED 127.0.0.1:8000`

**Solution**:
```bash
# Check if running
curl -s http://127.0.0.1:8000/health

# Start parser
make parser

# If port busy:
lsof -i :8000
kill -9 <PID>
make parser
```

### Issue 2: Tests Not Running

**Symptoms**: `vitest: not found` or `MODULE_NOT_FOUND`

**Solution**:
```bash
# Install dependencies
npm install

# Run with npx
npx vitest run tests/ladder/level-1-simple.spec.ts
```

### Issue 3: TypeScript Errors

**Symptoms**: Compilation errors

**Solution**:
```bash
# Check for errors
npx tsc --noEmit

# Fix import paths, type mismatches
# Then recompile
npx tsc
```

### Issue 4: Stage 1 Broken

**Symptoms**: Previously passing tests now fail

**Solution**:
```bash
# This is CRITICAL - Stage 1 must always pass
# Revert your changes and investigate why

git diff  # See what changed
git checkout -- <file>  # Revert specific file

# Re-run Stage 1
npm test tests/ladder/level-1-simple.spec.ts
```

---

## 📊 Success Metrics

### Primary Goals (Must Achieve)

1. ✅ **Test 2.12 passes** - Appositive parsing fixed
2. ✅ **Stage 2 complete** - P≥85%, R≥80%, all 15 tests passing
3. ✅ **Entity extraction improved** - 18+ tests passing (65%+)

### Secondary Goals (Nice to Have)

4. ✅ **Pattern coverage** - Increased to 30%+
5. ✅ **Stage 1 maintained** - Still 100% passing
6. ✅ **No regressions** - All previously passing tests still pass

### Reporting Metrics

After completing tasks, report:

```
Task Results:
- Test 2.12: [PASS/FAIL]
- Stage 2: Precision [X]%, Recall [Y]%, F1 [Z]%
- Entity tests: [N]/28 passing ([%])
- Pattern coverage: [N]%
- Stage 1 status: [PASS/FAIL]
```

---

## 🔄 Git Workflow

### Making Changes

```bash
# Check current branch
git status
# Should be on: claude/claude-md-miex9940wrme9tpt-01Jd9AfTTZNzdiNeQ7jgvkmh

# Make changes...
# Test after EACH change (don't batch!)

# Commit with descriptive message
git add <files>
git commit -m "fix: correct appositive parsing in relation extraction

- Add appositive clause detection in dependency path finder
- Skip over appositive subjects to find actual sentence subject
- Fixes test 2.12: 'Aragorn, son of Arathorn, traveled to Gondor'

Iteration 37"

# Push to branch
git push -u origin claude/claude-md-miex9940wrme9tpt-01Jd9AfTTZNzdiNeQ7jgvkmh
```

### Commit Message Format

```
<type>: <subject>

<body>

Iteration 37
```

**Types**: `fix`, `feat`, `docs`, `test`, `refactor`

### CRITICAL Git Rules

- ✅ Always push to the `claude/claude-md-miex9940wrme9tpt-01Jd9AfTTZNzdiNeQ7jgvkmh` branch
- ✅ Branch MUST start with `claude/` and end with session ID
- ✅ If network error, retry up to 4 times with backoff (2s, 4s, 8s, 16s)
- ❌ NEVER use `--force` on shared branches
- ❌ NEVER skip hooks with `--no-verify`
- ❌ NEVER push to main/master without permission

---

## 💬 Communication Protocol

### When to Report Progress

1. **After completing Task 1** (appositive fix)
2. **After completing Task 2** (entity extraction)
3. **If you get blocked** (can't figure out issue)
4. **Before making major architectural changes**

### Report Format

```
Status Update:

Task: [Task name]
Status: [In Progress / Complete / Blocked]

Results:
- Test 2.12: [PASS/FAIL]
- Stage 2: [metrics]
- Entity tests: [N/28 passing]

Issues Found:
- [Description of any issues]

Next Steps:
- [What you'll work on next]
```

### Questions to Ask

If stuck, ask:

1. "Test 2.12 still fails after adding appositive detection. The parser shows Arathorn as nsubj. How should I handle this?"
2. "Entity extraction tests are still at 7/28. Which test cases should I prioritize?"
3. "Pattern coverage script shows errors. What's the correct command to run?"

---

## 🎓 Key Architecture Principles

### 1. HERT System (Entity IDs)

```typescript
// ✅ Use stable entity IDs
const relation = {
  subjectId: 'EID_Aragorn_a7b3',
  predicate: 'traveled_to',
  objectId: 'EID_Gondor_d4e2'
};

// ❌ Don't use entity names
const relation = {
  subject: 'Aragorn',  // BAD!
  object: 'Gondor'
};
```

### 2. Evidence Provenance

Always include source text and location:

```typescript
const relation = {
  subjectId: 'EID_Aragorn',
  predicate: 'traveled_to',
  objectId: 'EID_Gondor',
  evidence: {
    text: 'Aragorn traveled to Gondor',
    sourceDoc: 'test.txt',
    paragraphIndex: 0,
    tokenStart: 0,
    tokenEnd: 5
  }
};
```

### 3. Deterministic Behavior

```typescript
// ✅ Sort for consistency
entities.sort((a, b) => a.name.localeCompare(b.name));

// ❌ Never use randomness
Math.random()  // FORBIDDEN!
```

### 4. Progressive Testing

- Stage 1 MUST always pass
- Don't break lower stages when fixing higher stages
- Test after EACH change

---

## 📚 Essential Reading

Before starting, skim these (10 minutes total):

1. **CLAUDE.md** (sections 1-3) - Project overview, quick start, architecture
2. **INTEGRATED_TESTING_STRATEGY.md** (Stage 1-2) - Testing requirements
3. **docs/ARES_PROJECT_BRIEFING.md** - Iteration 37 status

For reference while working:

4. **CLAUDE.md** (sections 7-9) - Common tasks, debugging, conventions
5. **README.md** - Feature overview

---

## 🚀 Ready to Start?

### Pre-flight Checklist

- [ ] Parser running: `curl -s http://127.0.0.1:8000/health`
- [ ] Dependencies installed: `npm install` completed
- [ ] Stage 1 baseline: `npm test tests/ladder/level-1-simple.spec.ts` passes
- [ ] Read CLAUDE.md sections 1-3
- [ ] Understand Task 1 (appositive parsing fix)

### Launch Sequence

```bash
# 1. Start parser (Terminal 1)
make parser

# 2. Verify baseline (Terminal 2)
npm test tests/ladder/level-1-simple.spec.ts
# Should pass with P≥90%, R≥85%

# 3. Check blocker
npx ts-node tests/ladder/test-2.12-only.ts
# Should fail: Arathorn --[traveled_to]--> Gondor (wrong!)

# 4. Begin Task 1
# Open: app/engine/extract/relations.ts
# Add appositive handling logic
```

---

## 🎯 Summary: Your Mission

1. **Fix appositive parsing** (Test 2.12) - CRITICAL blocker
2. **Complete Stage 2** (P≥85%, R≥80%) - Unblock Stage 3
3. **Improve entity extraction** (7/28 → 18+/28) - Validate Iteration 37 work
4. **Maintain quality** - Stage 1 must stay at 100%

**Expected time**: 2-3 hours for Tasks 1-2
**Success indicator**: Stage 2 shows ✅ PASSED instead of ⚠️ 99%

---

**You've got this, Codex! Claude and the ARES team are standing by to help.**

**Begin with Task 1: Fix Test 2.12 appositive parsing issue.**

Good luck! 🚀
