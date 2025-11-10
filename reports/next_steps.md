# Testing Ladder - Next Steps (R1 → R2)

**Baseline Status**: R1 - Synthetic Coverage Baseline
**Overall Metrics**: P=8.8% / R=2.9% / F1=4.3%
**Families Ready for Hybrid**: 0/15

---

## Prioritized Tasks

### 1. **[CRITICAL] Filter UNKNOWN Entities from Relation Extraction**

**Impact**: High (blocks 91% of false positives)
**Effort**: Low
**Gate**: Precision improves by >50% across all families

**What**:
The relation extractor is emitting relations with `subject="UNKNOWN"` or `object="UNKNOWN"` when entity resolution fails. This accounts for 91% of all false positives.

**How**:
```typescript
// In relation extraction pipeline (e.g., app/nlp/relations/extract-relations.ts)
function finalizeRelation(rel: Relation): Relation | null {
  if (!rel.subject || rel.subject === 'UNKNOWN' ||
      !rel.object || rel.object === 'UNKNOWN') {
    return null;  // Drop this relation
  }
  return rel;
}
```

**Validation**:
```bash
npx tsx scripts/pattern-expansion/evaluate-coverage.ts
# Expect: Precision >15% (from 8.8%), FP count <15 (from 31)
```

---

### 2. **Add Active Voice Patterns for Creation Family**

**Impact**: Medium-High (unlocks 0% → ~40% recall for creation)
**Effort**: Medium
**Gate**: Creation family recall ≥0.40, F1 ≥0.30

**What**:
The creation family has 0% recall because patterns are mostly in passive voice (`painted_by`, `written_by`), but test cases use active voice (`X painted Y`, `X wrote Y`).

**How**:
1. Add active-voice dependency patterns to `patterns/_signatures_all_relations.json`:
   ```json
   {
     "signature": "nsubj(painted, SUBJ) + obj(painted, OBJ)",
     "families": ["creation"],
     "predicate": "painted"
   }
   ```
2. Target verbs: `painted`, `wrote`, `composed`, `designed`, `sculpted`, `authored`
3. Run pattern expansion:
   ```bash
   npx tsx scripts/pattern-expansion/generate-patterns.ts --families creation
   ```

**Validation**:
```bash
npx tsx scripts/pattern-expansion/evaluate-coverage.ts
# Expect: creation.recall ≥ 0.40, creation.f1 ≥ 0.30
```

---

### 3. **Improve Multi-Word Entity Recognition (NER Enhancement)**

**Impact**: Medium (affects 5 families: kinship, creation, location, event, power)
**Effort**: High
**Gate**: Entity splitting errors <10% of total FN

**What**:
Entities like "Leonardo da Vinci" are being split into "Leonardo" and "Vinci", causing:
- Wrong subject/object in relations: `Leonardo --[painted_by]--> Vinci` ❌
- Should be: `Leonardo da Vinci --[painted]--> Mona Lisa` ✅

**How**:
1. Check NER configuration in `app/nlp/ner/` for proper handling of:
   - Titles: "Queen Elizabeth", "Professor Smith"
   - Compound names: "Leonardo da Vinci", "Frank Lloyd Wright"
   - Multi-word orgs/locations: "Standard Oil Company", "Silicon Valley"

2. Add entity boundary expansion rules:
   ```typescript
   // When extracting relation arguments, expand to full NP chunks
   function getFullEntitySpan(token: Token): Span {
     // Walk up to compound/flat/name dependents
     // Example: "Leonardo" → check for "da Vinci" as flat:name
   }
   ```

3. Alternative: Post-process relations to merge split entities using alias registry

**Validation**:
```bash
npx tsx scripts/pattern-expansion/evaluate-coverage.ts
# Expect: FN examples with entity splits <5 (from ~15)
# Expect: creation.recall ≥ 0.50 (combined with Task 2)
```

---

## Success Criteria (R2 Gate)

✅ Overall precision ≥ 15% (from 8.8%)
✅ At least 1 family ready for hybrid mode (P≥0.70, R≥0.50, F1≥0.60)
✅ No family's precision drops >5% vs R1 baseline
✅ Critical fixes (UNKNOWN filter) deployed

---

## Next Rung Preview (R2 → R3)

After completing these tasks:
- **R2**: Precision Guardrails – Add type filters and distance windows
- **R3**: Canary (Real Text) – Test on Barty manuscript + LotR samples
- **R4**: Adversarial/Negation – Mine hard negatives from `top_fn_fp.json`
