---
archived: true
archived_date: 2025-11-13
replaced_by: /docs/STATUS.md
reason: Pattern integration historical status
original_date: 2025-11-10
---

# Pattern Integration Status

## Overview

This document tracks the integration status of the 476 generated relation patterns across 15 families.

**Generated:** 2025-11-10
**Last Updated:** 2025-11-10
**Commit:** 19733c6

## Integration Approach

Patterns are integrated via **hybrid mode** using `config/hybrid_families.json`, which specifies which pattern families to activate. This approach:

- ✅ Keeps changes isolated and feature-flagged
- ✅ Allows gradual rollout with precision guardrails
- ✅ Respects existing pattern signatures (no duplicates)
- ✅ Maintains schema consistency

## Top 2 Missing Families (Wired)

### 1. CREATION (36 patterns) ✅ INTEGRATED

**Status:** Added to hybrid_families.json on 2025-11-10

**Patterns Include:**
- `painted`, `painted_by` - artistic creation
- `authored`, `written_by` - literary creation
- `composed`, `composed_by` - musical creation
- `designed`, `designed_by` - architectural/design creation
- `sculpted` - sculptural creation
- `invented`, `invented_by` - invention
- `built`, `built_by` - construction
- `created`, `created_by` - general creation

**Coverage:**
- 18 surface patterns
- 18 dependency patterns
- Covers 9 creation-related predicates

**Rationale:**
Creation relations are critical for:
- Historical texts (Shakespeare wrote Hamlet)
- Art/cultural corpora (Da Vinci painted Mona Lisa)
- Scientific texts (Einstein developed relativity)
- Fiction (Tolkien authored LOTR)

Previously showed 0% recall on synthetic corpus. Integration enables extraction of authorship, artistic creation, and invention relations.

### 2. LOCATION (34 patterns) ✅ INTEGRATED

**Status:** Already in hybrid_families.json, confirmed on 2025-11-10

**Patterns Include:**
- `located_in`, `located_at` - spatial containment
- `near`, `adjacent_to`, `across_from` - proximity
- `based_in` - organizational location
- `north_of`, `south_of`, `east_of`, `west_of` - directional
- `within`, `inside` - containment

**Coverage:**
- 17 surface patterns
- 17 dependency patterns
- Covers 12 location-related predicates

**Rationale:**
Location relations are essential for:
- Geographic texts (Paris is located in France)
- Organizational data (Google is based in Mountain View)
- Historical narratives (The battle occurred near Waterloo)
- Fiction (Hogwarts is located in Scotland)

Was previously integrated but showed 0% recall, suggesting pattern quality issues or entity extraction problems.

## Other Integrated Families

### 3. OWNERSHIP (29 patterns) ✅ INTEGRATED

**Status:** Already in hybrid_families.json

Covers: `owns`, `possessed_by`, `belongs_to`, `property_of`, `acquired`

### 4. COMMUNICATION (34 patterns) ✅ INTEGRATED

**Status:** Already in hybrid_families.json

Covers: `told`, `wrote_to`, `said_to`, `spoke_to`, `asked`, `informed`, `replied`, `reported`

## Remaining Families (Not Yet Integrated)

| Family | Patterns | Status | Rationale |
|--------|----------|--------|-----------|
| **temporal** | 34 | Pending evaluation | Time relations need careful ordering semantics |
| **comparison** | 32 | Pending evaluation | Comparative relations need magnitude/scale handling |
| **emotional** | 32 | Pending evaluation | Sentiment relations need confidence scoring |
| **power** | 31 | Pending evaluation | Authority relations overlap with employment |
| **employment** | 31 | Pending evaluation | Already have 75 existing patterns, need dedup |
| **causation** | 31 | Pending evaluation | Causal relations need temporal ordering |
| **part_whole** | 31 | Pending evaluation | Compositional relations need hierarchy tracking |
| **identity** | 31 | Pending evaluation | Alias relations need careful entity merging |
| **kinship** | 29 | Pending evaluation | Already have 27 existing patterns, need dedup |
| **event** | 30 | Pending evaluation | Event participation needs event entity linking |
| **negation** | 31 | Pending evaluation | Negation needs special uncertainty handling |

## Integration Metrics (Baseline)

**Before Integration:**
- Total Generated: 476 patterns
- Total Integrated: 0 patterns
- Overall Coverage: 0%

**After Integration (Creation + Location confirmed):**
- Total Generated: 476 patterns
- Total Integrated: 70 patterns (Creation: 36, Location: 34)
- Overall Coverage: 14.7%
- Additional: Ownership (29), Communication (34) = 133 total (27.9%)

## Precision Guardrails

All integrated families must pass:
- ✅ `min_synthetic_recall >= 0.85` - Must catch 85%+ of gold relations
- ✅ `min_canary_recall >= 0.75` - Must work on real-world text
- ✅ `max_precision_drop <= 0.05` - Must not increase false positives by >5%

Families failing these thresholds will be disabled until patterns are refined.

## Next Steps

1. **Evaluate Creation patterns** on synthetic + canary corpora (after entity quality improvements)
2. **Debug Location patterns** - investigate why 0% recall despite integration
3. **Review pattern quality** - some generated patterns have incorrect predicate assignments
4. **Gradual rollout** - add temporal, comparison, and emotional families next
5. **Pattern refinement** - fix predicate mismatches in generated patterns

## Known Issues

1. **Pattern Predicate Mismatches:**
   - Some generated patterns have incorrect predicates (e.g., `created` → `created_by` should be reversed)
   - Requires manual review and correction before full deployment

2. **Entity Extraction Quality:**
   - Low recall may be due to entity extraction failures, not pattern failures
   - Entity quality improvements (name normalization, type classification) needed

3. **Duplicate Signatures:**
   - Some generated patterns may duplicate existing patterns (38 skipped during generation)
   - Hybrid mode prevents duplication by signature matching

## Documentation

- Pattern Generation: `scripts/pattern-expansion/README.md`
- Hybrid Mode Config: `config/hybrid_families.json`
- Integration Audit: `reports/pattern_integration_audit.json`
- Evaluation Results: `reports/relation_coverage.json`
