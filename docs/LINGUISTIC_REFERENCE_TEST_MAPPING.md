# Linguistic Reference - Test Mapping

**Purpose**: Maps Stage 2 test cases to patterns in LINGUISTIC_REFERENCE.md (v0.4)

This document shows how the linguistic reference provides solutions for Stage 2 test failures.

---

## Stage 2 Test Coverage Analysis

### 2.1-2.3: Basic Pronoun Resolution ✅

**Tests:**
- 2.1: "Harry went to Hogwarts. He studied magic there."
- 2.2: "Hermione lives in London. She studies at Hogwarts."
- 2.3: "Frodo lived in the Shire. He traveled to Mordor."

**Linguistic Reference Coverage:**
- **Pattern PR-P1** (§2.2): Simple Subject Continuation
  - "He/She" → last salient PERSON subject
- **Pattern EV-4** (§10): Temporal/Locative Adverbs
  - "there" refers to prior location

**Implementation:** ✅ Likely already working (basic pronoun resolution)

---

### 2.4-2.5: Gender-Aware Pronoun Resolution ✅

**Tests:**
- 2.4: "Aragorn married Arwen. He loved her deeply."
- 2.5: "Ginny studied at Hogwarts. She married Harry."

**Linguistic Reference Coverage:**
- **Pattern PR-P1** (§2.2): Simple Subject Continuation with gender
  - "He" → male subject (Aragorn)
  - "She" → female subject (Ginny)
  - "her" → female object (Arwen)
- **PR-1 Agreement** (§2.1): Must agree with gender

**Implementation:** ✅ Likely working (gender-aware pronoun resolution)

---

### 2.6: Multi-Entity Pronoun Resolution ⚠️

**Test:**
```
"Gandalf traveled to Rivendell. Elrond lived there. He welcomed Gandalf."
```

Expected:
- "He" → Elrond (most recent PERSON subject)

**Linguistic Reference Coverage:**
- **Pattern PR-P2** (§2.2): Multiple Candidates in Previous Sentence
  - Subject preference: "he" = prior subject (Elrond)
  - If ambiguous → use salience/recency
- **§11 Salience**:
  - +10 for subject in current sentence
  - +8 for subject in previous sentence
  - Recency wins: Elrond mentioned more recently

**Potential Issue:** May incorrectly resolve to Gandalf if salience not properly decaying

---

### 2.7-2.8: Coordination (X and Y) ✅

**Tests:**
- 2.7: "Harry and Ron studied at Hogwarts."
- 2.8: "Frodo and Sam traveled to Mordor."

**Linguistic Reference Coverage:**
- **Pattern CO-1** (§19.1): "X and Y"
  - Extract both entities individually
  - Create relations for each: Harry studies_at Hogwarts, Ron studies_at Hogwarts
- **Pattern GR-2** (§7): Ad-hoc Groups
  - Create temporary GROUP {Harry, Ron}
  - "they" would refer to this group

**Implementation:** ✅ Likely working (coordination handling)

---

### 2.9-2.10: Title Back-Links ⚠️

**Tests:**
- 2.9: "Aragorn became king of Gondor. The king ruled wisely."
- 2.10: "Dumbledore is a wizard. The wizard teaches at Hogwarts."

**Linguistic Reference Coverage:**
- **Pattern NM-4** (§6): Role Titles
  - "the king" → unique role associated to Aragorn
  - "the wizard" → unique role associated to Dumbledore
- **Pattern DN-2** (§5): Simple Descriptions
  - Bind "the X" to most recent PERSON matching description

**Potential Issue:**
- May create separate entities for "the king" and "Aragorn"
- Should apply **Pattern AP-2** (§9): Description → Proper Name
  - Merge "the king" with "Aragorn" once equivalence is clear

---

### 2.11: Family Relations with Pronouns ✅

**Test:**
```
"Boromir is the son of Denethor. He was a brave warrior."
```

**Linguistic Reference Coverage:**
- **Pattern NM-2** (§6): Familial phrases
  - "son of Denethor" indicates child_of relation
- **Pattern PR-P1** (§2.2): Pronoun resolution
  - "He" → Boromir (most recent PERSON subject)

**Implementation:** ✅ Likely working if "son of" pattern exists

---

### 2.12: Appositive Parsing ❌ **BLOCKER**

**Test:**
```
"Aragorn, son of Arathorn, traveled to Gondor. He became king there."
```

Expected:
- Aragorn child_of Arathorn
- Arathorn parent_of Aragorn
- Aragorn traveled_to Gondor
- Aragorn rules Gondor

**Linguistic Reference Coverage:**
- **Pattern AP-3** (§9): Name + Role Apposition
  - "Aragorn, son of Arathorn" → appositive construction
  - Both refer to same entity (Aragorn)
  - "son of Arathorn" indicates child_of relation
  - Extract: Aragorn child_of Arathorn + inverse
- **Pattern AP-1** (§9): Simple Apposition
  - Comma-separated NPs → same entity

**Missing Implementation:**
- Code does NOT handle appositive constructions with commas
- Need to:
  1. Detect "X, [relation phrase], ..." pattern
  2. Parse "son of Y", "daughter of Y", etc.
  3. Extract child_of/parent_of relations
  4. Keep X as the canonical entity

**Fix Required:** Implement appositive parsing per §9 patterns

---

### 2.13: Three-Sentence Pronoun Chain ⚠️

**Test:**
```
"Legolas was an elf. He was friends with Gimli. They traveled together."
```

**Linguistic Reference Coverage:**
- **Pattern PR-P1** (§2.2): "He" → Legolas
- **Pattern PR-P4** (§2.2): Plural "They"
  - Bind to composite group from context
  - Here: GROUP {Legolas, Gimli} from "friends with"
- **Pattern GR-2** (§7): Ad-hoc Groups
  - Create temporary GROUP {Legolas, Gimli}
  - "They" → that group

**Potential Issue:** May not create implicit group from "friends with" relation

---

### 2.14: Possessive Pronoun Resolution ⚠️

**Test:**
```
"Theoden ruled Rohan. Eowyn was his niece. She lived in Rohan."
```

**Linguistic Reference Coverage:**
- **Pattern PR-P1** (§2.2):
  - "his" → Theoden (most recent male PERSON)
  - "She" → Eowyn (most recent female PERSON)
- **§11 Salience**: Track possessive pronouns like subject pronouns

**Potential Issue:** Possessive "his" may need special handling in salience tracking

---

### 2.15: Complex Coreference Chain (Epithet) ⚠️

**Test:**
```
"Elrond dwelt in Rivendell. The elf lord welcomed travelers. He was wise and ancient."
```

**Linguistic Reference Coverage:**
- **Pattern NM-5** (§6): Epithets
  - "the elf lord" is an epithet for Elrond
  - Once linked, treat as strong alias
- **Pattern DN-2** (§5): Simple Descriptions
  - "The elf lord" → most recent entity matching description
- **Pattern AP-2** (§9): Description → Proper Name
  - Merge "the elf lord" with "Elrond"

**Potential Issue:**
- May create separate entity for "the elf lord"
- Should merge using apposition/description rules

---

## Summary: Linguistic Reference Coverage

### ✅ Well-Covered (Likely Working)
- Basic pronoun resolution (2.1-2.3, 2.4-2.5)
- Coordination (2.7-2.8)
- Simple family relations (2.11)

### ⚠️ Partially Covered (May Need Fixes)
- Multi-entity pronoun resolution with salience (2.6)
- Title/role back-links and merging (2.9-2.10)
- Implicit group creation (2.13)
- Possessive pronouns (2.14)
- Epithet recognition and merging (2.15)

### ❌ Not Implemented (Blocker)
- **2.12: Appositive parsing** - Pattern documented (§9 AP-1, AP-3) but code missing

---

## Recommended Fixes (Priority Order)

### Priority 1: Unblock Stage 2 ⭐
**Fix Test 2.12** - Implement appositive parsing per §9

```typescript
// Detect: "X, [relation phrase], ..." pattern
// Example: "Aragorn, son of Arathorn, traveled..."
// Extract:
// - Entity: Aragorn (PERSON)
// - Entity: Arathorn (PERSON)
// - Relation: Aragorn child_of Arathorn
// - Relation: Arathorn parent_of Aragorn
```

Patterns to implement:
- "X, son of Y" → child_of
- "X, daughter of Y" → child_of
- "X, father of Y" → parent_of
- "X, [role/title]" → role relation

### Priority 2: Improve Entity Merging
**Fix Tests 2.9, 2.10, 2.15** - Title/epithet merging

Apply Pattern AP-2 (§9): Description → Proper Name
- "the king" + "Aragorn" → merge
- "the wizard" + "Dumbledore" → merge
- "the elf lord" + "Elrond" → merge

### Priority 3: Enhance Salience System
**Fix Tests 2.6, 2.13, 2.14** - Multi-entity pronoun resolution

Implement §11 salience tracking:
- Subject preference (subject > object)
- Recency decay (0.7 per sentence)
- Possessive pronoun handling

---

## Using This Document

When a Stage 2 test fails:

1. **Find the test** in this document
2. **Read the "Linguistic Reference Coverage" section** for that test
3. **Check the referenced patterns** in docs/LINGUISTIC_REFERENCE.md
4. **Implement missing patterns** or fix broken ones
5. **Update this document** if patterns were incorrect

**Example workflow for test 2.12:**
```bash
# 1. Test fails
npm test tests/ladder/level-2-multisentence.spec.ts -t "2.12"

# 2. Check this document
grep -A 15 "2.12" docs/LINGUISTIC_REFERENCE_TEST_MAPPING.md

# 3. Read Pattern AP-3 in linguistic reference
grep -A 10 "AP-3" docs/LINGUISTIC_REFERENCE.md

# 4. Implement appositive parsing in code
# (see app/engine/extract/entities.ts or relations.ts)

# 5. Re-run test
npm test tests/ladder/level-2-multisentence.spec.ts -t "2.12"
```

---

**Last Updated**: 2025-11-28
**Version**: 1.0
**Maintainers**: ARES Team
