# Jesse Extraction Fix & Real Literature Testing

## Summary

Fixed the issue where names in prepositional phrases (e.g., "son of Jesse") were not being extracted, then validated the fix against real literary texts.

---

## Issue Fixed

**Problem:** Names appearing after prepositions like "of" were being filtered out by an overly aggressive filter in the fallback extraction pattern.

**Example failure:**
- Text: "David, son of Jesse, was born in Bethlehem"
- Before: Extracted only "David, Bethlehem" (Jesse missing)
- After: Extracted "David, Jesse, Bethlehem" ✓

**Root cause:** Line 800-802 in `app/engine/extract/entities.ts` filtered out single-word matches after "the", "of", "and", "son", "daughter". This was intended to filter out descriptors like "the Grey" but was too broad.

**Fix:** Modified the filter to only skip words after "the" or "and", keeping words after "of" which often precede valid names (e.g., "son of X", "House of Y", "daughter of Z").

**Code change:**
```typescript
// BEFORE: Filtered after "the|of|and|son|daughter"
if (/\b(the|of|and|son|daughter)\s+$/.test(preceding) && !/^[A-Z][a-z]+s$/.test(value)) {
  continue;
}

// AFTER: Only filter after "the|and"
if (/\b(the|and)\s+$/.test(preceding) && !/^[A-Z][a-z]+s$/.test(value)) {
  continue;
}
```

**File:** `app/engine/extract/entities.ts:797-805`

---

## Validation

### Simple Cases (✓ PASS)
Created test `tests/debug-jesse.spec.ts` with two cases:
1. "David, son of Jesse, was born in Bethlehem" - All 3 entities extracted ✓
2. "Aragorn, son of Arathorn, married Arwen" - All 3 entities extracted ✓

### Mega Regression (✓ PASS)
- Entity Precision: 42.1% (100% recall)
- Relation Precision: 100%
- Relation Recall: 92.3%

No regressions from the fix.

---

## Real Literature Testing

Tested against two public domain literary excerpts:

### 1. A Tale of Two Cities (Charles Dickens, 1859)

**Extraction Issues Found:**
- ❌ France not extracted (only got England, Heaven, Versailles)
- ❌ Mrs. Southcott not extracted
- ❌ Year 1775 not extracted (text says "one thousand seven hundred and seventy-five" in words)
- ✓ England extracted
- ✓ Versailles extracted

**Impact:** Moderate - misses some place names and spelled-out dates.

### 2. Book of Ruth 1:1-5 (King James Bible)

**Extraction Results:**
```
PERSON (6): Moab, Elimelech, And Elimelech Naomi, And Mahlon, Orpah, Ruth
PLACE (0): NONE
Relations: NONE
```

**Critical Issues Found:**

1. **Wrong Entity Types**
   - Moab classified as PERSON (should be PLACE)

2. **Bad Entity Boundaries**
   - "And Elimelech Naomi" extracted as single person (should be separate)
   - "And Mahlon" includes conjunction "And"

3. **Missing Entities**
   - Naomi (standalone) - not extracted
   - Mahlon (standalone) - not extracted
   - Chilion - not extracted at all
   - Bethlehem - not extracted
   - Bethlehem-judah - not extracted

4. **Zero Relations Extracted**
   - Text explicitly states: "Elimelech Naomi's husband"
   - Text explicitly states: "his wife... Naomi"
   - Text explicitly states: "his two sons Mahlon and Chilion"
   - Text explicitly states: "they took them wives... Orpah... Ruth"
   - **NONE of these relationships were extracted**

**Impact:** High - Real biblical genealogical text fails to extract basic family relationships.

---

## User Impact Assessment

### Low Impact (Working Well) ✓
- **Complex narratives:** Mega-001 shows 100% relation precision, 92% recall
- **Simple isolated facts:** "David, son of Jesse" now works correctly
- **Fantasy names:** Whitelist approach works well for pre-defined entities

### Moderate Impact (Partial Failures) ⚠️
- **Spelled-out dates:** "one thousand seven hundred and seventy-five" not recognized
- **Some place names:** France, Moab missed in certain contexts
- **Titled names:** "Mrs. Southcott" not extracted

### High Impact (Critical Gaps) ❌
- **Coordinate conjunctions:** "And X and Y" creates bad entity boundaries
- **Possessive relationships:** "Naomi's husband" not creating married_to relation
- **Complex appositive structures:** "his wife... Naomi" not linking entities
- **Real-world biblical text:** 0 relations extracted from Ruth passage

---

## Conclusion

**Jesse Fix: SUCCESS** ✓
- The prepositional phrase extraction issue is resolved
- Simple "X, son of Y" patterns now work correctly
- Mega regression maintains 100% relation precision

**Real Literature Performance: NEEDS WORK** ❌
- Entity boundary detection fails on coordinate conjunctions
- Entity type classification has errors (Moab as PERSON)
- Relation extraction fails on real biblical genealogical text
- Missing support for spelled-out numbers and complex possessive structures

**Recommendation:**
The system performs well on **synthetic test data** and **modern fantasy narratives** but struggles with **real classical literature** due to:
1. More complex sentence structures
2. Coordinate conjunctions ("And X and Y")
3. Old English phrasings ("Naomi's husband", "the name of the man was X")
4. Spelled-out dates

For real-world biblical/classical literature use, additional work is needed on:
- Coordinate conjunction splitting
- Appositive phrase handling
- Possessive relation extraction
- Number word recognition
