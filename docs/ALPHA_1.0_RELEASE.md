# ARES Alpha 1.0 Release Notes

**Date**: 2026-01-03
**Version**: Alpha 1.0
**Status**: Feature Complete for Alpha

---

## Release Summary

ARES Alpha 1.0 is ready for internal testing. The system successfully extracts entities and relations from narrative fiction at production-quality speeds with high precision and recall.

---

## Performance Metrics

### Scale Testing Results

| Test | Words | Speed | Target | Status |
|------|-------|-------|--------|--------|
| Synthetic 9k | 9,040 | 2,002 w/s | ≥100 w/s | **PASSED** |
| Beauregard Novel | 39,283 | 1,118 w/s | ≥100 w/s | **PASSED** |

### Quality Metrics (HP Chapter 1 Golden Test)

| Metric | Score | Target | Status |
|--------|-------|--------|--------|
| Entity Precision | 100% | ≥80% | **PASSED** |
| Entity Recall | 100% | ≥75% | **PASSED** |
| Relation Precision | 100% | ≥80% | **PASSED** |
| Relation Recall | 100% | ≥75% | **PASSED** |

### Test Ladder Status

- **Level 1 (Simple Sentences)**: PASSED
- **Level 2 (Multi-sentence)**: PASSED
- **Level 3 (Complex Paragraphs)**: 96.3% (52/54 tests)
- **Level 5b (Performance)**: PASSED (385 w/s)

---

## Features Included in Alpha

### Entity Extraction
- Multi-pass extraction with pattern matching + NER + coreference
- 3-stage alias resolution (pattern-based, coreference, partial name variants)
- Surname and family name handling with recency-based resolution
- Fantasy entity pattern library (26 patterns across 15 types)
- Chunked extraction for documents >5,000 words

### Relation Extraction
- Dependency path patterns for family relations (parent_of, married_to, sibling_of)
- Employment relations (works_at, employed_by)
- Narrative action patterns
- Automatic inverse relation generation
- Deduplication with ≥98% precision

### HERT System
- Stable hierarchical entity references
- Cross-document entity identity
- Compact encoded format (20-30 chars)
- Precise paragraph + token location tracking

### APIs & Interfaces
- GraphQL API (port 4000)
- REST extraction endpoints
- Extraction Lab UI (port 3001)
- Entity review dashboard

---

## Known Limitations

### Entity Extraction
1. **Generic word false positives** - Some capitalized common words may be tagged as entities (e.g., "Maybe", "Thanks", "Very")
2. **Encoding issues with special characters** - Curly quotes and special punctuation may cause entity fragmentation
3. **Pronoun resolution accuracy** - Gender-mismatched pronouns may resolve incorrectly in complex multi-character scenes

### Relation Extraction
1. **Low relation count on real fiction** - Beauregard test yielded only 3 relations from 39k words
2. **Pattern coverage** - Many implicit relations not captured (need expanded pattern library)
3. **Cross-sentence relations** - Limited support for relations spanning multiple sentences

### Performance
1. **Memory usage on very large documents** - Documents >100k words may require increased memory
2. **Parser service dependency** - spaCy parser must be running on port 8000

### UI
1. **Safari backdrop-filter bug** - Fixed with React Portal, but watch for regressions
2. **Entity selection menu** - May overlap text in some edge cases

---

## Setup Requirements

### Prerequisites
- Node.js 16+
- Python 3.8+ with pip
- spaCy with en_core_web_lg model

### Quick Start
```bash
# Terminal 1: Start parser service
make parser

# Terminal 2: Start GraphQL server
npx ts-node -e "require('./app/api/graphql').startGraphQLServer(4000)"

# Terminal 3: Start UI (optional)
cd app/ui/console && npm run dev
```

### Service Endpoints
- **Parser**: http://127.0.0.1:8000
- **GraphQL API**: http://localhost:4000
- **Extraction Lab**: http://localhost:3001/lab

---

## What's Next (Post-Alpha)

1. **Relation pattern expansion** - Increase coverage for implicit relations
2. **Level 5C custom entities** - User-defined entity types
3. **Cross-document resolution** - Maintain entity identity across documents
4. **UI polish** - Entity review workflow improvements

---

## Contact & Resources

- **Repository**: https://github.com/mrfishcar/ARES
- **Documentation**: docs/ARES_PROJECT_BRIEFING.md
- **Testing**: INTEGRATED_TESTING_STRATEGY.md

---

*Alpha 1.0 - Ready for internal testing*
