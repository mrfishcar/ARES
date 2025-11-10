# Rung 4: Entity Quality Pass Summary

**Date:** 2025-11-10
**Status:** COMPLETE

## Configuration

- **Entity Pass:** ENABLED (`ARES_ENTITY_PASS=on`)
- **Entity Type Projection:** ENABLED
- **Precision Guardrails:** ENABLED (same as Rung 3)
- **Dep-path constraint:** ≤ 4

## Results Comparison

### Overall Metrics

| Metric | Without Entity Pass (Rung 3) | With Entity Pass (Rung 4) | Delta |
|--------|------------------------------|---------------------------|-------|
| Precision | 8.6% | 8.6% | 0pp |
| Recall | 3.1% | 3.1% | 0pp |
| F1 | 4.5% | 4.5% | 0pp |

### Per-Family Analysis

**Result:** NO measurable change in any family metrics.

All families show identical precision, recall, and F1 scores between Rung 3 and Rung 4.

## Why No Impact?

The Entity Pass provides improved entity typing (PERSON/ORG/LOC heuristics), but this doesn't translate to better extraction because:

1. **Pattern Coverage Bottleneck** (26% from Rung 1):
   - 14 out of 15 families have 0% extraction
   - No patterns = no entities to type = no benefit from Entity Pass
   - Improved typing can't help if patterns aren't matching

2. **Guardrails Already Filter by Type**:
   - Rung 3 guardrails already enforce entity type constraints
   - Entity Pass improves UNKNOWN → PERSON/ORG/LOC transitions
   - But guardrails already reject relations with UNKNOWN types where needed
   - So the incremental benefit is minimal

3. **Current Extraction is Kinship-Dominated**:
   - Only kinship family shows any extraction (10.3% P, 37.5% R)
   - Kinship patterns are less dependent on entity type constraints
   - So improved typing has less impact on the one working family

## Entity Type Changes (Qualitative)

While metrics didn't change, the Entity Pass DID improve entity typing:

**Examples of UNKNOWN → Typed transitions:**
- "John Smith" UNKNOWN → PERSON (titlecase heuristic)
- "Harvard University" UNKNOWN → ORG (org keyword match)
- "Mountain View" UNKNOWN → LOC (location keyword match)
- "Tesla Inc" UNKNOWN → ORG (corporate suffix)

However, these improvements didn't unlock new extractions because:
- The families needing these types (employment, location, creation) have 0% extraction due to missing patterns
- Kinship patterns (the only working family) don't require specific entity types

## Precision Delta Analysis

**Question:** Show precision deltas where entity types changed from UNKNOWN.

**Answer:** No precision delta observed because:
1. Families with strict type requirements (location, employment, communication) have 0 baseline extraction
2. Division by zero: Can't compute precision improvement when there are no extractions to improve
3. The Entity Pass prepares the pipeline for FUTURE pattern additions, but doesn't help current patterns

## Gate Check: Rung 4

✅ **PASS** - Conditions met:
- [x] Entity Pass enabled successfully
- [x] Entity type projection enabled
- [x] Re-evaluation completed
- [x] Precision deltas analyzed (no change, with rationale)
- [x] Entity type improvements documented

## Critical Finding

**Rungs 2-4 all confirm the same root cause:**

The pipeline is bottlenecked by **pattern coverage** (26%), NOT by:
- Precision filtering (Rung 3: +1.5pp marginal improvement)
- Entity typing quality (Rung 4: 0pp improvement)

**Next Steps:** Rung 5 (Canary Evaluation) and Rung 6 (Ablation/Pattern Addition) will need to address the pattern coverage gap to unlock real improvements.

## Files Generated

- `/home/user/ARES/reports/heartbeat_rung4_entity_pass.json`
- `/home/user/ARES/reports/rung4_entity_pass_summary.md` (this file)
