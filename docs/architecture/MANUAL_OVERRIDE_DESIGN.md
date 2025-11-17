# Manual Override System - Architecture & Design Specification

**Document Type:** Technical Architecture Specification
**Last Updated:** 2025-11-13
**Status:** DRAFT v1.0 - Awaiting architectural review
**Implementation Priority:** CRITICAL (Week 1-3 of 4-week sprint)

---

## Overview

The Manual Override System is the **core differentiating feature** of ARES. It enables authors to correct extraction errors, teach the system about their domain, and maintain authority over their knowledge graph.

This document specifies the architecture, data models, API contracts, user workflows, and learning algorithms needed to implement the complete manual override system.

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [System Architecture](#system-architecture)
3. [Data Models](#data-models)
4. [API Specification](#api-specification)
5. [User Workflows](#user-workflows)
6. [Learning Algorithm](#learning-algorithm)
7. [Reactive Updates](#reactive-updates)
8. [Version Control & Rollback](#version-control--rollback)
9. [Implementation Phases](#implementation-phases)
10. [Testing Strategy](#testing-strategy)

---

## Design Principles

### 1. Author Authority is Absolute

When an author makes a correction, the system accepts it without question. No "are you sure?" dialogs. No algorithmic confidence overrides. **The author is always right about their own story.**

**Implication:** Corrections must be:
- Immediately persisted (no delays)
- Irreversible by algorithm (only author can undo)
- Propagated everywhere (all affected data updates)

### 2. Evidence-Based Learning

Every correction includes context that enables learning:
- What text triggered the extraction?
- What did the algorithm extract?
- What is the correct extraction?
- Why was the algorithm wrong?

**Implication:** Correction records must capture:
- Before state (what algorithm said)
- After state (what author said)
- Context (source text, extraction method, confidence)
- Metadata (timestamp, author notes, correction type)

### 3. Fail Gracefully with Validation

While accepting author authority, prevent impossible corrections:
- Type safety (can't make entity type "banana")
- Relationship constraints (can't be parent and child of same person)
- Temporal consistency (birth before death)

**Implication:** Validation layer that:
- Warns about suspicious corrections (soft warnings)
- Blocks physically impossible corrections (hard errors)
- Allows override of warnings (author knows best)

### 4. Optimize for Common Cases

80% of corrections fall into these categories:
1. Entity type fix (PLACE → KINGDOM)
2. Entity merge (combine duplicates)
3. Entity split (separate incorrectly merged entities)
4. Relationship edit (add/modify/delete relations)
5. Alias addition (link name variations)

**Implication:** UI must make these operations:
- <3 clicks to complete
- Visually clear (before/after comparison)
- Batch-capable (fix multiple at once)
- Undo-able (always reversible)

### 5. Learn Patterns, Not Instances

Don't just remember "Gandalf is PERSON." Learn the generalizable pattern:
- "X the Y" → character title pattern
- "Kingdom of Z" → political entity pattern
- "Jon" / "Jonathan" → name variation pattern

**Implication:** Learning algorithm must:
- Extract patterns from corrections
- Apply patterns to future extractions
- Measure pattern effectiveness
- Prune ineffective patterns

---

## System Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                            │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Manual Override UI Components                                │  │
│  │  • EntityEditor.tsx                                           │  │
│  │  • RelationshipEditor.tsx                                     │  │
│  │  • MergeDialog.tsx                                            │  │
│  │  • SplitDialog.tsx                                            │  │
│  │  • VersionHistory.tsx                                         │  │
│  │  • DiffViewer.tsx                                             │  │
│  └───────────────────────┬───────────────────────────────────────┘  │
│                          │ GraphQL Mutations                        │
└──────────────────────────┼──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     API LAYER (GraphQL)                             │
│  Mutations:                                                         │
│  • correctEntityType(id, newType) → Entity                         │
│  • mergeEntities(ids[]) → Entity                                   │
│  • splitEntity(id, mentions[]) → Entity[]                          │
│  • updateRelation(id, changes) → Relation                          │
│  • rollbackCorrection(correctionId) → Entity                       │
│                                                                     │
│  Resolvers validate, apply correction, emit events                 │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   CORRECTION SERVICE                                │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  CorrectionManager                                            │  │
│  │  • validate(correction) → ValidationResult                    │  │
│  │  • apply(correction) → CorrectionResult                       │  │
│  │  • recordHistory(correction) → VersionSnapshot                │  │
│  │  • emitEvent(correction) → void                               │  │
│  └───────────────────────┬───────────────────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌────────────────┐  ┌──────────────┐  ┌──────────────────┐
│   DATABASE     │  │   LEARNING   │  │  EVENT SYSTEM    │
│   (SQLite)     │  │   ENGINE     │  │  (EventEmitter)  │
│                │  │              │  │                  │
│ • entities     │  │ • Analyze    │  │ • Notify wiki    │
│ • relations    │  │   patterns   │  │   regenerator    │
│ • corrections  │  │ • Extract    │  │ • Notify UI      │
│ • versions     │  │   rules      │  │ • Notify logger  │
│                │  │ • Update     │  │                  │
│                │  │   confidence │  │                  │
└────────────────┘  └──────────────┘  └──────────────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   WIKI REGENERATOR                                  │
│  • Listen for correction events                                    │
│  • Identify affected pages (entity, relations, timelines)          │
│  • Regenerate pages (GraphQL queries, template rendering)          │
│  • Emit update events (notify frontend)                            │
│  • Store new version (snapshot for history)                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Typical Correction

```
1. Author clicks "Edit" on entity in wiki
   │
   ▼
2. Frontend fetches entity details (GraphQL query)
   │
   ▼
3. Author changes type: PLACE → KINGDOM
   │
   ▼
4. Frontend sends mutation: correctEntityType(id: "E123", newType: KINGDOM)
   │
   ▼
5. API resolver calls CorrectionManager.apply()
   │
   ▼
6. CorrectionManager validates (is KINGDOM a valid type? yes)
   │
   ▼
7. CorrectionManager records version snapshot (before state)
   │
   ▼
8. CorrectionManager updates database (entity type = KINGDOM)
   │
   ▼
9. CorrectionManager logs correction (what changed, when, why)
   │
   ▼
10. CorrectionManager emits event: EntityTypeChanged(E123, PLACE → KINGDOM)
    │
    ├─────────────────┬────────────────┐
    │                 │                │
    ▼                 ▼                ▼
11a. Learning     11b. Wiki        11c. Frontend
     Engine           Regenerator       Listener
    │                 │                │
    ▼                 ▼                ▼
12a. Extract      12b. Find         12c. Update UI
     pattern          affected          (show new type)
     (Political       pages (Gondor
     entity →         page, relations)
     KINGDOM)         │
    │                 ▼
    ▼              12c. Regenerate
12b. Update          pages (query
     confidence      DB, render)
     (boost)         │
                     ▼
                  12d. Emit update
                       event
                     │
                     ▼
                  12e. Frontend
                       auto-refreshes
```

---

## Data Models

### Correction Record

**Table:** `corrections`

```typescript
interface Correction {
  id: string;                    // UUID
  type: CorrectionType;          // 'entity_type' | 'entity_merge' | 'entity_split' | 'relation_edit' | 'alias_add'
  timestamp: Date;               // When correction was made
  author: string;                // User ID (for multi-user future)

  // Before state
  before: {
    entityId?: string;           // For entity corrections
    relationId?: string;         // For relation corrections
    snapshot: any;               // Full state before change (JSON)
  };

  // After state
  after: {
    entityId?: string;           // New/modified entity
    relationId?: string;         // New/modified relation
    snapshot: any;               // Full state after change (JSON)
  };

  // Context for learning
  context: {
    sourceText: string;          // Text that triggered extraction
    extractionMethod: string;    // How it was extracted (pattern name, NER)
    originalConfidence: number;  // Algorithm's confidence before correction
    correction reason?: string;   // Optional author note ("This is a kingdom, not a place")
  };

  // Learning metadata
  learned: {
    patternExtracted: string[];  // Patterns learned from this correction
    confidenceBoost: number;     // How much to boost similar extractions
    appliedToCount: number;      // How many future extractions used this pattern
  };

  // Rollback capability
  rolledBack: boolean;           // Has this correction been undone?
  rollbackReason?: string;       // Why was it undone?
  rollbackTimestamp?: Date;
}

enum CorrectionType {
  ENTITY_TYPE = 'entity_type',
  ENTITY_MERGE = 'entity_merge',
  ENTITY_SPLIT = 'entity_split',
  RELATION_EDIT = 'relation_edit',
  ALIAS_ADD = 'alias_add',
  CONFIDENCE_OVERRIDE = 'confidence_override'
}
```

### Version Snapshot

**Table:** `versions`

```typescript
interface VersionSnapshot {
  id: string;                    // UUID
  timestamp: Date;
  correctionId: string;          // Reference to correction that created this version

  // What changed
  changedEntities: string[];     // Entity IDs that changed
  changedRelations: string[];    // Relation IDs that changed

  // Full snapshot (for rollback)
  snapshot: {
    entities: Record<string, Entity>;
    relations: Record<string, Relation>;
  };

  // Diff summary (for display)
  diff: {
    entitiesAdded: number;
    entitiesRemoved: number;
    entitiesModified: number;
    relationsAdded: number;
    relationsRemoved: number;
    relationsModified: number;
  };

  // Metadata
  message?: string;              // Optional author comment
  tags?: string[];               // For categorizing versions
}
```

### Learned Pattern

**Table:** `learned_patterns`

```typescript
interface LearnedPattern {
  id: string;                    // UUID
  type: PatternType;             // 'entity_type' | 'entity_name' | 'relation'
  pattern: string;               // Regular expression or rule description

  // Pattern details
  condition: {
    textPattern?: string;        // Regex or string to match
    contextPattern?: string;     // Surrounding text pattern
    entityType?: string;         // When to apply (if type-specific)
  };

  // Action to take
  action: {
    setType?: string;            // Change entity type to this
    setConfidence?: number;      // Override confidence
    merge?: boolean;             // Merge with another entity
    extractRelation?: string;    // Extract this relation type
  };

  // Learning metadata
  learnedFrom: string[];         // Correction IDs that taught this pattern
  firstSeen: Date;               // When pattern was learned
  lastApplied: Date;             // Most recent application

  // Effectiveness tracking
  stats: {
    timesApplied: number;        // How many times pattern matched
    timesValidated: number;      // How many times author confirmed it was correct
    timesRejected: number;       // How many times author corrected it again
    confidence: number;          // Pattern effectiveness score (0-1)
  };

  // Pattern lifecycle
  active: boolean;               // Is pattern currently used?
  disabled reason?: string;       // Why was it disabled? (if inactive)
}

enum PatternType {
  ENTITY_TYPE = 'entity_type',         // "X the Y" → TITLE
  ENTITY_NAME = 'entity_name',         // "Jon" / "Jonathan" → same entity
  RELATION = 'relation',               // "X married Y" → married_to(X, Y)
  CONFIDENCE = 'confidence'            // Boost/reduce confidence for pattern
}
```

### Entity (Modified)

Add fields to existing Entity model:

```typescript
interface Entity {
  // ... existing fields ...

  // Correction tracking
  manualOverrides: {
    typeOverride?: string;       // Manual type correction
    confidenceOverride?: number; // Manual confidence score
    aliasOverrides?: string[];   // Manually added aliases
    lastModified?: Date;
    modifiedBy?: string;
  };

  // Learning metadata
  learnedFrom?: {
    patternIds: string[];        // Patterns that contributed to this entity
    correctionIds: string[];     // Corrections that affected this entity
  };
}
```

### Relation (Modified)

Add fields to existing Relation model:

```typescript
interface Relation {
  // ... existing fields ...

  // Correction tracking
  manualOverride: boolean;       // Was this manually added/edited?
  manualConfidence?: number;     // Manual confidence override
  lastModified?: Date;
  modifiedBy?: string;

  // Learning metadata
  learnedFrom?: {
    patternId?: string;          // Pattern that extracted this
    correctionId?: string;       // Correction that added this
  };
}
```

---

## API Specification

### GraphQL Mutations

#### 1. Correct Entity Type

```graphql
mutation CorrectEntityType($input: CorrectEntityTypeInput!) {
  correctEntityType(input: $input) {
    success: Boolean!
    entity: Entity
    correction: Correction
    affectedPages: [String]      # Wiki pages that need regeneration
    errors: [ValidationError]
  }
}

input CorrectEntityTypeInput {
  entityId: ID!
  newType: String!               # PERSON, PLACE, ORG, KINGDOM, etc.
  reason: String                 # Optional author note
  confidenceOverride: Float      # Optional confidence (0-1)
}
```

**Validation:**
- `newType` must be in allowed entity types list
- `entityId` must exist
- `confidenceOverride` must be 0-1 (if provided)

**Side Effects:**
- Update entity type in database
- Record correction in `corrections` table
- Create version snapshot
- Emit `EntityTypeChanged` event
- Trigger learning analysis
- Regenerate affected wiki pages

#### 2. Merge Entities

```graphql
mutation MergeEntities($input: MergeEntitiesInput!) {
  mergeEntities(input: $input) {
    success: Boolean!
    mergedEntity: Entity          # The result of the merge
    removedEntities: [Entity]     # Entities that were merged into result
    correction: Correction
    affectedPages: [String]
    errors: [ValidationError]
  }
}

input MergeEntitiesInput {
  entityIds: [ID!]!               # List of entities to merge (2+)
  canonicalName: String           # Which name to keep (or specify new one)
  canonicalType: String           # Which type to keep (if they differ)
  reason: String                  # Why these are the same entity
}
```

**Validation:**
- At least 2 entities to merge
- All `entityIds` must exist
- If types differ, `canonicalType` must be specified
- Can't merge entities with conflicting facts (warn, don't block)

**Side Effects:**
- Create new merged entity (or keep one as primary)
- Transfer all mentions from removed entities to merged entity
- Transfer all relations (update subject/object IDs)
- Transfer all aliases
- Mark removed entities as `merged_into: <canonical_id>`
- Record correction
- Create version snapshot
- Emit `EntitiesMerged` event
- Trigger learning (name variation patterns)
- Regenerate affected pages (all entity pages involved)

#### 3. Split Entity

```graphql
mutation SplitEntity($input: SplitEntityInput!) {
  splitEntity(input: $input) {
    success: Boolean!
    newEntities: [Entity]         # Resulting entities after split
    originalEntity: Entity        # Original (may be deleted or modified)
    correction: Correction
    affectedPages: [String]
    errors: [ValidationError]
  }
}

input SplitEntityInput {
  entityId: ID!
  splits: [EntitySplitSpec!]!    # How to divide the entity
  reason: String
}

input EntitySplitSpec {
  name: String!                   # Name for this new entity
  type: String!                   # Type for this new entity
  mentionIds: [ID!]!              # Which mentions belong to this entity
  relationIds: [ID!]!             # Which relations belong to this entity
}
```

**Validation:**
- All `mentionIds` must belong to original entity
- All `relationIds` must involve original entity
- Every mention must be assigned to exactly one split
- At least 1 mention per split
- Can't create split with zero relations (warn, don't block)

**Side Effects:**
- Create new entities from splits
- Reassign mentions to appropriate entities
- Update relations (change subject/object to correct entity)
- Mark original entity as `split_into: [id1, id2, ...]`
- Record correction
- Create version snapshot
- Emit `EntitySplit` event
- Trigger learning (disambiguation patterns)
- Regenerate affected pages

#### 4. Update Relation

```graphql
mutation UpdateRelation($input: UpdateRelationInput!) {
  updateRelation(input: $input) {
    success: Boolean!
    relation: Relation
    correction: Correction
    affectedPages: [String]
    errors: [ValidationError]
  }
}

input UpdateRelationInput {
  relationId: ID                 # If editing existing relation
  create: Boolean                # If creating new relation

  # Relation fields
  subjectId: ID!
  predicate: String!             # parent_of, married_to, etc.
  objectId: ID!

  # Override fields
  confidenceOverride: Float
  evidenceText: String           # Manual evidence (if not extracted)
  reason: String
}
```

**Validation:**
- `subjectId` and `objectId` must exist
- `predicate` must be in allowed relation types
- Can't create duplicate relation (warn, allow merge)
- Can't create impossible relation (parent_of self, etc.)
- Temporal validation (if dates available)

**Side Effects:**
- Create or update relation in database
- Record correction
- Create version snapshot
- Emit `RelationUpdated` event
- Trigger learning (relation patterns)
- Regenerate affected pages (subject and object entity pages)

#### 5. Rollback Correction

```graphql
mutation RollbackCorrection($input: RollbackCorrectionInput!) {
  rollbackCorrection(input: $input) {
    success: Boolean!
    restoredState: VersionSnapshot
    correction: Correction        # Original correction being rolled back
    errors: [ValidationError]
  }
}

input RollbackCorrectionInput {
  correctionId: ID!               # Which correction to undo
  reason: String                  # Why rolling back
}
```

**Validation:**
- `correctionId` must exist
- Correction must not already be rolled back
- Can't rollback if dependent corrections exist (warn)

**Side Effects:**
- Restore database state from version snapshot
- Mark correction as `rolledBack: true`
- Record rollback as new correction
- Create version snapshot (rollback is versioned too)
- Emit `CorrectionRolledBack` event
- Remove learned patterns from this correction
- Regenerate affected pages

---

## User Workflows

### Workflow 1: Correct Entity Type

**Scenario:** Algorithm extracted "Gondor" as PLACE, but it's a KINGDOM.

**Steps:**
1. Author navigates to Gondor entity page in wiki
2. Sees incorrect type badge: "PLACE"
3. Clicks "Edit Entity" button
4. Modal opens showing current entity data
5. Author changes type from PLACE to KINGDOM in dropdown
6. Author (optionally) adds reason: "Gondor is a kingdom, not a place"
7. Author clicks "Save Correction"
8. UI shows loading spinner (backend processing)
9. Backend validates, applies, emits events
10. UI shows success toast: "Entity type updated to KINGDOM"
11. Entity page auto-refreshes (shows KINGDOM badge)
12. Related pages update (e.g., "Kingdoms of Middle-earth" now includes Gondor)

**UI Mockup:**

```
┌─────────────────────────────────────────────────────────────┐
│ Edit Entity: Gondor                                    [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Canonical Name:  [Gondor                          ]        │
│                                                             │
│ Entity Type:     [KINGDOM        ▼]   ← Changed from PLACE│
│                                                             │
│ Confidence:      [0.92          ] (Auto) [Override?]       │
│                                                             │
│ Reason:          [Gondor is a kingdom, not a place]        │
│                  (Optional note for learning)               │
│                                                             │
│                  [ Cancel ]  [ Save Correction ]           │
└─────────────────────────────────────────────────────────────┘
```

### Workflow 2: Merge Duplicate Entities

**Scenario:** Algorithm created separate entities for "Gandalf" and "Mithrandir" (same character).

**Steps:**
1. Author notices two entity pages for same character
2. Opens "Gandalf" entity page
3. Clicks "Merge with another entity" button
4. Search dialog opens: "Find entity to merge with"
5. Author types "Mithrandir" → entity appears in results
6. Author selects "Mithrandir" from results
7. Merge preview shows:
   - Combined mentions (10 from Gandalf + 5 from Mithrandir)
   - Combined relations (Gandalf's + Mithrandir's)
   - Name conflict: which to keep as canonical?
8. Author selects "Gandalf" as canonical name
9. Author confirms merge
10. Backend processes merge
11. UI redirects to merged entity page
12. Old "Mithrandir" page now redirects to "Gandalf"
13. All wiki links updated to point to "Gandalf"

**UI Mockup:**

```
┌─────────────────────────────────────────────────────────────┐
│ Merge Entities: Gandalf + Mithrandir                   [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ You are merging:                                            │
│ • Gandalf (PERSON) - 10 mentions, 8 relations              │
│ • Mithrandir (PERSON) - 5 mentions, 3 relations            │
│                                                             │
│ Canonical Name:  ( ) Gandalf  (•) Mithrandir  ( ) Other   │
│                  If other: [                   ]            │
│                                                             │
│ Entity Type:     Both are PERSON ✓                         │
│                                                             │
│ Aliases:         Combined: Gandalf, Mithrandir,            │
│                  Gandalf the Grey, Gandalf the White       │
│                                                             │
│ Relations:       11 total (8 from Gandalf, 3 from          │
│                  Mithrandir, no conflicts)                  │
│                                                             │
│ Reason:          [Same character, different names]          │
│                                                             │
│                  [ Cancel ]  [ Merge Entities ]            │
└─────────────────────────────────────────────────────────────┘
```

### Workflow 3: Add Missing Relation

**Scenario:** Algorithm didn't detect that "Aragorn married Arwen."

**Steps:**
1. Author viewing Aragorn entity page
2. Sees relations section, notices marriage missing
3. Clicks "Add Relation" button
4. Relation editor opens
5. Author fills in:
   - Subject: Aragorn (pre-filled)
   - Predicate: married_to (from dropdown)
   - Object: Arwen (search entity)
6. Author (optionally) adds evidence text: "Aragorn wed Arwen in 3019"
7. Author clicks "Save Relation"
8. Backend creates relation + inverse (Arwen married_to Aragorn)
9. UI shows success toast
10. Relations section refreshes, shows new relation
11. Arwen's page auto-updates (now shows marriage to Aragorn)

**UI Mockup:**

```
┌─────────────────────────────────────────────────────────────┐
│ Add Relation                                           [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Subject:         [Aragorn              ] (This entity)     │
│                                                             │
│ Predicate:       [married_to           ▼]                  │
│                  Common: parent_of, child_of, married_to,  │
│                          lives_in, works_at, ...           │
│                                                             │
│ Object:          [Arwen                ▼]                  │
│                  (Search entities)                          │
│                                                             │
│ Evidence:        [Aragorn wed Arwen in 3019]               │
│                  (Optional supporting text)                 │
│                                                             │
│ Confidence:      [0.95            ] (Manual)               │
│                                                             │
│ ✓ Also create inverse: Arwen married_to Aragorn           │
│                                                             │
│                  [ Cancel ]  [ Save Relation ]             │
└─────────────────────────────────────────────────────────────┘
```

### Workflow 4: View & Rollback Version History

**Scenario:** Author made a bad merge and wants to undo it.

**Steps:**
1. Author realizes mistake (merged wrong entities)
2. Navigates to entity page
3. Clicks "Version History" button
4. Timeline view shows all corrections for this entity:
   - 2 hours ago: Merged with "Strider" (current)
   - 1 day ago: Changed type to PERSON
   - 3 days ago: Entity created by extraction
5. Author clicks on "Merged with Strider" correction
6. Diff view shows:
   - Before: 2 separate entities
   - After: 1 merged entity
7. Author clicks "Rollback this correction"
8. Confirmation dialog: "This will undo the merge. Continue?"
9. Author confirms
10. Backend restores previous state (splits entities again)
11. UI redirects to Aragorn page (now separate from Strider again)
12. Success message: "Correction rolled back. Entities are now separate."

**UI Mockup:**

```
┌─────────────────────────────────────────────────────────────┐
│ Version History: Aragorn                               [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Timeline:                                                   │
│                                                             │
│ ○ 2 hours ago - Merged entities                            │
│   │ Merged "Aragorn" + "Strider" → "Aragorn"               │
│   │ By: Author | [View Diff] [Rollback]                    │
│   │                                                         │
│ ○ 1 day ago - Changed entity type                          │
│   │ PLACE → PERSON                                          │
│   │ By: Author | [View Diff]                               │
│   │                                                         │
│ ○ 3 days ago - Entity created                              │
│   │ Extracted from text                                    │
│   │ Confidence: 0.89 | [View Details]                      │
│   │                                                         │
│                                                             │
│                  [ Close ]                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Learning Algorithm

### Pattern Extraction Strategy

The learning system analyzes corrections to extract generalizable patterns.

#### Phase 1: Identify Correction Types

When a correction is made, classify it:

1. **Entity Type Fix:** Changed from type A to type B
2. **Entity Merge:** Combined N entities into 1
3. **Entity Split:** Divided 1 entity into N
4. **Relation Add:** Created new relation not detected
5. **Relation Delete:** Removed incorrect relation
6. **Confidence Override:** Changed confidence score

#### Phase 2: Extract Context Patterns

For each correction type, analyze context:

**For Entity Type Fixes:**
- Text pattern around entity ("Kingdom of X" → KINGDOM)
- Surrounding words (political terms → ORG)
- Syntactic role (subject of "ruled" → RULER entity)

**For Entity Merges:**
- Name variations ("Jon" / "Jonathan" → same entity)
- Title patterns ("Dr. Smith" / "Smith" → same entity)
- Coreference patterns ("he" refers to previous mention)

**For Relation Edits:**
- Dependency patterns ("X married Y" → married_to)
- Lexical patterns ("X's husband Y" → married_to)
- Implicit relations ("King of X" → rules(person, X))

#### Phase 3: Generalize Patterns

Convert specific corrections into reusable rules:

**Example 1: Kingdom Type Pattern**

```
Correction:
  Before: "Gondor" type=PLACE
  After: "Gondor" type=KINGDOM
  Context: "Kingdom of Gondor"

Learned Pattern:
  IF text matches "Kingdom of X" OR "X Kingdom"
  THEN entity X type = KINGDOM (confidence +0.2)
```

**Example 2: Name Variation Pattern**

```
Correction:
  Merged: "Jon Snow" + "Jon" → "Jon Snow"
  Context: "Jon" appeared 5 paragraphs after "Jon Snow"

Learned Pattern:
  IF short_name in long_name (fuzzy match)
  AND short_name appears within 10 paragraphs of long_name
  AND no other entities match short_name
  THEN merge short_name into long_name (confidence +0.3)
```

**Example 3: Relation Pattern**

```
Correction:
  Added: married_to(Aragorn, Arwen)
  Evidence: "Aragorn wed Arwen"

Learned Pattern:
  IF text matches "X wed Y"
  THEN relation married_to(X, Y) (confidence +0.25)
  AND create inverse married_to(Y, X)
```

#### Phase 4: Validate Patterns

Before applying learned patterns, test them:

1. **Precision Test:** Apply pattern to known-good data. Does it make mistakes?
2. **Recall Test:** Does pattern catch similar cases in test set?
3. **Conflict Test:** Does pattern conflict with other patterns?

**Pattern Confidence Score:**
```
pattern_confidence = (validated_applications / total_applications)

Where:
- validated_applications = times author confirmed pattern was correct
- total_applications = times pattern was applied
```

**Deactivation Rule:**
If `pattern_confidence < 0.5` after 10 applications, disable pattern.

#### Phase 5: Apply Patterns to Future Extractions

When extraction engine runs:

1. Extract entities/relations using baseline methods
2. For each extraction, check if learned patterns apply
3. If pattern matches:
   - Boost confidence by pattern's boost value
   - Add pattern ID to extraction metadata
4. If multiple patterns conflict:
   - Choose pattern with highest confidence
   - Flag extraction for review (uncertain)

### Learning Metrics Dashboard

Track learning effectiveness:

**Metrics to Display:**
- Total corrections made
- Patterns learned (active / disabled)
- Pattern effectiveness (avg confidence)
- Error reduction rate (% decrease over time)
- Most common correction types
- Entities with most corrections (candidates for review)

**Example Display:**

```
Learning Dashboard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Corrections Made: 127
Patterns Learned: 23 (19 active, 4 disabled)
Average Pattern Confidence: 0.78

Error Reduction:
• After 10 corrections:  -18% error rate
• After 50 corrections:  -42% error rate
• After 100 corrections: -61% error rate

Top Correction Types:
1. Entity Type Fix (45%)
2. Entity Merge (28%)
3. Relation Add (18%)
4. Confidence Override (9%)

Most Effective Patterns:
1. "Kingdom of X" → KINGDOM (conf: 0.94, applied: 12 times)
2. "X wed Y" → married_to (conf: 0.89, applied: 8 times)
3. Name variations (conf: 0.82, applied: 15 times)
```

---

## Reactive Updates

### Event System Architecture

**Event Types:**
```typescript
enum CorrectionEvent {
  ENTITY_TYPE_CHANGED = 'entity_type_changed',
  ENTITIES_MERGED = 'entities_merged',
  ENTITY_SPLIT = 'entity_split',
  RELATION_UPDATED = 'relation_updated',
  CORRECTION_ROLLED_BACK = 'correction_rolled_back'
}

interface CorrectionEventPayload {
  event: CorrectionEvent;
  correctionId: string;
  timestamp: Date;

  // Affected data
  affectedEntities: string[];
  affectedRelations: string[];
  affectedPages: string[];

  // Before/after for diff
  before: any;
  after: any;
}
```

### Wiki Regeneration Pipeline

**Step 1: Event Listener**
```typescript
eventEmitter.on(CorrectionEvent.ENTITY_TYPE_CHANGED, async (payload) => {
  // Step 2: Identify affected pages
  const pages = await identifyAffectedPages(payload.affectedEntities);

  // Step 3: Regenerate pages
  for (const page of pages) {
    await regeneratePage(page);
  }

  // Step 4: Emit update notification
  emitPageUpdated(pages);
});
```

**Step 2: Identify Affected Pages**
```typescript
async function identifyAffectedPages(entityIds: string[]): Promise<Page[]> {
  const pages: Page[] = [];

  for (const entityId of entityIds) {
    // Entity detail page
    pages.push({ type: 'entity', id: entityId });

    // Relationship pages (who is related to this entity)
    const relations = await getRelations(entityId);
    for (const rel of relations) {
      pages.push({ type: 'entity', id: rel.otherId });
    }

    // Timeline pages (if entity has temporal data)
    const hasDate = await entityHasDate(entityId);
    if (hasDate) {
      pages.push({ type: 'timeline', id: 'global' });
    }

    // Category pages (e.g., "All PERSONs", "All KINGDOMs")
    const entityType = await getEntityType(entityId);
    pages.push({ type: 'category', id: entityType });
  }

  return pages;
}
```

**Step 3: Regenerate Page**
```typescript
async function regeneratePage(page: Page): Promise<void> {
  // Query fresh data from database
  const data = await fetchPageData(page);

  // Render template with new data
  const html = renderTemplate(page.type, data);

  // Save to page store
  await savePage(page.id, html);

  // Create version snapshot
  await snapshotPage(page.id, html);
}
```

**Step 4: Notify Frontend**
```typescript
function emitPageUpdated(pages: Page[]): void {
  // WebSocket or Server-Sent Events
  websocket.broadcast({
    type: 'pages_updated',
    pages: pages.map(p => ({ type: p.type, id: p.id })),
    timestamp: new Date()
  });
}
```

### Frontend Real-Time Updates

**Listen for Updates:**
```typescript
// In React component
useEffect(() => {
  const socket = new WebSocket(WS_URL);

  socket.on('pages_updated', (event) => {
    // Check if current page is affected
    if (event.pages.some(p => p.id === currentPageId)) {
      // Refetch data for this page
      refetchPageData();
    }
  });

  return () => socket.close();
}, [currentPageId]);
```

**Optimistic Updates:**
```typescript
// When user makes correction, update UI immediately
async function correctEntityType(entityId, newType) {
  // 1. Update UI optimistically (instant feedback)
  updateLocalState({ entityId, type: newType });

  try {
    // 2. Send mutation to backend
    const result = await mutate({
      mutation: CORRECT_ENTITY_TYPE,
      variables: { entityId, newType }
    });

    // 3. Confirm UI matches backend result
    if (result.success) {
      showToast('Entity type updated successfully');
    }
  } catch (error) {
    // 4. Revert optimistic update if backend failed
    revertLocalState({ entityId });
    showToast('Failed to update entity type', 'error');
  }
}
```

---

## Version Control & Rollback

### Snapshot Strategy

**When to Snapshot:**
- Before every correction (full state snapshot)
- After wiki regeneration (page content snapshot)
- On demand (user-initiated checkpoint)

**Snapshot Granularity:**
- **Full Snapshots:** Complete database state (heavy, used sparingly)
- **Incremental Snapshots:** Only changed entities/relations (efficient)
- **Page Snapshots:** Rendered HTML for rollback display

**Storage Optimization:**
```typescript
interface Snapshot {
  id: string;
  timestamp: Date;
  type: 'full' | 'incremental' | 'page';

  // Incremental snapshot (lightweight)
  changes?: {
    entities: {
      added: Entity[];
      modified: Array<{ id: string; before: Entity; after: Entity }>;
      removed: string[];
    };
    relations: {
      added: Relation[];
      modified: Array<{ id: string; before: Relation; after: Relation }>;
      removed: string[];
    };
  };

  // Full snapshot (heavyweight, stored periodically)
  full?: {
    entities: Record<string, Entity>;
    relations: Record<string, Relation>;
  };
}
```

### Rollback Implementation

**Single Correction Rollback:**
```typescript
async function rollbackCorrection(correctionId: string): Promise<void> {
  // 1. Fetch correction record
  const correction = await getCorrection(correctionId);

  // 2. Fetch version snapshot BEFORE this correction
  const beforeSnapshot = await getSnapshotBeforeCorrection(correctionId);

  // 3. Restore database state from snapshot
  await restoreSnapshot(beforeSnapshot);

  // 4. Mark correction as rolled back
  await markCorrectionRolledBack(correctionId);

  // 5. Create new version snapshot (rollback is versioned too)
  await createSnapshot({
    type: 'incremental',
    reason: `Rollback of correction ${correctionId}`
  });

  // 6. Emit rollback event
  emitEvent({
    type: CorrectionEvent.CORRECTION_ROLLED_BACK,
    correctionId,
    affectedEntities: correction.affectedEntities,
    affectedRelations: correction.affectedRelations
  });
}
```

**Time-Travel Rollback:**
```typescript
async function rollbackToTimestamp(timestamp: Date): Promise<void> {
  // Find snapshot closest to timestamp
  const snapshot = await findSnapshotNear(timestamp);

  // Restore full state from that snapshot
  await restoreFullSnapshot(snapshot);

  // Mark all corrections after timestamp as rolled back
  await markCorrectionsRolledBack({ after: timestamp });

  // Emit rollback event
  emitEvent({
    type: CorrectionEvent.CORRECTION_ROLLED_BACK,
    timestamp,
    affectedEntities: 'all',  // Full rollback
    affectedRelations: 'all'
  });
}
```

### Conflict Resolution

**When Rollback Conflicts with Later Corrections:**

Example:
- Correction A: Merged "Gandalf" + "Mithrandir"
- Correction B: Added relation "Gandalf teaches Frodo"
- User wants to rollback A (unmerge entities)
- But correction B references merged entity!

**Resolution Strategy:**
1. **Detect Dependency:**
   - Before rollback, check if later corrections depend on this one
   - Dependency = correction references entities/relations created/modified by target

2. **Warn User:**
   - "Rolling back this correction will affect 3 later corrections:"
   - List affected corrections
   - Options: "Rollback all" | "Cancel"

3. **Cascade Rollback:**
   - If user chooses "Rollback all", undo dependent corrections too
   - Rollback in reverse chronological order (newest first)
   - Create version snapshot at each step

4. **Orphan Cleanup:**
   - If rollback leaves orphaned relations (references deleted entity), remove them
   - Log orphaned data for review

---

## Implementation Phases

### Phase 1: Manual Override UI (Week 1)

**Scope:**
- React components for correction interfaces
- GraphQL mutations for corrections
- Database schema updates (corrections table)
- Basic validation logic
- Version snapshot creation

**Deliverables:**
1. EntityEditor component (change type, confidence)
2. MergeDialog component (merge entities)
3. SplitDialog component (split entity)
4. RelationEditor component (add/edit/delete relations)
5. Validation service (prevent invalid corrections)
6. API endpoints (5 GraphQL mutations)
7. Database migrations (corrections, versions tables)

**Testing:**
- Unit tests for validation logic
- Integration tests for mutations
- E2E tests for UI workflows (Cypress)

### Phase 2: Learning System (Week 2)

**Scope:**
- Correction tracking and logging
- Pattern extraction algorithms
- Confidence boosting mechanism
- Learning metrics dashboard

**Deliverables:**
1. CorrectionLogger service
2. PatternExtractor service (analyze corrections)
3. ConfidenceBooster service (update scores)
4. LearnedPattern storage schema
5. Learning dashboard UI
6. Pattern effectiveness metrics

**Testing:**
- Test pattern extraction on synthetic corrections
- Measure error reduction on test suite
- Validate pattern confidence calculations

### Phase 3: Reactive Updates (Week 3)

**Scope:**
- Event system for change notifications
- Wiki regeneration pipeline
- Version history UI
- Rollback functionality

**Deliverables:**
1. EventEmitter service
2. WikiRegenerator service
3. VersionHistory UI component
4. DiffViewer UI component
5. Rollback mutation and logic
6. WebSocket for real-time updates

**Testing:**
- Test event propagation (correction → wiki update)
- Measure regeneration speed (<1s target)
- Test rollback correctness (restore exact state)
- Test conflict detection (dependent corrections)

### Phase 4: Polish & Documentation (Week 4)

**Scope:**
- UI/UX refinement
- User documentation
- Beta testing
- Bug fixes

**Deliverables:**
1. Polished UI (visual design, error states, loading)
2. User guide (how to correct entities/relations)
3. Tutorial video (screen recording)
4. Beta tester feedback report
5. Bug fixes (critical and high priority)

**Testing:**
- User acceptance testing (UAT) with beta testers
- Performance testing (response times, memory)
- Security testing (input validation, SQL injection)
- Accessibility testing (keyboard nav, screen readers)

---

## Testing Strategy

### Unit Tests

**Coverage Targets:**
- Validation logic: 100%
- Pattern extraction: 90%
- Confidence calculations: 95%
- Version control: 90%

**Example Unit Test:**
```typescript
describe('CorrectionValidator', () => {
  it('should reject invalid entity type', () => {
    const result = validator.validateEntityType('E123', 'BANANA');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid entity type');
  });

  it('should accept valid entity type', () => {
    const result = validator.validateEntityType('E123', 'KINGDOM');
    expect(result.valid).toBe(true);
  });

  it('should detect self-referential relation', () => {
    const result = validator.validateRelation({
      subjectId: 'E1',
      predicate: 'parent_of',
      objectId: 'E1'  // Same entity!
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cannot be parent of itself');
  });
});
```

### Integration Tests

**Test Scenarios:**
1. **Full Correction Workflow:** User corrects entity → DB updated → wiki regenerates → UI reflects change
2. **Learning Pipeline:** Correction made → pattern extracted → pattern applied to new extraction
3. **Rollback Flow:** Correction made → user rolls back → state restored correctly
4. **Conflict Resolution:** Dependent corrections handled correctly on rollback

**Example Integration Test:**
```typescript
describe('Correction Integration', () => {
  it('should correct entity type and regenerate wiki', async () => {
    // Setup: Create entity with wrong type
    const entity = await createEntity({ name: 'Gondor', type: 'PLACE' });

    // Action: Correct entity type
    const result = await correctEntityType({
      entityId: entity.id,
      newType: 'KINGDOM'
    });

    // Assertions
    expect(result.success).toBe(true);

    // Check DB updated
    const updated = await getEntity(entity.id);
    expect(updated.type).toBe('KINGDOM');

    // Check correction logged
    const correction = await getCorrection(result.correction.id);
    expect(correction.type).toBe('entity_type');
    expect(correction.before.type).toBe('PLACE');
    expect(correction.after.type).toBe('KINGDOM');

    // Check wiki regenerated
    const page = await getWikiPage(entity.id);
    expect(page.content).toContain('Type: KINGDOM');

    // Check version created
    const version = await getLatestVersion(entity.id);
    expect(version.diff.entitiesModified).toBe(1);
  });
});
```

### End-to-End Tests

**User Journeys:**
1. Author corrects entity type via UI
2. Author merges duplicate entities
3. Author adds missing relation
4. Author views version history and rolls back

**Example E2E Test (Cypress):**
```typescript
describe('Manual Override E2E', () => {
  it('should allow author to correct entity type', () => {
    // Navigate to entity page
    cy.visit('/wiki/entity/gondor');

    // Verify incorrect type shown
    cy.contains('Type: PLACE').should('be.visible');

    // Open edit dialog
    cy.contains('Edit Entity').click();

    // Change type
    cy.get('[data-testid="entity-type-select"]').select('KINGDOM');

    // Add reason
    cy.get('[data-testid="correction-reason"]')
      .type('Gondor is a kingdom, not a place');

    // Save correction
    cy.contains('Save Correction').click();

    // Verify success
    cy.contains('Entity type updated').should('be.visible');

    // Verify UI updated
    cy.contains('Type: KINGDOM').should('be.visible');
    cy.contains('Type: PLACE').should('not.exist');
  });
});
```

### Performance Tests

**Targets:**
- Entity type correction: <200ms
- Entity merge: <500ms
- Wiki regeneration: <1s
- Rollback: <1s

**Load Testing:**
- 100 corrections in 60 seconds
- 10 concurrent users making corrections
- 1000-entity knowledge graph with heavy corrections

---

## Open Questions & Decisions Needed

### 1. Learning Algorithm Complexity

**Question:** How sophisticated should pattern extraction be?

**Options:**
- **Simple:** Exact string matching, basic regex
  - Pros: Easy to implement, fast, deterministic
  - Cons: Misses complex patterns
- **Advanced:** NLP-based pattern learning, semantic similarity
  - Pros: Catches subtle patterns, higher recall
  - Cons: Complex, slower, requires ML models

**Recommendation:** Start simple (Week 2), iterate to advanced (post-beta).

### 2. Version Storage Strategy

**Question:** How long to keep version history?

**Options:**
- **Forever:** Keep all versions indefinitely
  - Pros: Complete audit trail, can rollback to any point
  - Cons: Database grows without bound
- **Time-Limited:** Keep versions for N days/months
  - Pros: Bounded storage
  - Cons: Can't rollback beyond limit
- **Snapshot Periodic:** Full snapshot every N corrections, incremental between
  - Pros: Balance between completeness and efficiency
  - Cons: Some history resolution lost

**Recommendation:** Snapshot periodic (full every 100 corrections, incremental always).

### 3. Conflict Resolution UX

**Question:** How aggressive should conflict warnings be?

**Options:**
- **Permissive:** Allow all corrections, warn about conflicts but don't block
  - Pros: Author has full control, no frustrating blocks
  - Cons: Easy to create inconsistencies
- **Restrictive:** Block corrections that conflict with existing data
  - Pros: Maintains consistency
  - Cons: Frustrating for author, limits flexibility
- **Intelligent:** Analyze conflict severity, block only critical issues
  - Pros: Balance between control and consistency
  - Cons: Complex logic, harder to explain to user

**Recommendation:** Intelligent (block impossible corrections, warn about suspicious ones, allow override).

### 4. Multi-User Support

**Question:** Should beta support multiple users editing same knowledge graph?

**Options:**
- **Single-User:** One author per knowledge graph (simpler)
  - Pros: No concurrency issues, simpler implementation
  - Cons: Can't collaborate
- **Multi-User:** Multiple authors can edit simultaneously
  - Pros: Enables collaboration
  - Cons: Requires conflict resolution, locking, access control

**Recommendation:** Single-user for beta, multi-user post-beta.

---

## Conclusion

This specification provides a complete blueprint for implementing the Manual Override System—the core feature that differentiates ARES from traditional entity extraction tools.

**Key Takeaways:**
1. **Author authority is absolute** - corrections are always accepted
2. **Evidence-based learning** - system improves from corrections
3. **Reactive updates** - wiki regenerates automatically on changes
4. **Version control** - everything is reversible
5. **Phased implementation** - 4 weeks to beta

**Next Steps:**
1. Review this spec with Archie (architect) and Cory (product owner)
2. Finalize API contracts and data models
3. Begin Week 1 implementation (Manual Override UI)
4. Iterate based on feedback

**Questions or feedback? Contact the team before starting implementation.**

---

**Document Status:** DRAFT v1.0 - Awaiting architectural review
**Related Documents:** VISION.md, STATUS.md, README.md
**Implementation Timeline:** Week 1-3 of 4-week sprint
