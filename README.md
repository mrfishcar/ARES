# ARES - Advanced Relation Extraction System

A local-first, deterministic engine for extracting entities and relations from narrative text. Builds knowledge graphs with full provenance tracking, wiki-style entity pages, and chronological timelines.

## Architecture Overview

ARES has two main systems:

### 1. Extraction Engine (`app/engine/extract/`)
Transforms raw text into structured entities and relations:
```
Text → spaCy Parser → Entity Extraction → Relation Extraction → Knowledge Graph
           ↓                  ↓                   ↓
      Tokenization      3-Stage NER        Pattern Matching
      Dependency Parse  Alias Resolution   Inverse Generation
      POS Tagging       Coreference        Evidence Provenance
```

### 2. Intermediate Representation (IR) System (`app/engine/ir/`)
Compiles extraction output into a rich story world model:
```
Knowledge Graph → Assertion Builder → Event Builder → Fact Builder
                       ↓                   ↓               ↓
                  Predicates          Story Events    Derived Facts
                  Modalities          Participants    Possession State
                  Confidence          Timelines       Relation Facts

                → Entity Renderer → Wiki Pages
                → Timeline Builder → Chronological Views
                → Extraction Diagnostics → Quality Metrics
```

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start spaCy parser (Terminal 1) - REQUIRED for full NER
make parser
# Wait for: "Application startup complete"

# 3. Run tests (Terminal 2)
npm test

# 4. Run IR tests (507 tests)
npm test tests/ir/

# 5. Start dev server (optional)
make server-graphql  # GraphQL API on port 4000
make ui-console      # Web UI on port 5173
```

## IR System Components

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| `assertion-builder` | Extract predicates and modalities | `buildAssertions()` |
| `event-builder` | Derive story events (MOVE, DEATH, TELL, TRANSFER) | `buildEvents()` |
| `fact-builder` | Materialize facts from events | `buildFactsFromEvents()`, `deriveRelationFacts()` |
| `entity-renderer` | Generate wiki-style entity pages | `renderEntityPage()`, `renderItemPage()`, `renderPlacePage()` |
| `timeline-builder` | Timeline ordering and filtering | `queryTimeline()`, `deriveTemporalLinks()` |
| `timeline-renderer` | Render chronological views | `renderTimeline()` |
| `extraction-diagnostics` | Validate and measure quality | `validateIR()`, `computeMetrics()` |

### Entity Pages (Wiki-Style)
```typescript
import { renderEntityPage, renderItemPage, renderPlacePage } from './app/engine/ir';
const markdown = renderEntityPage(ir, 'entity_harry');
// Returns: Wiki page with quick facts, relationships, possessions, timeline
```

### Timeline Queries
```typescript
import { queryTimeline } from './app/engine/ir';
const result = queryTimeline(ir.events, {
  entityId: 'entity_frodo',
  eventType: ['MOVE', 'MEET'],
  timeRange: { minChapter: 1, maxChapter: 5 },
});
```

## Testing

### Extraction Quality (Test Ladder)
| Level | Focus | Command |
|-------|-------|---------|
| 1 | Simple sentences | `npm test tests/ladder/level-1-simple.spec.ts` |
| 2 | Multi-sentence | `npm test tests/ladder/level-2-multisentence.spec.ts` |
| 3 | Complex narratives | `npm test tests/ladder/level-3-complex.spec.ts` |

### IR System Tests (507 tests)
```bash
npm test tests/ir/                         # All IR tests
npm test tests/ir/entity-renderer.spec.ts  # Entity pages (96 tests)
npm test tests/ir/fact-builder.spec.ts     # Facts (70 tests)
npm test tests/ir/timeline-builder.spec.ts # Timeline (57 tests)
```

**Quality Targets**: Entity P≥80% R≥75%, Relation P≥80% R≥75%

## Key Concepts

### Entity Types
`PERSON`, `ORG`, `PLACE`, `ITEM`, `WORK`, `EVENT`, `ANIMAL`

### Event Types (IR)
`MOVE`, `DEATH`, `TELL`, `TRANSFER`, `MEET`, `ATTACK`, `CREATE`

### Relation Predicates
`parent_of`, `child_of`, `sibling_of`, `married_to`, `enemy_of`, `ally_of`, `possesses`, `lives_in`

### HERT IDs
Hierarchical Entity Reference Tags - stable, compact entity identifiers with provenance.
Format: `HERTv1:1J8trXOyn4HRaWXrdh9TUE`

## Project Structure

```
ARES/
├── app/engine/
│   ├── extract/        # Extraction engine
│   ├── ir/             # IR System (assertions, events, facts, renderers)
│   ├── hert/           # HERT encoding
│   └── linguistics/    # Language processing
├── tests/
│   ├── ladder/         # Extraction tests
│   └── ir/             # IR tests (507)
└── docs/
    ├── SONNET_WORK_PLAN.md     # Year-long development plan
    └── ARCHITECTURE_MASTER.md  # Consolidated architecture
```

## Documentation

- `CLAUDE.md` - AI assistant development guide
- `docs/SONNET_WORK_PLAN.md` - Sequential development roadmap
- `docs/ARCHITECTURE_MASTER.md` - Architecture reference
- `docs/LINGUISTIC_REFERENCE.md` - Language patterns

## License

MIT
