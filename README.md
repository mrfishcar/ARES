# ARES - Advanced Relation Extraction System

A local-first, deterministic engine for extracting entities and relations from narrative text. Builds knowledge graphs with full provenance tracking.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start spaCy parser (Terminal 1) - REQUIRED for full NER
make parser
# Wait for: "Application startup complete"

# 3. Run tests (Terminal 2)
npm test

# 4. Start dev server (optional)
make server-graphql  # GraphQL API on port 4000
```

**Note**: Without the spaCy parser, tests use MockParserClient with limited NER. Start the parser for production-quality extraction.

## Architecture Overview

```
Text → spaCy Parser → Entity Extraction → Relation Extraction → Knowledge Graph
           ↓                  ↓                   ↓
      Tokenization      3-Stage NER        Pattern Matching
      Dependency Parse  Alias Resolution   Inverse Generation
      POS Tagging       Coreference        Evidence Provenance
```

**Core Pipeline** (`app/engine/`):
- `extract/orchestrator.ts` - Main extraction coordinator
- `extract/entities.ts` - Entity extraction (NER, aliases, confidence)
- `extract/relations.ts` - Relation extraction (dependency patterns)
- `narrative-relations.ts` - Narrative pattern extraction
- `coref.ts` - Coreference resolution
- `merge.ts` - Cross-document entity merging

**Parser** (`app/parser/`):
- `HttpParserClient.ts` - Production spaCy client
- `MockParserClient.ts` - Test fallback (limited NER)

## Testing

**Test Ladder** (progressive difficulty):

| Level | Focus | Command |
|-------|-------|---------|
| 1 | Simple sentences | `npm test tests/ladder/level-1-simple.spec.ts` |
| 2 | Multi-sentence | `npm test tests/ladder/level-2-multisentence.spec.ts` |
| 3 | Complex narratives | `npm test tests/ladder/level-3-complex.spec.ts` |
| 5A | Cross-document | `npm test tests/ladder/level-5-cross-document.spec.ts` |
| 5B | Performance | `npm test tests/ladder/level-5b-performance.spec.ts` |

**Quality Targets**:
- Entity Precision: ≥80%, Recall: ≥75%
- Relation Precision: ≥80%, Recall: ≥75%

```bash
npm test                    # Run all tests
npm run test:ladder         # Run ladder tests only
make smoke                  # Quick validation
```

## Key Concepts

### Entity Types
`PERSON`, `ORG`, `PLACE`, `GPE`, `DATE`, `EVENT`, `ARTIFACT`, `RACE`, `DEITY`

### Relation Predicates
`parent_of`, `child_of`, `sibling_of`, `married_to`, `works_at`, `lives_in`, `taught`, `founded`, etc.

### HERT IDs
Hierarchical Entity Reference Tags - stable, compact entity identifiers with provenance.
Format: `HERTv1:1J8trXOyn4HRaWXrdh9TUE` encodes entity ID, alias, document, position.

## Configuration

```bash
# Parser selection
PARSER_BACKEND=http|mock|embedded  # Default: auto (http → mock fallback)
PARSER_URL=http://127.0.0.1:8000   # Parser service URL

# Debug modes
L3_DEBUG=1                         # Verbose extraction logging
L3_TRACE=1                         # Span tracing
```

## Project Structure

```
ARES/
├── app/
│   ├── engine/          # Extraction engine
│   │   ├── extract/     # Entity & relation extraction
│   │   ├── hert/        # HERT encoding
│   │   └── linguistics/ # Language processing utilities
│   ├── parser/          # spaCy parser clients
│   ├── storage/         # SQLite persistence
│   ├── api/             # GraphQL API
│   └── ui/              # Web interfaces
├── tests/
│   ├── ladder/          # Progressive test ladder
│   └── entity-extraction/  # Entity regression tests
├── scripts/
│   └── parser_service.py   # spaCy service
└── docs/                # Reference documentation
```

## Documentation

- `ARCHITECTURE.md` - Detailed pipeline and design decisions
- `CONTRIBUTING.md` - Development workflow and conventions
- `docs/LINGUISTIC_REFERENCE.md` - Language patterns for debugging
- `docs/architecture/` - Technical design documents

## License

MIT
