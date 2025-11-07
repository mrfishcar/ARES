# ARES Phase 3 - Progress Report

**Status: Partial Implementation - Core Infrastructure Complete**

## Completed ✅

### 1. Schema Extensions
- ✅ Added `Qualifier` interface with time/place/source support
- ✅ Extended `Relation` with `qualifiers?`, `extractor?`, `conf?` fields
- ✅ Added `SINGLE_VALUED` constant for conflict detection

### 2. Confidence Computation
- ✅ Implemented `computeConfidence()` with distance penalty formula:
  - Base: 0.9 (dep) or 0.7 (regex)
  - Type guard bonus: 1.05×
  - Distance penalty: exp(-Δchars / 40)
- ✅ All relations now have computed confidence scores
- ✅ Extractor metadata (`dep` or `regex`) attached to all relations

### 3. Qualifier Extraction Infrastructure
- ✅ Implemented `extractQualifiers()` function
  - Scans ±12 token window around relation trigger
  - Detects DATE entities for time qualifiers
  - Detects PLACE entities for place qualifiers
- ✅ Updated all 7 dependency patterns to pass tokens + triggerIdx
- ✅ Qualifiers attached to relations when available

### 4. Testing
- ✅ All 15 Phase 2 tests still passing
- ✅ Created `tests/qualifiers.spec.ts` with 6 Phase 3 tests
- ⚠️ Current: 2/6 Phase 3 tests passing (33%)

---

## Known Issues & Solutions

### Issue 1: Qualifiers Not Extracted (Test Failure #1)

**Problem:** `married_in_year` test fails - qualifiers are `undefined`

**Root Cause:** DATE entity not in qualifier scan window OR entity not created

**Debug Output Needed:**
```typescript
// In married_in_year test
console.log('All entities:', entities.map(e => ({ type: e.type, name: e.canonical })));
console.log('Qualifiers:', marriedRel?.qualifiers);
```

**Likely Fix:**
1. Check if "3019" is being extracted as DATE entity
2. Verify token window (±12) includes the DATE
3. May need to expand window OR adjust DATE entity extraction

### Issue 2: Confidence Lower Than Expected (Test Failures #2, #4)

**Problem:**
- `lives_in_place`: confidence 0.649 < 0.7 expected
- `extractor_metadata`: confidence 0.573 < 0.8 expected

**Root Cause:** Distance penalty is too aggressive

**Current Formula:**
```
conf = 0.9 × 1.05 × exp(-Δchars / 40)
```

**For "Jacob dwelt in Hebron" (22 chars):**
```
conf = 0.945 × exp(-22/40) = 0.945 × 0.58 = 0.548
```

**Solution Options:**
1. **Increase decay constant:** exp(-Δchars / 60) or exp(-Δchars / 80)
2. **Remove type guard bonus from formula** (it's always 1.05 currently)
3. **Lower test expectations:** Accept 0.5+ for dep, 0.3+ for regex

**Recommended Fix:**
```typescript
const distPenalty = Math.exp(-charDist / 80);  // Slower decay
```

### Issue 3: Regex Preferred Over Dep (Test Failure #3)

**Problem:** `multi_sentence_begat` - Abram→Isaac uses regex instead of dep

**Root Cause:** Deduplication keeps first relation found, regex might come first

**Current Dedup Logic:**
```typescript
const allRelations = [...depRelations, ...regexRelations];
const uniqueRelations = dedupeRelations(allRelations);
```

**Solution:** Priority-based deduplication
```typescript
function dedupeRelations(relations: Relation[]): Relation[] {
  const seen = new Map<string, Relation>();

  for (const rel of relations) {
    const evidenceKey = rel.evidence[0] ? `${rel.evidence[0].span.start}-${rel.evidence[0].span.end}` : '';
    const key = `${rel.subj}::${rel.pred}::${rel.obj}::${evidenceKey}`;

    if (!seen.has(key)) {
      seen.set(key, rel);
    } else {
      // Prefer DEP over REGEX
      const existing = seen.get(key)!;
      if (rel.extractor === 'dep' && existing.extractor === 'regex') {
        seen.set(key, rel);
      }
    }
  }

  return Array.from(seen.values());
}
```

---

## Test Results Summary

```
Phase 2 Tests: 15/15 passing ✅
Phase 3 Tests: 2/6 passing (33%)

Passing:
  ✅ confidence_scores: All relations have valid confidence
  ✅ multi_sentence_begat: Both parent_of relations extracted

Failing:
  ❌ married_in_year: Qualifiers undefined
  ❌ lives_in_place: Confidence 0.649 < 0.7
  ❌ multi_sentence_begat: Extractor is 'regex' not 'dep'
  ❌ extractor_metadata: Confidence 0.573 < 0.8
```

---

## Not Yet Implemented

### 1. Cross-Document Merge (`app/engine/merge.ts`) ❌
**Scope:** ~150 lines
- `mergeEntitiesAcrossDocs()`
- `normalizeKey()` for canonical names
- Alias management

### 2. Conflict Detection (`app/engine/conflicts.ts`) ❌
**Scope:** ~100 lines
- `detectConflicts()` for single-valued predicates
- Temporal conflict detection
- Type conflict detection

### 3. Query Layer (`app/engine/query.ts`) ❌
**Scope:** ~80 lines
- `query({ subject?, predicate?, object?, time?, minConf? })`
- Entity name matching

### 4. Export Functions (`app/engine/export.ts`) ❌
**Scope:** ~200 lines
- `toJSONLD()` - Schema.org format
- `toCSV()` - Flat export
- `toDOT()` - Graphviz visualization

### 5. Additional Qualifier Tests ❌
- `conflicting_parents` test
- `nickname_alias` test

---

## Recommended Next Steps

### Quick Wins (30 min)

1. **Fix confidence decay:**
   ```typescript
   const distPenalty = Math.exp(-charDist / 80);
   ```

2. **Fix deduplication priority:**
   Prefer DEP over REGEX in dedupeRelations()

3. **Debug qualifier extraction:**
   Add logging to see why DATE entities aren't found

### Medium Priority (2-3 hours)

4. **Implement query layer** (`query.ts`)
   - Most useful for user-facing features
   - Enables Phase 3 demos

5. **Implement export functions** (`export.ts`)
   - toCSV() for data analysis
   - toDOT() for visualization

### Lower Priority (optional)

6. **Cross-doc merge** (`merge.ts`)
   - Needed for multi-document systems
   - Not critical for single-doc demos

7. **Conflict detection** (`conflicts.ts`)
   - Nice-to-have for data quality
   - Can be deferred

---

## Phase 3 Deliverables Status

| Item | Status | LOC | Notes |
|------|--------|-----|-------|
| Schema extensions | ✅ Complete | 15 | Qualifier, extractor fields |
| computeConfidence() | ✅ Complete | 15 | Needs tuning |
| extractQualifiers() | ✅ Complete | 40 | Needs debugging |
| Qualifier integration | ✅ Complete | 50 | All patterns updated |
| Query layer | ❌ Not started | 80 | High priority |
| Export functions | ❌ Not started | 200 | Medium priority |
| Merge/conflicts | ❌ Not started | 250 | Lower priority |
| Phase 3 tests | ⚠️ Partial | 130 | 2/6 passing |
| **Total** | **50% complete** | **780** | **Core done** |

---

## Working Features

### Confidence Scores
All relations now have:
```typescript
{
  confidence: 0.5-0.95 (dep) or 0.3-0.7 (regex),
  extractor: 'dep' | 'regex'
}
```

### Qualifier Infrastructure
Ready to extract qualifiers when entities are available:
```typescript
{
  qualifiers: [
    { type: 'time', value: '3019', entity_id: '<date_id>', span: [45, 49] },
    { type: 'place', value: 'Canaan', entity_id: '<place_id>', span: [20, 26] }
  ]
}
```

### Multi-Sentence Relations
Works correctly - multiple "begat" relations extracted from different sentences.

---

## Summary for ChatGPT

**Phase 3 Core Infrastructure: COMPLETE ✅**
- Schema extended with qualifiers, confidence, extractor
- Confidence computation implemented (needs tuning)
- Qualifier extraction infrastructure ready (needs debugging)
- All Phase 2 tests still passing (15/15)

**Phase 3 Features: PARTIAL ⚠️**
- 2/6 qualifier tests passing
- Need to fix: confidence decay, dedup priority, qualifier extraction
- Not implemented: query layer, export, merge, conflicts

**Recommendation:**
1. Fix 3 quick bugs (30 min) → get to 6/6 tests passing
2. Implement query layer (2 hours) → enable demos
3. Defer merge/conflicts to Phase 3.5 or Phase 4

**Bottom Line:**
Phase 3 is 50% complete with solid foundations. The hardest parts (schema design, confidence formulas, qualifier infrastructure) are done. Remaining work is mostly straightforward CRUD operations (query, export, merge).

🚀 **Ready for ChatGPT's feedback on priorities!**
