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

**What's happening:**
The system is treating the coordinated noun phrase "Frodo and Sam" as a **single GROUP entity** instead of extracting relations for **both individuals**.

**The question for linguistic expert:**

In the sentence "Frodo and Sam traveled to Mordor", should the system:

**Option A**: Extract individual relations (current expectation)
- Frodo traveled_to Mordor
- Sam traveled_to Mordor
- Optionally: Create a GROUP entity {Frodo, Sam} for pronoun resolution

**Option B**: Extract only a group relation (current behavior)
- GROUP{Frodo, Sam} traveled_to Mordor

**Option C**: Extract BOTH
- Frodo traveled_to Mordor
- Sam traveled_to Mordor
- GROUP{Frodo, Sam} traveled_to Mordor

**Context from LINGUISTIC_REFERENCE.md:**

Pattern CO-1 (§19.1): "X and Y"
```
"Harry and Ron entered."
→ Entities: Harry, Ron, group {Harry, Ron}
```

Pattern GR-2 (§7): Ad-hoc Groups (Conjoined NPs)
```
"Harry and Ron entered. They looked nervous."
→ Create temporary GROUP {Harry, Ron}; "they" → that group
```

**The ambiguity:**
The linguistic reference suggests creating BOTH individual entities AND a group entity, but the test expectation is for individual relations ONLY. Which is correct for relation extraction?

**Related patterns in real text:**
- "Harry and Ron studied at Hogwarts" → Should both get `studies_at` relations?
- "The Fellowship traveled to Mordor" → GROUP entity only?
- "Frodo, Sam, and Merry traveled together" → All three individuals?

**Technical note:**
The coreference system is creating a GROUP entity but the relation extractor is using that GROUP as the subject instead of distributing the relation to individuals.

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

**What's happening:**
The system successfully handles the appositive "son of Arathorn" and extracts the family relations. However, it's **not extracting the "rules" relation** from "He became king there."

**The question for linguistic expert:**

How should "He became king there" be interpreted for relation extraction?

**Interpretation 1**: State change (become)
- This is an EVENT: Aragorn became king
- Not a relation between Aragorn and Gondor

**Interpretation 2**: Role assumption → governance relation
- "became king" implies "rules"
- Should extract: Aragorn `rules` Gondor
- The word "there" refers to Gondor (from previous sentence)

**Current gold standard expects**: Aragorn `rules` Gondor

**Context from LINGUISTIC_REFERENCE.md:**

Pattern EV-4 (§10): Temporal/Locative Adverbs
```
"Harry went to the forest. There, he met a centaur."
→ "There" references prior location
```

Pattern NM-4 (§6): Role Titles
```
"the king" → unique role associated to entity
```

**The question:**
Should "became [ROLE] there" always extract a relation between the entity and the location?

**Examples to clarify:**
1. "Aragorn became king there" → Aragorn rules Gondor? ✅
2. "Harry became a teacher there" → Harry teaches_at Hogwarts? 🤔
3. "Ron became prefect there" → Ron ??? Hogwarts? 🤔
4. "Frodo became sick there" → (No relation - just state change) ❌

**Possible linguistic rule:**
- "became [GOVERNANCE_ROLE] there" → extract `rules` relation
  - Governance roles: king, queen, ruler, emperor, president, leader
- "became [OTHER_ROLE] there" → extract appropriate relation if it exists
  - teacher → teaches_at
  - student → studies_at
  - resident → lives_in
- "became [STATE/ADJECTIVE] there" → no relation extraction

**Pattern matching challenge:**
How do we distinguish between:
- Roles that imply relations (king → rules, teacher → teaches_at)
- Roles that don't (warrior, wizard, hero)
- States/adjectives (sick, tired, wise)

**Technical note:**
The pattern extractor needs to:
1. Resolve "there" to "Gondor" (already working via deictic resolution)
2. Recognize "became king" as implying governance
3. Map "king" → `rules` predicate
4. Create relation: Aragorn `rules` Gondor

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

## Questions for Linguistic Expert

### Question 1: Coordination and Relation Distribution

**Priority: HIGH** (Blocks test 2.8)

When a coordinated noun phrase "X and Y" appears as the subject of a relation, should we:

A. Extract individual relations for each entity?
   - "Frodo and Sam traveled to Mordor" →
     - Frodo traveled_to Mordor
     - Sam traveled_to Mordor

B. Extract only a group relation?
   - "Frodo and Sam traveled to Mordor" →
     - GROUP{Frodo, Sam} traveled_to Mordor

C. Extract both individual and group relations?

**Follow-up questions:**
- Does the answer differ for different predicate types?
  - Movement: "traveled to", "went to", "arrived at"
  - State: "studied at", "lived in"
  - Events: "fought", "won", "lost"
- Should "The Fellowship traveled to Mordor" behave the same as "Frodo and Sam traveled to Mordor"?
- What about three-way coordination: "Frodo, Sam, and Merry traveled to Mordor"?

**Note:** Test 2.7 "Harry and Ron studied at Hogwarts" extracts individual relations correctly, but test 2.8 "Frodo and Sam traveled to Mordor" creates a group entity. We need to understand the pattern.

---

### Question 2: "Became [ROLE] there" → Relation Extraction

**Priority: MEDIUM** (Blocks test 2.12 partial failure)

When text says "X became [ROLE] there", where "there" refers to a location:

1. Which roles should trigger relation extraction?
   - Governance roles (king, queen, ruler, emperor)?
   - Professional roles (teacher, professor, doctor)?
   - Membership roles (student, citizen, member)?
   - Status roles (hero, warrior, champion)?

2. What relation should be extracted for each role type?
   - king/queen/ruler → `rules`?
   - teacher/professor → `teaches_at`?
   - student → `studies_at`?
   - warrior → (no relation)?

3. How do we distinguish roles from states/adjectives?
   - "became king" (role) → relation
   - "became sick" (state) → no relation
   - "became famous" (adjective) → no relation

**Examples needing classification:**
- "Aragorn became king there" → ?
- "Harry became headmaster there" → ?
- "Ron became prefect there" → ?
- "Gandalf became wizard there" → ?
- "Frodo became ring-bearer there" → ?

**Current expectation:** "became king there" → `rules` relation

---

### Question 3: Edge Cases for Coordination (Optional)

**Priority: LOW** (Extends question 1)

How should these coordinations be handled?

1. **Mixed entity types:**
   - "Harry and Hogwarts were famous" → ?

2. **Nested coordination:**
   - "Harry and Ron or Hermione traveled to London" → ?
   - (Harry and Ron) or Hermione?
   - Harry and (Ron or Hermione)?

3. **Asymmetric relations:**
   - "Harry married Ginny and her brother" → ?
   - Harry married_to Ginny ✅
   - Harry married_to (Ginny's brother) ❌ (probably wrong!)

4. **Collective vs Distributive:**
   - "Harry and Ron lifted the table" (collective - did it together)
   - "Harry and Ron entered the room" (distributive - each entered)
   - Does this matter for relation extraction?

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

1. **Linguistic expert provides answers** to Questions 1 and 2
2. **Update LINGUISTIC_REFERENCE.md** with new patterns:
   - Pattern CO-X: Coordination relation distribution rule
   - Pattern NM-X: "became [ROLE]" → relation mapping
3. **Implement fixes** based on linguistic guidance
4. **Re-run Stage 2 tests** to verify 15/15 passing
5. **Proceed to Stage 3** (Complex Extraction)

---

**Contact**: ARES Development Team
**Related Documents**:
- `docs/LINGUISTIC_REFERENCE.md` - Linguistic patterns reference
- `docs/LINGUISTIC_REFERENCE_TEST_MAPPING.md` - Test-to-pattern mapping
- `tests/ladder/level-2-multisentence.spec.ts` - Full test suite
