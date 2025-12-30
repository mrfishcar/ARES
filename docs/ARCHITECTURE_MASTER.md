# ARES Architecture Master Reference

**Version:** 2.0
**Updated:** 2025-12-30
**Status:** Active

---

## System Overview

ARES is a two-stage system for narrative understanding:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTRACTION ENGINE                                  │
│                        app/engine/extract/                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Raw Text → Parser → Entities → Relations → Knowledge Graph                 │
│              ↓           ↓           ↓                                       │
│         spaCy NER   Alias Res   Dep Patterns                                │
│         Coreference            Narrative Pat                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        IR COMPILATION SYSTEM                                 │
│                           app/engine/ir/                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Knowledge Graph → Assertions → Events → Facts → Views                      │
│                        ↓           ↓        ↓       ↓                        │
│                   Predicates   Timeline  States   Wiki Pages                │
│                   Modalities   Causation         Timelines                  │
│                   Confidence   Discourse         Metrics                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Extraction Engine

### Pipeline Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ DocumentParse│────▶│EntityExtract │────▶│EntityFilter  │
│   Stage      │     │   Stage      │     │   Stage      │
└──────────────┘     └──────────────┘     └──────────────┘
        │                                        │
        ▼                                        ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Coreference  │◀────│EntityProfile │◀────│              │
│   Stage      │     │   Stage      │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
        │
        ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ RelationExtr │────▶│RelationFilter│────▶│InverseGen    │
│   Stage      │     │   Stage      │     │   Stage      │
└──────────────┘     └──────────────┘     └──────────────┘
        │                                        │
        ▼                                        ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Deduplication│────▶│AliasResolve  │────▶│KnowledgeGraph│
│   Stage      │     │   Stage      │     │   Stage      │
└──────────────┘     └──────────────┘     └──────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `extract/orchestrator.ts` | Main extraction coordinator |
| `extract/entities.ts` | 3-stage entity extraction (2898 lines) |
| `extract/relations.ts` | Dependency path patterns |
| `narrative-relations.ts` | Narrative pattern extraction |
| `coref.ts` | Coreference resolution |
| `merge.ts` | Cross-document entity merging |

### Entity Types

```typescript
type EntityType =
  | 'PERSON'    // People
  | 'ORG'       // Organizations
  | 'PLACE'     // Locations
  | 'ITEM'      // Objects, artifacts
  | 'WORK'      // Books, documents
  | 'EVENT'     // Named events
  | 'ANIMAL'    // Animals
  | 'DATE'      // Dates, times
  | 'GPE';      // Geopolitical entities
```

### Relation Predicates

```typescript
// Family relations
parent_of, child_of, sibling_of, married_to, cousin_of

// Social relations
friend_of, enemy_of, ally_of, mentor_of

// Organizational
member_of, works_for, leads, founded

// Spatial
lives_in, located_in, born_in

// Possession
possesses, owns, wields, guards
```

---

## 2. IR Compilation System

### Module Overview

```
app/engine/ir/
├── types.ts              # Core IR types (ProjectIR, Entity, Event, etc.)
├── adapter.ts            # Extraction → IR conversion
├── assertion-builder.ts  # Predicate extraction
├── event-builder.ts      # Event derivation
├── fact-builder.ts       # Fact materialization
├── entity-renderer.ts    # Wiki page generation
├── timeline-builder.ts   # Timeline ordering/filtering
├── timeline-renderer.ts  # Timeline display
├── extraction-diagnostics.ts  # Quality metrics
└── index.ts              # Module exports
```

### Data Flow

```
ExtractionResult
       │
       ▼
┌─────────────────┐
│ adaptLegacy()   │  adapter.ts
└────────┬────────┘
         │
         ▼
    ProjectIR
         │
    ┌────┴────┐
    │         │
    ▼         ▼
buildAssertions()  buildEvents()
    │              │
    ▼              ▼
Assertions      Events
    │              │
    └──────┬───────┘
           │
           ▼
    buildFactsFromEvents()
           │
           ▼
      FactViewRows
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
renderEntityPage()  renderTimeline()
    │               │
    ▼               ▼
  Markdown       Markdown
```

### Core Types

```typescript
// Project IR - the main container
interface ProjectIR {
  version: string;
  projectId: string;
  createdAt: string;
  entities: Entity[];
  events: StoryEvent[];
  assertions: Assertion[];
  stats: { entityCount, eventCount, assertionCount };
}

// Entity - person, place, thing
interface Entity {
  id: EntityId;
  type: EntityType;
  canonical: string;
  aliases: string[];
  confidence: Confidence;
  evidence: EvidenceSpan[];
  attrs: Record<string, any>;
}

// Story Event - something that happened
interface StoryEvent {
  id: EventId;
  type: string;  // MOVE, DEATH, TELL, TRANSFER, etc.
  time: TimeAnchor;
  participants: Participant[];
  evidence: EvidenceSpan[];
  attribution: Attribution;
  modality: Modality;
  confidence: Confidence;
  links: EventLink[];
}

// Assertion - a claim about the world
interface Assertion {
  id: AssertionId;
  assertionType: 'DIRECT' | 'INFERRED' | 'QUOTED';
  subject: EntityId;
  predicate: PredicateType;
  object: EntityId | string | number | boolean;
  modality: Modality;
  confidence: Confidence;
  evidence: EvidenceSpan[];
}

// Fact - materialized view of events/assertions
interface FactViewRow {
  id: FactId;
  subject: EntityId;
  predicate: PredicateType;
  object: EntityId | string | number | boolean;
  validFrom: TimeAnchor;
  validUntil?: TimeAnchor;
  derivedFrom: (EventId | AssertionId)[];
  confidence: number;
}
```

### Event Types

| Type | Participants | Derived From |
|------|--------------|--------------|
| MOVE | MOVER, DESTINATION, ORIGIN | location predicates |
| DEATH | DECEDENT, KILLER, LOCATION | death predicates |
| TELL | SPEAKER, ADDRESSEE, TOPIC | dialogue, speech |
| TRANSFER | GIVER, RECEIVER, TAKER, ITEM | possession changes |
| MEET | PERSON_A, PERSON_B, LOCATION | proximity |
| ATTACK | ATTACKER, VICTIM, WEAPON | conflict predicates |
| CREATE | CREATOR, CREATION | creation predicates |

### Renderers

#### Entity Pages

```typescript
renderEntityPage(ir, entityId, options?)
// Generates:
// - Title with type badge (👤 PERSON, 📍 PLACE, etc.)
// - Quick facts (location, status, possessions)
// - Relationships (with cross-links)
// - Timeline of events
// - Mentioned in section
// - Evidence snippets

renderItemPage(ir, itemId, options?)
// Generates:
// - Current holder
// - Ownership history with timeline
// - Location history

renderPlacePage(ir, placeId, options?)
// Generates:
// - Residents (lives_in)
// - Visitors (MOVE events)
// - Located items
```

#### Timeline

```typescript
queryTimeline(events, filter?)
// Filter by:
// - entityId: events involving entity
// - eventType: specific event types
// - timeRange: chapter/paragraph range
// - docId: specific document
// - modality: FACT, BELIEF, etc.
// - minConfidence: threshold

renderTimeline(ir, options?)
// Generates chronological event list with:
// - Event descriptions
// - Participants
// - Evidence snippets
// - Temporal links
```

### Diagnostics

```typescript
validateIR(ir)
// Checks:
// - Orphan references
// - Duplicate IDs
// - Missing required fields
// - Invalid confidence values
// - Temporal inconsistencies
// Returns: { valid, errors, warnings, info }

analyzeConfidence(ir)
// Returns:
// - Distribution statistics
// - Calibration score
// - Recommendations

computeMetrics(ir)
// Returns:
// - Entity/event/assertion counts
// - Type breakdown
// - Coverage metrics
// - Performance info
```

---

## 3. HERT System

Hierarchical Entity Reference Tags provide stable entity references:

```
HERTv1:1J8trXOyn4HRaWXrdh9TUE
       └───────────────────┘
           Base62 encoded:
           - EID (entity ID)
           - AID (alias ID)
           - DID (document ID)
           - Position (paragraph, tokens)
```

### Benefits
- **Stable**: ID doesn't change when entity name changes
- **Compact**: 20-30 chars vs 200+ for JSON
- **Precise**: Exact paragraph + token location
- **Portable**: Share via URL, no database needed

### Files
- `app/engine/hert/encoder.ts`
- `app/engine/hert/decoder.ts`
- `app/engine/hert/registry.ts`

---

## 4. UI Architecture

### Console Application

```
app/ui/console/src/
├── App.tsx               # Main app with routing
├── pages/
│   ├── ExtractionLab.tsx # Text extraction testing
│   ├── WikiPage.tsx      # Entity wiki viewer
│   ├── TimelinePage.tsx  # Timeline visualization
│   └── EntitiesPage.tsx  # Entity list/management
├── components/
│   ├── WikiPanel.tsx     # Entity wiki display
│   ├── EntityChip.tsx    # Entity badge component
│   └── VineTimeline.tsx  # Visual timeline
└── hooks/
    └── useIRAdapter.ts   # Extraction → IR hook
```

### Data Flow in UI

```
User Input (text)
       │
       ▼
ExtractionLab.tsx
       │
       ▼
useExtraction() hook
       │
       ▼
ExtractionResult
       │
       ▼
useIRAdapter() hook
       │
       ▼
ProjectIR
       │
    ┌──┴──┐
    │     │
    ▼     ▼
WikiPanel  TimelineView
```

---

## 5. Testing Strategy

### Test Ladder (Extraction)

| Level | Tests | Purpose |
|-------|-------|---------|
| 1 | Simple sentences | Basic NER + relations |
| 2 | Multi-sentence | Coreference |
| 3 | Complex narratives | Full extraction |
| 5 | Cross-document | Entity merging |

### IR Tests

| Module | Tests | Focus |
|--------|-------|-------|
| fact-builder | 70 | Fact derivation |
| entity-renderer | 96 | Wiki generation |
| timeline-builder | 57 | Timeline queries |
| event-builder | 43 | Event derivation |
| assertion-builder | 43 | Predicate extraction |
| extraction-diagnostics | 34 | Validation/metrics |

**Total IR Tests: 507**

### Running Tests

```bash
# All tests
npm test

# IR tests only
npm test tests/ir/

# Specific module
npm test tests/ir/entity-renderer.spec.ts

# With coverage
npm test -- --coverage
```

---

## 6. Configuration

### Environment Variables

```bash
# Parser
PARSER_BACKEND=http|mock|embedded
PARSER_URL=http://127.0.0.1:8000

# Debug
L3_DEBUG=1      # Verbose logging
L3_TRACE=1      # Span tracing

# Performance
IR_CACHE=true   # Enable IR caching
IR_PARALLEL=4   # Parallel workers
```

### Config Objects

```typescript
// Engine configuration
interface EngineConfig {
  llmConfig?: LLMConfig;
  entityFilterConfig: EntityFilterConfig;
  relationFilterConfig: RelationFilterConfig;
  hertOptions?: HERTOptions;
}

// Render options
interface EntityPageOptions {
  includeEvidence?: boolean;
  includeTimeline?: boolean;
  includeRelationships?: boolean;
  includeDebug?: boolean;
  maxEvidenceSnippets?: number;
}
```

---

## 7. Extension Points

### Adding New Event Types

1. Add type to `types.ts` EventType union
2. Add builder function in `event-builder.ts`
3. Add fact derivation in `fact-builder.ts` (if needed)
4. Add renderer section in `entity-renderer.ts`
5. Add tests in `tests/ir/`

### Adding New Predicates

1. Add to `PredicateType` union in `types.ts`
2. Add to relation sets in `fact-builder.ts`
3. Add inverse mapping if applicable
4. Add tests

### Adding New Renderers

1. Create render function in `entity-renderer.ts`
2. Export from `index.ts`
3. Add tests

---

## 8. Performance Considerations

### Current Benchmarks

- IR build: ~50ms for 100 entities
- Entity page render: ~5ms
- Timeline query: ~10ms for 1000 events
- Fact derivation: ~20ms for 500 events

### Optimization Strategies

1. **Caching**: Cache computed IR results by document hash
2. **Lazy loading**: Render sections on-demand
3. **Parallel processing**: Process events/facts in parallel
4. **Incremental updates**: Only recompute changed sections

---

## 9. Future Directions

### Planned Features

1. **Character arcs**: Track character state over time
2. **Knowledge graph export**: Neo4j, RDF, JSON-LD
3. **Search & query**: Full-text search, query language
4. **Visualization**: D3-based timeline, network graph

### Research Areas

1. **Causal reasoning**: Detect cause-effect chains
2. **Sentiment analysis**: Track emotional arcs
3. **Theme detection**: Identify narrative themes
4. **Summarization**: Generate plot summaries

---

**END OF ARCHITECTURE REFERENCE**
