# ARES Test Ladder - Level 3 Improvement

## Mission
Get Level 3 test precision from **77.9% → 80%+** (only 2.1% gap!)

## Current Status

### Test Ladder Results
```
✅ Level 1 (Simple Sentences):     20/20 tests passing
✅ Level 2 (Multi-Sentence):       15/15 tests passing
❌ Level 3 (Complex Narratives):   Failing - Relation precision 77.9% (needs 80%)
```

### Level 3 Metrics
```
Entity F1:       ✅ 0.85 (needs 0.77)
Relation Precision: ❌ 0.779 (needs 0.80) ← Focus here
Relation Recall:    ✅ 0.75 (needs 0.75)
Relation F1:        ✅ 0.77 (needs 0.77)
```

**The Gap**: Only 2.1 percentage points below threshold. We're extracting too many false positive relations.

## What You Need to Do

### 1. Run Level 3 Tests with Debug Logging
```bash
cd /Users/corygilford/ares
L3_DEBUG=1 npm test -- tests/ladder/level-3-complex.spec.ts
```

This will show:
- Which relations are being extracted
- Which ones are false positives (not in golden truth)
- Confidence scores for each relation

### 2. Analyze False Positives

Look for patterns in incorrectly extracted relations:
- Are they low confidence relations?
- Do they come from coreference errors?
- Are they from appositive parsing mistakes?
- Are entity names being confused?

### 3. Tune the Filters

**Option A: Raise confidence threshold**
File: `app/engine/extract/relations.ts` (around line 150)
```typescript
// Current threshold might be too low
const MIN_CONFIDENCE = 0.7; // Try raising to 0.75 or 0.8
```

**Option B: Tighten APPOS filter**
File: `app/engine/extract/appositive-relations.ts` (lines 50-100)
- Check if appositive relations are creating false positives
- May need stricter pattern matching

**Option C: Improve coreference precision**
File: `app/engine/coreference.ts`
- If pronouns are linking to wrong entities, this creates spurious relations
- Check nominal and title back-link logic

### 4. Rebuild and Test
```bash
npx tsc
npm test -- tests/ladder/level-3-complex.spec.ts
```

### 5. Iterate Until Passing

Target: Get precision ≥ 0.80 without dropping recall below 0.75

## Key Files

```bash
# Test file
tests/ladder/level-3-complex.spec.ts

# Entity extraction (recently fixed for long texts)
app/engine/extract/entities.ts

# Relation extraction
app/engine/extract/relations.ts
app/engine/extract/appositive-relations.ts
app/engine/extract/narrative-relations.ts

# Coreference resolution
app/engine/coreference.ts

# Main orchestrator
app/engine/orchestrator.ts
```

## Debug Commands

```bash
# Run Level 3 with full debug output
L3_DEBUG=1 npm test -- tests/ladder/level-3-complex.spec.ts

# Run all ladder tests
npm test -- tests/ladder/

# Compile TypeScript
npx tsc

# Check services
lsof -i :4000 -i :8000
```

## System State

**Services**: All running
- ✅ Backend API: Port 4000
- ✅ Parser: Port 8000
- ✅ Frontend: Port 3001

**Recent Fixes** (Nov 20):
- Fixed extraction on long texts (8000+ chars)
- All `.pos` property accesses now guarded
- Wiki generation enhanced with relationships

**TypeScript**: Compiled and ready

## Test Case Details

Level 3 tests complex Harry Potter narratives:
- 10 test cases
- Multi-paragraph stories
- Complex coreference chains
- Multiple entity types (PERSON, PLACE, ORG)

**Golden truth includes**:
- Family relations (parent_of, child_of)
- Professional relations (teaches_at, studied_at)
- Social relations (friends_with, enemy_of)
- Location relations (lived_in, traveled_to)

## Success Criteria

You'll know it's fixed when:
```
✅ avgRelationP ≥ 0.80  (currently 0.779)
✅ avgRelationR ≥ 0.75  (currently 0.75)
✅ relationF1 ≥ 0.77    (currently 0.77)
```

And test output shows:
```
✓ tests/ladder/level-3-complex.spec.ts (10 tests)
```

## Strategy Recommendations

### Conservative Approach (Recommended)
1. Run with debug logging first - understand the problem
2. Make ONE small change (e.g., confidence threshold 0.7 → 0.72)
3. Test and measure impact
4. Iterate until passing

### Aggressive Approach
1. Raise confidence threshold significantly (0.7 → 0.8)
2. Test - if precision improves but recall drops too much, back off slightly
3. Find the sweet spot

## Important Notes

- **Don't over-optimize**: Level 3 is just 2.1% away, small changes should work
- **Watch recall**: Don't let it drop below 0.75
- **Test incrementally**: One change at a time
- **Recent context**: Entity extraction is solid (just fixed for long texts), so focus on relations only

## If You Get Stuck

1. **Share the debug output**: Show which relations are false positives
2. **Ask questions**: "Should I focus on confidence thresholds or coreference accuracy?"
3. **Try small experiments**: Confidence 0.70 → 0.72 → 0.75 until it passes

## Quick Start

```bash
# Step 1: See what's failing
cd /Users/corygilford/ares
L3_DEBUG=1 npm test -- tests/ladder/level-3-complex.spec.ts > /tmp/level3-debug.log 2>&1

# Step 2: Analyze the false positives
grep "FALSE POSITIVE" /tmp/level3-debug.log
# or
tail -200 /tmp/level3-debug.log

# Step 3: Make your first adjustment (suggestion: raise confidence threshold)
# Edit: app/engine/extract/relations.ts

# Step 4: Rebuild and test
npx tsc
npm test -- tests/ladder/level-3-complex.spec.ts
```

## Goal
Get this output:
```
✓ tests/ladder/level-3-complex.spec.ts (10 tests)
  ✓ should pass complex Harry Potter narrative tests
```

**You got this! It's only 2.1% away.** 🎯
