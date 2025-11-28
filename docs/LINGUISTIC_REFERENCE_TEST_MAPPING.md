# Linguistic Reference - Test Mapping

**Purpose**: Maps Stage 2 test cases to patterns in `LINGUISTIC_REFERENCE.md` (v0.5)

This document shows how the linguistic reference provides solutions for Stage 2 test behaviors and failures.

---

## Stage 2 Test Coverage Analysis

### 2.1-2.3: Basic Pronoun Resolution ✅

**Tests:**
- 2.1: "Harry went to Hogwarts. He studied magic there."
- 2.2: "Hermione lives in London. She studies at Hogwarts."
- 2.3: "Frodo lived in the Shire. He traveled to Mordor."

**Linguistic Reference Coverage:**
- **Pattern PR-P1** (§2.2): Simple Subject Continuation
  - "He/She" → last salient PERSON subject.
- **Pattern EV-4** (§10): Temporal/Locative Adverbs
  - "there" refers to prior location (Hogwarts, the Shire, etc.).

**Implementation:** ✅ Already working (basic pronoun + "there" resolution).

---

### 2.4-2.5: Gender-Aware Pronoun Resolution ✅

**Tests:**
- 2.4: "Aragorn married Arwen. He loved her deeply."
- 2.5: "Ginny studied at Hogwarts. She married Harry."

**Linguistic Reference Coverage:**
- **Pattern PR-P1** (§2.2): Simple Subject Continuation with gender
  - "He" → male subject (Aragorn).
  - "She" → female subject (Ginny).
  - "her" → female object (Arwen).
- **PR-1 Agreement** (§2.1): Must agree in gender and number.

**Implementation:** ✅ Working (gender-aware pronouns).

---

### 2.6: Multi-Entity Pronoun Resolution ✅

**Test:**
```
"Gandalf traveled to Rivendell. Elrond lived there. He welcomed Gandalf."
```

Expected:
- "He" → Elrond (most recent PERSON subject).

**Linguistic Reference Coverage:**
- **Pattern PR-P2** (§2.2): Multiple Candidates in Previous Sentence
  - Subject preference: "he" = prior subject (Elrond) vs object.
- **§11 Salience / §11.1 Enhanced Salience:**
  - +10 / +8 for recent subjects, decayed by distance.
  - Elrond is more recent than Gandalf and subject of the previous sentence.

**Potential Issue:**
- If salience doesn't properly decay or isn't updated for Elrond, the system may incorrectly pick Gandalf.
- Fix is to ensure salience updates + decay match §11 / §11.1 (subject boost, recency).

**Current Status:** ✅ Working (100% P/R)

---

### 2.7-2.8: Coordination (X and Y) – Mixed ✅ / ❌

**Tests:**
- 2.7: "Harry and Ron studied at Hogwarts."
- 2.8: "Frodo and Sam traveled to Mordor."

**Expected:**
- 2.7:
  - Harry `studies_at` Hogwarts
  - Ron `studies_at` Hogwarts
- 2.8:
  - Frodo `traveled_to` Mordor
  - Sam `traveled_to` Mordor

**Current Behavior:**
- 2.7: ✅ Correct – emits individual relations.
- 2.8: ❌ Incorrect – emits only:
  - GROUP{Frodo, Sam} `traveled_to` Mordor.

**Linguistic Reference Coverage:**
- **Pattern CO-1** (§19.1): "X and Y" coordination
  - Two PERSON entities; plus optional group {X, Y}.
- **Pattern GR-2** (§7): Ad-hoc Groups
  - GROUP {X, Y} created from coordination.
- **Pattern CO-5** (§19.4): Distributive Verbs with Conjoined PERSON Subjects
  - For distributive relations like `traveled_to`, `studies_at`, `lives_in`, etc.:
    - Emit RELATION(person, place) for each PERSON in the coordination.
    - Optional: keep RELATION(group, place) but don't rely on it.

**Root Cause:**
- `studies_at` already uses a distributive pattern.
- `traveled_to` is still treating "Frodo and Sam" as a GROUP subject only.

**Fix Required:**
- Update the `traveled_to` emitter to use CO-5:
  - If subject is a coordination of PERSONs and verb is in the distributive set (`traveled_to`):
    - emit a relation per member:
      - Frodo → Mordor
      - Sam → Mordor
    - optionally keep the group relation.

---

### 2.9-2.10: Title / Role Back-Links ✅

**Tests:**
- 2.9: "Aragorn became king of Gondor. The king ruled wisely."
- 2.10: "Dumbledore is a wizard. The wizard teaches at Hogwarts."

**Expected:**
- 2.9:
  - Aragorn `rules` Gondor
  - "The king" → Aragorn (no new entity)
- 2.10:
  - Dumbledore is a wizard (descriptor)
  - "The wizard" → Dumbledore
  - Dumbledore `teaches_at` Hogwarts

**Linguistic Reference Coverage:**
- **Pattern NM-4** (§6): Role Titles
  - "the king" → unique governance role associated to Aragorn.
  - "the wizard" → unique role associated to Dumbledore in this local context.
- **Pattern DN-2** (§5): Simple Descriptions
  - "the X" → most recent PERSON matching description and role.
- **Pattern AP-2** (§9): Description → Proper Name
  - Once text clearly links "the king" or "the wizard" to a specific PERSON, merge as aliases for that entity.

**Potential Issue:**
- System may create separate entities for:
  - Aragorn vs "the king",
  - Dumbledore vs "the wizard".
- Should be merged via AP-2:
  - Same role + same local context + no competing candidate ⇒ unify entities.

**Current Status:** ✅ Working (100% P/R) - merging is functioning correctly

---

### 2.11: Family Relations with Pronouns ✅

**Test:**
```
"Boromir is the son of Denethor. He was a brave warrior."
```

**Expected:**
- Boromir `child_of` Denethor
- Denethor `parent_of` Boromir
- "He" → Boromir

**Linguistic Reference Coverage:**
- **Appositive / Role-like family phrases:**
  - You can view "the son of Denethor" as a descriptive NP:
    - Pattern AP-2 (§9) + a family-phrase extractor (child_of / parent_of).
- **Pattern PR-P1** (§2.2): Pronoun resolution
  - "He" → Boromir (most recent subject).

**Implementation:** ✅ Working if "son of" → child_of/parent_of is implemented (it is).

---

### 2.12: "Became King There" Relation ❌ BLOCKER

**Test:**
```
"Aragorn, son of Arathorn, traveled to Gondor. He became king there."
```

**Expected:**
- Aragorn `child_of` Arathorn
- Arathorn `parent_of` Aragorn
- Aragorn `traveled_to` Gondor
- Aragorn `rules` Gondor (from "became king there")

**Current Behavior:**
- ✅ Aragorn `child_of` Arathorn
- ✅ Arathorn `parent_of` Aragorn
- ✅ Aragorn `traveled_to` Gondor
- ❌ Missing: Aragorn `rules` Gondor

**Linguistic Reference Coverage:**
- **Pattern AP-1 / AP-3** (§9): Apposition
  - "Aragorn, son of Arathorn" handled as appositive; **already working**.
- **Role-Based Relations – Pattern RL-1** (§33): Governance Role Change
  - "became king there"
    - ROLE = king (governance role)
    - "there" → Gondor (locative anaphora)
    - Emit: `rules`(Aragorn, Gondor)

**Actual Missing Piece:**
- Appositive parsing is **not the blocker** here (those relations are already correct).
- The missing behavior is **role-to-relation mapping** for governance roles:
  - "became king there" → `rules`(person, place).

**Fix Required:**
1. Add a GOVERNANCE_ROLES lexicon (king, queen, monarch, ruler, emperor, etc.).
2. Implement RL-1:
   - For a clause of the form `X became ROLE there/of/in/over PLACE`:
     - Resolve ROLE ∈ GOVERNANCE_ROLES.
     - Resolve PLACE:
       - "there" → last salient PLACE, or
       - explicit "of PLACE", "in PLACE", "over PLACE".
     - Emit `rules`(X, PLACE).

That will directly satisfy Test 2.12.

---

### 2.13: Three-Sentence Pronoun Chain ✅

**Test:**
```
"Legolas was an elf. He was friends with Gimli. They traveled together."
```

**Expected:**
- "He" → Legolas
- "They" → GROUP {Legolas, Gimli}
- Relation: `friends_with`(Legolas, Gimli) + inverse

**Linguistic Reference Coverage:**
- **Pattern PR-P1** (§2.2): "He" → Legolas (subject continuation).
- **Pattern GR-2** (§7): Ad-hoc Groups
  - "friends with" relation between Legolas and Gimli licenses a group {Legolas, Gimli}.
- **Pattern PR-P4** (§2.2): Plural "They"
  - Bind "They" → group {Legolas, Gimli} in the next sentence.

**Potential Issue:**
- The engine may not:
  - create an implicit group from the "friends with" relation, or
  - treat "They" as referring to that group instead of introducing a new entity.

**Current Status:** ✅ Working (100% P/R) - group creation from symmetric relations functioning

---

### 2.14: Possessive Pronoun Resolution ✅

**Test:**
```
"Theoden ruled Rohan. Eowyn was his niece. She lived in Rohan."
```

**Expected:**
- Theoden `rules` Rohan
- Eowyn related_to Theoden (niece_of / uncle_of)
- "his" → Theoden
- "She" → Eowyn
- Eowyn `lives_in` Rohan

**Linguistic Reference Coverage:**
- **Possessive Pronouns as anaphors** (extends PR-P1):
  - "his niece" → possessive pronoun refers back to Theoden (prior male subject).
- **§11 Salience:**
  - Theoden is highly salient as the prior subject; "his" should resolve to him.
- **Basic NP resolution:**
  - "She" → Eowyn (most recent female PERSON subject).

**Potential Issue:**
- Possessive pronouns ("his/her/their") may not be integrated into the core salience/antecedent logic and might be treated as plain determiners without resolution.

**Current Status:** ✅ Working (100% P/R) - possessive pronoun resolution functioning

---

### 2.15: Complex Coreference Chain (Epithet) ✅

**Test:**
```
"Elrond dwelt in Rivendell. The elf lord welcomed travelers. He was wise and ancient."
```

**Expected:**
- Elrond `lives_in` Rivendell
- "the elf lord" → Elrond
- "He" → Elrond
- All descriptors ("elf lord", "wise", "ancient") attached to Elrond

**Linguistic Reference Coverage:**
- **Pattern NM-5** (§6): Epithets
  - "the elf lord" is an epithet for Elrond.
  - Once linked, treat as strong alias.
- **Pattern DN-2** (§5): Simple Descriptions
  - "the elf lord" → most recent PERSON matching description (elf, lord).
- **Pattern AP-2** (§9): Description → Proper Name
  - Merge "the elf lord" with "Elrond" when context indicates there is only one elf lord in focus.

**Potential Issue:**
- System may:
  - create separate PERSON entity for "the elf lord", and/or
  - resolve "He" to that new entity instead of Elrond.

**Current Status:** ✅ Working (100% P/R) - epithet merging functioning (though creates RACE::elf entity)

---

## Summary: Linguistic Reference Coverage

### ✅ Well-Covered and Largely Implemented
- Basic pronoun resolution (2.1–2.3, 2.4–2.5)
- Multi-entity pronoun resolution with salience (2.6)
- Basic coordination for `studies_at` (2.7)
- Simple family relations & pronoun (2.11)
- Title/role merging (2.9-2.10)
- Implicit groups from symmetric relations (2.13)
- Possessive pronouns (2.14)
- Epithet recognition (2.15)

### ❌ Specific Issues / Blockers
- **2.8**: `traveled_to` not using distributive coordination pattern CO-5.
- **2.12**: Role→relation mapping for "became king there" (needs RL-1).

---

## Recommended Fixes (Priority Order)

### Priority 1: Unblock Stage 2 ⭐

**Fix 2.8 – Coordination for `traveled_to`**
- Implement CO-5 (§19.4) for `traveled_to`:
  - If subject = coordination of PERSONs:
    - emit `traveled_to`(person, place) for each conjunct.
  - Optionally keep group relation, but tests only require per-person.

**Fix 2.12 – Role-Based Relations**
- Implement RL-1 (§33) ("became [ROLE] there/of/in PLACE" → `rules`) with a GOVERNANCE_ROLES list:
  - king, queen, monarch, ruler, emperor, etc.
  - Resolve "there" via locative anaphora to the last salient PLACE (Gondor).

---

## Using This Document

When a Stage 2 test fails:
1. **Find the test** in this document.
2. **Read the "Linguistic Reference Coverage" section** for that test.
3. **Check the referenced patterns** in `docs/LINGUISTIC_REFERENCE.md`.
4. **Implement missing patterns** or fix mismatches between the spec and code.
5. **Update this mapping** if the pattern IDs or behaviors change.

**Example workflow for test 2.12:**
```bash
# 1. Test fails
npm test tests/ladder/level-2-multisentence.spec.ts -t "2.12"

# 2. Check mapping doc
grep -A 15 "2.12" docs/LINGUISTIC_REFERENCE_TEST_MAPPING.md

# 3. Read RL-1 in linguistic reference
grep -A 15 "Role-Based Relations" docs/LINGUISTIC_REFERENCE.md

# 4. Implement 'became [ROLE] there' -> rules(person, place)
#    in the appropriate relation emitter.

# 5. Re-run the test
npm test tests/ladder/level-2-multisentence.spec.ts -t "2.12"
```

---

**Last Updated**: 2025-11-28
**Version**: 1.1
**Maintainers**: ARES Team
