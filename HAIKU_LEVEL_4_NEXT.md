# ARES Level 4: Complete Entity & Relation Extraction

**Date**: November 20, 2025
**Current Status**: 4 of 7 tests passing
**Goal**: Reach 6 of 7 tests passing
**Time**: 90 minutes

---

## Current State

```
Level 4 Tests: 4 of 7 passing (57%)

✅ Extract place entities
✅ Extract person entities
✅ Show statistics
✅ Extract places from Ruth

❌ Extract family members from Ruth (missing "Chilion")
❌ Extract family relationships (0 relations)
❌ Extract dates (DATE pipeline - defer)
```

---

## Task 1: Fix Relation Pattern Matching (30 min)

### Problem
Text: `"And Elimelech Naomi's husband died"`
Pattern expects: `"Naomi's husband"`
Pattern sees: `"And Elimelech Naomi's husband"` → fails

### Solution
Add text normalization BEFORE pattern matching.

### File
`/Users/corygilford/ares/app/engine/extract/narrative-relations.ts`

### Code to Add

**Step 1**: Add helper function at top of file (after imports):

```typescript
/**
 * Normalize text for pattern matching
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

**Step 2**: In `extractNarrativeRelations` function, normalize text BEFORE pattern matching:

```typescript
export function extractNarrativeRelations(
  text: string,
  entities: Entity[],
  parsedSentences: ParsedSentence[]
): Relation[] {
  const relations: Relation[] = [];

  // NORMALIZE TEXT BEFORE PATTERNS
  const normalizedText = normalizeTextForPatterns(text);

  // Now use normalizedText for ALL pattern matching below
  // (Find archaic patterns added earlier and apply to normalizedText)

  return relations;
}
```

### Test
```bash
npx tsc
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family relationships"
```

**Expected**: Relations extracted (currently 0 → should be 2+)

---

## Task 2: Add Conjunctive Name Extraction (60 min)

### Problem
Text: `"Mahlon and Chilion"`
spaCy extracts: "Mahlon" ✅
spaCy misses: "Chilion" ❌

### Solution
Add pattern-based extraction after spaCy, before quality filtering.

### File
`/Users/corygilford/ares/app/engine/extract/entities.ts`

### Code to Add

**Step 1**: Add helper function (around line 150, near other helpers):

```typescript
/**
 * Extract names missed by spaCy in conjunctive patterns
 * Pattern: [PERSON] and [CapitalizedWord]
 */
function extractConjunctiveNames(
  tokens: Token[],
  existingEntities: EntityCluster[]
): EntityCluster[] {
  const additionalEntities: EntityCluster[] = [];
  const existingNames = new Set(
    existingEntities.map(e => e.canonical.toLowerCase())
  );

  // Pattern: PERSON + "and" + PROPN (capitalized)
  for (let i = 0; i < tokens.length - 2; i++) {
    const current = tokens[i];
    const next = tokens[i + 1];
    const afterNext = tokens[i + 2];

    if (
      current.ent && current.ent.includes('PERSON') &&
      next.text.toLowerCase() === 'and' &&
      /^[A-Z]/.test(afterNext.text) &&
      afterNext.pos === 'PROPN' &&
      !existingNames.has(afterNext.text.toLowerCase())
    ) {
      const cluster = createEntityCluster(
        'PERSON',
        afterNext.text,
        [afterNext],
        'pattern-conjunctive'
      );

      additionalEntities.push(cluster);
      existingNames.add(afterNext.text.toLowerCase());

      if (process.env.L4_DEBUG === '1') {
        console.log(`[PATTERN] Conjunctive name: "${current.text} and ${afterNext.text}" → "${afterNext.text}"`);
      }
    }
  }

  return additionalEntities;
}
```

**Step 2**: In `extractEntities` function, add pattern extraction AFTER spaCy NER, BEFORE quality filtering:

Find where NER clusters are created (search for `nerClusters` or similar), then add:

```typescript
// After spaCy NER extraction
let allClusters = [...nerClusters];

// Add pattern-based extraction for conjunctive names
const conjunctiveNames = extractConjunctiveNames(allTokens, allClusters);
allClusters = [...allClusters, ...conjunctiveNames];

if (process.env.L4_DEBUG === '1' && conjunctiveNames.length > 0) {
  console.log(`[PATTERN] Added ${conjunctiveNames.length} conjunctive names`);
}

// Continue with quality filtering...
const filteredEntities = filterLowQualityEntities(allClusters, config);
```

### Test
```bash
npx tsc
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family members"
```

**Expected**: Chilion in the list (currently missing)

---

## Success Criteria

### After Task 1
```
✅ Extract family relationships (0 → 2+ relations)
```

### After Task 2
```
✅ Extract family members from Ruth (Chilion extracted)
```

### Final Result
```
Level 4: 6 of 7 tests passing (86%)

Remaining: DATE extraction (separate pipeline issue)
```

---

## Validation

```bash
# After each task
npx tsc
npm test -- tests/literature/real-text.spec.ts

# Check for regressions
npm test -- tests/ladder/

# Final validation
npm test
```

---

## Debug

```bash
# Task 1 debug
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "relationships" 2>&1 | grep -A5 "RELATION\|married"

# Task 2 debug
L4_DEBUG=1 npm test -- tests/literature/real-text.spec.ts -t "family members" 2>&1 | grep -A5 "PATTERN\|Chilion"
```

---

## Notes

- Task 1 is 30 min - do it first (quick win)
- Task 2 is 60 min - unlocks final entity test
- DATE issue is separate (not blocking Level 4 completion)
- Level 1-3 must remain passing (check after each task)

---

**Time Budget**: 90 minutes
**Expected Result**: 6 of 7 Level 4 tests passing
**Ready to execute**
