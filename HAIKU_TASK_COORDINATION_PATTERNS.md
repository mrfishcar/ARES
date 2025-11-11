# Task: Add Coordination Patterns for Common Relations

## Context
We just fixed Stage 2 by adding coordination patterns for `studies_at` and `traveled_to`.
These patterns handle "X and Y verb Z" instead of just "X verb Z".

**Result**: Stage 2 recall improved from 76.7% to 83.3% (+6.6%)

## Your Task
Add coordination patterns for 5 more common relations to improve coverage.

## File to Edit
`app/engine/narrative-relations.ts`

## Patterns to Add

### 1. friends_with coordination
Add BEFORE the existing friends_with pattern (around line 78-91):

```typescript
// COORDINATION: "Harry and Ron were friends"
{
  regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:were|are|became|remained)\s+(?:best\s+)?friends?\b/g,
  predicate: 'friends_with',
  symmetric: true,
  typeGuard: { subj: ['PERSON'], obj: ['PERSON'] },
  extractSubj: null,
  extractObj: null,  // Both are subjects - special handling needed
  coordination: true
},
```

**Note**: For symmetric relations where BOTH are subjects (not subject→object), the coordination handler needs adjustment. For now, add the pattern and mark it `coordination: true`.

### 2. lives_in coordination
Add BEFORE the existing lives_in pattern (around line 175-178):

```typescript
// COORDINATION: "Harry and Dudley lived in Privet Drive"
{
  regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:lived|dwelt|dwelled|resided|reside|live)\s+(?:in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
  predicate: 'lives_in',
  typeGuard: { subj: ['PERSON'], obj: ['PLACE'] },
  extractSubj: null,
  extractObj: 3,
  coordination: true
},
```

### 3. married_to coordination
The pattern already exists! Check line 60-64:
```typescript
{
  regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:married|wed)\b/g,
  predicate: 'married_to',
  symmetric: true,
  typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
}
```

**Add the coordination flag**:
```typescript
{
  regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:married|wed)\b/g,
  predicate: 'married_to',
  symmetric: true,
  typeGuard: { subj: ['PERSON'], obj: ['PERSON'] },
  extractSubj: null,
  extractObj: null,  // Both are subjects
  coordination: true
},
```

### 4. member_of coordination
Add new pattern (no existing one):

```typescript
// COORDINATION: "Harry and Ron were members of Gryffindor"
{
  regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:were|are|was)\s+(?:members?|part)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
  predicate: 'member_of',
  typeGuard: { subj: ['PERSON'], obj: ['ORG', 'HOUSE'] },
  extractSubj: null,
  extractObj: 3,
  coordination: true
},
```

### 5. works_at coordination
Add after the employment patterns I added (around line 257):

```typescript
// COORDINATION: "Alice and Bob worked at NASA"
{
  regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:worked|works|work)\s+(?:at|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
  predicate: 'works_for',
  typeGuard: { subj: ['PERSON'], obj: ['ORG'] },
  extractSubj: null,
  extractObj: 3,
  coordination: true
},
```

## Special Case: Symmetric Coordination

For patterns where BOTH matches are subjects (like "Harry and Ron were friends"), you need special logic.

**Update the coordination handler** in `narrative-relations.ts` around line 593:

```typescript
if ((pattern as any).coordination && match[1] && match[2]) {
  const firstSubj = match[1];
  const secondSubj = match[2];
  const obj = match[3];  // May be undefined for symmetric relations

  // Case 1: Subject-Object coordination (e.g., "Harry and Ron studied at Hogwarts")
  if (obj) {
    for (const subjSurface of [firstSubj, secondSubj]) {
      const subjEntity = matchEntity(subjSurface, entities);
      const objEntity = matchEntity(obj, entities);

      if (subjEntity && objEntity && passesTypeGuard(pattern, subjEntity, objEntity)) {
        // ... existing relation creation code ...
      }
    }
  }
  // Case 2: Symmetric coordination (e.g., "Harry and Ron were friends")
  else if (pattern.symmetric) {
    const entity1 = matchEntity(firstSubj, entities);
    const entity2 = matchEntity(secondSubj, entities);

    if (entity1 && entity2 && passesTypeGuard(pattern, entity1, entity2)) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;

      // Create forward relation
      relations.push({
        id: uuid(),
        subj: entity1.id,
        pred: pattern.predicate as any,
        obj: entity2.id,
        evidence: [{
          doc_id: docId,
          span: { start: matchStart, end: matchEnd, text: match[0] },
          sentence_index: 0,
          source: 'RULE'
        }],
        confidence: 0.85,
        extractor: 'regex'
      });

      // Create reverse relation (symmetric)
      relations.push({
        id: uuid(),
        subj: entity2.id,
        pred: pattern.predicate as any,
        obj: entity1.id,
        evidence: [{
          doc_id: docId,
          span: { start: matchStart, end: matchEnd, text: match[0] },
          sentence_index: 0,
          source: 'RULE'
        }],
        confidence: 0.85,
        extractor: 'regex'
      });
    }
  }
  continue;
}
```

## Testing

After adding patterns, run:
```bash
npm test tests/ladder/level-2-multisentence.spec.ts
npm test tests/ladder/level-3-complex.spec.ts
```

Stage 2 should remain passing. Stage 3 may improve slightly.

## Expected Impact

These patterns won't fix Stage 3 completely (that needs multi-paragraph handling), but they'll help Stage 2 and give incremental Stage 3 improvement.

## Time Estimate

2 hours total

## Deliverable

Commit with message:
```
feat: add coordination patterns for friends_with, lives_in, member_of, works_at

Extends coordination fix from studies_at/traveled_to to cover more relations.

New patterns handle:
- "Harry and Ron were friends" (friends_with)
- "Harry and Dudley lived in Privet Drive" (lives_in)
- "Harry and Ron were members of Gryffindor" (member_of)
- "Alice and Bob worked at NASA" (works_at)
- "Arthur and Molly married" (married_to - added flag)

Also updated coordination handler to support symmetric relations where
both captures are subjects (not subject→object pattern).
```
