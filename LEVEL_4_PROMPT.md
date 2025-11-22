# ARES Test Ladder - Level 4: Real Literature & Long Texts

## Mission
Design and pass Level 4 tests focused on **real literature extraction** - biblical texts, classic novels, and very long narratives (15,000+ characters).

## Context: Where We Are

### ✅ Current Status
```
✅ Level 1: Simple Sentences (20 tests)       - PASSING (99% entity precision)
✅ Level 2: Multi-Sentence (15 tests)         - PASSING (98% entity precision)
✅ Level 3: Complex Narratives (10 tests)     - PASSING (81% relation precision)
⬜ Level 4: Real Literature & Long Texts      - NOT YET DESIGNED
```

### 🎯 Level 3 Success (Nov 20, 2025)
Just completed! Improved relation precision from 77.9% → 81.2% through surgical filters:
- Filter 1: Family role label detection (prevents "eldest son" from being parent)
- Filter 2: Marriage deduplication (prevents spurious marriages)

**Key Learning**: Small, targeted filters are more effective than broad changes.

## Level 4 Objectives

### 1. Real Literature Extraction
Handle authentic literary texts with:
- Historical/archaic language patterns
- Biblical narrative structures
- Complex sentence structures from classic novels
- Proper noun variations (place names, historical dates)

### 2. Very Long Text Handling
- Texts 15,000+ characters (vs Level 3's ~2,000 chars)
- Maintain precision/recall across long narratives
- Handle entity disambiguation over long distances
- Scale relation extraction without performance degradation

### 3. Domain-Specific Challenges
- **Biblical texts**: Ancient names, genealogies, place names (Bethlehem-judah, Moab)
- **Classic literature**: Formal language, dates (1775), complex descriptions
- **Historical narratives**: Mixed proper nouns and common nouns

## Current Failing Tests (Starting Point)

### Test: Tale of Two Cities (Opening)
**File**: `tests/literature/real-text.spec.ts`
**Status**: ❌ Date extraction failing

```typescript
// Text: "It was the best of times, it was the worst of times...in the year 1775"
// Expected: Extract date "1775"
// Actual: Date not being extracted
// Issue: Year format not recognized by DATE entity type
```

### Test: Book of Ruth (Chapter 1)
**File**: `tests/literature/real-text.spec.ts`
**Status**: ❌ Multiple failures

**Issue 1 - Entity extraction**:
```typescript
// Text: "And Elimelech Naomi's husband died"
// Expected: Extract "Elimelech" as PERSON
// Actual: Extracts "And Elimelech Naomi" (incorrect span)
// Root cause: Possessive "'s" parsing issue
```

**Issue 2 - Place extraction**:
```typescript
// Text: "country of Moab"
// Expected: Extract "Moab" as PLACE
// Actual: Not extracted
// Root cause: "country of" pattern not handled
```

**Issue 3 - Relation extraction**:
```typescript
// Expected: Extract family relations (married_to, parent_of, etc.)
// Actual: 0 relations extracted
// Root cause: Archaic phrasing ("Elimelech Naomi's husband")
```

## Your Tasks

### Task 1: Analyze Current Failures (30 min)

Run the real literature tests with debug logging:

```bash
cd /Users/corygilford/ares

# Run with debug output
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts 2>&1 | tee /tmp/level4-debug.log

# Examine failures
grep -A10 "FAIL" /tmp/level4-debug.log
```

**Answer these questions**:
1. Why isn't "1775" being extracted as a DATE?
2. Why is "Elimelech Naomi" being extracted as one entity?
3. Why is "Moab" not being extracted as a PLACE?
4. Why are 0 relations being extracted from Ruth text?

### Task 2: Fix Entity Extraction Issues (60 min)

**Focus files**:
- `app/engine/extract/entities.ts` - Core entity extraction
- `app/engine/orchestrator.ts` - Entity coordination

**Likely fixes needed**:

**Fix A: Year format detection**
```typescript
// In entities.ts or date extraction logic
// Add pattern for standalone years: /\b(1[0-9]{3}|20[0-9]{2})\b/
// Examples: 1775, 1999, 2024
```

**Fix B: Possessive parsing**
```typescript
// In entities.ts around line 700-800 (token merging)
// When encountering "'s", ensure previous token boundary is correct
// "Elimelech Naomi's husband" should split as:
//   - "Elimelech" (PERSON)
//   - "Naomi" (PERSON)
//   - "'s husband" (skip or separate)
```

**Fix C: Place name extraction**
```typescript
// In entities.ts or place extraction
// Add pattern: "country of X", "land of X" → extract X as PLACE
// Example: "country of Moab" → extract "Moab"
```

### Task 3: Fix Relation Extraction for Archaic Text (45 min)

**Focus files**:
- `app/engine/extract/narrative-relations.ts` - Pattern matching
- `app/engine/extract/possessive-relations.ts` - Possessive patterns

**Likely fixes needed**:

**Pattern A: Possessive family relations**
```typescript
// Add pattern: "X's husband/wife Y" or "Y X's husband/wife"
// Example: "Elimelech Naomi's husband" → married_to(Naomi, Elimelech)
```

**Pattern B: Historical phrasing**
```typescript
// Add patterns for biblical/archaic text:
// - "X begat Y" → parent_of(X, Y)
// - "son/daughter of X" → parent_of(X, son/daughter)
// - "X's kinsman Y" → related_to(X, Y)
```

### Task 4: Design Level 4 Test Structure (30 min)

Create: `tests/ladder/level-4-literature.spec.ts`

**Suggested structure**:

```typescript
describe('Test Ladder - Level 4: Real Literature & Long Texts', () => {
  describe('Historical Dates', () => {
    it('should extract years from classic literature', () => {
      // Test: Tale of Two Cities opening (1775)
      // Metrics: DATE entities, precision/recall
    });
  });

  describe('Biblical Narratives', () => {
    it('should extract entities from Book of Ruth', () => {
      // Test: Ruth Chapter 1
      // Metrics: PERSON entities (Elimelech, Naomi, Ruth, etc.)
    });

    it('should extract places from biblical text', () => {
      // Test: Bethlehem-judah, Moab, etc.
      // Metrics: PLACE entities
    });

    it('should extract family relations from archaic phrasing', () => {
      // Test: "X's husband", "son of Y", etc.
      // Metrics: married_to, parent_of relations
    });
  });

  describe('Very Long Texts', () => {
    it('should handle 15,000+ character narratives', () => {
      // Test: Multi-chapter biblical text or novel excerpt
      // Metrics: Maintain P/R/F1 thresholds
      // Performance: Complete in <30 seconds
    });
  });

  describe('Level 4 Overall Metrics', () => {
    it('should meet Level 4 thresholds across all literary tests', () => {
      // Aggregate metrics from all Level 4 tests
      // Thresholds (suggested):
      //   Entity P ≥ 85%, R ≥ 80%, F1 ≥ 82%
      //   Relation P ≥ 75%, R ≥ 70%, F1 ≥ 72%
      // (Lower than Level 3 because literary text is harder)
    });
  });
});
```

### Task 5: Implement & Validate (60 min)

```bash
# After making fixes:
npx tsc

# Test specific fixes:
npm test -- tests/literature/real-text.spec.ts

# Test new Level 4 suite:
npm test -- tests/ladder/level-4-literature.spec.ts

# Run all ladder tests:
npm test -- tests/ladder/

# Full test suite:
npm test
```

**Success criteria**:
```
✅ Tale of Two Cities: Date "1775" extracted
✅ Book of Ruth: All major characters extracted correctly
✅ Book of Ruth: Place names extracted
✅ Book of Ruth: At least 5 family relations extracted
✅ Very long text: Completes in <30 seconds
✅ Level 4 metrics: Meet or exceed thresholds
```

## Key Files Reference

```bash
# Entity extraction (likely needs work)
app/engine/extract/entities.ts              # Lines 700-900 (token merging, DATE extraction)

# Relation extraction (likely needs patterns)
app/engine/extract/narrative-relations.ts    # Add archaic/biblical patterns
app/engine/extract/possessive-relations.ts   # Fix possessive parsing

# Orchestrator (may need coordination fixes)
app/engine/orchestrator.ts                   # Lines 950-1000 (recently added filters)

# Test files
tests/literature/real-text.spec.ts           # Currently failing - fix these
tests/ladder/level-4-literature.spec.ts      # CREATE THIS (new Level 4 suite)
```

## Debug Commands

```bash
# Entity extraction debugging
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts

# Check what entities are being extracted
grep "Entity extracted" /tmp/level4-debug.log

# Check relation patterns matching
grep "Pattern matched" /tmp/level4-debug.log

# Run specific test
npm test -- tests/literature/real-text.spec.ts -t "Book of Ruth"

# Compile TypeScript
npx tsc

# Check services
lsof -i :4000 -i :8000
```

## Strategy

### Phase 1: Understand (30 min)
- Run failing tests with debug logging
- Identify exact error patterns
- Document what's being extracted vs what should be extracted

### Phase 2: Fix Entity Extraction (60 min)
- Start with dates (easiest - just add year pattern)
- Then possessive parsing (moderate difficulty)
- Then place name patterns (similar to existing patterns)

### Phase 3: Fix Relations (45 min)
- Add archaic/biblical patterns to narrative-relations.ts
- Fix possessive relation parsing
- Test incrementally

### Phase 4: Create Level 4 Suite (30 min)
- Design comprehensive Level 4 test structure
- Set appropriate thresholds (lower than Level 3)
- Include very long text test

### Phase 5: Validate & Document (30 min)
- Run all tests
- Verify Level 4 passes
- Document approach and results

## Expected Challenges

### Challenge 1: Archaic Language
**Issue**: Biblical text uses different phrasing than modern text
**Solution**: Add specialized patterns without breaking modern text extraction
**Test**: Ensure Level 1-3 still pass after changes

### Challenge 2: Entity Span Boundaries
**Issue**: Possessive "'s" causing incorrect entity boundaries
**Solution**: Improve tokenization logic to handle possessives correctly
**Test**: "Elimelech Naomi's husband" should extract "Elimelech" and "Naomi" separately

### Challenge 3: Performance at Scale
**Issue**: 15,000+ character texts may be slow
**Solution**: Monitor extraction time, optimize if needed
**Test**: Should complete in <30 seconds

## Thresholds for Level 4

**Suggested (adjust based on difficulty)**:

```
Entity Extraction:
  Precision: ≥85% (vs 99% in Level 3)
  Recall: ≥80% (vs 98% in Level 3)
  F1: ≥82%

Relation Extraction:
  Precision: ≥75% (vs 81% in Level 3)
  Recall: ≥70% (vs 78% in Level 3)
  F1: ≥72%

Performance:
  15,000 char text: <30 seconds
  Memory: <2GB
```

**Rationale**: Literary text is inherently harder:
- Archaic language
- Complex sentence structures
- Historical proper nouns
- Less structured than fiction

## Success Definition

You'll know Level 4 is complete when:

```bash
npm test -- tests/ladder/

# Output:
✓ tests/ladder/level-1-simple.spec.ts (20 tests)
✓ tests/ladder/level-2-multisentence.spec.ts (15 tests)
✓ tests/ladder/level-3-complex.spec.ts (10 tests)
✓ tests/ladder/level-4-literature.spec.ts (10 tests) ⭐ NEW!

Test Files: 4 passed (4)
Tests: 55 passed (55)
```

## Current System State

**Services**: All running
- ✅ Backend API: Port 4000
- ✅ Parser: Port 8000
- ✅ Frontend: Port 3001

**Recent Changes** (Nov 20):
- ✅ Level 3 precision filters in orchestrator.ts (lines 951-985)
- ✅ Long text extraction fixed (entities.ts)
- ✅ Auto-approve config enabled (should work in new session)

**TypeScript**: Compiled and ready

**Test Baseline**:
- All Level 1-3 tests passing
- Some real literature tests failing (your starting point)

## Documentation

When you complete Level 4, create:
```
/Users/corygilford/ares/LEVEL_4_SUCCESS.md
```

Include:
- What was broken
- What you fixed
- Metrics achieved
- Test cases that now pass
- Lessons learned

## Quick Start Checklist

```bash
# 1. Analyze failures
cd /Users/corygilford/ares
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts > /tmp/level4-debug.log 2>&1
less /tmp/level4-debug.log

# 2. Fix entity extraction
# Edit: app/engine/extract/entities.ts
# Add: Year pattern, possessive parsing, place patterns

# 3. Fix relation extraction
# Edit: app/engine/extract/narrative-relations.ts
# Add: Archaic/biblical relation patterns

# 4. Test incrementally
npx tsc
npm test -- tests/literature/real-text.spec.ts

# 5. Create Level 4 suite
# Create: tests/ladder/level-4-literature.spec.ts

# 6. Validate all levels
npm test -- tests/ladder/
```

## Resources

**Research paper** (just added): `/docs/research/entity-extraction-sota.pdf`
- May have insights on handling historical/literary text
- Check for date extraction patterns
- Look for possessive parsing techniques

**Previous success docs**:
- `/LEVEL_3_SUCCESS.md` - Recent success pattern
- `/HAIKU_SESSION_PROMPT.md` - This worked well for Level 3

**Golden truth** (for creating tests):
- `tests/golden_truth/` - Has examples of expected outputs

## Final Notes

- **Build on Level 3 success**: Use the same methodical approach
- **Test incrementally**: Fix one issue at a time
- **Don't break existing tests**: Run Level 1-3 after each change
- **Lower thresholds are OK**: Literary text is genuinely harder
- **Document everything**: Future sessions will appreciate it

**You've got this!** Level 3 was conquered with precision and method. Level 4 is just applying the same discipline to harder text. 🎯

---

**Created**: November 20, 2025
**For**: Haiku session (Level 4 development)
**Prerequisites**: Level 1-3 passing, auto-approve config enabled
**Estimated time**: 3-4 hours for complete Level 4 implementation
