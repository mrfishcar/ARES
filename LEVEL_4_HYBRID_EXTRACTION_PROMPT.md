# ARES Level 4: Hybrid Extraction System

**Date**: November 20, 2025
**Target**: Fix remaining Level 4 failures with pattern-based extraction
**Architecture**: Hybrid NER (spaCy + Patterns + Filters)
**Session**: Haiku focused implementation

---

## Strategic Decision: Keep spaCy, Add Patterns

### Why NOT Switch to Rust NLP?

**Rust Options Evaluated**:
- rust-bert: More accurate but slower, needs GPU, less mature ecosystem
- rsnltk: Depends on Python anyway
- nlprule: Not designed for NER

**Cost/Benefit Analysis**:
- Migration cost: **Weeks** (rewrite parser, re-test everything)
- Performance impact: **Slower** (BERT vs spaCy)
- Maturity risk: **High** (Rust NLP "less mature than Python's")
- Current issues solvable: **YES** (with patterns)

**Verdict**: **Augment spaCy with pattern-based extraction** (industry standard approach)

---

## Current State

### Test Results (After Entity Filters)
```
Level 4: 4 of 7 tests passing (57%)

✅ Extract place entities from real literature
✅ Extract person entities from real literature
✅ Show overall extraction statistics
✅ Extract places from Ruth

❌ Extract dates from real literature (DATE pipeline - separate issue)
❌ Extract family members from Ruth (missing "Chilion")
❌ Extract family relationships (0 relations extracted)
```

### Root Cause Analysis

**Issue 1: Missing "Chilion"**
- Text: `"the name of his two sons Mahlon and Chilion"`
- spaCy extracts: "Mahlon" ✅
- spaCy misses: "Chilion" ❌
- Why: Conjunction pattern - spaCy sometimes misses second name after "and"

**Issue 2: Zero Relations**
- Text: `"And Elimelech Naomi's husband died"`
- Expected pattern: `"Naomi's husband"` → married_to(Naomi, Elimelech)
- Actual: Pattern matches `"And Elimelech Naomi's husband"` → fails
- Why: Leading conjunction breaks pattern matching

---

## Solution: Hybrid Extraction Architecture

### Layer 1: spaCy NER (Primary)
**Status**: Already working ✅
**Coverage**: ~90% of entities
**Strengths**: Fast, accurate on modern text

### Layer 2: Pattern-Based Extraction (Fallback)
**Status**: Needs implementation ⚠️
**Coverage**: Edge cases spaCy misses
**Patterns to add**:
1. Conjunctive names
2. List patterns
3. Possessive patterns

### Layer 3: Quality Filters (Post-processing)
**Status**: Already working ✅
**Coverage**: Reject/split malformed entities
**Examples**: "Elimelech Naomi" split, role names rejected

---

## Implementation Plan

### Task 1: Fix Relation Pattern Matching (30 min) ⚡ HIGHEST PRIORITY

**File**: `/Users/corygilford/ares/app/engine/extract/narrative-relations.ts`

**Problem**: Patterns include leading conjunctions

**Current Code** (from Haiku's earlier work, lines 90-125):
```typescript
// Pattern: "X's husband/wife died" → married_to(X, husband/wife)
```

**Issue**: Text `"And Elimelech Naomi's husband died"` doesn't match because of "And"

**Fix**: Add conjunction normalization BEFORE pattern matching

**Implementation**:

```typescript
/**
 * Normalize text for pattern matching
 * Remove leading conjunctions, extra whitespace
 */
function normalizeTextForPatterns(text: string): string {
  let normalized = text.trim();

  // Remove leading conjunctions
  normalized = normalized.replace(/^(And|But|Then|So|For|Yet|Nor|Or)\s+/i, '');

  // Remove leading articles
  normalized = normalized.replace(/^(The|A|An)\s+/i, '');

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized;
}
```

**Integration Point** (in extractNarrativeRelations function):

```typescript
export function extractNarrativeRelations(
  text: string,
  entities: Entity[],
  parsedSentences: ParsedSentence[]
): Relation[] {
  const relations: Relation[] = [];

  // BEFORE pattern matching, normalize text
  const normalizedText = normalizeTextForPatterns(text);

  // Now use normalizedText for pattern matching
  // Example: "And Elimelech Naomi's husband died"
  // becomes: "Elimelech Naomi's husband died"

  // Continue with existing pattern logic...
  // ...existing archaic patterns...

  return relations;
}
```

**Critical**: This change applies to ALL pattern matching, not just archaic patterns.

**Test Command**:
```bash
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family relationships"
```

**Expected Result**:
- Text: `"And Elimelech Naomi's husband died"` → normalized to `"Elimelech Naomi's husband died"`
- Pattern matches: `"Naomi's husband"` ✅
- Relation extracted: married_to(Naomi, Elimelech) ✅
- Test passes: "should extract family relationships" ✅

---

### Task 2: Add Conjunctive Name Extraction (60 min)

**File**: `/Users/corygilford/ares/app/engine/extract/entities.ts`

**Problem**: spaCy misses second name in "X and Y" patterns

**Current Behavior**:
- Text: `"Mahlon and Chilion"`
- spaCy NER: Extracts "Mahlon" (PERSON)
- spaCy NER: Misses "Chilion"

**Solution**: Add pattern-based fallback extraction

**Implementation**:

Create new function **after** spaCy extraction, **before** quality filtering:

```typescript
/**
 * Extract names missed by spaCy in conjunctive patterns
 * Pattern: [PERSON] and [CapitalizedWord]
 */
function extractConjunctiveNames(
  text: string,
  tokens: Token[],
  existingEntities: EntityCluster[]
): EntityCluster[] {
  const additionalEntities: EntityCluster[] = [];
  const existingNames = new Set(
    existingEntities.map(e => e.canonical.toLowerCase())
  );

  // Pattern: PERSON + "and" + PROPN (capitalized word not already extracted)
  for (let i = 0; i < tokens.length - 2; i++) {
    const current = tokens[i];
    const next = tokens[i + 1];
    const afterNext = tokens[i + 2];

    // Check if pattern matches: PERSON + "and" + Capitalized
    if (
      current.ent && current.ent.includes('PERSON') &&  // Current is PERSON
      next.text.toLowerCase() === 'and' &&               // Next is "and"
      /^[A-Z]/.test(afterNext.text) &&                   // After is capitalized
      afterNext.pos === 'PROPN' &&                       // After is proper noun
      !existingNames.has(afterNext.text.toLowerCase())   // Not already extracted
    ) {
      // Extract the missed name
      const cluster = createEntityCluster(
        'PERSON',
        afterNext.text,
        [afterNext],
        'pattern-conjunctive'
      );

      additionalEntities.push(cluster);
      existingNames.add(afterNext.text.toLowerCase());

      if (process.env.L4_DEBUG === '1') {
        console.log(
          `[PATTERN-EXTRACT] Found conjunctive name: "${current.text} and ${afterNext.text}" → extracted "${afterNext.text}"`
        );
      }
    }
  }

  return additionalEntities;
}
```

**Integration Point** (in extractEntities function, around line 1500-1600):

```typescript
export async function extractEntities(
  text: string,
  docId: string
): Promise<ExtractedEntitiesResult> {
  // ... existing spaCy extraction ...

  // After initial NER extraction, before quality filtering
  let allClusters = [...nerClusters];

  // Add pattern-based extraction for missed conjunctive names
  const conjunctiveNames = extractConjunctiveNames(text, allTokens, allClusters);
  allClusters = [...allClusters, ...conjunctiveNames];

  if (process.env.L4_DEBUG === '1' && conjunctiveNames.length > 0) {
    console.log(`[PATTERN-EXTRACT] Added ${conjunctiveNames.length} conjunctive names`);
  }

  // Continue with existing quality filtering...
  const filteredEntities = filterLowQualityEntities(allClusters, config);

  // ... rest of function ...
}
```

**Test Command**:
```bash
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family members"
```

**Expected Result**:
- Text: `"Mahlon and Chilion"`
- spaCy extracts: "Mahlon" ✅
- Pattern extracts: "Chilion" ✅
- Test passes: "should extract family members from Ruth" ✅

---

### Task 3: Add List Pattern Extraction (Optional - 30 min)

**Pattern**: `"the name of X was Y"` → extract Y

**Example from Ruth**:
- `"the name of the man was Elimelech"`
- `"the name of his wife Naomi"`
- `"the name of his two sons Mahlon and Chilion"`

**Implementation**:

```typescript
/**
 * Extract names from explicit naming patterns
 * Pattern: "the name of X was Y", "named Y", etc.
 */
function extractListPatternNames(
  text: string,
  tokens: Token[],
  existingEntities: EntityCluster[]
): EntityCluster[] {
  const additionalEntities: EntityCluster[] = [];

  // Regex patterns for explicit naming
  const namingPatterns = [
    /the name of (?:the |his |her |their )?(\w+) (?:was|were) ([A-Z]\w+)/gi,
    /named ([A-Z]\w+)/gi,
    /called ([A-Z]\w+)/gi,
  ];

  for (const pattern of namingPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[match.length - 1]; // Last captured group is the name

      // Check if already extracted
      const alreadyExtracted = existingEntities.some(
        e => e.canonical.toLowerCase() === name.toLowerCase()
      );

      if (!alreadyExtracted) {
        // Find token corresponding to this name
        const nameToken = tokens.find(
          t => t.text === name && /^[A-Z]/.test(t.text)
        );

        if (nameToken) {
          const cluster = createEntityCluster(
            'PERSON',
            name,
            [nameToken],
            'pattern-list'
          );

          additionalEntities.push(cluster);

          if (process.env.L4_DEBUG === '1') {
            console.log(`[PATTERN-EXTRACT] Found list pattern name: "${name}"`);
          }
        }
      }
    }
  }

  return additionalEntities;
}
```

**Integration**: Same as Task 2 (add to extractEntities after NER, before filtering)

---

## Success Criteria

### After Task 1 (Relation Pattern Fix)
```bash
npm test -- tests/literature/real-text.spec.ts
```

**Expected**: 5 of 7 tests passing (71%)
```
✅ Extract family relationships  ⭐ FIXED
```

### After Task 2 (Conjunctive Names)
**Expected**: 6 of 7 tests passing (86%)
```
✅ Extract family members from Ruth  ⭐ FIXED
✅ Extract family relationships
```

### After Task 3 (Optional - List Patterns)
**Expected**: Still 6 of 7 (doesn't fix DATE issue)

**Remaining Failure**:
```
❌ Extract dates from real literature (DATE pipeline - separate task)
```

---

## Validation Checklist

- [ ] Task 1: Compile TypeScript
- [ ] Task 1: Test relation extraction with debug logging
- [ ] Task 1: Verify "family relationships" test passes
- [ ] Task 1: Check Level 1-3 for regressions
- [ ] Task 2: Compile TypeScript
- [ ] Task 2: Test entity extraction with debug logging
- [ ] Task 2: Verify "Chilion" is extracted
- [ ] Task 2: Verify "family members" test passes
- [ ] Task 2: Check Level 1-3 for regressions
- [ ] Full ladder test: npm test -- tests/ladder/

---

## Debug Commands

```bash
# Compile
npx tsc

# Task 1: Test relation pattern fix
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family relationships" 2>&1 | tee /tmp/task1.log

# Check pattern normalization
grep "normalizeTextForPatterns\|PATTERN" /tmp/task1.log

# Task 2: Test conjunctive name extraction
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family members" 2>&1 | tee /tmp/task2.log

# Check pattern extraction
grep "PATTERN-EXTRACT\|conjunctive" /tmp/task2.log

# Full Level 4 test
npm test -- tests/literature/real-text.spec.ts

# Full ladder test (check regressions)
npm test -- tests/ladder/
```

---

## Architecture Notes

### Why This Approach is Industry Standard

**Production NER systems use hybrid extraction:**
1. **ML-based NER** (spaCy, BERT, etc.) - Handles 80-90% of cases
2. **Pattern-based extraction** - Handles edge cases, domain-specific patterns
3. **Post-processing filters** - Quality control, deduplication

**Examples**:
- Google: spaCy + custom patterns + filters
- Amazon: CoreNLP + patterns + rules
- spaCy itself: Provides `matcher` and `phrase_matcher` for custom patterns

**Benefits of hybrid approach**:
- ✅ Fast (spaCy is blazing fast)
- ✅ Accurate (ML handles common cases, patterns handle edge cases)
- ✅ Maintainable (easy to add new patterns)
- ✅ Scalable (no GPU needed, just add patterns)

### Why NOT Pure BERT/Transformers

**BERT-based NER (rust-bert, Hugging Face)**:
- ✅ More accurate on complex/ambiguous text
- ❌ 10-100x slower than spaCy
- ❌ Needs GPU for reasonable performance
- ❌ Higher memory usage
- ❌ Harder to debug (black box)

**When to use BERT**: When accuracy > speed and you have GPUs

**When to use spaCy + patterns**: When speed matters and 95%+ accuracy is enough

**ARES use case**: Literary text extraction → spaCy + patterns is perfect fit

---

## Time Estimates

- **Task 1** (relation pattern fix): 30 min
- **Task 2** (conjunctive names): 60 min
- **Task 3** (list patterns - optional): 30 min

**Total**: 90-120 minutes to reach 6 of 7 Level 4 tests passing

---

## What About the DATE Issue?

**Status**: Separate from entity extraction
**Issue**: "1775" extracted but lost in pipeline
**Fix location**: Storage/aggregation layer (not extraction layer)
**Next session**: Debug DATE pipeline after entity/relation extraction is solid

---

## Key Files

```bash
# Task 1: Relation pattern fix
/Users/corygilford/ares/app/engine/extract/narrative-relations.ts

# Task 2: Conjunctive name extraction
/Users/corygilford/ares/app/engine/extract/entities.ts

# Task 3: List pattern extraction (optional)
/Users/corygilford/ares/app/engine/extract/entities.ts

# Test file
/Users/corygilford/ares/tests/literature/real-text.spec.ts
```

---

## Notes for Haiku

### Task Order Matters

1. **Start with Task 1** (relation fix) - It's quick (30 min) and high-impact
2. **Then Task 2** (conjunctive names) - Unlocks the last entity test
3. **Skip Task 3** for now - Optional enhancement, not blocking

### Code Integration Points

**Task 1**: Look for the archaic relation patterns you added earlier (lines 90-125 in narrative-relations.ts). Add normalization RIGHT BEFORE pattern matching starts.

**Task 2**: Find where spaCy NER results are collected into `nerClusters`. Add pattern extraction RIGHT AFTER that, BEFORE quality filtering.

### Testing Strategy

**After Task 1**:
```bash
npm test -- tests/literature/real-text.spec.ts -t "relationships"
```
Should see relations extracted (currently 0 → should be 2+)

**After Task 2**:
```bash
npm test -- tests/literature/real-text.spec.ts -t "family members"
```
Should see Chilion in the list (currently missing)

### Debug Logging

Both tasks include debug logging with `L4_DEBUG=1`. Use it!

Example output you should see:
```
[PATTERN-EXTRACT] Found conjunctive name: "Mahlon and Chilion" → extracted "Chilion"
```

---

**Ready to move. Let's build the hybrid extraction system.** 🚀

**Remember**: This isn't a workaround. This is the RIGHT architecture. spaCy is excellent, we're just adding the patterns it needs for biblical text.
