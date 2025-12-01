# ARES Coding Agent Instructions v2 - THE REAL PROBLEM
- Date: 2025-11-11
- Task: Fix Stage 2 recall gap via pattern expansion or confidence tuning
- Priority: High; recall 71.1% vs target 80%
- Estimated Time: 4-6 hours (Option A quick win ~30 min)

---

## Critical Note
- Ignore v1 proximity-filter instructions; they were implemented and did not improve recall because filtering rarely triggers.
- Actual issue: under-extraction.

## Setup
- Update main branch and confirm proximity helper exists:
  ```bash
  git checkout main
  git pull origin main
  grep -n "hasMarriedToInProximity" app/engine/extract/orchestrator.ts
  npm install
  ```
- Start parser (required):
  ```bash
  make parser
  # Wait for "SpaCy parser running on port 8000"
  ```

## Current Status
- Metrics:
  | Metric | Current | Target | Gap | Diagnosis |
  |--------|---------|--------|-----|-----------|
  | Stage 2 Precision | 86.7% | 85% | +1.7% | ✅ accurate |
  | Stage 2 Recall | 71.1% | 80% | -8.9% | ❌ missing relations |
  | Stage 2 F1 | ~78% | 82% | -4% | ❌ |
- Filtering did not help; logs show no married_to/parent_of suppression.

## Root Causes
- Pattern coverage 26% (480/1827); need 40%+ for +5-7% recall.
- Confidence threshold 0.70 likely too strict; try 0.60-0.65 for +2-4% recall.
- Low coverage families: LOCATION 18%, PART_WHOLE 10%, EMPLOYMENT 16%, CREATION 25%.

## Solution Options
### Option A: Quick Confidence Test (try first, ~30 min)
- Lower ARES_MIN_CONFIDENCE and run Stage 2 test:
  ```bash
  ARES_MIN_CONFIDENCE=0.65 npm test tests/ladder/level-2-multisentence.spec.ts
  ARES_MIN_CONFIDENCE=0.60 npm test tests/ladder/level-2-multisentence.spec.ts
  ARES_MIN_CONFIDENCE=0.55 npm test tests/ladder/level-2-multisentence.spec.ts
  ```
- Success if recall ≥78%, precision ≥83%, F1 ≥81%.
- If best threshold found, update default in `app/engine/extract/orchestrator.ts`:
  ```typescript
  const minConfidence = parseFloat(process.env.ARES_MIN_CONFIDENCE || '0.65');
  ```
- If this fixes metrics, commit and stop.

### Option B: Pattern Expansion (4-6 hours, if Option A insufficient)
- Goal: raise coverage to ≥35-40% by adding ~50 patterns.
- Key references: `patterns/new_dependency_patterns.json`, `patterns/new_surface_patterns.json`, `app/engine/extract/relations.ts`, `app/engine/narrative-relations.ts`.
- Pattern formats remain unchanged (dependency: predicate/dep_path/constraints/confidence; surface: regex/predicate/typeGuard).
- Selection rules: confidence ≥0.75; prioritize families under 30% and common predicates (works_at, lives_in, part_of, created_by).
- Target additions: 14 LOCATION, 12 PART_WHOLE, 12 EMPLOYMENT, 12 CREATION.

#### Integration Steps
1. Inspect pattern inventories:
   ```bash
   npx ts-node scripts/pattern-expansion/inventory-patterns.ts
   # Output: reports/rung1_pattern_coverage_summary.md
   ```
2. Add dependency patterns to `RELATION_PATTERNS` in `app/engine/extract/relations.ts` (examples: located_in, lives_in, works_for, part_of with proper constraints and confidence ~0.75-0.85).
3. Add surface patterns to `narrativePatterns` in `app/engine/narrative-relations.ts` (examples: created predicates capturing authored/wrote/created with typeGuard { subj: ['PERSON'], obj: ['WORK'] }).
4. Test every 10-15 patterns:
   ```bash
   npm test tests/ladder/level-2-multisentence.spec.ts
   npx ts-node scripts/pattern-expansion/inventory-patterns.ts
   ```
   - Track recall, keep precision >83%; monitor new false positives.
5. Validation:
   ```bash
   make test
   npm test tests/ladder/level-1-simple.spec.ts
   npm test tests/ladder/level-3-complex.spec.ts
   npm test tests/ladder/level-2-multisentence.spec.ts
   ```
   - Success: avgRelationP ≥83-84%, avgRelationR ≥78%, relationF1 ≥80-81%, coverage ≥35-40%.

## Required Reading (10 min)
- `scripts/pattern-expansion/README.md`: pattern generation.
- `reports/rung1_pattern_coverage_summary.md`: current coverage.
- Existing patterns in `app/engine/extract/relations.ts` and `app/engine/narrative-relations.ts` to match format.

## Testing Strategy
- Quick threshold loop:
  ```bash
  for threshold in 0.65 0.60 0.55; do
    echo "Testing threshold: $threshold"
    ARES_MIN_CONFIDENCE=$threshold npm test tests/ladder/level-2-multisentence.spec.ts 2>&1 | grep "avgRelation"
    echo "---"
  done
  ```
- Pattern addition: add 15 → test → measure; repeat until ~50 total.

## Success Criteria
- Minimum: recall ≥75%, precision ≥83%, F1 ≥79.
- Target: recall ≥78%, precision ≥84%, F1 ≥81, coverage ≥35%.
- Stretch: recall ≥80%, precision ≥85%, F1 ≥82, coverage ≥40%, Stage 2 test passes.

## Troubleshooting
- If thresholds fail, drop to 0.55 or 0.50; if precision collapses, proceed with pattern expansion.
- For new pattern errors: check predicate names match schema, regex escapes, and typeGuard constraints; verify with `npx tsc --noEmit`.
