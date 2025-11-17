# Phase 2: Complexity Scaling - START HERE

**Purpose**: Implementation guide for Phase 2 of ARES entity extraction
**Audience**: AI assistants and developers working on compound sentence handling
**Status**: 🟡 Ready to Begin
**Estimated Duration**: 5 days
**Your Mission**: Handle compound sentences, coordination, nested entities

---

## 🎯 Goals

**Target Metrics** (Level 2 Ladder):
- Entity Precision: ≥88%
- Entity Recall: ≥83%
- Relation Precision: ≥88%
- Relation Recall: ≥83%

**Test Suite**: `/Users/corygilford/ares/tests/ladder/level-2-multisentence.spec.ts`

---

## 📋 Day 1: Multi-Clause Entity Tracking

### Problem
Current code treats compound sentences as single units:
```
"Gandalf traveled to Rivendell, where Elrond lived."
```

May extract:
- ❌ "Rivendell where Elrond" as single entity
- ❌ Missing "Elrond" entity
- ❌ Missing "lived_in" relation

Should extract:
- ✅ "Gandalf" (PERSON)
- ✅ "Rivendell" (PLACE)
- ✅ "Elrond" (PERSON)
- ✅ Relation: gandalf::traveled_to::rivendell
- ✅ Relation: elrond::lives_in::rivendell

---

### Task 1.1: Analyze Current Behavior (1 hour)

**Test the current system**:
```bash
# Create test file
cat > /tmp/test_compound.ts << 'EOF'
import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const text = "Gandalf traveled to Rivendell, where Elrond lived.";
  const result = await extractFromSegments("test", text);

  console.log("Entities:", result.entities.map(e => `${e.type}::${e.canonical}`));
  console.log("Relations:", result.relations.map(r => `${r.subj}::${r.pred}::${r.obj}`));
}

test();
EOF

npx ts-node /tmp/test_compound.ts > /tmp/compound_current.log 2>&1
cat /tmp/compound_current.log
```

**Document results** in `/tmp/day1_analysis.md`:
```markdown
## Current Compound Sentence Behavior

**Test**: "Gandalf traveled to Rivendell, where Elrond lived."

**Extracted**:
- Entities: [list]
- Relations: [list]

**Issues**:
1. [Describe what's wrong]
2. [More issues]

**Root Cause**: [Why it happens]
```

---

### Task 1.2: Implement Clause Detector (2 hours)

**Create new file**: `/Users/corygilford/ares/app/engine/extract/clause-detector.ts`

```typescript
import { Sentence } from '../schema';

export interface Clause {
  text: string;
  start: number;
  end: number;
  type: 'main' | 'subordinate' | 'relative';
}

/**
 * Detect clause boundaries in a sentence
 * Uses spaCy dependency markers (SBAR, WHNP, etc.)
 */
export function detectClauses(sentence: Sentence): Clause[] {
  const clauses: Clause[] = [];

  // Algorithm:
  // 1. Find subordinate clause markers (where, which, that, when, because)
  // 2. Use spaCy dependency tree to find clause spans
  // 3. Return main + subordinate clauses

  // IMPLEMENT THIS

  return clauses;
}

/**
 * Example:
 * Input: "Gandalf traveled to Rivendell, where Elrond lived."
 * Output: [
 *   { text: "Gandalf traveled to Rivendell", start: 0, end: 31, type: 'main' },
 *   { text: "where Elrond lived", start: 33, end: 51, type: 'relative' }
 * ]
 */
```

**Implementation hints**:
1. Look for subordinating conjunctions in spaCy tokens (mark = "SBAR")
2. Find relative pronouns (where, which, that)
3. Use dependency tree to find clause boundaries
4. Test on 5 compound sentence examples

---

### Task 1.3: Integrate Clause Detection (1 hour)

**Modify**: `/Users/corygilford/ares/app/engine/extract/entities.ts`

In `extractEntities()` function (around line 1450):

```typescript
// Before (current):
const parsed = await parseWithService(text);
const ner = parsed.sentences.flatMap(sent => splitCoordination(sent, nerSpans(sent)));

// After (new):
const parsed = await parseWithService(text);

// Detect clauses for better entity extraction
const clauseEntities = parsed.sentences.flatMap(sent => {
  const clauses = detectClauses(sent);

  // Extract entities from each clause separately
  return clauses.flatMap(clause => {
    // Extract entities within clause boundaries
    const clauseNer = nerSpans(sent).filter(span =>
      span.start >= clause.start && span.end <= clause.end
    );
    return splitCoordination(sent, clauseNer);
  });
});

const ner = clauseEntities;
```

**Test**:
```bash
npx ts-node /tmp/test_compound.ts > /tmp/compound_after_clauses.log 2>&1
diff /tmp/compound_current.log /tmp/compound_after_clauses.log
```

---

### Task 1.4: Create Test Cases (1 hour)

**File**: `/tmp/phase2_test_cases.md`

Create 10 compound sentence test cases:

```markdown
## Compound Sentence Test Cases

### 1. Relative clause with "where"
Text: "Gandalf traveled to Rivendell, where Elrond lived."
Expected Entities:
- PERSON::Gandalf
- PLACE::Rivendell
- PERSON::Elrond
Expected Relations:
- gandalf::traveled_to::rivendell
- elrond::lives_in::rivendell

### 2. Relative clause with "which"
Text: "Frodo found the Ring, which Sauron created."
Expected Entities:
- PERSON::Frodo
- ITEM::Ring
- PERSON::Sauron
Expected Relations:
- frodo::found::ring
- sauron::created::ring

### 3-10: [Create more examples]
```

---

## 📋 Day 2: Coordination Entity Splitting

### Problem
```
"Harry and Ron traveled to Hogwarts."
```

Current: May extract "Harry and Ron" as single PERSON
Should: Two separate entities + two relations

---

### Task 2.1: Analyze Coordination Patterns (1 hour)

**Search existing code**:
```bash
grep -rn "splitCoordination" /Users/corygilford/ares/app/engine/extract/
```

**Document** in `/tmp/coordination_analysis.md`:
- What `splitCoordination()` currently does
- What patterns it handles
- What's missing

---

### Task 2.2: Enhance Coordination Splitting (2 hours)

**File**: `/Users/corygilford/ares/app/engine/extract/entities.ts`

Find the `splitCoordination()` function and enhance it:

```typescript
// Current logic splits "A and B" noun phrases
// Need to add:
// 1. Handle "A, B, and C" (Oxford comma)
// 2. Handle "A or B"
// 3. Preserve entity type for all splits
// 4. Handle title coordination: "King and Queen" vs "Harry and Ron"
```

**Edge cases to handle**:
- "The King and Queen" → One entity (title pair) OR two entities?
- "Harry and Ron" → Two entities (clear)
- "Lord of the Rings and Silmarillion" → Two WORK entities
- "England and France" → Two PLACE entities

---

### Task 2.3: Create Shared Relations (1 hour)

When splitting "Harry and Ron traveled to Hogwarts", create TWO relations:
- harry::traveled_to::hogwarts
- ron::traveled_to::hogwarts

**Modify**: `/Users/corygilford/ares/app/engine/extract/relations.ts`

After extracting coordinated entities, duplicate relations for each:

```typescript
// Pseudo-code:
if (subjectEntity.isCoordinated) {
  for (const entity of subjectEntity.coordinatedEntities) {
    createRelation(entity, predicate, object);
  }
} else {
  createRelation(subjectEntity, predicate, object);
}
```

---

### Task 2.4: Test Coordination (1 hour)

Create test file:
```bash
cat > /tmp/test_coordination.ts << 'EOF'
import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const tests = [
    "Harry and Ron traveled to Hogwarts.",
    "Frodo, Sam, and Merry went to Mordor.",
    "England and France signed the treaty."
  ];

  for (const text of tests) {
    console.log(`\n--- Testing: "${text}" ---`);
    const result = await extractFromSegments("test", text);
    console.log("Entities:", result.entities.map(e => e.canonical));
    console.log("Relations:", result.relations.map(r => `${r.subj}::${r.pred}::${r.obj}`));
  }
}

test();
EOF

npx ts-node /tmp/test_coordination.ts > /tmp/coordination_results.log 2>&1
cat /tmp/coordination_results.log
```

**Expected**:
- "Harry and Ron" → 2 entities, 2 relations
- "Frodo, Sam, and Merry" → 3 entities, 3 relations

---

## 📋 Days 3-4: Implementation Continue

Follow the detailed tasks in `ENTITY_EXTRACTION_MASTER_PLAN.md` Phase 2 sections:
- 2.3: Nested Entity Resolution
- 2.4: Temporal Expression Enhancement
- 2.5: Create Level 2 Test Suite

---

## 📋 Day 5: Level 2 Optimization

### Goal: Pass Level 2 Ladder Test

**Run Level 2 tests**:
```bash
npx vitest run tests/ladder/level-2-multisentence.spec.ts > /tmp/level2_results.log 2>&1
tail -50 /tmp/level2_results.log
```

**Analyze failures**, fix issues, iterate until:
- Entity P ≥ 88%
- Entity R ≥ 83%
- Relation P ≥ 88%
- Relation R ≥ 83%

---

## 📊 Daily Check-in Template

At end of each day, create `/tmp/day<N>_summary.md`:

```markdown
# Day <N> Summary - Phase 2

## What I Accomplished
- [Task completed]
- [Files modified]

## Current Metrics
- Entity P/R: X% / Y%
- Relation P/R: X% / Y%
- Tests passing: X/15

## Issues Encountered
- [Problem 1 and solution]

## Tomorrow's Plan
- [Next tasks]
```

---

## 🚨 Important Notes

1. **Test frequently**: After each feature, run tests
2. **Don't break Level 1**: Verify Level 1 still passes after changes
3. **Mirror to .js**: Remember to copy TypeScript changes to dist/
4. **Document edge cases**: Create test cases for tricky scenarios
5. **Ask if stuck**: After 1 hour on single issue, document and ask for help

---

## ✅ Success Criteria

Phase 2 complete when:
- [ ] Level 2 ladder test passing (15/15 tests)
- [ ] Metrics meet targets (≥88% precision, ≥83% recall)
- [ ] Level 1 still passing (no regressions)
- [ ] Documentation complete (`PHASE2_COMPLETE.md`)
- [ ] Code clean and commented

---

**BEGIN**: Start with Day 1, Task 1.1 - analyze current compound sentence behavior

Good luck! Phase 1 was incredible, Phase 2 will be even better! 🚀
