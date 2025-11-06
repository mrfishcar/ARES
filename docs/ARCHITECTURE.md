# ARES Architecture

This document describes the architecture, design principles, and technical implementation of ARES (Advanced Relation Extraction System).

## Table of Contents

- [Overview](#overview)
- [Design Principles](#design-principles)
- [System Architecture](#system-architecture)
- [Extraction Pipeline](#extraction-pipeline)
- [Data Flow](#data-flow)
- [Storage Layer](#storage-layer)
- [HERT System](#hert-system)
- [GraphQL API](#graphql-api)
- [Performance Characteristics](#performance-characteristics)

## Overview

ARES is a local-first knowledge extraction system that transforms unstructured text into structured knowledge graphs. It combines:

- **Algorithmic extraction** - Rule-based patterns and dependency parsing (fast, deterministic)
- **spaCy NLP** - Named entity recognition and dependency parsing
- **Pattern matching** - Regular expressions and linguistic patterns
- **Coreference resolution** - Pronoun and descriptor resolution
- **Quality filtering** - Confidence-based filtering and review queues

### Key Capabilities

1. **Entity Extraction** - Identifies people, places, organizations, dates, and more
2. **Relation Extraction** - Finds connections between entities (parent_of, works_at, etc.)
3. **HERT Generation** - Creates stable, compact entity references with precise locations
4. **Alias Resolution** - Maps name variations to single entities
5. **Provenance Tracking** - Tracks evidence for every claim with source text
6. **Cross-document Identity** - Maintains entity identity across multiple documents

## Design Principles

### 1. Algorithmic-First

ARES prioritizes deterministic, rule-based extraction over ML/LLM approaches:

- **Same input → same output** (reproducible)
- **Fast** (hundreds of words per second)
- **Explainable** (every extraction has a reason)
- **Testable** (unit tests for every pattern)
- **No API costs** (fully local)

LLMs are reserved for ambiguous edge cases (<5% of extractions).

### 2. Local-First

- **No cloud dependencies** - Runs entirely offline
- **Privacy-preserving** - Your data never leaves your machine
- **No API costs** - No usage limits or billing
- **Always available** - Works without internet

### 3. Multi-Pass Extraction

ARES uses multiple extraction methods and combines results:

1. **Dependency parsing** - Grammatical structure analysis
2. **Pattern matching** - Regex for narrative patterns
3. **NER tagging** - spaCy named entity recognition
4. **Coreference resolution** - Link pronouns to entities
5. **Context classification** - Improve entity types
6. **Confidence filtering** - Remove low-quality extractions

### 4. Provenance & Evidence

Every extraction includes:
- Source text snippet
- Character offsets (start/end)
- Sentence index
- Extraction method used
- Confidence score

This enables:
- Verification of facts
- Debugging extractions
- Confidence-based filtering
- Human review workflows

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ARES ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Raw Text   │─────▶│  Extraction  │─────▶│  Knowledge   │
│   Documents  │      │    Engine    │      │    Graph     │
└──────────────┘      └──────────────┘      └──────────────┘
                             │
                             ├─▶ spaCy Parser Service (Python)
                             ├─▶ Entity Extraction (TypeScript)
                             ├─▶ Relation Extraction (TypeScript)
                             ├─▶ Coreference Resolution
                             └─▶ Quality Filtering

┌─────────────────────────────────────────────────────────────┐
│                      COMPONENT LAYOUT                        │
└─────────────────────────────────────────────────────────────┘

app/
├── engine/                 # Core extraction engine
│   ├── extract/
│   │   ├── orchestrator.ts     # Main pipeline coordinator
│   │   ├── entities.ts         # Entity extraction
│   │   ├── relations.ts        # Dependency-based relations
│   │   └── spans.ts            # Span tracking
│   ├── coreference.ts          # Pronoun resolution
│   ├── narrative-relations.ts  # Pattern-based relations
│   ├── entity-profiler.ts      # Entity profiling
│   ├── confidence-scoring.ts   # Quality assessment
│   └── schema.ts               # Type definitions
│
├── storage/                # Persistence layer
│   ├── storage.ts              # JSON storage
│   └── hert-store.ts           # HERT reference storage
│
├── api/                    # GraphQL API
│   ├── graphql.ts              # Apollo server
│   ├── schema.graphql          # API schema
│   ├── cache-layer.ts          # LRU caching
│   ├── rate-limit.ts           # Rate limiting
│   └── resolvers/
│       ├── entities.ts         # Entity queries
│       ├── relations.ts        # Relation queries
│       ├── graph-viz.ts        # Graph traversal
│       ├── search.ts           # Full-text search
│       └── bulk-review.ts      # Batch operations
│
└── ui/console/             # Web interface (React + Vite)
    └── src/
        ├── pages/GraphPage.tsx       # Graph visualization
        └── components/GraphCanvas.tsx # D3 force layout

scripts/
└── parser_service.py       # spaCy NLP service (port 8000)

tests/
├── ladder/                 # Progressive difficulty tests
├── golden/                 # Golden corpus (LotR, HP, Bible)
├── golden_truth/           # Annotated synthetic tests
└── integration/            # API integration tests
```

## Extraction Pipeline

The extraction pipeline is orchestrated by `orchestrator.ts` and runs in multiple phases:

### Phase 1: Text Preprocessing

```typescript
// Split text into sentences and paragraphs
const segments = splitIntoSegments(text);
const sentences = splitIntoSentences(text);
```

### Phase 2: spaCy Parsing

```typescript
// Send to Python parser service for NLP analysis
const parsed = await parseText(text, parserUrl);
// Returns: tokens, dependencies, NER tags, POS tags
```

### Phase 3: Entity Extraction

```typescript
// Multi-source entity extraction
entities = extractEntities(parsed, {
  sources: ['NER', 'DEPENDENCY', 'WHITELIST', 'FALLBACK'],
  mergeVariants: true,
  coordinationSplit: true
});
```

**Entity sources:**
- **WHITELIST** - Known entities (KNOWN_ORGS, KNOWN_PLACES)
- **NER** - spaCy named entity recognition
- **DEPENDENCY** - Dependency patterns (subjects, objects)
- **FALLBACK** - Capitalized patterns (last resort)

### Phase 4: Confidence Scoring

```typescript
// Score each entity based on multiple factors
for (const entity of entities) {
  entity.confidence = computeConfidence(entity, {
    source: entity.attrs?.source,
    frequency: countMentions(entity),
    context: hasStrongContext(entity),
    genericPenalty: isGenericWord(entity.text)
  });
}

// Filter low-confidence entities
entities = entities.filter(e => e.confidence >= 0.5);
```

### Phase 5: Relation Extraction (Dependency-Based)

```typescript
// Extract relations using dependency paths
relations = extractRelations(parsed, entities);
```

Extracts relations like:
- `parent_of` - "X, son of Y" → parent_of(Y, X)
- `married_to` - "X married Y" → married_to(X, Y)
- `works_at` - "X works at Y" → works_at(X, Y)
- `lives_in` - "X lives in Y" → lives_in(X, Y)

### Phase 6: Coreference Resolution

```typescript
// Resolve pronouns and descriptors
const corefEntities = resolveCoref(parsed, entities);

// Links:
// "She" → Aria Thorne
// "The strategist" → Kara Nightfall
// "their daughter" → (Aria, Elias)'s child
```

### Phase 7: Narrative Relation Extraction

```typescript
// Pattern-based extraction for narrative text
const narrativeRelations = extractNarrativeRelations(text, entities);
```

Extracts patterns like:
- "X and Y remained friends" → friends_with(X, Y)
- "X studied at Y" → studies_at(X, Y)
- "X became an enemy of Y" → enemy_of(X, Y)

### Phase 8: Inverse Relations

```typescript
// Auto-generate inverse relations
for (const relation of relations) {
  if (INVERSE[relation.pred]) {
    relations.push({
      ...relation,
      id: newId(),
      subj: relation.obj,
      obj: relation.subj,
      pred: INVERSE[relation.pred]
    });
  }
}
```

Examples:
- `parent_of(A, B)` → auto-creates `child_of(B, A)`
- `married_to(A, B)` → auto-creates `married_to(B, A)` (symmetric)

### Phase 9: Deduplication

```typescript
// Remove duplicate relations
relations = deduplicateRelations(relations);
```

### Phase 10: Entity Profiling

```typescript
// Build entity profiles
const profiles = buildProfiles(entities, relations, spans);
// Tracks: descriptors, roles, mention_count, confidence
```

## Data Flow

```
┌─────────────┐
│  Raw Text   │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│  spaCy Parser       │  ◀── Python service (port 8000)
│  (NLP Analysis)     │
└──────┬──────────────┘
       │ ParseResponse (tokens, deps, NER)
       ▼
┌─────────────────────┐
│  Entity Extraction  │
│  - NER tagger       │
│  - Dependency       │
│  - Whitelist        │
│  - Fallback         │
└──────┬──────────────┘
       │ Entity[]
       ▼
┌─────────────────────┐
│  Confidence Filter  │  ◀── Drop entities < 0.5 confidence
└──────┬──────────────┘
       │ Filtered Entity[]
       ▼
┌─────────────────────┐
│  Relation Extraction│
│  - Dependency paths │
│  - Narrative patterns│
│  - Possessives      │
└──────┬──────────────┘
       │ Relation[]
       ▼
┌─────────────────────┐
│  Coreference Resol. │  ◀── Link pronouns to entities
└──────┬──────────────┘
       │ Enhanced Relation[]
       ▼
┌─────────────────────┐
│  Inverse Generation │  ◀── Auto-create reverse relations
└──────┬──────────────┘
       │ Complete Relation[]
       ▼
┌─────────────────────┐
│  Deduplication      │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  Knowledge Graph    │
│  - Entities         │
│  - Relations        │
│  - Spans            │
│  - Profiles         │
└─────────────────────┘
```

## Storage Layer

ARES uses JSON-based storage with optional binary HERT encoding.

### Graph Storage

```typescript
interface SerializedGraph {
  entities: Entity[];           // All entities
  relations: Relation[];        // All relations
  conflicts: Conflict[];        // Conflicting extractions
  provenance: Record<string, Provenance>;  // Evidence chains
  profiles: Record<string, EntityProfile>; // Entity metadata
  metadata: GraphMetadata;      // Graph stats
}
```

Stored in: `data/projects/{project_name}/graph.json`

### HERT Storage (Optional)

```typescript
interface ReferenceIndex {
  byEID: Map<number, string[]>;      // Entity ID → HERTs
  byDID: Map<bigint, string[]>;      // Document ID → HERTs
  all: string[];                     // All HERTs
}
```

Stored in: `data/herts.json`

## HERT System

HERT (Hierarchical Entity Reference Tag) provides stable, compact entity references.

### What is a HERT?

A HERT is a URL-safe string encoding:
- **EID** (Entity ID) - Stable 32-bit entity identifier
- **AID** (Alias ID) - Surface form identifier
- **SP** (Sense Path) - Disambiguation path
- **DID** (Document ID) - Document fingerprint
- **Location** - Paragraph + token offsets

Example HERT:
```
HERTv1:1J8trXOyn4HRaWXrdh9TUE

Decodes to:
- EID: 43 (Gandalf)
- AID: 230 (surface form: "Gandalf the Grey")
- Document: B6gaPG
- Location: paragraph 0, tokens 0-14
```

### Benefits

1. **Stable** - EID doesn't change when entity name changes
2. **Compact** - 20-30 chars vs 200+ for JSON
3. **Precise** - Exact paragraph + token location
4. **Portable** - Share via URL, no database needed
5. **Alias-aware** - Tracks surface form variations

See [HERT_SPECIFICATION.md](HERT_SPECIFICATION.md) for full technical details.

## GraphQL API

ARES provides a GraphQL API on port 4000 with:

- **Entity queries** - Search, filter, paginate entities
- **Relation queries** - Find relations by type, entities
- **Graph traversal** - BFS neighborhood exploration
- **Full-text search** - Lunr.js-powered search
- **Bulk operations** - Batch approve/dismiss for review
- **Metrics** - Prometheus-compatible metrics

### Key Features

- **LRU caching** - 30-60s TTL for frequent queries
- **Rate limiting** - Token bucket (12 req/sec)
- **Search facets** - Entity types, predicates
- **Graph visualization** - D3 force-directed layout support

See [API_REFERENCE.md](API_REFERENCE.md) for detailed API documentation.

## Performance Characteristics

### Extraction Performance

- **Speed**: ~190 words/second
- **Relation density**: 3-5 relations per 100 words (biographical)
- **Relation density**: 1-2 relations per 100 words (narrative fiction)

### Quality Metrics (Current)

Based on mega-001 benchmark (933 words):

- **Entity Precision**: 46.7% (target: 80%)
- **Entity Recall**: 87.5% (target: 75%) ✅
- **Relation Precision**: 60.0% (target: 80%)
- **Relation Recall**: 35.3% (target: 75%)

### API Performance

- **Cache hit rate**: 70-80% (typical workload)
- **Latency reduction**: ~60% with caching
- **Search index build**: <50ms (1K entities), <200ms (10K entities)
- **Rate limit**: 12 req/sec max

### Memory Usage

- **spaCy model** (en_core_web_sm): ~50MB
- **Node process**: ~100-200MB (typical)
- **Index storage**: ~1-2MB per 1000 entities (JSON)

## Scalability

### Document Size Limits

Tested on:
- ✅ 1,000 words - Fast (~5 seconds)
- ✅ 5,000 words - Good (~20 seconds)
- ✅ 10,000 words - Acceptable (~40 seconds)
- ⚠️ 50,000+ words - May need chunking

### Storage Scaling

- **JSON graphs**: Efficient up to ~100K entities per project
- **HERT storage**: Delta-encoded bundles scale to millions of references
- **SQLite migration**: Planned for 100K+ entity projects

## Future Enhancements

Planned architectural improvements:

1. **SQLite storage** - Replace JSON for large projects
2. **Incremental extraction** - Update graph without full reprocessing
3. **LLM fallback** - Local LLM for ambiguous cases
4. **Distributed caching** - Redis for multi-instance deployments
5. **WebSocket subscriptions** - Real-time updates
6. **Entity deduplication** - Advanced merging algorithms

---

For implementation details, see:
- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) - Contributing and extending
- [HERT_SPECIFICATION.md](HERT_SPECIFICATION.md) - HERT technical spec
- [API_REFERENCE.md](API_REFERENCE.md) - GraphQL API reference
