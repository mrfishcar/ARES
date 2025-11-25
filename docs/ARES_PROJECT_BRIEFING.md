# ARES Project Briefing - Iteration 37

**Date**: 2025-11-25
**Project**: Advanced Relation Extraction System (ARES)
**Current Focus**: Entity Extraction & Alias Resolution

---

## Executive Summary

ARES is an entity and relation extraction system with advanced alias matching, coreference resolution, and multi-language support. The system has reached Iteration 37 with partial name variant matching recently implemented. Current test baseline: **7/28 passing** (25%) on the entity extraction regression suite, with recent work improving complex person entity handling.

---

## System Architecture

### Core Pipeline: Entity Extraction (`app/engine/extract/entities.ts`)

The extraction pipeline has three main alias-matching stages:

**Stage 1: Pattern-Based Aliases** (Lines 2762-2853)
- Extracts explicit alias patterns: "is often called 'Jim'", "known as", etc.
- Status: ✅ **Working**
- Example: "James Robert Wilson is often called 'Jim'" → aliases include "Jim"

**Stage 2: Coreference Resolution** (Lines 2855-2891)
- Resolves pronouns and descriptive references using sentence segmentation and coref links
- Filters context-dependent pronouns to avoid false alias inclusion
- Status: ✅ **Working**
- Example: "he" resolves to "John" when in same coreference chain

**Stage 3: Partial Name Variant Matching** (Lines 2891+)
- Recently implemented (Iteration 37)
- Matches implicit partial mentions (first/last/middle names) from compound person names
- Uses proximity gating (~500 chars) to avoid false positives
- Status: ✅ **Implemented**, validation pending

---

## Current Test Status

### Entity Extraction Regression Suite
- **File**: `tests/entity-extraction/extraction.spec.ts`
- **Test Cases**: 28 total
- **Baseline (Iteration 36)**: 7/28 passing (25%)
- **Latest Results (Iteration 37)**: Full suite not yet re-run post-partial-name-matching implementation

### Key Test Cases

**Passing Tests**:
- `basic-person-001`: "James Robert Wilson" with aliases ["Jim", "Wilson"] ✅

**Target Tests for Recent Work**:
- `complex-person-002`: Multiple persons with informal references
  - Expected: Sarah Johnson-Smith (aliases: ["Sarah"]), Michael Smith (aliases: ["Mike"]), Emma Smith (aliases: ["Em"])
  - Status: Partial-name matching now implemented to handle these cases
- `historical-context`: Persons in historical text
- `multilingual`: Persons with non-English names and variants

**Major Failing Clusters**:
- Missing ORGANIZATION entities: Apple, TechCrunch, FBI, CIA, NSA, TechCorp, Stanford, IBM
- Missing LOCATION entities: New York City, University of California Berkeley, Silicon Valley
- Missing ITEM entities: iPhone 15 Pro, React.js
- Missing DATE entities: January 15 2024, Hundred Years' War dates
- Missing PERSON variants: Elon Musk, Biden, complex name normalizations (Murakami-sensei/村上 春樹)
- Alias extraction failures: pronoun aliases ("He"/"His"), short-form names (Sarah from Sarah Johnson-Smith) - **partially addressed by Iteration 37 work**

---

## Recent Work (Iteration 37)

### Partial Name Variant Matching Implementation

**Problem Addressed**:
When a full person name like "Sarah Johnson-Smith" appears in text WITH partial mentions like "Sarah" or "Smith" appearing later, the system was not recognizing these as aliases of the same entity.

**Solution Implemented**:
Added comprehensive partial name matching logic:

1. **Name Decomposition**: Extract first/last/middle/hyphenated parts from compound names
   - "Sarah Johnson-Smith" → partials: ["Sarah", "Johnson", "Smith"]

2. **Proximity Gating**: Only match partials within ~500 characters of full name first occurrence
   - Prevents matching unrelated people with same first name elsewhere in text

3. **Entity Merging**: When abbreviated first names match (Mike/Michael), consolidates entities
   - Mike → merged into Michael entity with alias "Mike"

4. **Name Promotion**: Single-token names promoted to include nearby surname
   - Emma → Emma Smith with alias "Em"

5. **Title Consolidation**: Title-prefixed variants merged into base entity
   - "Professor Wei" → merged into "Wei Chen" as alias

**Test Validation**:
- `complex-person-002` targeted for validation
- Merges confirmed: Mike/Smith consolidated, Emma promoted to Emma Smith with alias Em
- Pending full-suite re-run to confirm overall improvement

**Expected Impact**:
- Target: 18-22/28 tests passing (65-79% improvement from current 25%)
- Should resolve most multi-person test failures (complex-person-*, historical-*, multilingual-*)

---

## Known Issues & Blockers

### Test Failures by Category

**Entity Type Coverage Gaps**:
- ORGANIZATION: Multiple major companies/institutions missing from extraction
- LOCATION: Geographic entities inconsistently extracted
- DATE: Normalizing spelled-out years to numeric canonicals, but some dates still missed
- ITEM: Technology products/languages often missed

**Alias/Variant Issues**:
- Pronoun aliases filtered out (context-dependent designation)
- Short-form names partially addressed (Sarah from Sarah Johnson-Smith) - **Iteration 37 work**
- Non-English name variants (Murakami-sensei/村上 春樹) still problematic

**Infrastructure Issues**:
- **Port Binding**: `startGraphQLServer` expects dual-port model (port + 100 offset for metrics/wiki)
  - Current EPERM errors handled via in-memory HTTP fallback
  - Needs proper socket binding to 127.0.0.1 with offset port

- **Wiki Generation**: Missing `./exposition` import in `wiki-metrics.spec.ts`

- **Performance**: `level-5b-performance.spec.ts` exceeds 500ms threshold (547ms)

- **Watch Ingestion**: File detection tests not capturing add events within 500ms window

- **Span Tracking**: Some entities (Apple, iPhone) present in span trace but absent in final output
  - Likely merge/quality-filter issue during entity consolidation

---

## Architecture Notes

### Confidence Scoring
- New entities created with confidence: 0.99
- Allows test normalization and quality filtering
- File: `app/engine/extract/entities.ts`

### Type Normalization (Test Layer)
- ORGANIZATION → ORG
- LOCATION → PLACE
- PRODUCT/SOFTWARE_LIBRARY → ITEM
- LAW → WORK
- Applied in `tests/entity-extraction/extraction.spec.ts`

### Parser Fallback
- Primary parser unavailable (HTTP/embedded modes)
- Using heuristic NER with dependency-based extraction
- MockParserClient provides NER tags for spaCy pipeline

---

## Next Steps

### Immediate Priorities
1. **Full Test Suite Validation**: Re-run `npx vitest tests/entity-extraction/extraction.spec.ts` to measure improvement from Iteration 37 partial-name-matching work
2. **Resolve Port Binding**: Fix dual-port expectations in `startGraphQLServer`
3. **Address Wiki Metrics**: Add missing `./exposition` import for markdown generation
4. **Investigate Span Merge Issues**: Why Apple/iPhone present in traces but missing in final entities

### Medium-Term Work
- Broaden entity type coverage (ORGANIZATION, LOCATION, DATE, ITEM)
- Improve non-English name variant handling
- Optimize performance for long-corpus processing
- Fix watch ingestion timing issues

### Architectural Improvements Needed
- Better entity deduplication logic when spans overlap
- Coreference chain confidence scoring
- Quality filtering thresholds for borderline entities

---

## Code References

**Key Files**:
- `app/engine/extract/entities.ts` - Core extraction pipeline (2898 lines)
- `tests/entity-extraction/extraction.spec.ts` - Regression test suite
- `tests/entity-extraction/test-cases/001-basic-aliases.json` - Test case definitions

**Recent Commits**:
- Iteration 37: Partial name variant matching implementation (in progress)
- Iteration 36: Architectural design documentation
- Previous: Confidence field addition, watcher timeout extension

---

## Testing Guide

### Run Entity Extraction Tests
```bash
# Full regression suite
npx vitest tests/entity-extraction/extraction.spec.ts

# Specific test case
npx vitest tests/entity-extraction/extraction.spec.ts -t "complex-person-002"

# With debug output
L3_DEBUG=1 npx vitest tests/entity-extraction/extraction.spec.ts -t "complex-person-002"
```

### Check Span Traces
```bash
# View span trace for debugging entity boundary issues
cat tmp/span-trace.log | head -50
```

---

## Role Structure for Future Work

When working with Claude deployments:
- **Claude**: System architecture, root cause analysis, design directives
- **Codex**: Implementation, testing, debugging, repetitive mechanical work
- Coordinate via handoff documents when switching focus between high-level design and execution

