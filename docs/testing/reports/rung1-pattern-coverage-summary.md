# Rung 1: Pattern Coverage / Inventory Summary

**Date:** 2025-11-10
**Status:** COMPLETE

## Inventory Results

### Current Integration Status
- **Total Integrated Patterns:** 480 patterns
  - Dependency patterns: 443
  - Surface patterns: 37
  - Unique signatures: 474

### Generated but Not Integrated
- **Total Generated Patterns:** 476 patterns
- **Total Integrated:** 125 (26% coverage)
- **Total Missing:** 351 (74% unintegrated)

## Missing Patterns by Family

### Top 5 Families with Largest Gaps

1. **NEGATION** - 31 patterns (0% coverage)
   - Examples: `not_related_to`, `alleged`, `rumored`, `denied`, `disputed`
   - Status: NEW family, not in original predicate map

2. **LOCATION** - 28 patterns (18% coverage, 6/34 integrated)
   - Examples: `located_in`, `near`, `within`, `based_in`, `north_of`
   - Status: Core family, needs expansion

3. **PART_WHOLE** - 28 patterns (10% coverage, 3/31 integrated)
   - Examples: `part_of`, `consists_of`, `includes`, `contains`, `made_of`
   - Status: Core family, needs expansion

4. **CREATION** - 27 patterns (25% coverage, 9/36 integrated)
   - Examples: `created_by`, `authored`, `written_by`, `invented_by`, `painted_by`
   - Status: Core family, moderate coverage

5. **EMPLOYMENT** - 26 patterns (16% coverage, 5/31 integrated)
   - Examples: `works_for`, `employed_by`, `member_of`, `affiliated_with`
   - Status: Core family, needs expansion

### Complete Family Coverage

| Family | Generated | Integrated | Missing | Coverage |
|--------|-----------|------------|---------|----------|
| negation | 31 | 0 | 31 | 0% |
| location | 34 | 6 | 28 | 18% |
| part_whole | 31 | 3 | 28 | 10% |
| creation | 36 | 9 | 27 | 25% |
| employment | 31 | 5 | 26 | 16% |
| temporal | 34 | 11 | 23 | 32% |
| communication | 34 | 11 | 23 | 32% |
| comparison | 32 | 9 | 23 | 28% |
| ownership | 29 | 7 | 22 | 24% |
| causation | 31 | 9 | 22 | 29% |
| power | 31 | 9 | 22 | 29% |
| emotional | 32 | 10 | 22 | 31% |
| kinship | 29 | 10 | 19 | 34% |
| event | 30 | 12 | 18 | 40% |
| identity | 31 | 14 | 17 | 45% |

## Decision: Integration Strategy

### Explicitly EXCLUDED Families
- **NEGATION** (31 patterns)
  - Reason: New family not in original design; requires separate uncertainty/modality handling
  - Recommendation: Defer to Phase 2 after core families stabilized

### To Be INTEGRATED (High Priority)
Based on coverage gaps and core relation importance:

1. **LOCATION** - Integrate 10 high-quality patterns (↑ to ~45% coverage)
2. **PART_WHOLE** - Integrate 10 high-quality patterns (↑ to ~40% coverage)
3. **EMPLOYMENT** - Integrate 8 high-quality patterns (↑ to ~40% coverage)
4. **CREATION** - Integrate 5 high-quality patterns (↑ to ~40% coverage)

**Total to integrate:** ~33 patterns
**Expected new coverage:** ~33% overall

## Gate Check: Rung 1

✅ **PASS** - Conditions met:
- [x] inventory-patterns.ts executed successfully
- [x] audit-integration.ts executed successfully
- [x] Diff of loaded vs missing patterns generated per family
- [x] Integration strategy decided (integrate 33 high-quality, exclude negation)

## Next Steps (Rung 2)

Before moving to synthetic evaluation:
1. Review and select specific high-quality patterns from priority families
2. Integrate selected patterns into extraction pipeline
3. Re-run inventory to confirm integration
4. Proceed to Rung 2: Synthetic Evaluation

## Files Generated

- `/home/user/ARES/patterns/_existing_surface.json` - Current surface patterns
- `/home/user/ARES/patterns/_existing_dependency.json` - Current dependency patterns
- `/home/user/ARES/patterns/_inventory_stats.json` - Pattern statistics
- `/home/user/ARES/patterns/_signatures_all_relations.json` - Pattern signatures
- `/home/user/ARES/reports/pattern_integration_audit.json` - Integration audit
- `/home/user/ARES/reports/rung1_pattern_coverage_summary.md` - This document
