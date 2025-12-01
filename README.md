# ARES - Advanced Relation Extraction System

Local-first entity and relation extraction to turn unstructured text into knowledge graphs with provenance.

## Features
- Entity extraction for people, places, organizations, dates, etc.
- Browser "Extraction Lab" for live testing and JSON exports.
- Relation extraction with inverse generation and pronoun resolution.
- HERT system for compact, stable entity references.
- Alias resolution and cross-document identity.
- Provenance on every fact.
- Offline-first operation with GraphQL API, caching, and rate limiting.

## Quick Start
```bash
make install       # Install
make parser        # Start parser (Terminal 1)
make test          # Expect 119/119 passing
make smoke         # Fast smoke test
```
More detail: [docs/guides/QUICK_START.md](docs/guides/QUICK_START.md).

## Extraction Lab (/lab)
- Live pattern tests and highlighting via CodeMirror.
- Export JSON reports.
- Iterate on rules with instant feedback.

Full extraction docs: [ENTITY_EXTRACTION_STATUS.md](ENTITY_EXTRACTION_STATUS.md).

## Example
Input: `Aragorn, son of Arathorn, married Arwen in 3019. Gandalf the Grey traveled to Minas Tirith.`
- Entities: Aragorn (PERSON), Arathorn (PERSON), Arwen (PERSON), 3019 (DATE), Gandalf (PERSON), Minas Tirith (PLACE)
- Relations: parent_of/child_of (Arathorn ↔ Aragorn), married_to (Aragorn ↔ Arwen), traveled_to (Gandalf → Minas Tirith)

## Current Status
- HERT: Phases 1–5 complete (IDs, binary format, aliases, senses, query API).
- Tests: 119/119 passing; entity recall 87.5% (target ≥75%); relations validated on narrative/biographical text.
- Performance: ~190 wps; ~3–5 relations per 100 words (bio), 1–2 (narrative).

## Architecture (high level)
spaCy parser → Entity extract (NER + deps + patterns, confidence filtering) → Relation extract (deps, patterns, coref, inverses) → Knowledge graph + GraphQL API. See [docs/architecture](docs/architecture/) for diagrams.

## Documentation
Key entries:
- [Entity Extraction Status](ENTITY_EXTRACTION_STATUS.md)
- [Session Handoff](HANDOFF.md)
- [Quick Start](docs/guides/QUICK_START.md)
- [Desktop Tester](docs/guides/DESKTOP_TESTER_QUICKSTART.md)
- [HERT Integration](docs/architecture/HERT_INTEGRATION_GUIDE.md)
- [Engine Evolution](docs/architecture/ENGINE_EVOLUTION_STRATEGY.md)
- [Wiki Quickstart](docs/reference/WIKI_QUICKSTART.md)
- [Changelog](CHANGELOG.md)

## Key Concepts
### HERT (Hierarchical Entity Reference Tag)
Compact entity reference with exact location. Example `HERTv1:1J8trXOyn4HRaWXrdh9TUE` decodes to EID 43, AID 230, document fingerprint, paragraph 0, tokens 0–14.
- Stable IDs unaffected by surface changes.
- ~20–30 chars; URL-safe.
- Precise paragraph/token pointers.

Details: [docs/architecture/HERT_IMPLEMENTATION.md](docs/architecture/HERT_IMPLEMENTATION.md).

### Multi-Pass Extraction
- Dependency parsing
- Pattern-based detection
- Co-reference resolution
- Alias normalization
- Human-in-the-loop corrections
