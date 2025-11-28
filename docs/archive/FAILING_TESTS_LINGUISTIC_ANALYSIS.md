# ARES Stage 2 Failing Tests - Linguistic Analysis Report

**Date**: 2025-11-28
**Purpose**: Detailed analysis of failing Stage 2 tests for linguistic expert review
**Current Status**: 13/15 tests passing (86.7% pass rate)

---

## Executive Summary

**Overall Performance:**
- Relation Precision: 93.3% (target: ≥85%) ✅
- Relation Recall: 91.7% (target: ≥80%) ✅
- Tests Passing: 13/15 (86.7%)
- Tests Failing: 2/15 (13.3%)

**Failing Tests:**
1. **Test 2.8** - Coordination entity grouping issue
2. **Test 2.12** - Missing "became king there" → "rules" relation

---

## FAILING TEST #1: Test 2.8 - Coordination (Critical)

### Input Text
```
"Frodo and Sam traveled to Mordor."
```

### Expected Output
**Entities:**
- Frodo (PERSON)
- Sam (PERSON)
- Mordor (PLACE)

**Relations:**
- Frodo `traveled_to` Mordor
- Sam `traveled_to` Mordor

### Actual Output
**Entities:**
- "Frodo and Sam" (GROUP) ← **PROBLEM: Created a group entity**
- Mordor (PLACE)

**Relations:**
- "Frodo and Sam" `traveled_to` Mordor ← **PROBLEM: Wrong subject**

### The Linguistic Issue

**Root Cause: Missing Pattern CO-5 (Distributive Verbs)**

The system is treating the coordinated noun phrase "Frodo and Sam" as a **single GROUP entity** instead of distributing the relation to **both individuals**.

**The pattern is documented in LINGUISTIC_REFERENCE.md v0.5:**

**Pattern CO-5 (§19.4): Distributive Verbs with Conjoined PERSON Subjects**

```
"Frodo and Sam traveled to Mordor."
→ Extract:
  - Frodo traveled_to Mordor  ← INDIVIDUAL relation
  - Sam traveled_to Mordor    ← INDIVIDUAL relation
  - Optional: GROUP{Frodo, Sam} traveled_to Mordor
```

**Distributive verbs** perform actions independently by each person:
- Movement: `traveled_to`, `went_to`, `arrived_at`, `left_from`
- State: `studies_at`, `lives_in`, `works_at`
- Experience: `saw`, `heard`, `felt`

**Why test 2.7 works but 2.8 fails:**
- Test 2.7: "Harry and Ron **studied** at Hogwarts" ✅
  - `studies_at` already has distributive pattern implemented
- Test 2.8: "Frodo and Sam **traveled** to Mordor" ❌
  - `traveled_to` missing distributive pattern

**This is NOT a question for the linguistic expert** - the pattern is already documented and the answer is clear: distribute to individuals.

**Solution:**
1. Add `traveled_to` to DISTRIBUTIVE_VERBS list
2. When extracting `traveled_to` with coordinated subject:
   - Split "Frodo and Sam" into [Frodo, Sam]
   - Emit relation for each: Frodo→Mordor, Sam→Mordor

**Contrast with collective verbs** (which DON'T distribute):
- "Harry and Ron **lifted** the table" → GROUP relation only
- Collective verbs: lifted, carried, surrounded, voted

**This is a straightforward implementation issue, not a linguistic ambiguity.**

---

## FAILING TEST #2: Test 2.12 - "Became King" Relation (Partial Failure)

### Input Text
```
"Aragorn, son of Arathorn, traveled to Gondor. He became king there."
```

### Expected Output
**Entities:**
- Aragorn (PERSON)
- Arathorn (PERSON)
- Gondor (PLACE)

**Relations:**
- Aragorn `child_of` Arathorn ← ✅ EXTRACTED
- Arathorn `parent_of` Aragorn ← ✅ EXTRACTED
- Aragorn `traveled_to` Gondor ← ✅ EXTRACTED
- Aragorn `rules` Gondor ← ❌ **MISSING**

### Actual Output
**Entities:** ✅ All correct
- Aragorn (PERSON)
- Arathorn (PERSON)
- Gondor (PLACE)

**Relations:** 3/4 extracted
- ✅ Aragorn `child_of` Arathorn
- ✅ Arathorn `parent_of` Aragorn
- ✅ Aragorn `traveled_to` Gondor
- ❌ **MISSING**: Aragorn `rules` Gondor

### The Linguistic Issue

**Root Cause: Missing Pattern RL-1 (Role-Based Relations)**

**IMPORTANT:** The appositive parsing is **WORKING CORRECTLY** ✅
- "Aragorn, son of Arathorn" successfully extracts:
  - Aragorn `child_of` Arathorn ✅
  - Arathorn `parent_of` Aragorn ✅

**The actual issue:** Missing "became king there" → `rules` relation extraction.

**The pattern is documented in LINGUISTIC_REFERENCE.md v0.5:**

**Pattern RL-1 (§33): Governance Role Change**

```
"X became ROLE there/of/in/over PLACE"
→ Extract: X `rules` PLACE

Example:
"He became king there."
(where "there" = Gondor from prior sentence)
→ Extract: Aragorn rules Gondor
```

**GOVERNANCE_ROLES list:**
- king, queen
- monarch, ruler
- emperor, empress
- sultan, pharaoh
- lord (when clearly governance)

**Implementation required:**
1. Detect clause pattern: `X became/was crowned/assumed ROLE [LOCATION_REF]`
2. Check if ROLE ∈ GOVERNANCE_ROLES (king ✓)
3. Resolve LOCATION_REF:
   - "there" → last salient PLACE (Gondor from previous sentence)
   - Already working via deictic resolution ✅
4. Extract: `rules`(Aragorn, Gondor)

**This is NOT a question for the linguistic expert** - the pattern is documented with:
- Clear GOVERNANCE_ROLES list
- Role → relation mapping (king → rules)
- Examples showing when to extract vs not extract

**Pattern RL-2 (§33)** also provides professional role mappings:
- teacher → `teaches_at`
- student → `studies_at`
- headmaster → `heads`

**Distinguishing roles from states** (already documented):
- Role: "became king" → extract relation ✅
- State: "became sick" → no relation ❌
- Heuristic: noun with org/location context = role

**This is a straightforward implementation issue, not a linguistic ambiguity.**

---

## PASSING TESTS (For Reference)

These tests are working correctly and demonstrate what the system handles well:

### ✅ Test 2.1: Simple Pronoun Resolution
```
"Harry went to Hogwarts. He studied magic there."
```
- Extracts: harry::traveled_to::hogwarts, harry::studies_at::hogwarts
- Pronoun "He" → Harry ✅
- Deictic "there" → Hogwarts ✅

### ✅ Test 2.4: Gender-Aware Pronouns
```
"Aragorn married Arwen. He loved her deeply."
```
- Extracts: aragorn::married_to::arwen, arwen::married_to::aragorn
- "He" → Aragorn (male) ✅
- "her" → Arwen (female) ✅

### ✅ Test 2.6: Multi-Entity Pronoun Resolution
```
"Gandalf traveled to Rivendell. Elrond lived there. He welcomed Gandalf."
```
- Extracts: gandalf::traveled_to::rivendell, elrond::lives_in::rivendell
- "He" → Elrond (most recent PERSON subject, not Gandalf) ✅
- "there" → Rivendell ✅

### ✅ Test 2.7: Coordination (Working Case)
```
"Harry and Ron studied at Hogwarts."
```
- Extracts: harry::studies_at::hogwarts, ron::studies_at::hogwarts
- **Individual relations extracted correctly** ✅
- Note: This one works, but 2.8 doesn't - why?

### ✅ Test 2.9: Role Title Merging
```
"Aragorn became king of Gondor. The king ruled wisely."
```
- Extracts: aragorn::rules::gondor
- "The king" merged with "Aragorn" ✅

### ✅ Test 2.11: Family Relations
```
"Boromir is the son of Denethor. He was a brave warrior."
```
- Extracts: boromir::child_of::denethor, denethor::parent_of::boromir
- Phrase "son of" → child_of relation ✅

### ✅ Test 2.13: Plural "They" Resolution
```
"Legolas was an elf. He was friends with Gimli. They traveled together."
```
- Extracts: legolas::friends_with::gimli, gimli::friends_with::legolas
- "They" → GROUP{Legolas, Gimli} ✅

---

## Summary: No Linguistic Questions Remain ✅

**IMPORTANT UPDATE:** Both failing tests are now fully documented in LINGUISTIC_REFERENCE.md v0.5 with clear patterns and implementation guidance. **No linguistic expert input required** - these are straightforward implementation tasks.

### Issue 1: Test 2.8 - SOLVED by Pattern CO-5

**Status:** ✅ Documented in §19.4

The question "should we distribute to individuals?" is **answered**:
- YES, for distributive verbs (traveled_to, studies_at, lives_in, etc.)
- NO, for collective verbs (lifted, carried, surrounded, etc.)

**Implementation:**
1. Add `traveled_to` to DISTRIBUTIVE_VERBS list
2. When subject is coordinated PERSONs + distributive verb:
   - Emit relation for each person
3. Contrast: collective verbs keep GROUP relation only

**The pattern is clear and unambiguous.** Test 2.7 works because `studies_at` is already distributive. Test 2.8 fails because `traveled_to` is missing from the distributive list.

---

### Issue 2: Test 2.12 - SOLVED by Pattern RL-1

**Status:** ✅ Documented in §33

The question "which roles trigger relations?" is **answered**:

**GOVERNANCE_ROLES → `rules`:**
- king, queen, monarch, ruler, emperor, empress, sultan, pharaoh

**PROFESSIONAL_ROLES → role-specific relations:**
- teacher/professor → `teaches_at`
- student → `studies_at`
- headmaster/director → `heads`
- employee → `works_at`

**States/adjectives → NO relation:**
- sick, tired, famous, wise, angry

**Implementation:**
1. Detect "became [ROLE] [LOCATION_REF]" pattern
2. Check ROLE against lexicons
3. Resolve LOCATION_REF ("there" → last salient PLACE)
4. Emit appropriate relation

**The pattern includes:**
- Clear role lexicons ✅
- Role → predicate mappings ✅
- Examples of when to extract vs not ✅
- Heuristic for distinguishing roles from states ✅

---

### Edge Cases: Also Documented

**Question 3 items are also addressed in v0.5:**

1. **Collective vs Distributive** - Pattern CO-5 (§19.4)
   - "lifted table" → collective → GROUP relation
   - "traveled to Mordor" → distributive → individual relations

2. **Named groups** - Pattern GR-3 (§7)
   - "The Fellowship traveled" → treat as established GROUP entity

3. **Three-way coordination** - Pattern CO-2 (§19.1) + CO-5 (§19.4)
   - "Frodo, Sam, and Merry traveled" → apply distributive rule to all three

**Mixed entity types and asymmetric relations** are edge cases not currently in test suite - can be addressed when encountered.

---

## Technical Implementation Notes

### Current System Behavior

**Coordination handling:**
- Parser creates entities for "Frodo", "Sam", and potentially "Frodo and Sam" (group)
- Coreference system may merge or create group entities
- Relation extractor uses whatever entity the parser provides as subject

**Possible fix for Test 2.8:**
If linguistic expert says "distribute to individuals", we need to:
1. Detect coordinated subject in relation extraction
2. Split "Frodo and Sam" into [Frodo, Sam]
3. Create relation for each: Frodo→Mordor, Sam→Mordor
4. Optionally keep GROUP entity for pronoun resolution

**"Became [ROLE]" handling:**
If linguistic expert provides role → relation mapping, we need to:
1. Detect "became [ROLE] [LOCATION_REF]" pattern
2. Resolve location reference ("there" → "Gondor")
3. Look up ROLE in mapping (king → rules, teacher → teaches_at)
4. Extract appropriate relation

---

## Appendix: Full Test Suite Results

| Test | Description | Status | Precision | Recall |
|------|-------------|--------|-----------|--------|
| 2.1  | Simple pronoun resolution | ✅ PASS | 100% | 100% |
| 2.2  | Female pronoun resolution | ✅ PASS | 100% | 100% |
| 2.3  | "lived/traveled" resolution | ✅ PASS | 100% | 100% |
| 2.4  | Gender-aware pronouns | ✅ PASS | 100% | 100% |
| 2.5  | Female pronoun + marriage | ✅ PASS | 100% | 100% |
| 2.6  | Multi-entity pronoun | ✅ PASS | 100% | 100% |
| 2.7  | Coordination (working) | ✅ PASS | 100% | 100% |
| 2.8  | Coordination (failing) | ❌ FAIL | 0% | 0% |
| 2.9  | Role title merging | ✅ PASS | 100% | 100% |
| 2.10 | Title back-link | ✅ PASS | 100% | 100% |
| 2.11 | Family relation | ✅ PASS | 100% | 100% |
| 2.12 | Appositive + "became king" | ⚠️ PARTIAL | 100% | 75% |
| 2.13 | Plural "they" | ✅ PASS | 100% | 100% |
| 2.14 | Possessive pronoun | ✅ PASS | 100% | 100% |
| 2.15 | Epithet resolution | ✅ PASS | 100% | 100% |

**Overall:** 13/15 passing (86.7%)

---

## Next Steps

✅ **Patterns Documented** - LINGUISTIC_REFERENCE.md v0.5 now includes:
- Pattern CO-5 (§19.4): Distributive verbs coordination
- Pattern RL-1/RL-2 (§33): Role-based relations

**Ready for Implementation:**

1. **Implement CO-5 for Test 2.8:**
   - Add `traveled_to` to DISTRIBUTIVE_VERBS list
   - Update relation extractor to distribute coordinated subjects for distributive verbs
   - File: `app/engine/extract/relations.ts` or `app/engine/narrative-relations.ts`

2. **Implement RL-1 for Test 2.12:**
   - Create GOVERNANCE_ROLES and PROFESSIONAL_ROLES lexicons
   - Detect "became [ROLE] [LOCATION_REF]" pattern
   - Map roles to predicates (king → rules, teacher → teaches_at)
   - Combine with existing deictic resolution for "there"
   - File: `app/engine/narrative-relations.ts`

3. **Test Implementation:**
   - Re-run Stage 2 tests: `npm test tests/ladder/level-2-multisentence.spec.ts`
   - Target: 15/15 passing (currently 13/15)
   - Expected: 100% precision, 100% recall

4. **Proceed to Stage 3:**
   - Once Stage 2 passes → move to Complex Extraction tests
   - 3-5 sentence paragraphs with complex coreference chains

---

**Contact**: ARES Development Team
**Related Documents**:
- `docs/LINGUISTIC_REFERENCE.md` - Linguistic patterns reference
- `docs/LINGUISTIC_REFERENCE_TEST_MAPPING.md` - Test-to-pattern mapping
- `tests/ladder/level-2-multisentence.spec.ts` - Full test suite
