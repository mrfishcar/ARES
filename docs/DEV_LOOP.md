# ARES Development Loop

**Purpose**: Step-by-step workflow guide for making changes to ARES
**Audience**: Developers and AI assistants working on entity extraction
**Last Updated**: 2025-11-17

---

## Quick Start

### First Time Setup

1. **Clone and install**:
```bash
cd /Users/corygilford/ares
npm install
```

2. **Verify tests work**:
```bash
npx vitest run tests/ladder/level-1-simple.spec.ts
```

3. **Read ground truths**:
```bash
cat docs/GROUND_TRUTHS.md
```

You're ready to start!

---

## The Development Cycle

### Overview
```
Identify → Analyze → Implement → Test → Mirror → Verify → Document
   ↑                                                            ↓
   └────────────────── Iterate if needed ──────────────────────┘
```

---

## Step 1: Identify the Issue/Feature

### For Bugs
**Check test results**:
```bash
# Run a test level
npx vitest run tests/ladder/level-1-simple.spec.ts > /tmp/test_results.log 2>&1

# Check summary
tail -50 /tmp/test_results.log | grep -A10 "LEVEL 1 RESULTS"

# Find failures
grep "❌" /tmp/test_results.log
```

**Common failure patterns**:
- Low entity precision: Extracting too many incorrect entities
- Low entity recall: Missing entities that should be found
- Low relation precision: Creating incorrect relations
- Low relation recall: Missing relations between entities

### For Features
**Reference the master plan**:
```bash
cat docs/ENTITY_EXTRACTION_MASTER_PLAN.md | grep -A20 "Phase <N>"
```

**Check current phase requirements**:
- What specific capability needs to be added?
- What are the success criteria?
- Which test cases validate this feature?

---

## Step 2: Analyze Root Cause

### Create Analysis Document

**Template** (`/tmp/issue_analysis.md`):
```markdown
# Issue Analysis: [Brief Description]

## Problem Statement
- What's wrong?
- What's the expected behavior?
- Current metrics vs target metrics

## Test Cases Affected
- Test 1.X: [description]
- Test 2.Y: [description]

## Root Cause Hypothesis
1. [First hypothesis]
2. [Second hypothesis]

## Evidence
- Code locations: [file:line]
- Console output: [relevant logs]
- Test output: [failing assertions]

## Proposed Solution
[Your approach to fixing this]
```

### Investigation Commands

**Search for relevant code**:
```bash
# Find where entities are extracted
grep -rn "extractEntities" app/engine/extract/

# Find relation extraction
grep -rn "extractRelations" app/engine/extract/

# Find specific patterns
grep -rn "parent_of\|child_of" app/engine/extract/relations.ts
```

**Check existing tests**:
```bash
# What does a test expect?
grep -A30 "test 1.19" tests/ladder/level-1-simple.spec.ts

# What are the gold standards?
cat docs/GROUND_TRUTHS.md | grep -A20 "Test 1.19"
```

**Create minimal reproduction**:
```typescript
// /tmp/test_reproduction.ts
import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const text = "Eowyn fought in the Battle of Pelennor Fields.";
  const result = await extractFromSegments("test", text);

  console.log("Entities:", result.entities.map(e => `${e.type}::${e.canonical}`));
  console.log("Relations:", result.relations.map(r => `${r.pred}`));
}

test();
```

Run it:
```bash
npx ts-node /tmp/test_reproduction.ts
```

---

## Step 3: Make Changes

### File Structure Reference

**Core extraction files**:
```
app/engine/extract/
├── orchestrator.ts      # Main entry point, coordinates extraction
├── entities.ts          # Entity extraction logic (NER + merging)
├── relations.ts         # Relation extraction patterns
├── clause-detector.ts   # Clause boundary detection (Phase 2+)
├── coordination.ts      # Coordination splitting ("A and B")
└── patterns/           # Relation extraction patterns
```

**Storage and schema**:
```
app/storage/
├── storage.ts          # Graph persistence (JSON)
└── schema.ts           # Type definitions

app/engine/
└── schema.ts           # Entity/Relation types
```

**Tests**:
```
tests/ladder/
├── level-1-simple.spec.ts        # 20 simple sentence tests
├── level-2-multisentence.spec.ts # 15 multi-sentence tests
└── level-3-complex.spec.ts       # 10 complex narrative tests
```

### Making the Change

**Read before editing**:
```bash
# Always read the file first to understand context
cat app/engine/extract/entities.ts | head -100
```

**Edit with precision**:
- Make ONE logical change at a time
- Add comments explaining WHY, not just WHAT
- Keep changes minimal and focused
- Preserve existing functionality

**Example edit** (fixing entity merging):
```typescript
// BEFORE:
function mergeEntities(entities: Entity[]): Entity[] {
  return entities; // TODO: implement merging
}

// AFTER:
function mergeEntities(entities: Entity[]): Entity[] {
  // Merge entities with same canonical name
  // Strategy: Keep first occurrence, merge aliases
  const merged = new Map<string, Entity>();

  for (const entity of entities) {
    const key = entity.canonical.toLowerCase();
    if (merged.has(key)) {
      // Merge aliases
      const existing = merged.get(key)!;
      existing.aliases.push(...entity.aliases);
    } else {
      merged.set(key, entity);
    }
  }

  return Array.from(merged.values());
}
```

---

## Step 4: Test Changes

### Run Specific Test Level

**Level 1 (simple sentences)**:
```bash
npx vitest run tests/ladder/level-1-simple.spec.ts > /tmp/level1_results.log 2>&1
tail -50 /tmp/level1_results.log
```

**Level 2 (multi-sentence)**:
```bash
npx vitest run tests/ladder/level-2-multisentence.spec.ts > /tmp/level2_results.log 2>&1
tail -50 /tmp/level2_results.log
```

**Level 3 (complex)**:
```bash
npx vitest run tests/ladder/level-3-complex.spec.ts > /tmp/level3_results.log 2>&1
tail -50 /tmp/level3_results.log
```

### Run All Tests
```bash
npx vitest run tests/ladder/ > /tmp/all_tests.log 2>&1
```

### Interpreting Results

**Success**:
```
📊 LEVEL 1 RESULTS:

Entities:
  Precision: 92.5% (target: ≥90%) ✓
  Recall: 92.5% (target: ≥85%) ✓
  F1: 92.5% (target: ≥87%) ✓

Relations:
  Precision: 100.0% (target: ≥90%) ✓
  Recall: 100.0% (target: ≥85%) ✓
  F1: 100.0% (target: ≥87%) ✓

🎉 LEVEL 1 PASSED! Unlock Level 2.
```

**Failure**:
```
❌ Test 1.19 failed:
   Text: "Eowyn fought in the Battle of Pelennor Fields."
   Entity P/R: 66.7% / 66.7%
   Relation P/R: 100.0% / 100.0%
   Gold entities: event::battle of pelennor fields, person::eowyn
   Extracted entities: event::battle, person::eowyn, place::pelennor fields
```

### Debugging Failed Tests

**Add temporary logging**:
```typescript
console.log(`[DEBUG] Extracted entities:`, entities.map(e => e.canonical));
console.log(`[DEBUG] Entity boundaries:`, entities.map(e => `${e.start}-${e.end}`));
```

**Run single test with logging**:
```bash
npx vitest run tests/ladder/level-1-simple.spec.ts 2>&1 | grep -A5 "Test 1.19"
```

**Check test expectations**:
```bash
cat docs/GROUND_TRUTHS.md | grep -A15 "Test 1.19"
```

---

## Step 5: Mirror TypeScript to JavaScript (If Needed)

### Understanding the Issue

The ARES codebase has both TypeScript source files (`.ts`) and compiled JavaScript files (`.js`). In some environments, Node.js prefers `.js` files even when `.ts` files exist.

### Solution 1: Delete Compiled Files (Recommended)

**Delete all .js files in app/ directory**:
```bash
find /Users/corygilford/ares/app -name "*.js" -type f -delete
```

**Why this works**:
- Vitest/ts-node will transpile TypeScript on the fly
- Your changes in `.ts` files will always be used
- No stale compiled code

**When to do this**:
- After making TypeScript changes
- Before running tests
- If you see unexpected behavior (check for stale .js files)

### Solution 2: Manual Mirroring (If .js Required)

If your environment requires compiled .js files:

**Compile TypeScript**:
```bash
npx tsc
```

**Or manually mirror specific file**:
```bash
# Find the TypeScript file you changed
# Example: app/engine/extract/entities.ts

# Create corresponding .js file
# Example: app/engine/extract/entities.js

# Copy logic, remove type annotations
```

### Verifying Mirror Success

```bash
# Check if .js files exist
find app/engine/extract -name "*.js" | head -5

# If they exist, verify they're up to date
ls -lt app/engine/extract/entities.* | head -2
# .ts should be older or same timestamp as .js
```

---

## Step 6: Verify No Regressions

### Check All Test Levels

**Run Level 1** (must always pass):
```bash
npx vitest run tests/ladder/level-1-simple.spec.ts 2>&1 | tail -20
```

**If Level 2 was passing, verify it still passes**:
```bash
npx vitest run tests/ladder/level-2-multisentence.spec.ts 2>&1 | tail -20
```

### Compare Before/After Metrics

**Document in `/tmp/before_after.md`**:
```markdown
# Change Impact Analysis

## Before Change
- Entity P/R: 89.2% / 86.7%
- Relation P/R: 82.5% / 82.5%
- Failing tests: 1.19

## After Change
- Entity P/R: 92.5% / 92.5%
- Relation P/R: 100.0% / 100.0%
- Failing tests: None

## Improvement
- Entity precision: +3.3%
- Entity recall: +5.8%
- Relation precision: +17.5%
- Relation recall: +17.5%
- Tests fixed: 1.19

## Regressions
None
```

### Regression Checklist

- [ ] Level 1 tests still pass (if they were passing before)
- [ ] Metrics didn't decrease significantly
- [ ] No new test failures introduced
- [ ] No new console errors/warnings

---

## Step 7: Document the Change

### Update Relevant Documentation

**If fixing a bug**:
Create `/tmp/fix_summary.md`:
```markdown
# Fix: [Brief Description]

## Problem
[What was broken]

## Root Cause
[Why it was broken]

## Solution
[What you changed]

## Files Modified
- app/engine/extract/entities.ts (lines 1348-1404)
- app/engine/extract/relations.ts (line 205)

## Test Results
Before: Entity P/R 89.2%/86.7%
After: Entity P/R 92.5%/92.5%

## Tests Fixed
- Test 1.19: Battle of Pelennor Fields

## Side Effects
None - no regressions detected
```

**If implementing a feature**:
Create `/tmp/feature_implementation.md`:
```markdown
# Feature: [Brief Description]

## Goal
[What this feature enables]

## Implementation
[High-level approach]

## Files Created/Modified
- app/engine/extract/clause-detector.ts (new, 200 lines)
- app/engine/extract/relations.ts (+50 lines)

## Test Results
[Metrics before/after]

## Examples
Input: "Gandalf traveled to Rivendell, where Elrond lived."
Output:
  - Entities: Gandalf (PERSON), Rivendell (PLACE), Elrond (PERSON)
  - Relations: gandalf::traveled_to::rivendell, elrond::lives_in::rivendell

## Next Steps
[What needs to happen next]
```

### Update Master Plan (If Completing Phase Task)

```bash
# Find your task in the master plan
grep -n "Your task description" docs/ENTITY_EXTRACTION_MASTER_PLAN.md

# Edit to mark as complete
# Change: ⏳ to ✅
# Add completion date
# Update metrics
```

---

## Common Workflows

### Workflow 1: Adding a New Relation Type

**Scenario**: Want to extract "sibling_of" relations

**Steps**:

1. **Add to relation types** (`app/engine/schema.ts`):
```typescript
export type RelationType =
  | "parent_of"
  | "child_of"
  | "sibling_of"  // NEW
  // ... other types
```

2. **Add extraction patterns** (`app/engine/extract/relations.ts`):
```typescript
// Find the pattern matching section
// Add new patterns:
if (verb === "sibling" || verb === "brother" || verb === "sister") {
  return createRelation(subj, "sibling_of", obj);
}
```

3. **Add test case** (`tests/ladder/level-1-simple.spec.ts`):
```typescript
{
  id: '1.21',
  text: 'Ron is the brother of Ginny.',
  gold: {
    entities: [
      { text: 'Ron', type: 'PERSON' },
      { text: 'Ginny', type: 'PERSON' }
    ],
    relations: [
      { subj: 'Ron', pred: 'sibling_of', obj: 'Ginny' },
      { subj: 'Ginny', pred: 'sibling_of', obj: 'Ron' }
    ]
  }
}
```

4. **Make bidirectional** (if appropriate):
```typescript
function createSiblingRelation(e1: Entity, e2: Entity): Relation[] {
  return [
    { subj: e1.id, pred: "sibling_of", obj: e2.id },
    { subj: e2.id, pred: "sibling_of", obj: e1.id }
  ];
}
```

5. **Test**:
```bash
npx vitest run tests/ladder/level-1-simple.spec.ts 2>&1 | grep "1.21"
```

6. **Document** in `docs/GROUND_TRUTHS.md`:
```markdown
### sibling_of
Relates two people who are siblings.
- Bidirectional: Yes
- Example: "Ron is the brother of Ginny"
- Pattern: "X is the brother/sister of Y", "X and Y are siblings"
```

---

### Workflow 2: Fixing Entity Boundary Issues

**Scenario**: "Battle of Pelennor Fields" being split into two entities

**Steps**:

1. **Reproduce the issue**:
```bash
cat > /tmp/test_boundary.ts << 'EOF'
import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const result = await extractFromSegments(
    "test",
    "Eowyn fought in the Battle of Pelennor Fields."
  );
  console.log("Entities:", result.entities.map(e => `${e.type}::${e.canonical}`));
}
test();
EOF

npx ts-node /tmp/test_boundary.ts
```

2. **Analyze why it's splitting**:
```bash
# Find entity boundary detection logic
grep -rn "entity.*boundary\|span.*merge" app/engine/extract/entities.ts
```

3. **Identify the pattern**:
- Pattern: `[Event word] of [Proper noun phrase]`
- Examples: "Battle of X", "War of X", "Treaty of X"
- Should be: Single entity, not split at "of"

4. **Implement fix** (`app/engine/extract/entities.ts`):
```typescript
function mergeOfPatterns(entities: Entity[]): Entity[] {
  // Look for pattern: EVENT + "of" + PLACE/PERSON
  // Examples: "Battle of Hastings", "Lord of the Rings"

  const eventWords = new Set(['battle', 'war', 'treaty', 'siege']);

  for (let i = 0; i < entities.length - 1; i++) {
    const curr = entities[i];
    const next = entities[i + 1];

    // Check if first entity ends with event word
    const lastWord = curr.canonical.split(' ').pop()?.toLowerCase();
    if (eventWords.has(lastWord || '')) {
      // Check if there's "of" between them in text
      if (textBetween(curr, next) === ' of ') {
        // Merge into single entity
        curr.canonical = `${curr.canonical} of ${next.canonical}`;
        curr.end = next.end;
        entities.splice(i + 1, 1);
        i--; // Check this entity again
      }
    }
  }

  return entities;
}
```

5. **Test the fix**:
```bash
npx ts-node /tmp/test_boundary.ts
# Should now show: EVENT::Battle of Pelennor Fields
```

6. **Verify no regressions**:
```bash
npx vitest run tests/ladder/level-1-simple.spec.ts 2>&1 | tail -20
```

7. **Document**:
```markdown
# Fix: Entity Boundary Detection for "X of Y" Patterns

## Problem
Multi-word entities with "of" were being incorrectly split:
- "Battle of Pelennor Fields" → "Battle" + "Pelennor Fields"

## Solution
Added mergeOfPatterns() to detect and merge "EVENT of PLACE" patterns.

## Test Results
- Test 1.19 now passing
- Entity precision: 89.2% → 92.5%
```

---

### Workflow 3: Improving Precision/Recall

**Understanding the Trade-off**:
- **High Precision, Low Recall**: Too conservative, missing valid extractions
- **Low Precision, High Recall**: Too aggressive, extracting false positives

**To Increase Precision** (reduce false positives):

1. **Add stricter filters**:
```typescript
// Before: Extract all noun phrases
const entities = allNounPhrases(text);

// After: Filter by confidence
const entities = allNounPhrases(text).filter(e => e.confidence > 0.7);
```

2. **Validate entity types**:
```typescript
// Check if entity makes sense for its type
function isValidPersonName(name: string): boolean {
  // Person names typically start with capital letter
  // And don't contain certain words
  const invalidWords = ['the', 'a', 'an'];
  return /^[A-Z]/.test(name) && !invalidWords.some(w => name.toLowerCase().includes(w));
}
```

3. **Remove duplicate relations**:
```typescript
function deduplicateRelations(relations: Relation[]): Relation[] {
  const seen = new Set<string>();
  return relations.filter(r => {
    const key = `${r.subj}::${r.pred}::${r.obj}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

**To Increase Recall** (find more valid extractions):

1. **Add more patterns**:
```typescript
// Before: Only "X married Y"
if (verb === "married") {
  return createRelation(subj, "married_to", obj);
}

// After: Multiple patterns for same relation
if (verb === "married" || verb === "wed" || phrase === "got married to") {
  return createRelation(subj, "married_to", obj);
}
```

2. **Handle more variations**:
```typescript
// Handle past/present/future tense
const marriageVerbs = ["marry", "married", "marries", "wed", "wedded"];
```

3. **Expand entity detection**:
```typescript
// Before: Only proper nouns
const entities = tokens.filter(t => t.pos === "PROPN");

// After: Include some common nouns
const entities = tokens.filter(t =>
  t.pos === "PROPN" ||
  (t.pos === "NOUN" && isKnownEntity(t.text))
);
```

**Measure impact**:
```bash
# Before change
npx vitest run tests/ladder/level-1-simple.spec.ts > /tmp/before.log 2>&1

# After change
npx vitest run tests/ladder/level-1-simple.spec.ts > /tmp/after.log 2>&1

# Compare
diff <(grep "Precision:\|Recall:" /tmp/before.log) <(grep "Precision:\|Recall:" /tmp/after.log)
```

---

### Workflow 4: Debugging Extraction Issues

**Issue**: Test failing but not sure why

**Step-by-step debugging**:

1. **Isolate the failing test**:
```bash
# Find the test ID
grep "Test 2.7" tests/ladder/level-2-multisentence.spec.ts -A20
```

2. **Create minimal reproduction**:
```typescript
// /tmp/debug_test.ts
import { extractFromSegments } from './app/engine/extract/orchestrator';

async function debug() {
  const text = "Harry and Ron studied at Hogwarts.";

  console.log("Input:", text);

  const result = await extractFromSegments("debug", text);

  console.log("\nExtracted Entities:");
  result.entities.forEach(e => {
    console.log(`  ${e.type}::${e.canonical} (${e.start}-${e.end})`);
  });

  console.log("\nExtracted Relations:");
  result.relations.forEach(r => {
    console.log(`  ${r.subj} --${r.pred}-> ${r.obj}`);
  });

  console.log("\nExpected:");
  console.log("  Entities: PERSON::Harry, PERSON::Ron, ORG::Hogwarts");
  console.log("  Relations: harry::studies_at::hogwarts, ron::studies_at::hogwarts");
}

debug();
```

3. **Run with debug output**:
```bash
npx ts-node /tmp/debug_test.ts
```

4. **Add logging to source code**:
```typescript
// In app/engine/extract/entities.ts
export function extractEntities(text: string): Entity[] {
  console.log(`[EXTRACT] Input: "${text}"`);

  const entities = /* extraction logic */;

  console.log(`[EXTRACT] Found ${entities.length} entities`);
  entities.forEach(e => console.log(`  [EXTRACT] ${e.type}::${e.canonical}`));

  return entities;
}
```

5. **Trace through the pipeline**:
```bash
npx ts-node /tmp/debug_test.ts 2>&1 | grep "\[EXTRACT\]"
```

6. **Compare with expected**:
- What did we extract?
- What should we have extracted?
- What's the difference?

7. **Identify root cause**:
- Entity not detected? → Check NER logic
- Entity detected but wrong type? → Check type classification
- Entities correct but relation missing? → Check relation patterns
- Relation created but wrong predicate? → Check pattern matching

8. **Fix and verify**:
```bash
# Make the fix
# Run debug script again
npx ts-node /tmp/debug_test.ts

# Run full test
npx vitest run tests/ladder/level-2-multisentence.spec.ts 2>&1 | grep "Test 2.7"
```

---

## Tools and Commands Reference

### Test Commands

```bash
# Run single test file
npx vitest run tests/ladder/level-1-simple.spec.ts

# Run all ladder tests
npx vitest run tests/ladder/

# Run with verbose output
npx vitest run tests/ladder/level-1-simple.spec.ts --reporter=verbose

# Run specific test by pattern
npx vitest run tests/ladder/ -t "Test 1.19"

# Watch mode (reruns on file change)
npx vitest tests/ladder/level-1-simple.spec.ts
```

### Search Commands

```bash
# Find function definition
grep -rn "function extractEntities" app/

# Find all uses of a function
grep -rn "extractEntities(" app/

# Find pattern in specific file
grep -n "canonical" app/engine/extract/entities.ts

# Find with context
grep -A5 -B5 "pattern" file.ts

# Find in multiple files
grep -r "pattern" app/engine/extract/*.ts

# Case-insensitive search
grep -i "pattern" file.ts
```

### File Operations

```bash
# Read file with line numbers
cat -n app/engine/extract/entities.ts | head -50

# View specific lines
sed -n '100,200p' app/engine/extract/entities.ts

# Check file structure
ls -la app/engine/extract/

# Find files by pattern
find app/ -name "*extract*.ts"

# Check file size
wc -l app/engine/extract/entities.ts
```

### Git Commands (If Applicable)

```bash
# Check what changed
git diff app/engine/extract/entities.ts

# See recent changes
git log --oneline -10

# Revert file to previous version
git checkout HEAD -- app/engine/extract/entities.ts

# Create branch for feature
git checkout -b feature/new-relation-type
```

### Debug Logging

**Add temporary logging**:
```typescript
console.log('[DEBUG]', variable);
console.log('[DEBUG] entities:', JSON.stringify(entities, null, 2));
console.table(entities);
```

**Remove debug logs before committing**:
```bash
# Find all debug logs
grep -rn "console.log.*DEBUG" app/

# Or more aggressive
grep -rn "console.log" app/ | grep -v "Production log"
```

---

## Testing Strategy

### When to Run Which Tests

**During Development** (quick feedback):
- Run only the test level you're working on
- Use focused tests for specific failures

**Before Committing** (verify no regressions):
- Run all test levels you've previously passed
- Run full test suite if major changes

**After Major Changes**:
- Run complete test suite
- Check metrics against targets
- Verify no performance degradation

### Test Result Interpretation

**Green (Passing)**:
```
✓ tests/ladder/level-1-simple.spec.ts (1)
   ✓ Test Ladder - Level 1: Simple Sentences (1)
     ✓ should pass all 20 simple sentence tests

🎉 LEVEL 1 PASSED! Unlock Level 2.
```

**Red (Failing)**:
```
✕ tests/ladder/level-1-simple.spec.ts (1)
   ✕ Test Ladder - Level 1: Simple Sentences (1)
     ✕ should pass all 20 simple sentence tests

AssertionError: expected 0.825 to be at least 0.9
```

**Metrics Below Target**:
```
❌ Test 1.19 failed:
   Entity P/R: 66.7% / 66.7%
   Relation P/R: 100.0% / 100.0%
```

### Creating New Test Cases

**Format** (add to test file):
```typescript
{
  id: 'X.Y',
  text: 'Your test sentence here.',
  gold: {
    entities: [
      { text: 'Entity1', type: 'PERSON' },
      { text: 'Entity2', type: 'PLACE' }
    ],
    relations: [
      { subj: 'entity1', pred: 'traveled_to', obj: 'entity2' }
    ]
  }
}
```

**Guidelines**:
- Start with simple cases
- Add complexity gradually
- Cover edge cases
- Document expected behavior
- Reference GROUND_TRUTHS.md

---

## File Mirroring Details

### Why Mirroring Matters

The ARES project can have both TypeScript (`.ts`) and JavaScript (`.js`) files:
- `.ts` files: Source code, what you edit
- `.js` files: Compiled code, what Node.js might execute

**Problem**: If `.js` files exist and are stale, your `.ts` changes won't take effect.

### The Definitive Solution

**Delete all compiled .js files in app/ directory**:
```bash
find /Users/corygilford/ares/app -name "*.js" -type f -delete
```

**Why this works**:
1. Removes stale compiled code
2. Forces use of TypeScript source
3. Vitest/ts-node transpiles on the fly
4. Always uses latest changes

**When to do this**:
- After editing any .ts file
- Before running tests
- If you see unexpected behavior
- When switching between git branches

### Verifying Success

**Check for .js files**:
```bash
find /Users/corygilford/ares/app -name "*.js" -type f
# Should return nothing or very few files
```

**Check test uses TypeScript**:
```bash
npx vitest run tests/ladder/level-1-simple.spec.ts --reporter=verbose 2>&1 | head -20
# Should not show warnings about compiled files
```

### Common Pitfalls

**Pitfall 1**: Editing .ts but .js file still exists
- **Symptom**: Changes don't take effect
- **Fix**: Delete .js files

**Pitfall 2**: Build tool creates .js files automatically
- **Symptom**: .js files reappear after deletion
- **Fix**: Check build scripts, disable automatic compilation

**Pitfall 3**: Deployment uses .js files
- **Symptom**: Dev works, production doesn't
- **Fix**: Build fresh .js files before deployment: `npx tsc`

---

## Common Issues and Solutions

### Issue: Tests Pass Locally but Fail in CI

**Possible causes**:
- Different Node.js version
- Missing environment setup
- Stale cache

**Solution**:
```bash
# Check Node version
node --version

# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Run tests
npx vitest run tests/ladder/
```

---

### Issue: Extraction Very Slow

**Symptoms**:
- Tests timeout
- Single extraction takes >5 seconds

**Debugging**:
```bash
# Time the extraction
time npx ts-node /tmp/test_extraction.ts

# Profile with Node.js
node --prof /tmp/test_extraction.js
node --prof-process isolate-*-v8.log > profile.txt
```

**Common causes**:
- Infinite loop in pattern matching
- Repeated expensive operations (regex, parsing)
- Memory leak

**Solutions**:
- Add caching for expensive operations
- Optimize regex patterns
- Use early returns in loops

---

### Issue: TypeScript Compilation Errors

**Symptom**:
```
error TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'
```

**Solutions**:
```bash
# Check TypeScript configuration
cat tsconfig.json

# Verify types are correct
npx tsc --noEmit

# Install type definitions
npm install --save-dev @types/node
```

---

### Issue: Import/Module Errors

**Symptom**:
```
Cannot find module './entities' or its corresponding type declarations
```

**Solutions**:
1. Check file path is correct
2. Check file extension (`.ts` not `.js`)
3. Check import statement:
   ```typescript
   // Correct
   import { extractEntities } from './entities';

   // Wrong (don't include extension in import)
   import { extractEntities } from './entities.ts';
   ```

---

## Best Practices

### Code Style

1. **Descriptive names**:
```typescript
// Good
function mergeEntitiesByCanonicalName(entities: Entity[]): Entity[]

// Bad
function merge(arr: any[]): any[]
```

2. **Comments explain why**:
```typescript
// Good
// Merge "Battle of X" patterns to prevent splitting event names
function mergeOfPatterns(entities: Entity[]): Entity[]

// Bad
// Merge entities
function mergeOfPatterns(entities: Entity[]): Entity[]
```

3. **Small, focused functions**:
```typescript
// Good: Each function does one thing
function detectEntities(text: string): Entity[]
function mergeEntities(entities: Entity[]): Entity[]
function filterLowConfidence(entities: Entity[]): Entity[]

// Bad: One huge function doing everything
function processText(text: string): Entity[]
```

### Testing Strategy

1. **Test one thing at a time**
2. **Start simple, add complexity**
3. **Document expected behavior**
4. **Use meaningful test names**

### Documentation

1. **Document as you go** (not later)
2. **Update docs when changing behavior**
3. **Include examples**
4. **Explain trade-offs**

---

## Related Documentation

- **Ground Truths**: `/Users/corygilford/ares/docs/GROUND_TRUTHS.md`
- **Master Plan**: `/Users/corygilford/ares/docs/ENTITY_EXTRACTION_MASTER_PLAN.md`
- **Quick Start**: `/Users/corygilford/ares/docs/AI_ASSISTANT_QUICK_START.md`
- **Architecture**: `/Users/corygilford/ares/ARCHITECTURE_DIAGRAM.md`
- **For AI Agents**: `/Users/corygilford/ares/docs/FOR_AGENTS.md`

---

## Quick Reference Card

```bash
# Test Commands
npx vitest run tests/ladder/level-1-simple.spec.ts    # Run Level 1
npx vitest run tests/ladder/level-2-multisentence.spec.ts  # Run Level 2
npx vitest run tests/ladder/   # Run all levels

# Search Commands
grep -rn "pattern" app/engine/extract/   # Find in extraction code
grep -A10 "Test 1.19" tests/ladder/level-1-simple.spec.ts  # Find test

# Debug Commands
npx ts-node /tmp/test_file.ts   # Run test script
find /Users/corygilford/ares/app -name "*.js" -type f -delete  # Clean .js

# File Locations
app/engine/extract/entities.ts    # Entity extraction
app/engine/extract/relations.ts   # Relation extraction
tests/ladder/*.spec.ts            # Test suites
docs/GROUND_TRUTHS.md            # Expected behavior
```

---

**Last Updated**: 2025-11-17
**Maintainer**: ARES Project Team
**Questions**: See `/Users/corygilford/ares/docs/FOR_AGENTS.md`
