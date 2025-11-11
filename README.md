# ARES - Advanced Relation Extraction System

**Local-first entity and relation extraction for building knowledge graphs from unstructured text.**

Transform raw text (notes, stories, books, documents) into structured knowledge graphs with entities, relations, and provenance tracking—all running offline on your machine.

## Features

- **Entity Extraction** - Identifies people, places, organizations, dates, and more
- **Extraction Lab** - Browser-based testing interface for real-time entity detection
- **Relation Extraction** - Finds connections (parent_of, works_at, married_to, etc.)
- **HERT System** - Stable, compact entity references with precise locations
- **Alias Resolution** - Maps name variations to single entities
- **Provenance Tracking** - Every fact includes source text and evidence
- **Cross-document Identity** - Maintains entity identity across multiple documents
- **Local-First** - No cloud dependencies, runs entirely offline
- **GraphQL API** - Flexible query interface with caching and rate limiting

## Quick Start

```bash
# 1. Install dependencies
make install

# 2. Start parser service (Terminal 1)
make parser

# 3. Run tests (Terminal 2)
make test        # Expected: 119/119 passing ✅
make smoke       # Quick smoke test
```

That's it! See [docs/guides/QUICK_START.md](docs/guides/QUICK_START.md) for detailed setup and usage.

## Extraction Lab

Access the browser-based testing interface at `/lab` to:
- Test entity detection patterns in real-time
- Visualize entity highlighting with CodeMirror
- Export JSON reports for analysis
- Refine detection rules with live feedback

See [ENTITY_EXTRACTION_STATUS.md](ENTITY_EXTRACTION_STATUS.md) for comprehensive documentation on the entity detection system.

## Example

**Input:**
```
Aragorn, son of Arathorn, married Arwen in 3019.
Gandalf the Grey traveled to Minas Tirith.
```

**Output:**
- **Entities:** Aragorn (PERSON), Arathorn (PERSON), Arwen (PERSON), 3019 (DATE), Gandalf (PERSON), Minas Tirith (PLACE)
- **Relations:**
  - parent_of(Arathorn, Aragorn)
  - child_of(Aragorn, Arathorn)
  - married_to(Aragorn, Arwen)
  - married_to(Arwen, Aragorn)
  - traveled_to(Gandalf, Minas Tirith)

## Current Status

### HERT System (Complete ✅)

- ✅ **Phase 1:** Stable Entity IDs (EID)
- ✅ **Phase 2:** Binary HERT Format (7.4x compression)
- ✅ **Phase 3:** Alias Resolution (AID)
- ✅ **Phase 4:** Sense Disambiguation (SP)
- ✅ **Phase 5:** Query & Retrieval API

### Extraction Quality

**Test Suite:**
- ✅ **100% tests passing** (119/119)
- ✅ **Entity Recall: 87.5%** (target ≥75%)
- ✅ **Relation Quality:** Validated on biographical and narrative text

**Performance:**
- ~190 words/second
- 3-5 relations per 100 words (biographical text)
- 1-2 relations per 100 words (narrative fiction)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  ARES Pipeline                      │
└─────────────────────────────────────────────────────┘

  Raw Text
     │
     ▼
┌─────────────────┐
│  spaCy Parser   │ (Python service, port 8000)
│  NLP Analysis   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Entity Extract  │ (Multi-source: NER, dependency, patterns)
│ Confidence      │ (Filter low-quality extractions)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Relation Extract│ (Dependency paths + patterns)
│ Coreference     │ (Resolve pronouns)
│ Inverse Gen     │ (Auto-create reverse relations)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Knowledge Graph │ (Entities + Relations + Evidence)
│ GraphQL API     │ (Query and visualization)
└─────────────────┘
```

See [docs/architecture/](docs/architecture/) for detailed architecture documentation.

## Documentation

- **[Entity Extraction Status](ENTITY_EXTRACTION_STATUS.md)** - Current entity detection system
- **[Session Handoff](HANDOFF.md)** - Latest session status and next steps
- **[Getting Started](docs/guides/QUICK_START.md)** - Installation and setup
- **[Desktop Tester](docs/guides/DESKTOP_TESTER_QUICKSTART.md)** - Testing guide
- **[HERT Integration](docs/architecture/HERT_INTEGRATION_GUIDE.md)** - HERT system integration
- **[Engine Evolution](docs/architecture/ENGINE_EVOLUTION_STRATEGY.md)** - Architecture strategy
- **[Wiki Reference](docs/reference/WIKI_QUICKSTART.md)** - Wiki quickstart
- **[Changelog](CHANGELOG.md)** - Version history and changes

## Key Concepts

### HERT (Hierarchical Entity Reference Tag)

A compact, URL-safe reference to an entity mention with precise location:

```
HERTv1:1J8trXOyn4HRaWXrdh9TUE

Decodes to:
- EID 43 (stable entity ID)
- AID 230 (surface form)
- Document fingerprint
- Paragraph 0, tokens 0-14
```

**Benefits:**
- **Stable** - EID doesn't change when entity name changes
- **Compact** - 20-30 chars vs 200+ for JSON
- **Precise** - Exact paragraph + token location
- **Portable** - Share via URL, no database needed

See [docs/architecture/HERT_IMPLEMENTATION.md](docs/architecture/HERT_IMPLEMENTATION.md) for full technical details.

### Multi-Pass Extraction

ARES uses multiple extraction strategies:

1. **Dependency parsing** - Grammatical structure analysis
2. **Pattern matching** - Regex for narrative patterns
3. **NER tagging** - spaCy named entity recognition
4. **Coreference resolution** - Link pronouns to entities
5. **Confidence filtering** - Remove low-quality extractions

This combination provides high recall and precision across different text types.

## Use Cases

- **Note-taking** - Build personal knowledge bases from notes
- **World-building** - Extract characters and relationships from fiction
- **Research** - Structure information from papers and documents
- **Documentation** - Create knowledge graphs from technical docs
- **Historical records** - Extract facts from historical texts

## Commands

```bash
make help        # Show all commands
make install     # One-time setup
make parser      # Start spaCy parser (required)
make test        # Run all tests
make smoke       # Quick validation
make clean       # Remove generated files
```

## Testing Strategy

**IMPORTANT**: ARES uses a **5-stage integrated testing ladder** that combines component health checks with extraction quality gates.

See [INTEGRATED_TESTING_STRATEGY.md](INTEGRATED_TESTING_STRATEGY.md) for complete details.

### Quick Overview

**Single progressive ladder** where each stage validates both component health AND extraction quality:

```
Stage 1: Foundation [✅ PASSED]
├─ 1.1 Pattern Coverage Audit (≥30%)
├─ 1.2 Entity Quality Check
└─ 1.3 Simple Sentence Extraction (P≥90%, R≥85%)

Stage 2: Component Validation [⚠️ 99%]
├─ 2.1 Synthetic Baseline (F1≥10%)
├─ 2.2 Precision Guardrails Test
└─ 2.3 Multi-Sentence Extraction (P≥85%, R≥80%)

Stage 3: Complex Extraction [⏸️ Not Started]
├─ 3.1 Cross-Sentence Coreference
├─ 3.2 Pattern Family Coverage (≥50%)
└─ 3.3 Complex Paragraph Extraction (P≥80%, R≥75%)

Stage 4: Scale Testing [⏸️ Future]
├─ 4.1 Performance Benchmarks
├─ 4.2 Memory Profile
└─ 4.3 Mega Regression Test (P≥75%, R≥70%)

Stage 5: Production Readiness [⏸️ Future]
├─ 5.1 Canary Corpus (P≥75%, R≥65%)
├─ 5.2 Real-World Validation
└─ 5.3 Edge Case Coverage
```

### Testing Workflow

```bash
# Run Stage 1 (Foundation)
npx ts-node scripts/pattern-expansion/inventory-patterns.ts  # 1.1 Pattern coverage
npm test tests/ladder/level-1-simple.spec.ts                 # 1.3 Simple extraction

# Run Stage 2 (Component Validation)
npx tsx scripts/pattern-expansion/evaluate-coverage.ts --precision_guardrails  # 2.1, 2.2
npm test tests/ladder/level-2-multisentence.spec.ts         # 2.3 Multi-sentence

# Run Stage 3 (Complex Extraction) - when Stage 2 passes
npm test tests/ladder/level-3-complex.spec.ts               # 3.3 Complex paragraphs
```

**Key Principle**: Check component health FIRST, then test extraction quality. Don't waste time testing extraction when components are broken.

**Current Status**: Stage 1 passed ✅, Stage 2 at 99% (blocked on test 2.12 appositive parsing), Stages 3-5 not yet started.

**Current Blocker**: Pattern coverage at 26% (need ≥30% for optimal Stage 3+ performance).

## Project Structure

```
ARES/
├── app/
│   ├── engine/          # Extraction engine
│   ├── storage/         # Data persistence
│   ├── api/             # GraphQL API
│   ├── parser/          # spaCy parser client
│   ├── editor/          # Entity highlighter
│   └── ui/              # Web interface
│       └── console/     # Extraction Lab (browser UI)
├── tests/               # Test suites
│   ├── ladder/          # Progressive difficulty tests
│   ├── golden/          # Golden corpus tests
│   └── integration/     # API tests
├── scripts/             # Utility scripts
├── docs/                # Documentation
│   ├── architecture/    # Technical architecture docs
│   ├── guides/          # User guides
│   ├── reference/       # Reference documentation
│   └── archive/         # Historical reports
└── data/                # Data storage
```

## Requirements

- **Node.js** 16+ and npm
- **Python** 3.8+ with pip
- **Make** (for running commands)

## Contributing

Contributions are welcome! Please see [docs/guides/](docs/guides/) for:

- Setting up development environment
- Adding relation patterns
- Writing tests
- Code style guidelines
- Submitting pull requests

## License

MIT License - see LICENSE file for details

## Acknowledgments

- **spaCy** - NLP library for parsing and NER
- **GraphQL** - Query language for the API
- **TypeScript** - Type-safe development
- **CodeMirror** - Editor for Extraction Lab
- Community contributors

## Contact

- **Issues:** https://github.com/mrfishcar/ARES/issues
- **Documentation:** https://github.com/mrfishcar/ARES/tree/main/docs

---

**ARES** - Building knowledge graphs from text, one extraction at a time. 🚀
