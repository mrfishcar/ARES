# Test Ladder Strategy - Quick Reference

**⚠️ DEPRECATION NOTICE**: This file has been superseded by `UNIFIED_TESTING_STRATEGY.md`

**Please refer to**: `/home/user/ARES/UNIFIED_TESTING_STRATEGY.md` for the current testing strategy that consolidates both Progressive Levels and Diagnostic Rungs into a single workflow.

**Last Updated**: 2025-11-09 (Deprecated 2025-11-10)

## What is the Test Ladder?

A systematic, progressive approach to fixing entity and relation extraction test failures by building quality incrementally through 5 difficulty levels.

## Core Principles

1. **No artificial scope limits** - Handle all entity types and predicates
2. **Progressive difficulty** - Start simple, add complexity gradually
3. **Must pass Level N before moving to Level N+1**
4. **Deterministic rules** - Pure algorithms, no ML dependencies
5. **Gold standard validation** - Hand-labeled ground truth

## The 5 Levels

```
Level 1: Simple Sentences         → P≥0.90, R≥0.85, F1≥0.87 ✅ PASSED
Level 2: Multi-Sentence Narratives → P≥0.85, R≥0.80, F1≥0.82 ⚠️ 80% (gap: 5%)
Level 3: Complex Multi-Paragraph  → P≥0.80, R≥0.75, F1≥0.77 ⚠️ 69% (gap: 11%)
Level 4: Temporal Reasoning       → P≥0.80, R≥0.70, F1≥0.74 ⏸️ Not started
Level 5: Full Narrative           → P≥0.75, R≥0.65, F1≥0.69 ⏸️ Not started
```

## Test Locations

- **Ladder Tests**: `/home/user/ARES/tests/ladder/`
  - `level-1-simple.spec.ts` - 20 simple test cases
  - `level-2-multisentence.spec.ts` - 15 multi-sentence narratives
  - `level-3-complex.spec.ts` - Complex multi-paragraph scenarios
  - `run-level-1.ts` - Debug runner for Level 1

- **Reports**: `/home/user/ARES/LADDER_TEST_REPORT.md`

## Running Tests

```bash
# Run all ladder tests
npm run test:ladder

# Run specific level
npm test tests/ladder/level-1-simple.spec.ts
npm test tests/ladder/level-2-multisentence.spec.ts
npm test tests/ladder/level-3-complex.spec.ts

# Debug runner for Level 1
npx ts-node tests/ladder/run-level-1.ts
```

## Fix Strategy (6 Steps)

1. **Run tests** - Identify which level is failing
2. **Analyze failures** - What entity types or relations are wrong?
3. **Root cause** - Why? (schema guards, patterns, coreference, etc.)
4. **Targeted fix** - Modify specific files:
   - `app/engine/schema.ts` - Type guards and allowed combinations
   - `app/engine/extract/entities.ts` - Entity extraction patterns
   - `app/engine/extract/relations/dependency-paths.ts` - Relation patterns
5. **Verify** - Re-run tests to confirm improvement
6. **Document** - Update `LADDER_TEST_REPORT.md` with changes

## Recent Wins (Level 1 → 90% Precision)

1. **Allow traveling to ORG** - Fixed "Hermione went to Hogwarts"
2. **Extract fantasy dates** - Year pattern now matches 3000-9999
3. **Classify "Battle of X" as EVENT** - Not PERSON
4. **Add "fought_in" pattern** - New dependency pattern for combat relations

## Current Focus: Level 2

**Challenge**: Multi-sentence narratives require:
- **Coreference resolution** - "He studied magic there" → resolve "He"
- **Pronoun handling** - Track pronouns across sentences
- **Title back-links** - "The wizard teaches" → recognize as Dumbledore
- **Coordination** - "Harry and Ron studied" → extract both relations

**Known Issues**:
- False positives from over-broad patterns
- Coreference errors in complex narratives
- Need 5% precision boost to reach 85% target

## Files Modified by Ladder Fixes

### Core Extraction
- `app/engine/schema.ts` - Entity/relation type guards
- `app/engine/extract/entities.ts` - Entity patterns (date regex, battle keywords)
- `app/engine/extract/relations/dependency-paths.ts` - Relation patterns

### Supporting Systems
- `app/services/parse/HttpParserClient.ts` - Timeout handling, caching
- `tests/ladder/` - Test cases and runners

## Progress Tracking

**Overall Integration Tests**: 88.4% pass rate (11/217 failed)
- Test execution: 217s → 65s (70% faster)
- Pass rate: 83.9% → 88.4% (+4.5%)
- Failed tests: 33 → 11 (66% reduction)

**Latest Session (2025-11-09)**:
- Fixed TypeScript error in `app/engine/entity-profiler.ts:429`
- Improved pronoun resolution in `app/engine/coref.ts:406-464` to prefer sentence subjects over appositives
- Added appositive filtering in `app/engine/extract/orchestrator.ts:469-499`
- Created debug runners: `tests/ladder/run-level-2.ts`, `tests/ladder/test-2.12-only.ts`
- **Remaining Issue**: Test 2.12 false positive - dependency parser extracts "Arathorn traveled_to Gondor" instead of "Aragorn traveled_to Gondor" due to appositive phrase "son of Arathorn"

## Next Steps

1. ✅ Pass Level 1 (DONE - 90% precision achieved)
2. 🔄 Pass Level 2 (IN PROGRESS - 84.4% precision, need 85.0%, gap: 0.6%)
   - **Blocker**: Test 2.12 dependency parsing issue with appositives
   - Needs investigation of how spaCy parses "Aragorn, son of Arathorn, traveled to Gondor"
3. ⏭️ Pass Level 3 (need +11% precision)
4. ⏭️ Complete Levels 4-5

---

**Remember**: The test ladder is about **incremental quality**. Fix one level at a time, document every change, and verify metrics before moving forward.
