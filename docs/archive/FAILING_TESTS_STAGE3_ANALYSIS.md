# ARES Stage 3 Failing Tests - Linguistic Analysis Report

**Date**: 2025-11-28
**Purpose**: Detailed analysis of failing Stage 3 tests for implementation
**Current Status**: 5/10 tests failing

---

## Executive Summary

**Overall Performance:**
- Entity Precision: 90.2% (target: ≥80%) ✅
- Entity Recall: 91.3% (target: ≥75%) ✅
- **Relation Precision: 76.0% (target: ≥80%) ❌ -4%**
- **Relation Recall: 74.2% (target: ≥75%) ❌ -0.8%**

**Failing Tests:**
1. **Test 3.1** - Possessive pronoun misattribution (Harry vs Ron's father)
2. **Test 3.2** - Missing "joined" → member_of and "rival" → enemy_of patterns
3. **Test 3.5** - Sibling misidentified as parent, missing coordination patterns
4. **Test 3.8** - "The couple" pronoun group resolution issue
5. **Test 3.9** - Title preservation ("Professor McGonagall") and missing teaching patterns

**Passing Tests:** 3.3, 3.4, 3.6, 3.7, 3.10 ✅

---

## FAILING TEST #1: Test 3.1 - Possessive Pronoun Misattribution (Critical)

### Input Text
```
"Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic."
```

### Expected Output
**Relations:**
- Harry Potter `child_of` James ✅ EXTRACTED
- James `parent_of` Harry Potter ✅ EXTRACTED
- Harry Potter `child_of` Lily Potter ✅ EXTRACTED
- **Lily Potter `parent_of` Harry Potter** ❌ MISSING
- Harry Potter `lives_in` Privet Drive ✅ EXTRACTED
- Harry Potter `friends_with` Ron Weasley ✅ EXTRACTED
- Ron Weasley `friends_with` Harry Potter ✅ EXTRACTED
- **Ron Weasley `child_of` Arthur** ❌ MISSING
- **Arthur `parent_of` Ron Weasley** ❌ MISSING

### Actual Output
**Relations Extracted:** 8 relations
- ✅ Harry Potter `child_of` James
- ✅ James `parent_of` Harry Potter
- ✅ Harry Potter `child_of` Lily Potter
- ❌ **MISSING**: Lily Potter `parent_of` Harry Potter
- ✅ Harry Potter `lives_in` Privet Drive
- ✅ Harry Potter `friends_with` Ron Weasley
- ✅ Ron Weasley `friends_with` Harry Potter
- ❌ **MISSING**: Ron Weasley `child_of` Arthur
- ❌ **MISSING**: Arthur `parent_of` Ron Weasley
- ❌ **FALSE POSITIVE**: Arthur `works_at` Ministry of Magic (actually correct, in gold standard)
- ❌ **FALSE POSITIVE**: Harry Potter `child_of` Arthur (WRONG!)

### The Linguistic Issue

**Root Cause 1: Possessive Pronoun Resolution Error**

In the sentence "His father Arthur worked at the Ministry of Magic", the possessive pronoun "His" should refer to **Ron** (the most recent male PERSON subject), but the system is resolving it to **Harry** instead.

**Sentence context:**
1. "Harry's best friend was Ron Weasley." (Harry is subject)
2. "Ron came from a large wizarding family." (Ron becomes subject)
3. "His father Arthur worked..." (His should → Ron)

**Pattern from LINGUISTIC_REFERENCE.md v0.5:**
- **§2.2 Pattern PR-P1**: Possessive pronouns follow same resolution as subject pronouns
- **§11.1 Enhanced Salience**: Most recent subject gets +10 salience

**The bug:** The salience system is not properly updating when Ron becomes the subject in sentence 2, so "His" still points to Harry from sentence 1.

**Root Cause 2: Missing Inverse Relation for Lily Potter**

The system extracted:
- Harry Potter `child_of` James → James `parent_of` Harry Potter ✅
- Harry Potter `child_of` Lily Potter → **Missing inverse** ❌

**Coordination handling issue:** "son of James and Lily Potter" is being processed, but only James is getting the inverse parent_of relation, not Lily.

**Pattern CO-1 (§19.1)**: For coordinated parents "X and Y", extract:
- Child `child_of` X → X `parent_of` Child
- Child `child_of` Y → Y `parent_of` Child

---

## FAILING TEST #2: Test 3.2 - Organizational & Adversarial Relations

### Input Text
```
"Hermione Granger was sorted into Gryffindor House. Harry Potter and Ron Weasley were also in Gryffindor.

Draco Malfoy, on the other hand, joined Slytherin. He became a rival to Harry."
```

### Expected Output
**Relations:**
- Hermione Granger `member_of` Gryffindor ✅ EXTRACTED
- Harry Potter `member_of` Gryffindor ✅ EXTRACTED
- Ron Weasley `member_of` Gryffindor ✅ EXTRACTED
- **Draco Malfoy `member_of` Slytherin** ❌ MISSING
- **Draco Malfoy `enemy_of` Harry Potter** ❌ MISSING
- **Harry Potter `enemy_of` Draco Malfoy** ❌ MISSING

### The Linguistic Issue

**Root Cause 1: Missing "joined X" → member_of Pattern**

Text: "Draco Malfoy joined Slytherin"

**Current system:** Has "sorted into" → member_of pattern ✅
**Missing:** "joined" → member_of pattern ❌

**Implementation needed:**
```typescript
// Pattern: "X joined ORG"
{
  regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+joined\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
  predicate: 'member_of',
  typeGuard: { subj: ['PERSON'], obj: ['ORG'] }
}
```

**Root Cause 2: Missing "rival" → enemy_of Pattern**

Text: "He became a rival to Harry"

**Adversarial relations (§TBD in linguistic reference):**
- rival → enemy_of
- enemy, foe, adversary → enemy_of
- opposed, fought against → enemy_of

**Implementation needed:**
```typescript
// Pattern: "X became/was a rival to Y"
{
  regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*|[Hh]e|[Ss]he)\s+(?:became|was)\s+(?:a\s+)?(?:rival|enemy|foe|adversary)\s+(?:to|of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
  predicate: 'enemy_of',
  inverse: 'enemy_of',  // Symmetric
  typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
}
```

---

## FAILING TEST #3: Test 3.5 - Sibling Relations & Family Coordination (Critical)

### Input Text
```
"The Weasley family lived at the Burrow. Molly Weasley was Arthur's wife. Their children included Ron, Ginny, Fred, and George.

Bill Weasley, the eldest son, worked for Gringotts Bank."
```

### Expected Output
**Relations:**
- Molly Weasley `lives_in` Burrow ❌ MISSING
- Arthur `lives_in` Burrow ❌ MISSING
- Molly Weasley `married_to` Arthur ✅ EXTRACTED
- Arthur `married_to` Molly Weasley ✅ EXTRACTED
- Ron `child_of` Molly Weasley ❌ MISSING
- Ron `child_of` Arthur ✅ EXTRACTED
- Ginny `child_of` Molly Weasley ❌ MISSING
- Ginny `child_of` Arthur ✅ EXTRACTED
- Bill Weasley `works_at` Gringotts Bank ✅ EXTRACTED

### Actual Output
**FALSE POSITIVES (All wrong!):**
- Bill Weasley `parent_of` Ron ❌
- Ron `child_of` Bill Weasley ❌
- Ginny `child_of` Bill Weasley ❌
- Fred `child_of` Bill Weasley ❌
- Bill Weasley `lives_in` Burrow ❌

### The Linguistic Issue

**Root Cause 1: Sibling Misidentified as Parent (Critical Bug!)**

Text: "Bill Weasley, the eldest son, worked for Gringotts Bank."

**What happened:**
1. System sees "the eldest son"
2. Incorrectly creates parent_of relations: Bill → Ron, Bill → Ginny, Bill → Fred
3. **BUG**: "eldest son" means Bill is a SIBLING, not a parent!

**Pattern needed (§TBD in linguistic reference):**

**SIBLING_INDICATORS:**
- "eldest/oldest son/daughter/child/brother/sister"
- "younger/younger brother/sister"
- "twin"

**Rule:**
- If entity has SIBLING_INDICATOR + mentioned in same family context → sibling_of (NOT parent_of)
- "Their children included X, Y, Z. Bill, the eldest son..." → Bill is sibling to X, Y, Z

**Root Cause 2: "Their children included X, Y, Z" Coordination**

Text: "Their children included Ron, Ginny, Fred, and George."

**Expected extractions:**
- Ron `child_of` Molly Weasley
- Ron `child_of` Arthur
- Ginny `child_of` Molly Weasley
- Ginny `child_of` Arthur
- Fred `child_of` Molly Weasley
- Fred `child_of` Arthur
- George `child_of` Molly Weasley
- George `child_of` Arthur

**Current system:** Only extracting Arthur as parent, missing Molly.

**Pattern needed:**
```typescript
// "Their children included X, Y, Z"
// 1. Resolve "Their" to most recent married/coupled pair
// 2. For each child in coordination:
//    - Extract child_of for BOTH parents
```

**Root Cause 3: Group Lives-in Distribution**

Text: "The Weasley family lived at the Burrow."

**Expected:** Molly and Arthur (the two adults) `lives_in` Burrow
**Actual:** Not extracting individual lives_in relations

**Pattern GR-4 (needs addition to linguistic reference):**
- "The [FAMILY_NAME] family lived at [PLACE]"
- Extract lives_in for **named family members** (Molly, Arthur)
- DO NOT extract for unnamed children unless explicitly stated

---

## FAILING TEST #4: Test 3.8 - Pronoun Group Resolution ("The couple")

### Input Text
```
"After the war, Harry Potter married Ginny Weasley. They had three children together.

Ron Weasley married Hermione Granger. The couple had two children."
```

### Expected Output
**Relations:**
- Harry Potter `married_to` Ginny Weasley ✅ EXTRACTED
- Ginny Weasley `married_to` Harry Potter ✅ EXTRACTED
- Ron Weasley `married_to` Hermione Granger ✅ EXTRACTED
- Hermione Granger `married_to` Ron Weasley ✅ EXTRACTED

### Actual Output
**FALSE POSITIVES:**
- Ron Weasley `married_to` Harry Potter ❌
- Harry Potter `married_to` Ron Weasley ❌

### The Linguistic Issue

**Root Cause: Group Noun "The couple" Resolution**

Text flow:
1. "Harry Potter married Ginny Weasley." → Creates group {Harry, Ginny}
2. "They had three children together." → "They" = {Harry, Ginny} ✅
3. "Ron Weasley married Hermione Granger." → Creates group {Ron, Hermione}
4. "The couple had two children." → "The couple" should = {Ron, Hermione}

**Bug:** "The couple" is resolving to the wrong pair, creating Ron ↔ Harry marriage relation.

**Pattern PR-P5 (needs addition to linguistic reference):**

**Group Nouns:** the couple, the pair, the duo, the two, both
- Resolve to **most recent group** created by:
  - Explicit coordination ("X and Y")
  - Symmetric relations (married_to, friends_with)
  - Explicit group formation ("formed a trio")

**Recency rule:**
- In multi-paragraph text, "the couple" refers to couple mentioned in **current or previous paragraph**, not earlier paragraphs.

---

## FAILING TEST #5: Test 3.9 - Title Preservation & Teaching Patterns

### Input Text
```
"Professor McGonagall taught Transfiguration at Hogwarts. She was also the head of Gryffindor House.

Professor Snape taught Potions. The stern professor later became headmaster."
```

### Expected Entities
- **Professor McGonagall** (PERSON)
- Hogwarts (ORG)
- Gryffindor (ORG)
- **Professor Snape** (PERSON)

### Actual Entities
- **McGonagall** ❌ (title "Professor" stripped)
- Hogwarts ✅
- Gryffindor ✅
- **Snape** ❌ (title "Professor" stripped)

### Expected Relations
- Professor McGonagall `teaches_at` Hogwarts ❌ MISSING
- Professor McGonagall `leads` Gryffindor ❌ MISSING
- Professor Snape `teaches_at` Hogwarts ❌ MISSING
- Professor Snape `leads` Hogwarts ✅ (from "became headmaster")

### Actual Relations
- McGonagall `leads` Gryffindor ❌ (extracted but with wrong entity name)

### The Linguistic Issue

**Root Cause 1: Title Stripping from Canonical Name**

**Current behavior:** "Professor McGonagall" → canonical name = "McGonagall"
**Expected behavior:** "Professor McGonagall" → canonical name = "Professor McGonagall"

**Pattern NM-3 (§6 in linguistic reference):**
- Professional titles (Professor, Doctor, etc.) should be **preserved** in canonical name when:
  - Title appears in first mention
  - Title is part of how character is consistently referred to

**Implementation fix needed:**
- Update entity canonical name selection to preserve titles
- File: `app/engine/extract/entities.ts` or `app/engine/merge.ts`

**Root Cause 2: Missing "taught X at Y" → teaches_at Pattern**

Text: "Professor McGonagall taught Transfiguration at Hogwarts."

**Current system:** Missing this pattern
**Needed pattern:**

```typescript
// Pattern: "X taught [SUBJECT] at ORG"
{
  regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+taught\s+(?:[A-Z][a-z]+\s+)?at\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
  predicate: 'teaches_at',
  typeGuard: { subj: ['PERSON'], obj: ['ORG'] }
}
```

**Note:** "taught Transfiguration at Hogwarts" should match even with the subject name in between.

---

## PASSING TESTS (For Reference)

### ✅ Test 3.3: Complex Coreference
```
"Albus Dumbledore was the headmaster of Hogwarts. The wise wizard had a phoenix named Fawkes.
He trusted Severus Snape completely. The headmaster believed Snape was loyal to the Order."
```
- Relations: 100% P, 100% R ✅
- Epithets working: "The wise wizard" → Dumbledore
- Title back-links working: "The headmaster" → Dumbledore

### ✅ Test 3.4: Event Sequence with Temporal Progression
```
"In 1991, Harry Potter started at Hogwarts School. He quickly became friends with Ron and Hermione.
During his first year, Harry faced Voldemort in the chamber. The young wizard survived the encounter."
```
- All relations extracted correctly ✅
- Coordination "Ron and Hermione" handled properly ✅

### ✅ Test 3.6: Long-Distance Coreference
```
"Luna Lovegood was a unique student at Hogwarts. She was sorted into Ravenclaw House.
The eccentric girl became close friends with Ginny Weasley..."
```
- Multi-paragraph pronoun resolution working ✅
- Epithets working: "The eccentric girl" → Luna

### ✅ Test 3.7: Three-Way Coordination
```
"Harry, Ron, and Hermione formed a powerful trio. They fought together against the Death Eaters.
The three friends traveled to many dangerous places during their quest."
```
- All three-way friendship relations extracted ✅
- Group pronouns working: "They" → {Harry, Ron, Hermione}

### ✅ Test 3.10: Complex Organizational Structure
```
"Hogwarts School was located in Scotland. Students traveled there via the Hogwarts Express from Platform 9¾.
The castle had four houses: Gryffindor, Slytherin, Hufflepuff, and Ravenclaw..."
```
- Four-way coordination: All houses `part_of` Hogwarts School ✅

---

## Summary: Implementation Roadmap

### Priority 1: Critical Bugs (Must Fix)

1. **Test 3.1 - Possessive Pronoun Resolution**
   - File: `app/engine/coref.ts` or pronoun resolution module
   - Issue: "His father Arthur" resolving to Harry instead of Ron
   - Fix: Update salience properly when new subject introduced

2. **Test 3.5 - Sibling vs Parent Detection**
   - File: `app/engine/narrative-relations.ts`
   - Issue: "eldest son" creating parent_of instead of sibling_of
   - Fix: Add SIBLING_INDICATORS list, block parent_of for siblings

3. **Test 3.1 - Inverse Relations for Coordination**
   - File: `app/engine/extract/orchestrator.ts` (inverse generation)
   - Issue: "James and Lily Potter" only creating parent_of for James, not Lily
   - Fix: Ensure inverse generation for ALL coordinated subjects

### Priority 2: Missing Patterns (Easy Wins)

4. **Test 3.2 - "joined X" → member_of**
   - File: `app/engine/narrative-relations.ts`
   - Add pattern for "joined ORG" → member_of

5. **Test 3.2 - "rival" → enemy_of**
   - File: `app/engine/narrative-relations.ts`
   - Add pattern for "rival/enemy/foe" → enemy_of

6. **Test 3.9 - "taught X at Y" → teaches_at**
   - File: `app/engine/narrative-relations.ts`
   - Add pattern for "taught [subject] at ORG" → teaches_at

### Priority 3: Complex Issues

7. **Test 3.5 - "Their children included X, Y, Z"**
   - File: `app/engine/narrative-relations.ts`
   - Resolve "Their" to married pair, distribute child_of to both parents

8. **Test 3.8 - "The couple" Group Resolution**
   - File: `app/engine/coref.ts`
   - Add group noun resolution with recency preference

9. **Test 3.9 - Title Preservation**
   - File: `app/engine/extract/entities.ts` or `app/engine/merge.ts`
   - Preserve professional titles in canonical names

10. **Test 3.5 - Family Group Distribution**
    - File: `app/engine/narrative-relations.ts`
    - "The X family lived at Y" → distribute to named members

---

## Technical Implementation Notes

### Files to Modify

1. **app/engine/narrative-relations.ts**
   - Add 3 new patterns: "joined", "rival/enemy", "taught...at"
   - Add SIBLING_INDICATORS list
   - Add family coordination patterns

2. **app/engine/coref.ts**
   - Fix possessive pronoun salience update
   - Add group noun resolution ("the couple")

3. **app/engine/extract/orchestrator.ts**
   - Fix inverse relation generation for coordination

4. **app/engine/extract/entities.ts** or **app/engine/merge.ts**
   - Update canonical name selection to preserve titles

### Testing Strategy

After each fix:
```bash
# Test specific case
npm test tests/ladder/level-3-complex.spec.ts

# Check overall progress
# Target: Relations ≥80% precision, ≥75% recall
```

---

## Next Steps

1. ✅ Create this analysis document
2. ⏭️ Update LINGUISTIC_REFERENCE.md with missing patterns:
   - SIBLING_INDICATORS (§TBD)
   - Group noun resolution (§TBD)
   - Family group distribution (§TBD)
3. ⏭️ Implement Priority 1 fixes (critical bugs)
4. ⏭️ Implement Priority 2 fixes (missing patterns)
5. ⏭️ Implement Priority 3 fixes (complex issues)
6. ⏭️ Re-run tests and verify 100% pass rate

---

**Contact**: ARES Development Team
**Related Documents**:
- `docs/LINGUISTIC_REFERENCE.md` - Linguistic patterns reference (v0.5)
- `FAILING_TESTS_LINGUISTIC_ANALYSIS.md` - Stage 2 analysis
- `tests/ladder/level-3-complex.spec.ts` - Full test suite
