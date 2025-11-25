# AI Handoff Document

**Status**: ACTIVE
**Updated**: 2025-11-25
**Iteration**: 37

## Current Task
Complete Stage 2 testing and improve entity extraction coverage

## Context (Iteration 37)

### Test Status
- ✅ **Stage 1 (Foundation)**: PASSED - 119/119 tests passing
- ⚠️ **Stage 2 (Components)**: 99% complete - **blocked on test 2.12** (appositive parsing)
- ⏸️ **Stage 3-5**: Not started (blocked on Stage 2)

### Entity Extraction
- **Current**: 7/28 tests passing (25%)
- **Target**: 18-22/28 tests (65-79%)
- **Recent**: Partial name variant matching implemented

### Pattern Coverage
- **Current**: 26% (480/1827 patterns)
- **Target**: ≥30% for Stage 1, ≥50% for Stage 3

### Recent Accomplishments (Iteration 37)
1. ✅ Partial name variant matching for compound names (Sarah Johnson-Smith → aliases)
2. ✅ Pronoun filtering from coreference-resolved aliases
3. ✅ Name decomposition with proximity gating (~500 chars)
4. ✅ Entity merging for abbreviated names (Mike → Michael)
5. ✅ Name promotion (Emma → Emma Smith with alias "Em")
6. ✅ Title consolidation (Professor Wei → Wei Chen as alias)

### Critical Blocker: Test 2.12

**Issue**: Appositive parsing error
- **Input**: "Aragorn, son of Arathorn, traveled to Gondor"
- **Expected**: `Aragorn --[traveled_to]--> Gondor`
- **Actual**: `Arathorn --[traveled_to]--> Gondor` ❌ (wrong subject!)
- **Root Cause**: Appositive phrase interferes with dependency parsing
- **Location**: `app/engine/extract/relations.ts` - dependency path extraction

## Instructions for Codex (Priority Order)

### Task 1: Fix Test 2.12 - Appositive Parsing ⚠️ CRITICAL

**Goal**: Correctly extract "Aragorn traveled_to Gondor" from appositive sentences

**Steps**:
1. Run isolated test: `npx ts-node tests/ladder/test-2.12-only.ts`
2. Check dependency parse with parser directly
3. Add appositive handling in `app/engine/extract/relations.ts`:
   - Detect when subject is inside appositive clause (dep='appos')
   - Skip appositive and use parent entity as actual subject
4. Test fix and verify Stage 2 metrics

**Files**:
- `app/engine/extract/relations.ts` (lines ~400-800)
- `app/engine/extract/clause-detector.ts`
- `tests/ladder/test-2.12-only.ts`

**Success Criteria**:
- ✅ Test 2.12 passes
- ✅ Stage 2: P≥85%, R≥80%
- ✅ No Stage 1 regressions

### Task 2: Improve Entity Extraction Test Coverage

**Goal**: Increase from 7/28 (25%) to 18-22/28 (65-79%)

**Priority Tests**:
1. **complex-person-002**: Multiple persons with informal references (should pass with recent partial name matching)
2. **organization-001 to organization-003**: Add ORG detection (Apple, TechCrunch, FBI, CIA)
3. **location-001 to location-002**: Improve GPE/LOC classification (New York City, Silicon Valley)
4. **historical-context**: Persons in historical text
5. **multilingual**: Non-English name variants

**Files**:
- `app/engine/extract/entities.ts` (lines 2891+ for partial name matching)
- Entity classification logic
- NER pattern additions

**Testing**:
```bash
# Run all entity tests
npx vitest tests/entity-extraction/extraction.spec.ts

# Run specific test
npx vitest tests/entity-extraction/extraction.spec.ts -t "complex-person-002"
```

**Success Criteria**:
- ✅ complex-person-002 passes (validates Iteration 37 work)
- ✅ At least 3 new ORG tests pass
- ✅ At least 2 new PLACE tests pass
- ✅ Overall: 18+ tests passing (65%+)

### Task 3: Increase Pattern Coverage (If Time Permits)

**Goal**: Increase from 26% to 30%+

**Steps**:
1. Run coverage audit: `npx ts-node scripts/pattern-expansion/inventory-patterns.ts`
2. Identify relation families with <20% coverage
3. Add dependency patterns to `app/engine/extract/relations.ts`
4. Validate: `npx tsx scripts/pattern-expansion/evaluate-coverage.ts`

**Common patterns to add**:
- founded/established (for organizations)
- located_in/based_in (for locations)
- employed_by/works_at (for employment)
- member_of/belongs_to (for memberships)

**Success Criteria**:
- ✅ Pattern coverage ≥30%
- ✅ No precision/recall decrease

### Testing Commands

```bash
# Start parser (Terminal 1 - keep running)
make parser

# Verify baseline (Terminal 2)
npm test tests/ladder/level-1-simple.spec.ts  # Must always pass

# Check blocker
npx ts-node tests/ladder/test-2.12-only.ts

# Debug with verbose output
L3_DEBUG=1 npx ts-node tests/ladder/run-level-2.ts

# Full Stage 2 suite
npm test tests/ladder/level-2-multisentence.spec.ts

# Entity extraction tests
npx vitest tests/entity-extraction/extraction.spec.ts

# Pattern coverage
npx ts-node scripts/pattern-expansion/inventory-patterns.ts
npx tsx scripts/pattern-expansion/evaluate-coverage.ts
```

### Progress Reporting

After each task, report:
```
Status Update - [Task Name]

Completed:
- [What was done]

Results:
- Test 2.12: [PASS/FAIL]
- Stage 2: Precision [X]%, Recall [Y]%, F1 [Z]%
- Entity tests: [N]/28 passing ([%])
- Pattern coverage: [N]%

Issues Found:
- [Any blockers or unexpected behavior]

Next Steps:
- [What to do next]
```

## Instructions for Claude

### Review Checklist
1. Review Codex's progress updates and test results
2. Verify Stage 2 completion (test 2.12 fixed, P≥85%, R≥80%)
3. Validate entity extraction improvements (18+ tests passing)
4. Check for any Stage 1 regressions (must maintain 100% pass rate)
5. Review code changes for:
   - Proper HERT ID usage
   - Evidence provenance tracking
   - Deterministic behavior (no randomness)
   - No new architectural debts

### Next Phase Planning

**If Stage 2 Complete** (P≥85%, R≥80%):
- Plan Stage 3 work (complex paragraph extraction)
- Set pattern coverage targets (50%+)
- Identify coreference resolution improvements

**If Entity Extraction Improved** (18+ tests):
- Validate partial name matching is working correctly
- Plan remaining entity type coverage (DATE, ITEM)
- Consider multilingual name support

**If Blockers Remain**:
- Analyze root causes
- Provide architectural guidance
- Adjust task priorities

### Architecture Review Points

1. **Appositive Handling**: Review solution for correctness and maintainability
2. **Entity Type Coverage**: Ensure patterns don't over-extract (precision vs recall balance)
3. **Pattern Library**: Validate new patterns follow existing conventions
4. **Test Coverage**: Ensure new functionality has appropriate tests

### Documentation Updates

After Codex completes tasks:
1. Update CHANGELOG.md with Iteration 37 improvements
2. Update INTEGRATED_TESTING_STRATEGY.md with current stage status
3. Update docs/ARES_PROJECT_BRIEFING.md if moving to Iteration 38
4. Update this handoff document for next Codex session

## NEXT: Codex (see CODEX_ONLINE_PROMPT.md for detailed instructions)
