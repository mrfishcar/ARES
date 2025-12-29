# Story World IR: Architecture Specification

**Version:** 1.0
**Date:** 2025-12-27
**Status:** Draft Specification

---

## Executive Summary

ARES compiles narrative text into a **Story World IR** (Intermediate Representation) - a queryable, evidence-backed representation of everything that exists, happens, and is claimed in a story.

The IR is the product. Extraction is just parsing. Wiki pages and timelines are renderers over the IR.

---

## Core Principles

### 1. Compiler, Not Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ARES COMPILER                                      │
│                                                                              │
│  Source          Passes                      IR              Renderers       │
│  ──────          ──────                      ──                ─────────     │
│                                                                              │
│  ┌──────────┐    ┌─────────────────────┐    ┌──────────────┐   ┌─────────┐  │
│  │Narrative │ -> │ P0: Baseline Signals│ -> │              │   │  Wiki   │  │
│  │  Text    │    │ P1: Candidate Extr. │    │  Story World │ ->│ Timeline│  │
│  │          │    │ P2: Identity Stabil.│    │      IR      │   │ Queries │  │
│  │(chapters,│    │ P3: Type Resolution │    │              │   │Analytics│  │
│  │ scenes)  │    │ P4: Assertion Build │    │ (Entities,   │   │         │  │
│  └──────────┘    │ P5: Event Modeling  │    │  Events,     │   └─────────┘  │
│                  │ P6: State Derivation│    │  Assertions, │                │
│                  └─────────────────────┘    │  Facts)      │                │
│                                             └──────────────┘                │
│                           ▲                        │                        │
│                           │                        │                        │
│                           └────────────────────────┘                        │
│                              Priors + Constraints                           │
│                              (not hidden rewrites)                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Evidence-First, Uncertainty-Preserved

Every IR object carries:
- **Evidence spans**: Document + character offsets
- **Attribution**: Who asserts this (narrator, character, omniscient)
- **Modality**: Fact, belief, rumor, plan, negation, hypothetical
- **Confidence**: Layer-specific, propagated through passes

**Dropping uncertainty early = hallucinating certainty later.**

### 3. Entities Are Data Types, Not Sacred

"Entity" is not a fundamental concept. It's a current data type of interest:
- PERSON, PLACE, ORG are default types
- Users can add FACTION, ARTIFACT, SPELL, HOUSE
- Types can be filtered, merged, extended without recompiling

The IR stores canonical identities. Type assignments are metadata.

### 4. Renderers Consume IR, Never Infer

| Renderers CAN | Renderers CANNOT |
|---------------|------------------|
| Display evidence spans | Infer new facts from text |
| Format IR into prose | Resolve unresolved references |
| Filter/sort IR objects | Apply semantic rules |
| Aggregate statistics | Decide modality/confidence |

All semantic work happens in compiler passes.

---

## Compiler Passes

### Pass 0: Baseline Signals (BookNLP + Syntax)

**Input:** Raw text + document metadata
**Output:** Perceptual signals

Produces:
- Token stream with POS, lemmas
- Sentence boundaries
- Mention spans (names, pronouns, nominals)
- Coreference chains (proposed, not canonical)
- Quote spans with speaker attribution
- Weak type guesses (PERSON, LOC, ORG from NER)

**Constraints:**
- No canonical IDs assigned
- No merging authority
- No knowledge of project canon

BookNLP/spaCy are sensors. They propose; they don't decide.

### Pass 1: Candidate Extraction

**Input:** Baseline signals
**Output:** Candidate objects

Produces:
- Entity candidates with spans
- Relation candidates with trigger spans
- Event candidates (actions, state changes, speech acts)

**Constraints:**
- Recall-focused: capture everything that might matter
- False positives acceptable (filtered later)
- Confidence attached to each candidate

### Pass 2: Identity Stabilization

**Input:** Entity candidates + project canon
**Output:** Stable identities

Responsibilities:
- Assign canonical IDs (stable across reprocessing)
- Merge/split decisions
- Alias mapping (all surface forms → canonical ID)
- Apply project-level identity constraints

**Output schema:**
```typescript
interface CanonicalIdentity {
  id: string;                    // Stable canonical ID
  aliases: string[];             // All surface forms
  mergedFrom?: string[];         // If result of merge
  splitFrom?: string;            // If result of split
  confidence: number;
  evidence: EvidenceSpan[];
}
```

### Pass 3: Type & Ontology Resolution

**Input:** Identities + type candidates
**Output:** Typed entities

Responsibilities:
- Assign types (PERSON, PLACE, ORG, EVENT, custom)
- Validate against ontology constraints
- Apply type locks from user overrides
- Handle type ambiguity (keep alternatives with confidence)

**Separate from identity because:**
- Type change shouldn't force identity churn
- Same identity can have type uncertainty
- Type constraints are schema-level, not instance-level

### Pass 4: Assertion Builder

**Input:** Relation/event candidates + typed entities
**Output:** Typed assertions

This is the core semantic interpretation pass.

**Produces:**
```typescript
interface Assertion {
  id: string;
  type: 'DIRECT' | 'BELIEF' | 'CLAIM' | 'NEGATION' | 'HYPOTHETICAL';

  // For DIRECT assertions
  subject?: EntityId;
  predicate?: PredicateType;
  object?: EntityId | Value;

  // For BELIEF/CLAIM (nested)
  holder?: EntityId;              // Who believes/claims
  content?: Assertion;            // What they believe/claim

  // Evidence & epistemics
  evidence: EvidenceSpan[];
  attribution: Attribution;       // narrator | character | omniscient
  modality: Modality;
  confidence: number;

  // Temporal
  validFrom?: TimeAnchor;
  validUntil?: TimeAnchor;
}
```

**Handles:**
- Reference resolution ("the family" → specific entities)
- Modality detection (fact vs belief vs plan)
- Attribution (who says this)
- Discourse context (narration vs dialogue)

### Pass 5: Event Modeling

**Input:** Assertions + temporal signals
**Output:** Event graph

Events are first-class IR objects:

```typescript
interface StoryEvent {
  id: string;
  type: EventType;                // From event ontology

  // Participants with roles
  participants: {
    role: ParticipantRole;        // AGENT, PATIENT, EXPERIENCER, etc.
    entity: EntityId;
  }[];

  // Temporal anchoring
  time: TimeAnchor;
  duration?: Duration;

  // Spatial anchoring
  location?: EntityId;

  // Evidence
  evidence: EvidenceSpan[];
  attribution: Attribution;
  modality: Modality;
  confidence: number;

  // Causal/temporal links
  links: {
    type: 'BEFORE' | 'AFTER' | 'CAUSES' | 'ENABLES' | 'PREVENTS';
    target: EventId;
    confidence: number;
  }[];

  // Derived assertions (state changes)
  produces: Assertion[];
}
```

### Pass 6: State Derivation

**Input:** Events + assertions
**Output:** Queryable facts

Derives stable facts from events and assertions:

```typescript
interface Fact {
  id: string;
  subject: EntityId;
  predicate: PredicateType;
  object: EntityId | Value;

  // Validity window
  validFrom: TimeAnchor;
  validUntil?: TimeAnchor;

  // Provenance
  derivedFrom: (EventId | AssertionId)[];
  confidence: number;

  // Override status
  userConfirmed?: boolean;
  userRejected?: boolean;
}
```

Facts are what renderers query. They're derived from the semantic passes, not directly from extraction.

---

## IR Core Types

### Evidence Span

```typescript
interface EvidenceSpan {
  docId: string;
  chapterIndex?: number;
  paragraphIndex?: number;
  sentenceIndex?: number;
  charStart: number;
  charEnd: number;
  text: string;                   // The actual text (cached for display)
}
```

### Time Anchor

```typescript
type TimeAnchor =
  | { type: 'ABSOLUTE'; date: string; precision: 'year' | 'month' | 'day' | 'time' }
  | { type: 'RELATIVE'; anchor: EventId; offset: string }  // "+3 days", "-1 year"
  | { type: 'BOUNDED'; before?: EventId | TimeAnchor; after?: EventId | TimeAnchor }
  | { type: 'UNCERTAIN'; range: [TimeAnchor, TimeAnchor] }
  | { type: 'DISCOURSE'; chapter?: number; paragraph?: number; sentence?: number }
  | { type: 'UNKNOWN' };
```

### Modality

```typescript
type Modality =
  | 'FACT'          // Presented as true by narrator
  | 'BELIEF'        // Character believes (may be false)
  | 'CLAIM'         // Character/narrator claims (reliability uncertain)
  | 'RUMOR'         // Unverified social knowledge
  | 'PLAN'          // Intended future action
  | 'HYPOTHETICAL'  // Imagined, conditional, counterfactual
  | 'NEGATED'       // Explicitly stated as not true
  | 'UNCERTAIN';    // Ambiguous in text
```

### Attribution

```typescript
interface Attribution {
  source: 'NARRATOR' | 'CHARACTER' | 'OMNISCIENT' | 'DOCUMENT';
  character?: EntityId;           // If source is CHARACTER
  reliability: number;            // 0-1, based on narrator/character trustworthiness
  isDialogue: boolean;
  isThought: boolean;
}
```

### Confidence

```typescript
interface Confidence {
  extraction: number;             // How well did we parse this?
  identity: number;               // How sure are we about entity resolution?
  semantic: number;               // How sure are we about interpretation?
  temporal: number;               // How sure are we about timing?
  composite: number;              // Aggregated confidence
}
```

---

## Event Ontology v1 (Literary-Focused)

### State Changes
- `BECOME` - Entity gains property (Harry became an orphan)
- `CEASE` - Entity loses property (Harry stopped being a student)
- `TRANSFORM` - Entity changes form (frog became prince)

### Actions
- `MOVE` - Physical movement (Harry went to Hogwarts)
- `TRANSFER` - Object changes possession (Hagrid gave Harry the letter)
- `CREATE` - Something comes into existence (Voldemort created horcruxes)
- `DESTROY` - Something ceases to exist (Harry destroyed the diary)
- `ATTACK` - Hostile action (Voldemort attacked Harry)
- `HELP` - Beneficial action (Dumbledore helped Harry)

### Social/Relational
- `MEET` - Entities encounter each other
- `BEFRIEND` - Friendship forms
- `MARRY` - Marriage event
- `BETRAY` - Trust violation
- `ALLY` - Alliance forms
- `CONFLICT` - Opposition emerges

### Cognitive
- `LEARN` - Entity gains knowledge (Harry learned he was a wizard)
- `DISCOVER` - Entity finds something (Harry discovered the mirror)
- `REALIZE` - Insight/understanding (Harry realized Snape was protecting him)
- `DECIDE` - Choice made
- `PLAN` - Future intention formed

### Communicative
- `TELL` - Information transfer (Hagrid told Harry about his parents)
- `ASK` - Question posed
- `PROMISE` - Commitment made
- `LIE` - False statement (knowingly)
- `REVEAL` - Hidden information exposed
- `CONCEAL` - Information hidden

### Biological/Physical
- `BIRTH` - Entity comes into existence
- `DEATH` - Entity ceases to exist
- `INJURE` - Physical harm
- `HEAL` - Recovery from harm

---

## Cross-Document / Project Scope

### Document-Level Compilation

Each document (chapter, book) compiles independently to local IR:
- Local entity candidates
- Local events
- Local assertions

### Project-Level Linking

Cross-document operations:
1. **Identity resolution**: Match entities across documents
2. **Timeline ordering**: Order events across documents
3. **Fact aggregation**: Combine assertions into project-level facts
4. **Override application**: Apply user edits project-wide

### Incremental Processing

```
[Chapter 1] --compile--> IR_1
[Chapter 2] --compile--> IR_2
                          │
                          ▼
              ┌─────────────────────┐
              │   Project Linker    │
              │                     │
              │ - Cross-doc identity│
              │ - Timeline ordering │
              │ - Fact aggregation  │
              └─────────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │   Project IR        │
              │   (queryable)       │
              └─────────────────────┘
```

**Adding Chapter 10:**
1. Compile Chapter 10 to IR_10
2. Run identity resolution against existing project IR
3. Update timeline with new events
4. No recompile of Chapters 1-9 (unless retroactive reinterpretation triggered)

### Retroactive Reinterpretation

When new information changes past understanding:
- User can trigger full project recompile
- Or accept that old chapters have "outdated" interpretation
- Conflicts flagged for review

### Override Ripple Strategy

User edits are IR objects:

```typescript
interface Override {
  id: string;
  timestamp: string;
  user: string;

  target: {
    type: 'entity' | 'event' | 'assertion' | 'fact';
    id: string;
  };

  action: 'merge' | 'split' | 'retype' | 'reject' | 'confirm' | 'correct_time' | 'add_alias';

  payload: Record<string, any>;
  reason?: string;

  // Affected downstream objects (computed)
  rippleAffects: string[];
}
```

Override application:
1. Apply override to target object
2. Propagate to derived objects (facts derived from changed assertions)
3. Mark affected renderers as stale
4. No silent rewrite of extraction heuristics

---

## Renderer Contracts

### What Renderers Receive

```typescript
interface RendererInput {
  // Entities (filtered by type if requested)
  entities: Entity[];

  // Facts about entities (current state)
  facts: Fact[];

  // Events (filtered by time range if requested)
  events: StoryEvent[];

  // For evidence display
  evidenceSpans: EvidenceSpan[];

  // Project metadata
  projectId: string;
  documentIds: string[];
}
```

### Wiki Renderer Contract

**Consumes:**
- Entity with all aliases
- Facts about entity (with temporal validity)
- Events entity participated in
- Evidence spans for citations

**Produces:**
- Entity page with sections:
  - Summary (generated from facts)
  - Timeline (from events)
  - Relationships (from relation facts)
  - Appearances (from evidence spans)
  - Notes/Trivia

**MUST NOT:**
- Infer facts not in IR
- Resolve references not already resolved
- Decide modality/confidence
- Access raw text except for quotation

### Timeline Renderer Contract

**Consumes:**
- Events with TimeAnchors
- Entity filter (optional)
- Time range filter (optional)

**Produces:**
- Ordered list of events
- Grouped by time periods if absolute time available
- Uncertainty indicators for unclear ordering
- Links to evidence

**MUST NOT:**
- Infer temporal ordering not in IR
- Assume events are linearly ordered when they're not
- Hide uncertainty

### Query Interface Contract

Example queries the IR supports:
```
// All lies told by character X
events.filter(e => e.type === 'LIE' && e.participants.some(p => p.entity === X.id))

// Everything character Y believes (even if false)
assertions.filter(a => a.type === 'BELIEF' && a.holder === Y.id)

// All scenes in location Z
events.filter(e => e.location === Z.id)

// All promises (and whether kept)
events.filter(e => e.type === 'PROMISE')
  .map(e => ({ promise: e, fulfilled: findFulfillment(e) }))

// All discoveries
events.filter(e => e.type === 'DISCOVER' || e.type === 'LEARN' || e.type === 'REALIZE')
```

---

## Feedback Without Entanglement

### What IS allowed

IR can improve extraction via **explicit priors**:
- Alias dictionary: "Harry" is alias for entity_123
- Reject list: "the" is never an entity
- Type locks: entity_456 is always PERSON

These are **static data** fed to extraction passes.

### What is NOT allowed

- Downstream interpretation silently changing extraction behavior
- Assertions modifying candidate generation heuristics
- Hidden feedback loops

**Saved canon = priors + constraints, not hidden behavior.**

---

## Implementation Priority

1. **Define IR types** (`app/engine/ir/types.ts`)
2. **Implement Pass 2-3** (Identity + Type) as replacement for current entity-extraction
3. **Implement Pass 4** (Assertion Builder) - core semantic pass
4. **Implement Pass 5** (Event Modeling) - enables timelines
5. **Implement Pass 6** (State Derivation) - enables wiki queries
6. **Build renderers** that consume IR

---

## Open Questions

1. **How deep does belief nesting go?**
   - "Harry believes Ron thinks Hermione is hiding something"
   - Propose: max depth 2, deeper becomes summary

2. **How to handle unreliable narrators?**
   - First-person narration where narrator lies
   - Propose: narrator reliability as Attribution metadata

3. **How to handle retcons/author corrections?**
   - Information later revealed to contradict earlier text
   - Propose: explicit RETCON event type, or version annotations

4. **What's the storage format?**
   - SQLite for local-first
   - JSON export for interop
   - Propose: SQLite primary, JSON serialization for IR exchange

---

## North Star

> "ARES compiles narrative text into a Story World IR - a queryable, evidence-backed representation of entities, events, and assertions - that wiki pages, timelines, and analytics render into human-readable knowledge products."

---

**Document Status:** Draft for review
**Next:** Implement `app/engine/ir/types.ts` with these schemas
