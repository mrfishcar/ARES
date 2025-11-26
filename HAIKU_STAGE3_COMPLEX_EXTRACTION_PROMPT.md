# Haiku Agent: Stage 3 - Complex Extraction Testing

**Date**: 2025-11-26
**Task**: Implement and validate Stage 3 (Complex Extraction)
**Prerequisites**: ✅ Stage 1 COMPLETE (95.4% F1), ✅ Stage 2 COMPLETE (93.2% F1)
**Branch**: Work on `main` (all Stage 2 fixes merged)

---

## Context

Stage 2 is complete with exceptional results (91%+ precision/recall). Now we tackle Stage 3: Complex paragraph extraction with long-distance dependencies, cross-sentence coreference, and expanded pattern coverage.

**Your Goal**: Get Stage 3 to pass with P≥80%, R≥75%, F1≥77%

---

## Stage 3 Overview

### 3.1 Cross-Sentence Coreference ⏸️ NOT STARTED
**Goal**: Multi-paragraph pronoun resolution
**Target**: ≥80% coreference accuracy

### 3.2 Pattern Family Coverage ⏸️ NOT STARTED
**Goal**: Expand pattern library
**Target**: ≥50% coverage (currently ~30%)

### 3.3 Complex Paragraph Extraction ⏸️ NOT STARTED
**Goal**: Long-form narrative extraction
**Target**: P≥80%, R≥75%, F1≥77%

---

## Task Breakdown

## PART 1: Create Stage 3 Test Suite (30 minutes)

### Step 1.1: Create Test File

```bash
# Create the test file
touch tests/ladder/level-3-complex.spec.ts
```

**File Structure** (`tests/ladder/level-3-complex.spec.ts`):
```typescript
import { describe, it, expect } from 'vitest';
import { extractFromText } from '../../app/engine/extract/orchestrator';

describe('Level 3: Complex Paragraph Extraction', () => {
  // Test cases will go here

  it('3.1: Cross-paragraph coreference - pronoun chains', async () => {
    const text = `...`; // See test cases below
    const result = await extractFromText(text);
    // Assertions
  });

  // ... more tests
});
```

### Step 1.2: Define 15-20 Complex Test Cases

**Test Case Categories**:

1. **Long-distance coreference (5 tests)**
   - Pronouns spanning 3+ sentences
   - Multiple entities with pronouns
   - Nested references

2. **Complex relationships (5 tests)**
   - Multi-hop relations (A→B→C)
   - Transitive relations
   - Relationship chains

3. **Paragraph-scale extraction (5 tests)**
   - 150-300 word passages
   - Multiple entities and relations
   - Temporal sequences

4. **Edge cases (3-5 tests)**
   - Ambiguous pronouns
   - Multiple candidates for coreference
   - Long noun phrases

**Example Test Cases**:

```typescript
// Test 3.1: Cross-paragraph pronoun chain
const test3_1 = {
  text: `Gandalf arrived at Bag End early in the morning. The wizard knocked on the round green door. He waited patiently for Bilbo to answer.

  Bilbo Baggins was having breakfast when he heard the knock. The hobbit put down his tea and shuffled to the door. He opened it to find his old friend standing there.

  "Good morning!" said Gandalf. The wizard smiled warmly. He had traveled far to see Bilbo.`,

  gold: {
    entities: ['Gandalf', 'Bilbo Baggins', 'Bag End'],
    relations: [
      'Gandalf --[traveled_to]--> Bag End',
      'Gandalf --[friends_with]--> Bilbo Baggins',
      'Bilbo Baggins --[lives_in]--> Bag End'
    ],
    coreference: {
      'The wizard': 'Gandalf',
      'He': 'Gandalf',  // First "He"
      'The hobbit': 'Bilbo Baggins',
      'his old friend': 'Gandalf'
    }
  }
};

// Test 3.2: Multi-hop relation chain
const test3_2 = {
  text: `Aragorn is the son of Arathorn. Arathorn was the chieftain of the Dúnedain. The Dúnedain are the descendants of Númenor. Through his ancestry, Aragorn claimed the throne of Gondor.`,

  gold: {
    entities: ['Aragorn', 'Arathorn', 'Dúnedain', 'Númenor', 'Gondor'],
    relations: [
      'Aragorn --[child_of]--> Arathorn',
      'Arathorn --[led]--> Dúnedain',
      'Dúnedain --[descended_from]--> Númenor',
      'Aragorn --[claims_throne_of]--> Gondor'
    ]
  }
};

// Test 3.3: Complex paragraph with multiple entities
const test3_3 = {
  text: `At Rivendell, Elrond convened the Council. Gandalf spoke first, describing the growing darkness in Mordor. Aragorn revealed his identity as Isildur's heir. Boromir represented Gondor and argued for using the Ring as a weapon. Frodo, overwhelmed by the debate, finally volunteered to take the Ring to Mount Doom. Sam insisted on accompanying his master. Legolas and Gimli pledged their support despite their peoples' ancient enmity.`,

  gold: {
    entities: ['Elrond', 'Rivendell', 'Gandalf', 'Mordor', 'Aragorn', 'Isildur', 'Boromir', 'Gondor', 'Frodo', 'Ring', 'Mount Doom', 'Sam', 'Legolas', 'Gimli'],
    relations: [
      'Elrond --[convened]--> Council',
      'Council --[located_at]--> Rivendell',
      'Gandalf --[described]--> darkness',
      'Aragorn --[descended_from]--> Isildur',
      'Boromir --[represents]--> Gondor',
      'Frodo --[carries]--> Ring',
      'Sam --[serves]--> Frodo',
      'Legolas --[allied_with]--> Gimli'
    ]
  }
};

// Test 3.4: Temporal sequence
const test3_4 = {
  text: `In the year 2941, Bilbo found the Ring in Gollum's cave. Twenty years later, he passed it to Frodo at his 111th birthday party. Frodo kept the Ring hidden for seventeen years before beginning his quest. By 3019, Frodo finally destroyed the Ring at Mount Doom.`,

  gold: {
    entities: ['Bilbo', 'Ring', 'Gollum', 'Frodo', 'Mount Doom'],
    relations: [
      'Bilbo --[found]--> Ring',
      'Ring --[previously_owned_by]--> Gollum',
      'Bilbo --[gave_to]--> Frodo',
      'Frodo --[destroyed]--> Ring',
      'Ring --[destroyed_at]--> Mount Doom'
    ]
  }
};

// Test 3.5: Ambiguous pronouns (challenging)
const test3_5 = {
  text: `Merry and Pippin were captured by the Uruk-hai. They marched for days through Rohan. He tried to escape multiple times but they were closely guarded.`,

  gold: {
    entities: ['Merry', 'Pippin', 'Uruk-hai', 'Rohan'],
    relations: [
      'Uruk-hai --[captured]--> Merry',
      'Uruk-hai --[captured]--> Pippin',
      'Uruk-hai --[traveled_through]--> Rohan'
    ],
    notes: 'Ambiguous "He" - system should either resolve correctly or skip'
  }
};

// ADD 10-15 MORE TEST CASES like these
```

### Step 1.3: Implement Test Runner

Create `tests/ladder/run-level-3.ts`:

```typescript
import { extractFromText } from '../../app/engine/extract/orchestrator';

async function runLevel3Tests() {
  console.log('=== STAGE 3: COMPLEX EXTRACTION ===\n');

  // Load test cases
  const tests = [test3_1, test3_2, test3_3, test3_4, test3_5]; // ... all tests

  let totalPrecision = 0, totalRecall = 0;
  let passed = 0, failed = 0;

  for (const test of tests) {
    const result = await extractFromText(test.text);

    // Calculate precision/recall
    const { precision, recall } = evaluateExtraction(result, test.gold);

    totalPrecision += precision;
    totalRecall += recall;

    if (precision >= 0.80 && recall >= 0.75) {
      passed++;
      console.log(`✅ Test ${test.id}: P=${precision}%, R=${recall}%`);
    } else {
      failed++;
      console.log(`❌ Test ${test.id}: P=${precision}%, R=${recall}%`);
    }
  }

  const avgP = totalPrecision / tests.length;
  const avgR = totalRecall / tests.length;
  const f1 = (2 * avgP * avgR) / (avgP + avgR);

  console.log(`\n=== STAGE 3 RESULTS ===`);
  console.log(`Tests: ${passed}/${tests.length} passing`);
  console.log(`Precision: ${avgP.toFixed(1)}% (target ≥80%)`);
  console.log(`Recall: ${avgR.toFixed(1)}% (target ≥75%)`);
  console.log(`F1: ${f1.toFixed(1)}% (target ≥77%)`);

  if (avgP >= 80 && avgR >= 75 && passed >= tests.length * 0.85) {
    console.log(`\n✅ STAGE 3 COMPLETE!`);
  } else {
    console.log(`\n⚠️ STAGE 3 INCOMPLETE - needs improvement`);
  }
}

runLevel3Tests();
```

---

## PART 2: Run Baseline Tests (10 minutes)

### Step 2.1: Run Stage 3 Tests

```bash
# Make sure parser is running
make parser  # Terminal 1

# Run Stage 3 tests (Terminal 2)
npm test tests/ladder/level-3-complex.spec.ts

# OR run debug runner
npx ts-node tests/ladder/run-level-3.ts
```

**Expected First Run**:
- Tests passing: 0-30% (baseline)
- Precision: 60-70%
- Recall: 50-60%
- Many failures on long-distance coreference

**Why Low?** System was optimized for Stage 1-2 (simple/multi-sentence). Stage 3 requires:
- Better cross-paragraph coreference
- More patterns for complex relations
- Long-distance dependency handling

---

## PART 3: Iterative Improvement (2-3 hours)

### Improvement Cycle:

1. **Run tests** → Identify failures
2. **Diagnose root cause** → What's breaking?
3. **Implement fix** → Add patterns, improve coreference, etc.
4. **Re-test** → Verify improvement
5. **Repeat** until P≥80%, R≥75%

### Common Issues & Fixes:

#### Issue 1: Cross-Paragraph Coreference Fails

**Symptom**: "He" / "The wizard" not resolving across paragraph boundaries

**Diagnosis**:
```bash
# Check coreference resolution
L3_DEBUG=1 npm test tests/ladder/level-3-complex.spec.ts -t "3.1"
```

**Fix Locations**:
- `app/engine/coref.ts` - Coreference resolution logic
- `app/engine/extract/entities.ts` - Entity merging across paragraphs

**Potential Fixes**:
```typescript
// Expand coreference window from sentence to paragraph
const corefWindow = 5; // sentences (increase if needed)

// Add title-based coreference
if (mention.includes('wizard') && hasEntity('Gandalf')) {
  linkMentionToEntity(mention, 'Gandalf');
}
```

#### Issue 2: Long-Distance Relations Missed

**Symptom**: Relations work in Stage 2 but fail when entities are 3+ sentences apart

**Diagnosis**:
```bash
# Check relation extraction with verbose output
L3_DEBUG=1 npx ts-node tests/ladder/run-level-3.ts
```

**Fix Locations**:
- `app/engine/extract/relations.ts` - Dependency path extraction
- `app/engine/narrative-relations.ts` - Narrative pattern matching

**Potential Fixes**:
```typescript
// Expand context window for relation extraction
const contextWindow = 300; // characters (increase from 150)

// Add paragraph-level pattern matching
function extractParagraphRelations(paragraph: string) {
  // Match relations across full paragraph, not just sentences
}
```

#### Issue 3: Complex Entity Phrases

**Symptom**: "the chieftain of the Dúnedain" not recognized as single entity

**Diagnosis**:
```bash
# Check entity extraction
npx tsx app/engine/extract/entities.ts --debug
```

**Fix Locations**:
- `app/engine/extract/entities.ts` - Entity span expansion
- `app/engine/grammar/noun-phrase.ts` - NP chunking

**Potential Fixes**:
```typescript
// Expand noun phrase detection
function expandNounPhrase(token: Token): string {
  // Include prepositional phrases: "chieftain of the Dúnedain"
  if (hasPrepPhrase(token)) {
    return token.text + ' ' + getPrepPhrase(token);
  }
}
```

#### Issue 4: Pattern Coverage Too Low

**Symptom**: Pattern coverage still at 30%, need 50%

**Diagnosis**:
```bash
# Check current coverage
npx ts-node scripts/pattern-expansion/inventory-patterns.ts
```

**Fix**: Add more patterns
```bash
# Add patterns to these files:
# - app/engine/extract/relations.ts (dependency patterns)
# - app/engine/narrative-relations.ts (surface patterns)
# - patterns/new_surface_patterns.json (pattern library)

# Focus on:
# - Temporal relations (before, after, during)
# - Creation relations (created, built, founded)
# - Possession relations (owns, has, possesses)
# - Social relations (allied_with, enemy_of, serves)
```

---

## PART 4: Pattern Expansion (1 hour)

### Step 4.1: Audit Current Patterns

```bash
# Check what's missing
npx ts-node scripts/pattern-expansion/inventory-patterns.ts

# Check uncovered phrases
cat reports/uncovered_phrases.json
```

### Step 4.2: Add High-Value Patterns

**Priority Pattern Families** (to reach 50% coverage):

1. **Temporal Relations** (20+ patterns)
   ```typescript
   // Add to app/engine/extract/relations.ts
   {
     subj: 'nsubj',
     obj: 'obl',
     pred: 'preceded',
     tokens: ['before', 'prior to', 'earlier than']
   },
   {
     subj: 'nsubj',
     obj: 'obl',
     pred: 'followed',
     tokens: ['after', 'following', 'subsequent to']
   }
   ```

2. **Creation Relations** (15+ patterns)
   ```typescript
   {
     subj: 'nsubj',
     obj: 'dobj',
     pred: 'created',
     tokens: ['created', 'built', 'constructed', 'established']
   }
   ```

3. **Possession Relations** (15+ patterns)
   ```typescript
   {
     subj: 'nsubj',
     obj: 'dobj',
     pred: 'owns',
     tokens: ['owns', 'possesses', 'holds', 'has']
   }
   ```

4. **Social Relations** (15+ patterns)
   ```typescript
   {
     subj: 'nsubj',
     obj: 'obl',
     pred: 'allied_with',
     tokens: ['allied with', 'partnered with', 'joined forces with']
   }
   ```

### Step 4.3: Verify Pattern Coverage

```bash
# Re-run inventory after adding patterns
npx ts-node scripts/pattern-expansion/inventory-patterns.ts

# Target: ≥50% coverage (900+ patterns)
```

---

## PART 5: Final Validation (30 minutes)

### Step 5.1: Run All Stage Tests

```bash
# Stage 1 stability check
npm test tests/ladder/level-1-simple.spec.ts

# Stage 2 stability check
npm test tests/ladder/level-2-multisentence.spec.ts

# Stage 3 target tests
npm test tests/ladder/level-3-complex.spec.ts
```

**Success Criteria**:
- ✅ Stage 1: Still passing (P≥90%, R≥85%)
- ✅ Stage 2: Still passing (P≥85%, R≥80%)
- ✅ Stage 3: Now passing (P≥80%, R≥75%)

### Step 5.2: Update Documentation

```bash
# Update status
vim INTEGRATED_TESTING_STRATEGY.md

# Mark Stage 3 as complete:
# - Change status from "⏸️ NOT STARTED" to "✅ COMPLETE"
# - Add final metrics
# - Document any issues/workarounds
```

### Step 5.3: Commit and Push

```bash
git add tests/ladder/level-3-complex.spec.ts
git add tests/ladder/run-level-3.ts
git add app/engine/extract/relations.ts  # If modified
git add app/engine/coref.ts  # If modified
git add patterns/new_surface_patterns.json  # If modified
git add INTEGRATED_TESTING_STRATEGY.md

git commit -m "$(cat <<'EOF'
feat: Complete Stage 3 - Complex Extraction

- Add 15-20 complex paragraph test cases
- Improve cross-paragraph coreference resolution
- Expand pattern coverage to 50% (900+ patterns)
- Achieve P≥80%, R≥75%, F1≥77%

Stage 3 Results:
- Precision: X.X%
- Recall: X.X%
- F1: X.X%
- Tests: XX/XX passing

Iteration XX
EOF
)"

git push origin main
```

---

## Success Report Format

When Stage 3 passes, report:

```
✅ STAGE 3 COMPLETE

Test Results:
- Level 3 Complex Extraction: [X/XX] passing
- Precision: [X]%
- Recall: [X]%
- F1: [X]%

Pattern Coverage: [X]% ([Y]/1827 patterns)

Cross-Stage Stability:
- Stage 1: [PASS/FAIL] - [metrics]
- Stage 2: [PASS/FAIL] - [metrics]
- Stage 3: [PASS/FAIL] - [metrics]

Key Improvements:
- [List main improvements made]

Next Action: Ready to advance to Stage 4 (Scale Testing)
```

---

## If Stage 3 Fails After Multiple Iterations

Report:

```
⚠️ STAGE 3 INCOMPLETE - Need Different Approach

Current Metrics:
- Precision: [X]% (target: ≥80%)
- Recall: [X]% (target: ≥75%)
- Tests Passing: [X]/[XX]

Persistent Issues:
1. [Issue 1 description]
2. [Issue 2 description]

Root Causes:
- [Analysis]

Recommended Actions:
1. [Specific fix needed]
2. [Alternative approach]
3. [Architectural change needed?]
```

---

## Time Budget

- Part 1 (Test Suite): 30 minutes
- Part 2 (Baseline): 10 minutes
- Part 3 (Improvement): 2-3 hours (iterative)
- Part 4 (Patterns): 1 hour
- Part 5 (Validation): 30 minutes

**Total**: 4-5 hours

---

## Critical Success Factors

1. **Comprehensive Test Cases**: Need 15-20 diverse tests covering all complexity types
2. **Iterative Testing**: Test → Fix → Retest cycle (don't batch changes)
3. **Cross-Paragraph Focus**: This is what separates Stage 3 from Stage 2
4. **Pattern Library**: Must reach 50% coverage (currently 30%)
5. **No Regressions**: Stage 1 and 2 must remain stable

---

## Reference Files

**Test Files**:
- `tests/ladder/level-3-complex.spec.ts` - Main test suite (CREATE THIS)
- `tests/ladder/run-level-3.ts` - Debug runner (CREATE THIS)
- `tests/mega/cases/mega-001.json` - Example complex narrative

**Code Files**:
- `app/engine/extract/entities.ts` - Entity extraction (2898 lines)
- `app/engine/extract/relations.ts` - Relation extraction
- `app/engine/coref.ts` - Coreference resolution
- `app/engine/narrative-relations.ts` - Narrative patterns

**Pattern Files**:
- `patterns/new_surface_patterns.json` - Surface patterns library
- `app/engine/extract/relations.ts` - Embedded dependency patterns

**Documentation**:
- `INTEGRATED_TESTING_STRATEGY.md` - Testing ladder
- `CLAUDE.md` - Project guide
- `docs/ARES_PROJECT_BRIEFING.md` - Current status

---

**Good luck! Stage 3 is challenging but achievable. Focus on incremental improvement and thorough testing.**
