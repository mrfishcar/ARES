# Clause Detector Implementation Guide

**Purpose**: Technical guide for implementing clause boundary detection
**Audience**: AI assistants and developers working on Phase 2, Day 1
**Task**: Implement clause-detector.ts for Day 1, Task 1.2
**Goal**: Segment sentences into main + subordinate clauses
**Time**: 2 hours

---

## Step 1: Create the File (5 min)

**File**: `/Users/corygilford/ares/app/engine/extract/clause-detector.ts`

```typescript
import { Sentence, Token } from '../schema';

export interface Clause {
  text: string;
  start: number;
  end: number;
  type: 'main' | 'subordinate' | 'relative';
  tokens: Token[];  // Tokens in this clause
}

/**
 * Detect clause boundaries in a sentence using spaCy dependency markers
 *
 * Example:
 * "Gandalf traveled to Rivendell, where Elrond lived."
 * → Main: "Gandalf traveled to Rivendell"
 * → Relative: "where Elrond lived"
 */
export function detectClauses(sentence: Sentence): Clause[] {
  const clauses: Clause[] = [];
  const tokens = sentence.tokens;

  if (!tokens || tokens.length === 0) {
    return clauses;
  }

  // Find subordinate clause markers
  const markers = findClauseMarkers(tokens);

  if (markers.length === 0) {
    // Simple sentence - no subordinate clauses
    return [{
      text: sentence.text,
      start: tokens[0].start,
      end: tokens[tokens.length - 1].end,
      type: 'main',
      tokens: tokens
    }];
  }

  // Split into clauses based on markers
  let lastEnd = 0;

  for (const marker of markers) {
    // Add main clause before this marker
    if (marker.position > lastEnd) {
      const mainTokens = tokens.slice(lastEnd, marker.position);
      clauses.push({
        text: sentence.text.substring(
          mainTokens[0].start,
          mainTokens[mainTokens.length - 1].end
        ),
        start: mainTokens[0].start,
        end: mainTokens[mainTokens.length - 1].end,
        type: 'main',
        tokens: mainTokens
      });
    }

    // Add subordinate clause
    const subTokens = tokens.slice(marker.position, marker.endPosition);
    clauses.push({
      text: sentence.text.substring(
        subTokens[0].start,
        subTokens[subTokens.length - 1].end
      ),
      start: subTokens[0].start,
      end: subTokens[subTokens.length - 1].end,
      type: marker.type,
      tokens: subTokens
    });

    lastEnd = marker.endPosition;
  }

  // Add remaining main clause
  if (lastEnd < tokens.length) {
    const mainTokens = tokens.slice(lastEnd);
    clauses.push({
      text: sentence.text.substring(
        mainTokens[0].start,
        mainTokens[mainTokens.length - 1].end
      ),
      start: mainTokens[0].start,
      end: mainTokens[mainTokens.length - 1].end,
      type: 'main',
      tokens: mainTokens
    });
  }

  return clauses;
}

interface ClauseMarker {
  position: number;      // Token index where marker starts
  endPosition: number;   // Token index where clause ends
  type: 'subordinate' | 'relative';
  marker: string;        // The actual marker word
}

/**
 * Find subordinate clause markers in token stream
 *
 * Markers:
 * - Relative pronouns: where, which, who, whom, whose, that
 * - Subordinating conjunctions: because, although, while, if, when, since
 */
function findClauseMarkers(tokens: Token[]): ClauseMarker[] {
  const markers: ClauseMarker[] = [];

  // Relative pronouns
  const relativeProns = new Set(['where', 'which', 'who', 'whom', 'whose', 'that']);

  // Subordinating conjunctions
  const subConjs = new Set(['because', 'although', 'while', 'if', 'when', 'since', 'unless', 'until']);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const word = token.text.toLowerCase();

    // Check for relative pronoun after comma
    if (relativeProns.has(word)) {
      // Find end of this clause (next comma, or end of sentence)
      let endPos = findClauseEnd(tokens, i);

      markers.push({
        position: i,
        endPosition: endPos,
        type: 'relative',
        marker: word
      });

      // Skip to end of this clause
      i = endPos - 1;
      continue;
    }

    // Check for subordinating conjunction
    if (subConjs.has(word)) {
      let endPos = findClauseEnd(tokens, i);

      markers.push({
        position: i,
        endPosition: endPos,
        type: 'subordinate',
        marker: word
      });

      i = endPos - 1;
      continue;
    }
  }

  return markers;
}

/**
 * Find the end of a subordinate clause starting at `startIdx`
 *
 * Heuristic:
 * - End at comma (unless inside nested structure)
 * - End at period/end of sentence
 * - End at coordinating conjunction (and, or, but)
 */
function findClauseEnd(tokens: Token[], startIdx: number): number {
  let depth = 0;  // Track nested parentheses/brackets

  for (let i = startIdx + 1; i < tokens.length; i++) {
    const token = tokens[i];
    const text = token.text;

    // Track nesting
    if (text === '(' || text === '[') depth++;
    if (text === ')' || text === ']') depth--;

    // End at comma if not nested
    if (depth === 0 && text === ',') {
      return i;
    }

    // End at period
    if (text === '.' || text === '!' || text === '?') {
      return i;
    }

    // End at coordinating conjunction (and, or, but) if not nested
    const coord = new Set(['and', 'or', 'but']);
    if (depth === 0 && coord.has(text.toLowerCase())) {
      return i;
    }
  }

  // Default: end of sentence
  return tokens.length;
}
```

---

## Step 2: Test the Detector (30 min)

Create test file:

```bash
cat > /tmp/test_clause_detector.ts << 'EOF'
import { detectClauses } from './app/engine/extract/clause-detector';

// Mock sentence with spaCy-like structure
const testSentence = {
  text: "Gandalf traveled to Rivendell, where Elrond lived.",
  tokens: [
    { text: "Gandalf", start: 0, end: 7, pos: "PROPN", dep: "nsubj" },
    { text: "traveled", start: 8, end: 16, pos: "VERB", dep: "ROOT" },
    { text: "to", start: 17, end: 19, pos: "ADP", dep: "prep" },
    { text: "Rivendell", start: 20, end: 29, pos: "PROPN", dep: "pobj" },
    { text: ",", start: 29, end: 30, pos: "PUNCT", dep: "punct" },
    { text: "where", start: 31, end: 36, pos: "ADV", dep: "advmod" },
    { text: "Elrond", start: 37, end: 43, pos: "PROPN", dep: "nsubj" },
    { text: "lived", start: 44, end: 49, pos: "VERB", dep: "relcl" },
    { text: ".", start: 49, end: 50, pos: "PUNCT", dep: "punct" }
  ]
};

const clauses = detectClauses(testSentence as any);

console.log("Detected clauses:");
for (const clause of clauses) {
  console.log(`  ${clause.type}: "${clause.text}"`);
  console.log(`    Tokens: ${clause.tokens.map(t => t.text).join(' ')}`);
}
EOF

npx ts-node /tmp/test_clause_detector.ts
```

**Expected output**:
```
Detected clauses:
  main: "Gandalf traveled to Rivendell"
    Tokens: Gandalf traveled to Rivendell ,
  relative: "where Elrond lived"
    Tokens: where Elrond lived .
```

---

## Step 3: Handle Edge Cases (30 min)

Test with more examples:

```typescript
// Test cases
const tests = [
  "Gandalf traveled to Rivendell, where Elrond lived.",
  "Frodo went to Mordor because he had to destroy the Ring.",
  "Aragorn, who became king, ruled Gondor.",
  "Harry studied magic while Ron played chess.",
  "The Ring was destroyed when Frodo threw it into the fire."
];

for (const text of tests) {
  // Parse with spaCy first (you'll need actual parsing)
  // Then detect clauses
  // Verify correct splitting
}
```

**Edge cases to handle**:
1. Multiple subordinate clauses
2. Nested clauses
3. Relative clauses with "who", "which"
4. Temporal clauses with "when", "while"
5. Causal clauses with "because", "since"

---

## Step 4: Integrate into Extraction Pipeline (30 min)

**Modify**: `/Users/corygilford/ares/app/engine/extract/relations.ts`

Find where relations are extracted (likely in `extractRelations()` function):

```typescript
// BEFORE:
export async function extractRelations(
  text: string,
  entities: Entity[],
  spans: any[],
  parsed: ParsedDocument
): Promise<Relation[]> {
  const relations: Relation[] = [];

  for (const sent of parsed.sentences) {
    // Extract relations from full sentence
    const sentRels = extractFromSentence(sent, entities, spans);
    relations.push(...sentRels);
  }

  return relations;
}

// AFTER:
import { detectClauses } from './clause-detector';

export async function extractRelations(
  text: string,
  entities: Entity[],
  spans: any[],
  parsed: ParsedDocument
): Promise<Relation[]> {
  const relations: Relation[] = [];

  for (const sent of parsed.sentences) {
    // Detect clauses
    const clauses = detectClauses(sent);

    // Extract relations from EACH clause
    for (const clause of clauses) {
      // Create a mini-sentence for this clause
      const clauseSent = {
        ...sent,
        text: clause.text,
        tokens: clause.tokens
      };

      const clauseRels = extractFromSentence(clauseSent, entities, spans);
      relations.push(...clauseRels);
    }
  }

  return relations;
}
```

---

## Step 5: Test End-to-End (30 min)

Run your original test:

```bash
node /tmp/test_compound.js > /tmp/compound_after_clauses.log 2>&1
cat /tmp/compound_after_clauses.log
```

**Expected improvement**:
```
// Before:
Relations: gandalf::traveled_to::rivendell

// After:
Relations:
  gandalf::traveled_to::rivendell
  elrond::lives_in::rivendell  ← NEW!
```

**Compare**:
```bash
diff /tmp/compound_current.log /tmp/compound_after_clauses.log
```

---

## Step 6: Mirror to JavaScript (15 min)

Since tests might use compiled code:

1. Create `/Users/corygilford/ares/dist/app/engine/extract/clause-detector.js`
2. Copy the TypeScript logic (remove types)
3. Update `relations.js` with the integration

**Or**: Just delete all .js files again and let vitest transpile fresh:
```bash
find /Users/corygilford/ares/app -name "*.js" -type f -delete
```

---

## Success Criteria

✅ `detectClauses()` correctly identifies:
- Main clause: "Gandalf traveled to Rivendell"
- Relative clause: "where Elrond lived"

✅ Relations extracted from BOTH clauses:
- gandalf::traveled_to::rivendell
- elrond::lives_in::rivendell

✅ Test passes on 3+ compound sentence examples

✅ No regressions on Level 1 tests

---

## If Stuck

**Problem**: Can't figure out clause boundaries
**Solution**: Use simple heuristic first:
- Split on comma + relative pronoun (", where", ", which")
- Split on subordinating conjunctions ("because", "while")
- Don't worry about perfect parsing yet

**Problem**: Relations still missing from subordinate clauses
**Solution**: Add debug logging:
```typescript
console.log(`[CLAUSE] Detected ${clauses.length} clauses`);
for (const clause of clauses) {
  console.log(`  [CLAUSE] ${clause.type}: "${clause.text}"`);
}
```

**Problem**: Too many false positives
**Solution**: Filter clauses by verb presence:
```typescript
const hasVerb = clause.tokens.some(t => t.pos === 'VERB');
if (!hasVerb) continue;  // Skip non-verbal clauses
```

---

## Next: Task 1.3

After clause detector works, you'll integrate it into entity extraction (not just relations).

But for now, focus on getting relations from subordinate clauses working!

---

**Time Budget**:
- File creation: 5 min ✓
- Basic implementation: 45 min
- Testing: 30 min
- Edge cases: 30 min
- Integration: 30 min
- End-to-end test: 30 min
- Mirror to JS: 15 min

**Total**: ~3 hours (slightly over 2hr estimate, but thorough)

---

Good luck! Report back with `/tmp/clause_detector_results.md` when done.
