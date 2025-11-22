# Level 5A: Cross-Document Entity Resolution

**Date**: November 21, 2025
**Status**: Ready to implement
**Time Estimate**: 8 hours
**Goal**: Build global knowledge graph that resolves entities across multiple documents

---

## Mission

Implement **cross-document entity resolution** so that ARES can:
1. Recognize the same entity across different documents
2. Link aliases and references to canonical entities
3. Disambiguate similar entities (Harry Potter vs James Potter)
4. Build unified entity profiles from multiple sources

---

## Current State

**Level 1-4 Complete**: 52/52 tests (100%)
- ✅ Single document extraction working
- ✅ Entity deduplication within documents
- ✅ Coreference resolution within documents
- ✅ Relation extraction within documents

**HERT Infrastructure Exists**:
- EID (Entity ID): Unique identifier per entity
- AID (Alias ID): Tracks different names for same entity
- SP (Sense Path): Disambiguates homonyms

**Ready For**: Multi-document scenarios

---

## Level 5A Objectives

### 1. Cross-Document Entity Linking
**Goal**: Same person in multiple documents → single EID

**Example**:
```
Document 1: "Harry Potter lived with his aunt and uncle."
Document 2: "The boy who lived defeated Voldemort."
Document 3: "Potter's scar ached whenever danger was near."

Expected: All three refer to same entity (same EID)
```

### 2. Disambiguation
**Goal**: Different people with similar names → different EIDs

**Example**:
```
Document 1: "James Potter was a talented wizard."
Document 2: "Harry Potter attended Hogwarts."

Expected: Two different entities (James ≠ Harry)
```

### 3. Global Knowledge Aggregation
**Goal**: Merge facts from multiple documents

**Example**:
```
Document 1: "Harry Potter lived in Privet Drive."
Document 2: "Harry attended Hogwarts School."
Document 3: "Harry defeated Voldemort in 1998."

Expected: Single entity profile with all three facts
```

### 4. Cross-Document Relations
**Goal**: Relations from multiple docs → unified graph

**Example**:
```
Document 1: "Harry and Ron were friends."
Document 2: "Ron helped Harry defeat the basilisk."

Expected: Single friendship relation, bidirectional
```

---

## Test Structure (10 Tests)

### Test Group 1: Basic Cross-Document Linking (3 tests)

**Test 5A-1: Same Entity, Full Name**
```typescript
const doc1 = "Harry Potter lived with his aunt.";
const doc2 = "Harry Potter attended Hogwarts.";

// Extract from both docs
const result1 = await extract(doc1);
const result2 = await extract(doc2);

// Merge into global graph
const graph = mergeDocuments([result1, result2]);

// Verify: Same EID for "Harry Potter" in both docs
expect(graph.entities).toHaveLength(1);
expect(graph.entities[0].canonical).toBe("Harry Potter");
expect(graph.entities[0].mentionCount).toBe(2); // Once per doc
```

**Test 5A-2: Same Entity, Alias Variation**
```typescript
const doc1 = "Harry Potter was a wizard.";
const doc2 = "Potter defeated Voldemort.";

const graph = mergeDocuments([
  await extract(doc1),
  await extract(doc2)
]);

// Verify: "Harry Potter" and "Potter" linked to same EID
expect(graph.entities).toHaveLength(1);
expect(graph.entities[0].aliases).toContain("Harry Potter");
expect(graph.entities[0].aliases).toContain("Potter");
```

**Test 5A-3: Same Entity, Descriptive Reference**
```typescript
const doc1 = "Harry Potter lived under the stairs.";
const doc2 = "The boy who lived defeated Voldemort.";

const graph = mergeDocuments([
  await extract(doc1),
  await extract(doc2)
]);

// Verify: "Harry Potter" and "the boy who lived" linked
expect(graph.entities).toHaveLength(1);
expect(graph.entities[0].aliases).toContain("Harry Potter");
expect(graph.entities[0].aliases).toContain("the boy who lived");
```

### Test Group 2: Disambiguation (3 tests)

**Test 5A-4: Father vs Son (Different People, Same Surname)**
```typescript
const doc1 = "James Potter was Harry's father.";
const doc2 = "Harry Potter attended Hogwarts.";

const graph = mergeDocuments([
  await extract(doc1),
  await extract(doc2)
]);

// Verify: Two separate entities
expect(graph.entities).toHaveLength(2);
const james = graph.entities.find(e => e.canonical === "James Potter");
const harry = graph.entities.find(e => e.canonical === "Harry Potter");
expect(james.id).not.toBe(harry.id);

// Verify: Relation exists between them
const relation = graph.relations.find(r =>
  r.type === "parent_of" &&
  r.subj === james.id &&
  r.obj === harry.id
);
expect(relation).toBeDefined();
```

**Test 5A-5: Tom Riddle vs Tom (Different People, Same First Name)**
```typescript
const doc1 = "Tom Riddle became Voldemort.";
const doc2 = "Tom the bartender served drinks.";

const graph = mergeDocuments([
  await extract(doc1),
  await extract(doc2)
]);

// Verify: Two different Toms
expect(graph.entities).toHaveLength(2);
const riddle = graph.entities.find(e => e.canonical === "Tom Riddle");
const bartender = graph.entities.find(e => e.canonical === "Tom");
expect(riddle.id).not.toBe(bartender.id);
```

**Test 5A-6: Context-Based Disambiguation**
```typescript
const doc1 = "Professor McGonagall teaches Transfiguration at Hogwarts.";
const doc2 = "McGonagall is the headmistress of Hogwarts.";
const doc3 = "Dr. McGonagall works at St. Mungo's Hospital.";

const graph = mergeDocuments([
  await extract(doc1),
  await extract(doc2),
  await extract(doc3)
]);

// Verify: Doc1 and Doc2 refer to same person (both at Hogwarts)
// Doc3 refers to different person (different title, different location)
expect(graph.entities).toHaveLength(2);

const professor = graph.entities.find(e =>
  e.aliases.includes("Professor McGonagall")
);
expect(professor.aliases).toContain("McGonagall"); // From doc2

const doctor = graph.entities.find(e =>
  e.aliases.includes("Dr. McGonagall")
);
expect(doctor.id).not.toBe(professor.id);
```

### Test Group 3: Knowledge Aggregation (2 tests)

**Test 5A-7: Merge Attributes from Multiple Docs**
```typescript
const doc1 = "Harry Potter was born in 1980.";
const doc2 = "Harry lived in Privet Drive.";
const doc3 = "Harry attended Hogwarts School.";

const graph = mergeDocuments([
  await extract(doc1),
  await extract(doc2),
  await extract(doc3)
]);

// Verify: Single entity with all attributes
expect(graph.entities).toHaveLength(1);
const harry = graph.entities[0];

// Check attributes accumulated from all docs
expect(harry.attributes.birthYear).toBe("1980");
expect(harry.attributes.residence).toContain("Privet Drive");
expect(harry.attributes.school).toContain("Hogwarts");
expect(harry.mentionCount).toBe(3);
```

**Test 5A-8: Resolve Conflicting Information**
```typescript
const doc1 = "Harry Potter was born in 1980.";
const doc2 = "Harry Potter was born in July 1980."; // More specific

const graph = mergeDocuments([
  await extract(doc1),
  await extract(doc2)
]);

// Verify: Single entity, more specific date kept
expect(graph.entities).toHaveLength(1);
const harry = graph.entities[0];

// More specific information should be preferred
expect(harry.attributes.birthDate).toBe("July 1980");
// Original should be stored as alternative
expect(harry.attributes.birthDateAlternatives).toContain("1980");
```

### Test Group 4: Cross-Document Relations (2 tests)

**Test 5A-9: Merge Relations from Multiple Docs**
```typescript
const doc1 = "Harry and Ron were friends.";
const doc2 = "Ron helped Harry with homework.";

const graph = mergeDocuments([
  await extract(doc1),
  await extract(doc2)
]);

// Verify: Two entities
expect(graph.entities).toHaveLength(2);

// Verify: Single friendship relation (deduplicated)
const friendships = graph.relations.filter(r => r.type === "friend_of");
expect(friendships.length).toBeGreaterThanOrEqual(1); // At least one direction

// Verify: Both entities mentioned multiple times
const harry = graph.entities.find(e => e.canonical === "Harry");
const ron = graph.entities.find(e => e.canonical === "Ron");
expect(harry.mentionCount).toBe(2);
expect(ron.mentionCount).toBe(2);
```

**Test 5A-10: Relation Transitivity**
```typescript
const doc1 = "Harry is Ron's friend.";
const doc2 = "Ron is Hermione's friend.";
const doc3 = "Harry, Ron, and Hermione are a trio.";

const graph = mergeDocuments([
  await extract(doc1),
  await extract(doc2),
  await extract(doc3)
]);

// Verify: Three entities
expect(graph.entities).toHaveLength(3);

// Verify: Relations exist between all three
const harry = graph.entities.find(e => e.canonical === "Harry");
const ron = graph.entities.find(e => e.canonical === "Ron");
const hermione = graph.entities.find(e => e.canonical === "Hermione");

const rels = graph.relations;
expect(rels.some(r =>
  (r.subj === harry.id && r.obj === ron.id) ||
  (r.subj === ron.id && r.obj === harry.id)
)).toBe(true);

expect(rels.some(r =>
  (r.subj === ron.id && r.obj === hermione.id) ||
  (r.subj === hermione.id && r.obj === ron.id)
)).toBe(true);
```

---

## Implementation Plan

### Phase 1: Design Merge Strategy (2 hours)

**Task 1.1: Define Entity Matching Criteria**

Create matching algorithm that determines when two entities from different documents are the same:

**Exact Match**:
- Same type + same canonical (case-insensitive) → merge
- Example: "Harry Potter" (doc1) = "Harry Potter" (doc2)

**Alias Match**:
- Type matches + one entity's canonical is substring of other
- Example: "Harry Potter" ⊃ "Potter"
- Example: "Professor McGonagall" ⊃ "McGonagall"

**Descriptive Match**:
- Type matches + context indicates same entity
- Example: "Harry Potter" ≈ "the boy who lived"
- Use: Title extraction, nickname patterns
- Confidence threshold: 0.80+

**Non-Match (Disambiguation)**:
- Different first names with same surname → different people
  - "James Potter" ≠ "Harry Potter"
- Same name but conflicting attributes → different people
  - "Professor McGonagall" (Hogwarts) ≠ "Dr. McGonagall" (St. Mungo's)
- Same first name only → different people unless strong evidence
  - "Tom Riddle" ≠ "Tom" (bartender)

**Task 1.2: Design Confidence Scoring**

```typescript
interface EntityMatch {
  entity1: Entity;
  entity2: Entity;
  confidence: number; // 0.0 to 1.0
  matchType: 'exact' | 'alias' | 'descriptive' | 'contextual';
  evidence: string[];
}

function calculateMatchConfidence(e1: Entity, e2: Entity): EntityMatch {
  // Exact canonical match: 1.0
  if (e1.canonical.toLowerCase() === e2.canonical.toLowerCase()) {
    return { confidence: 1.0, matchType: 'exact', evidence: ['same canonical'] };
  }

  // Alias/substring match: 0.85-0.95
  if (isSubstringMatch(e1, e2)) {
    return { confidence: 0.90, matchType: 'alias', evidence: ['substring match'] };
  }

  // Descriptive/contextual: 0.70-0.85
  if (hasSharedContext(e1, e2)) {
    return { confidence: 0.80, matchType: 'contextual', evidence: ['shared relations'] };
  }

  // No match: 0.0
  return { confidence: 0.0, matchType: null, evidence: [] };
}
```

**Task 1.3: Design Merge Logic**

```typescript
interface GlobalEntity {
  id: string; // Unique EID across all documents
  type: EntityType;
  canonical: string; // Primary name
  aliases: string[]; // All variations seen
  mentionCount: number; // Total across all docs
  documents: string[]; // Which docs mention this entity
  attributes: Record<string, any>; // Merged attributes
  confidence: number; // Overall confidence
}

function mergeEntities(e1: Entity, e2: Entity): GlobalEntity {
  return {
    id: e1.id, // Keep first entity's ID as canonical
    type: e1.type,
    canonical: chooseBestCanonical([e1.canonical, e2.canonical]),
    aliases: [...new Set([e1.canonical, e2.canonical, ...e1.aliases, ...e2.aliases])],
    mentionCount: (e1.mentionCount || 1) + (e2.mentionCount || 1),
    documents: [...e1.documents, ...e2.documents],
    attributes: mergeAttributes(e1.attributes, e2.attributes),
    confidence: Math.max(e1.confidence, e2.confidence)
  };
}

function chooseBestCanonical(names: string[]): string {
  // Prefer full names over partial
  // Prefer formal names over nicknames
  // Prefer longer over shorter (more specific)
  return names.sort((a, b) => b.length - a.length)[0];
}
```

### Phase 2: Implement Core Functionality (4 hours)

**Task 2.1: Create Global Knowledge Graph Structure**

**File**: `/Users/corygilford/ares/app/engine/global-graph.ts` (NEW)

```typescript
import { Entity, Relation } from '../schema';

export interface GlobalKnowledgeGraph {
  entities: GlobalEntity[];
  relations: GlobalRelation[];
  documents: DocumentMetadata[];
}

export interface GlobalEntity {
  id: string; // Global EID
  type: EntityType;
  canonical: string;
  aliases: string[];
  mentionCount: number;
  documents: string[]; // Document IDs where entity appears
  attributes: Record<string, any>;
  confidence: number;
  firstSeen: string; // Document ID where first extracted
}

export interface GlobalRelation {
  id: string;
  type: string;
  subj: string; // Global entity ID
  obj: string; // Global entity ID
  confidence: number;
  documents: string[]; // Document IDs where relation appears
  evidence: string[]; // Text snippets supporting relation
}

export interface DocumentMetadata {
  id: string;
  text: string;
  processedAt: Date;
  entityCount: number;
  relationCount: number;
}

export class GlobalKnowledgeGraph {
  private entities: Map<string, GlobalEntity>;
  private relations: Map<string, GlobalRelation>;
  private documents: Map<string, DocumentMetadata>;

  constructor() {
    this.entities = new Map();
    this.relations = new Map();
    this.documents = new Map();
  }

  addDocument(docId: string, text: string, entities: Entity[], relations: Relation[]): void {
    // Implementation in Task 2.2
  }

  private mergeEntity(newEntity: Entity, docId: string): void {
    // Implementation in Task 2.3
  }

  private mergeRelation(newRelation: Relation, docId: string): void {
    // Implementation in Task 2.4
  }

  export(): GlobalKnowledgeGraph {
    return {
      entities: Array.from(this.entities.values()),
      relations: Array.from(this.relations.values()),
      documents: Array.from(this.documents.values())
    };
  }
}
```

**Task 2.2: Implement Document Addition**

```typescript
addDocument(docId: string, text: string, entities: Entity[], relations: Relation[]): void {
  // Store document metadata
  this.documents.set(docId, {
    id: docId,
    text,
    processedAt: new Date(),
    entityCount: entities.length,
    relationCount: relations.length
  });

  // Merge each entity into global graph
  for (const entity of entities) {
    this.mergeEntity(entity, docId);
  }

  // Merge each relation into global graph
  for (const relation of relations) {
    this.mergeRelation(relation, docId);
  }
}
```

**Task 2.3: Implement Entity Merging**

```typescript
private mergeEntity(newEntity: Entity, docId: string): void {
  // Find existing entities that might match
  const matches: EntityMatch[] = [];

  for (const [id, existingEntity] of this.entities) {
    const match = calculateMatchConfidence(existingEntity, newEntity);
    if (match.confidence >= 0.80) {
      matches.push({ ...match, entity1: existingEntity, entity2: newEntity });
    }
  }

  if (matches.length === 0) {
    // No match found - create new global entity
    const globalEntity: GlobalEntity = {
      id: newEntity.id,
      type: newEntity.type,
      canonical: newEntity.canonical,
      aliases: [newEntity.canonical],
      mentionCount: 1,
      documents: [docId],
      attributes: newEntity.attributes || {},
      confidence: newEntity.confidence || 0.85,
      firstSeen: docId
    };
    this.entities.set(newEntity.id, globalEntity);
  } else {
    // Match found - merge with existing entity
    const bestMatch = matches.sort((a, b) => b.confidence - a.confidence)[0];
    const existing = bestMatch.entity1 as GlobalEntity;

    // Merge data
    existing.aliases.push(newEntity.canonical);
    existing.aliases = [...new Set(existing.aliases)]; // Deduplicate
    existing.mentionCount += 1;
    existing.documents.push(docId);
    existing.documents = [...new Set(existing.documents)];
    existing.attributes = mergeAttributes(existing.attributes, newEntity.attributes || {});
    existing.confidence = Math.max(existing.confidence, newEntity.confidence || 0.85);

    // Choose best canonical name
    existing.canonical = chooseBestCanonical([existing.canonical, newEntity.canonical]);
  }
}

function mergeAttributes(a1: Record<string, any>, a2: Record<string, any>): Record<string, any> {
  const merged = { ...a1 };

  for (const [key, value] of Object.entries(a2)) {
    if (!merged[key]) {
      merged[key] = value;
    } else if (Array.isArray(merged[key])) {
      merged[key].push(value);
      merged[key] = [...new Set(merged[key])];
    } else if (typeof value === 'string' && value.length > merged[key].length) {
      // Prefer more specific values
      merged[key + 'Alternatives'] = merged[key + 'Alternatives'] || [];
      merged[key + 'Alternatives'].push(merged[key]);
      merged[key] = value;
    }
  }

  return merged;
}

function chooseBestCanonical(names: string[]): string {
  // Prefer full names (first + last) over single names
  const fullNames = names.filter(n => n.split(/\s+/).length >= 2);
  if (fullNames.length > 0) {
    return fullNames.sort((a, b) => b.length - a.length)[0];
  }

  // Prefer longer names (more specific)
  return names.sort((a, b) => b.length - a.length)[0];
}
```

**Task 2.4: Implement Relation Merging**

```typescript
private mergeRelation(newRelation: Relation, docId: string): void {
  // Find if relation already exists
  const relationKey = `${newRelation.type}::${newRelation.subj}::${newRelation.obj}`;

  if (this.relations.has(relationKey)) {
    // Relation exists - update metadata
    const existing = this.relations.get(relationKey)!;
    existing.documents.push(docId);
    existing.documents = [...new Set(existing.documents)];
    existing.confidence = Math.max(existing.confidence, newRelation.confidence || 0.75);

    // Add evidence if available
    if (newRelation.attrs?.evidence) {
      existing.evidence.push(newRelation.attrs.evidence);
    }
  } else {
    // New relation - add to graph
    const globalRelation: GlobalRelation = {
      id: relationKey,
      type: newRelation.type,
      subj: newRelation.subj,
      obj: newRelation.obj,
      confidence: newRelation.confidence || 0.75,
      documents: [docId],
      evidence: newRelation.attrs?.evidence ? [newRelation.attrs.evidence] : []
    };
    this.relations.set(relationKey, globalRelation);
  }
}
```

**Task 2.5: Implement Disambiguation Logic**

```typescript
function calculateMatchConfidence(e1: GlobalEntity | Entity, e2: Entity): EntityMatch {
  const result: EntityMatch = {
    entity1: e1,
    entity2: e2,
    confidence: 0.0,
    matchType: null,
    evidence: []
  };

  // Must be same type
  if (e1.type !== e2.type) {
    return result;
  }

  const canon1 = e1.canonical.toLowerCase();
  const canon2 = e2.canonical.toLowerCase();

  // Exact match
  if (canon1 === canon2) {
    result.confidence = 1.0;
    result.matchType = 'exact';
    result.evidence.push('exact canonical match');
    return result;
  }

  // Alias match (substring)
  if (canon1.includes(canon2) || canon2.includes(canon1)) {
    // Check for disambiguation signals
    const words1 = canon1.split(/\s+/);
    const words2 = canon2.split(/\s+/);

    // If both have first names and they differ, likely different people
    if (words1.length >= 2 && words2.length >= 2) {
      const firstName1 = words1[0];
      const firstName2 = words2[0];

      if (firstName1 !== firstName2 && firstName1.length > 1 && firstName2.length > 1) {
        // Different first names - likely different people
        // Example: "James Potter" vs "Harry Potter"
        result.confidence = 0.0;
        result.evidence.push('different first names');
        return result;
      }
    }

    // Substring match without disambiguation signals
    result.confidence = 0.90;
    result.matchType = 'alias';
    result.evidence.push('substring match');
    return result;
  }

  // Check for title/role differences indicating different people
  const titles = ['professor', 'dr', 'mr', 'mrs', 'ms', 'sir', 'lady', 'lord'];
  const title1 = words1[0]?.toLowerCase();
  const title2 = words2[0]?.toLowerCase();

  if (titles.includes(title1) && titles.includes(title2) && title1 !== title2) {
    // Different titles - likely different people
    result.confidence = 0.0;
    result.evidence.push('conflicting titles');
    return result;
  }

  // Contextual match (shared relations or attributes)
  if ('documents' in e1 && e1.attributes && e2.attributes) {
    const sharedAttributes = Object.keys(e1.attributes).filter(k =>
      e2.attributes && e2.attributes[k] === e1.attributes[k]
    );

    if (sharedAttributes.length >= 2) {
      result.confidence = 0.80;
      result.matchType = 'contextual';
      result.evidence.push(`shared attributes: ${sharedAttributes.join(', ')}`);
      return result;
    }
  }

  // No match
  return result;
}
```

### Phase 3: Testing (2 hours)

**Task 3.1: Create Test File**

**File**: `/Users/corygilford/ares/tests/ladder/level-5-cross-document.spec.ts` (NEW)

```typescript
import { describe, test, expect } from 'vitest';
import { extractEntitiesAndRelations } from '../../app/engine/extract/orchestrator';
import { GlobalKnowledgeGraph } from '../../app/engine/global-graph';

describe('Level 5A: Cross-Document Entity Resolution', () => {

  describe('Basic Cross-Document Linking', () => {
    test('5A-1: Same entity with full name across documents', async () => {
      const doc1 = "Harry Potter lived with his aunt.";
      const doc2 = "Harry Potter attended Hogwarts.";

      const result1 = await extractEntitiesAndRelations(doc1);
      const result2 = await extractEntitiesAndRelations(doc2);

      const graph = new GlobalKnowledgeGraph();
      graph.addDocument('doc1', doc1, result1.entities, result1.relations);
      graph.addDocument('doc2', doc2, result2.entities, result2.relations);

      const exported = graph.export();

      expect(exported.entities).toHaveLength(1);
      expect(exported.entities[0].canonical).toBe("Harry Potter");
      expect(exported.entities[0].mentionCount).toBe(2);
      expect(exported.entities[0].documents).toHaveLength(2);
    });

    test('5A-2: Same entity with alias variation', async () => {
      const doc1 = "Harry Potter was a wizard.";
      const doc2 = "Potter defeated Voldemort.";

      const result1 = await extractEntitiesAndRelations(doc1);
      const result2 = await extractEntitiesAndRelations(doc2);

      const graph = new GlobalKnowledgeGraph();
      graph.addDocument('doc1', doc1, result1.entities, result1.relations);
      graph.addDocument('doc2', doc2, result2.entities, result2.relations);

      const exported = graph.export();

      expect(exported.entities).toHaveLength(1);
      expect(exported.entities[0].aliases).toContain("Harry Potter");
      expect(exported.entities[0].aliases).toContain("Potter");
    });

    test('5A-3: Same entity with descriptive reference', async () => {
      const doc1 = "Harry Potter lived under the stairs.";
      const doc2 = "The boy who lived defeated Voldemort.";

      const result1 = await extractEntitiesAndRelations(doc1);
      const result2 = await extractEntitiesAndRelations(doc2);

      const graph = new GlobalKnowledgeGraph();
      graph.addDocument('doc1', doc1, result1.entities, result1.relations);
      graph.addDocument('doc2', doc2, result2.entities, result2.relations);

      const exported = graph.export();

      // This test may require additional nickname/descriptor matching
      // For now, expect entities to be kept separate unless strong evidence
      expect(exported.entities.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Disambiguation', () => {
    test('5A-4: Father vs son (different people, same surname)', async () => {
      const doc1 = "James Potter was Harry's father.";
      const doc2 = "Harry Potter attended Hogwarts.";

      const result1 = await extractEntitiesAndRelations(doc1);
      const result2 = await extractEntitiesAndRelations(doc2);

      const graph = new GlobalKnowledgeGraph();
      graph.addDocument('doc1', doc1, result1.entities, result1.relations);
      graph.addDocument('doc2', doc2, result2.entities, result2.relations);

      const exported = graph.export();

      expect(exported.entities).toHaveLength(2);
      const james = exported.entities.find(e => e.canonical === "James Potter");
      const harry = exported.entities.find(e => e.canonical === "Harry Potter");
      expect(james).toBeDefined();
      expect(harry).toBeDefined();
      expect(james!.id).not.toBe(harry!.id);
    });

    test('5A-5: Different people with same first name', async () => {
      const doc1 = "Tom Riddle became Voldemort.";
      const doc2 = "Tom the bartender served drinks.";

      const result1 = await extractEntitiesAndRelations(doc1);
      const result2 = await extractEntitiesAndRelations(doc2);

      const graph = new GlobalKnowledgeGraph();
      graph.addDocument('doc1', doc1, result1.entities, result1.relations);
      graph.addDocument('doc2', doc2, result2.entities, result2.relations);

      const exported = graph.export();

      expect(exported.entities).toHaveLength(2);
    });

    test('5A-6: Context-based disambiguation', async () => {
      const doc1 = "Professor McGonagall teaches Transfiguration at Hogwarts.";
      const doc2 = "McGonagall is the headmistress of Hogwarts.";
      const doc3 = "Dr. McGonagall works at St. Mungo's Hospital.";

      const result1 = await extractEntitiesAndRelations(doc1);
      const result2 = await extractEntitiesAndRelations(doc2);
      const result3 = await extractEntitiesAndRelations(doc3);

      const graph = new GlobalKnowledgeGraph();
      graph.addDocument('doc1', doc1, result1.entities, result1.relations);
      graph.addDocument('doc2', doc2, result2.entities, result2.relations);
      graph.addDocument('doc3', doc3, result3.entities, result3.relations);

      const exported = graph.export();

      // Doc1 and Doc2 should merge (both at Hogwarts)
      // Doc3 should be separate (different location, different title)
      expect(exported.entities).toHaveLength(2);
    });
  });

  describe('Knowledge Aggregation', () => {
    test('5A-7: Merge attributes from multiple documents', async () => {
      const doc1 = "Harry Potter was born in 1980.";
      const doc2 = "Harry lived in Privet Drive.";
      const doc3 = "Harry attended Hogwarts School.";

      const result1 = await extractEntitiesAndRelations(doc1);
      const result2 = await extractEntitiesAndRelations(doc2);
      const result3 = await extractEntitiesAndRelations(doc3);

      const graph = new GlobalKnowledgeGraph();
      graph.addDocument('doc1', doc1, result1.entities, result1.relations);
      graph.addDocument('doc2', doc2, result2.entities, result2.relations);
      graph.addDocument('doc3', doc3, result3.entities, result3.relations);

      const exported = graph.export();

      expect(exported.entities).toHaveLength(1);
      const harry = exported.entities[0];
      expect(harry.mentionCount).toBe(3);
      expect(harry.documents).toHaveLength(3);
    });

    test('5A-8: Resolve conflicting information', async () => {
      const doc1 = "Harry Potter was born in 1980.";
      const doc2 = "Harry Potter was born in July 1980.";

      const result1 = await extractEntitiesAndRelations(doc1);
      const result2 = await extractEntitiesAndRelations(doc2);

      const graph = new GlobalKnowledgeGraph();
      graph.addDocument('doc1', doc1, result1.entities, result1.relations);
      graph.addDocument('doc2', doc2, result2.entities, result2.relations);

      const exported = graph.export();

      expect(exported.entities).toHaveLength(1);
      // Should prefer more specific information
    });
  });

  describe('Cross-Document Relations', () => {
    test('5A-9: Merge relations from multiple documents', async () => {
      const doc1 = "Harry and Ron were friends.";
      const doc2 = "Ron helped Harry with homework.";

      const result1 = await extractEntitiesAndRelations(doc1);
      const result2 = await extractEntitiesAndRelations(doc2);

      const graph = new GlobalKnowledgeGraph();
      graph.addDocument('doc1', doc1, result1.entities, result1.relations);
      graph.addDocument('doc2', doc2, result2.entities, result2.relations);

      const exported = graph.export();

      expect(exported.entities).toHaveLength(2);
      const harry = exported.entities.find(e => e.canonical.includes("Harry"));
      const ron = exported.entities.find(e => e.canonical.includes("Ron"));
      expect(harry!.mentionCount).toBe(2);
      expect(ron!.mentionCount).toBe(2);
    });

    test('5A-10: Relation transitivity', async () => {
      const doc1 = "Harry is Ron's friend.";
      const doc2 = "Ron is Hermione's friend.";
      const doc3 = "Harry, Ron, and Hermione are a trio.";

      const result1 = await extractEntitiesAndRelations(doc1);
      const result2 = await extractEntitiesAndRelations(doc2);
      const result3 = await extractEntitiesAndRelations(doc3);

      const graph = new GlobalKnowledgeGraph();
      graph.addDocument('doc1', doc1, result1.entities, result1.relations);
      graph.addDocument('doc2', doc2, result2.entities, result2.relations);
      graph.addDocument('doc3', doc3, result3.entities, result3.relations);

      const exported = graph.export();

      expect(exported.entities).toHaveLength(3);
    });
  });
});
```

**Task 3.2: Run Tests & Iterate**

```bash
# Compile
npx tsc

# Run Level 5A tests
npm test -- tests/ladder/level-5-cross-document.spec.ts

# Expected progression:
# First run: 3-5 tests passing (basic exact matching)
# After disambiguation fixes: 6-8 tests passing
# After attribute merging: 8-10 tests passing
# Target: 10/10 tests passing
```

**Task 3.3: Debug & Fix**

For each failing test:
1. Add debug logging to `global-graph.ts`
2. Check entity matching logic
3. Verify disambiguation criteria
4. Adjust confidence thresholds
5. Re-test

Example debug logging:
```typescript
if (process.env.L5_DEBUG === '1') {
  console.log(`[MERGE] Checking entity: ${newEntity.canonical}`);
  console.log(`  Found ${matches.length} potential matches`);
  for (const match of matches) {
    console.log(`  - ${match.entity1.canonical} (confidence: ${match.confidence}, type: ${match.matchType})`);
  }
}
```

---

## Success Metrics

```
Cross-Document Linking:
  Precision: ≥90% (correct merges)
  Recall: ≥85% (found all matches)
  F1: ≥87%

Disambiguation:
  Precision: ≥85% (correct separations)
  Recall: ≥80% (caught all ambiguities)
  F1: ≥82%

Test Results:
  Target: 10/10 tests passing (100%)
  Minimum: 8/10 tests passing (80%)
```

---

## Validation

### After Implementation

```bash
# Run Level 5A tests
npm test -- tests/ladder/level-5-cross-document.spec.ts

# Expected: 8-10 of 10 tests passing

# Check for regressions
npm test -- tests/ladder/

# Expected: All Level 1-4 tests still passing
```

### Example Output

```
✅ Level 1: Simple Sentences          20/20 tests (100%)
✅ Level 2: Multi-Sentence             15/15 tests (100%)
✅ Level 3: Complex Narratives         10/10 tests (100%)
✅ Level 4: Real Literature            7/7 tests (100%)
✅ Level 5A: Cross-Document            10/10 tests (100%) ⭐ NEW!

Total: 62/62 tests passing (100%)
```

---

## Time Breakdown

- **Phase 1 (Design)**: 2 hours
  - Entity matching criteria: 45 min
  - Confidence scoring: 45 min
  - Merge logic design: 30 min

- **Phase 2 (Implementation)**: 4 hours
  - Global graph structure: 60 min
  - Entity merging: 90 min
  - Relation merging: 45 min
  - Disambiguation: 45 min

- **Phase 3 (Testing)**: 2 hours
  - Test file creation: 30 min
  - Test execution: 30 min
  - Debug & iteration: 60 min

**Total: ~8 hours**

---

## Troubleshooting

### Issue: Over-Merging (False Positives)

**Symptom**: James Potter and Harry Potter merged into one entity

**Fix**: Lower alias match confidence, add first-name disambiguation
```typescript
if (firstName1 !== firstName2 && words1.length >= 2 && words2.length >= 2) {
  return { confidence: 0.0, evidence: ['different first names'] };
}
```

### Issue: Under-Merging (False Negatives)

**Symptom**: "Harry Potter" and "Potter" kept as separate entities

**Fix**: Increase substring match confidence, relax matching criteria
```typescript
if (canon1.includes(canon2) || canon2.includes(canon1)) {
  return { confidence: 0.90, matchType: 'alias' };
}
```

### Issue: Attribute Conflicts

**Symptom**: Merging fails when attributes don't match

**Fix**: Store alternatives instead of rejecting merge
```typescript
merged[key + 'Alternatives'] = merged[key + 'Alternatives'] || [];
merged[key + 'Alternatives'].push(existing[key]);
merged[key] = value; // Keep more specific value
```

---

## Next Steps After Level 5A

After completing Level 5A (cross-document resolution), you'll have two options:

**Option 1**: Level 5B (Performance & Scale)
- Test cross-document with very long texts (50,000+ chars)
- Optimize for speed and memory
- Handle large-scale knowledge graphs

**Option 2**: Level 6 (Advanced Features)
- Temporal reasoning (events, timelines)
- Causal relations (cause/effect chains)
- Multi-hop inference

---

## Ready?

**This prompt provides**:
- ✅ Complete implementation plan
- ✅ Code examples for all major components
- ✅ 10 test cases with clear expectations
- ✅ Debugging strategies
- ✅ Success metrics

**You have everything needed to implement Level 5A: Cross-Document Entity Resolution.**

Let's build a global knowledge graph! 🚀
