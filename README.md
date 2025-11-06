# ARES - Advanced Relation Extraction System

**Local-first entity and relation extraction for building knowledge graphs from unstructured text.**

Transform raw text (notes, stories, books, documents) into structured knowledge graphs with entities, relations, and provenance tracking—all running offline on your machine.

## Features

- **Entity Extraction** - Identifies people, places, organizations, dates, and more
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

That's it! See [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) for detailed setup and usage.

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

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

## Documentation

- **[Getting Started](docs/GETTING_STARTED.md)** - Installation, setup, first extraction
- **[Architecture](docs/ARCHITECTURE.md)** - System design and components
- **[Developer Guide](docs/DEVELOPER_GUIDE.md)** - Contributing and extending ARES
- **[API Reference](docs/API_REFERENCE.md)** - GraphQL API documentation
- **[HERT Specification](docs/HERT_SPECIFICATION.md)** - Technical spec for HERT encoding
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

See [docs/HERT_SPECIFICATION.md](docs/HERT_SPECIFICATION.md) for full technical details.

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

## Project Structure

```
ARES/
├── app/
│   ├── engine/          # Extraction engine
│   ├── storage/         # Data persistence
│   ├── api/             # GraphQL API
│   └── ui/              # Web interface
├── tests/               # Test suites
│   ├── ladder/          # Progressive difficulty tests
│   ├── golden/          # Golden corpus tests
│   └── integration/     # API tests
├── scripts/             # Utility scripts
├── docs/                # Documentation
└── data/                # Data storage
```

## Requirements

- **Node.js** 16+ and npm
- **Python** 3.8+ with pip
- **Make** (for running commands)

## Contributing

Contributions are welcome! Please see [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) for:

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
- Community contributors

## Contact

- **Issues:** https://github.com/yourusername/ARES/issues
- **Documentation:** https://github.com/yourusername/ARES/tree/main/docs

---

**ARES** - Building knowledge graphs from text, one extraction at a time. 🚀
