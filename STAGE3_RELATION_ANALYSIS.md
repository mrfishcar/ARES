# Stage 3 Relation Extraction Analysis

**Date**: 2025-11-26
**Status**: 6/10 tests failing (66.2% F1, need 77%)
**Problem**: Multiple relation patterns missing or broken

---

## Current Status

**Entities**: 88.4% F1 ✅ (target: ≥77%)
**Relations**: 66.2% F1 ❌ (target: ≥77%)
- Precision: 63.7% (need ≥80%) → Too many false positives
- Recall: 68.9% (need ≥75%) → Missing 31% of relations

**Passing Tests** (4/10): 3.4, 3.6, 3.7, 3.10
**Failing Tests** (6/10): 3.1, 3.2, 3.3, 3.5, 3.8, 3.9

---

## Failing Test Analysis

### ❌ Test 3.1: Family Relations
**Text**: "Harry Potter was the son of James and Lily Potter. After their death, he lived with the Dursleys at Privet Drive..."

**Expected Relations**:
- Harry Potter --[child_of]--> James
- Harry Potter --[child_of]--> Lily Potter
- Harry Potter --[lives_in]--> Privet Drive
- Harry Potter --[friends_with]--> Ron Weasley
- Ron Weasley --[child_of]--> Arthur

**Likely Issues**:
1. "son of X and Y" not extracting child_of for both parents
2. "lived with X at Y" not extracting lives_in relation
3. Missing patterns for complex family structures

---

### ❌ Test 3.2: Organizational Membership
**Text**: "Hermione Granger was sorted into Gryffindor House. Harry Potter and Ron Weasley were also in Gryffindor. Draco Malfoy joined Slytherin. He became a rival to Harry."

**Expected Relations**:
- Hermione Granger --[member_of]--> Gryffindor
- Harry Potter --[member_of]--> Gryffindor
- Ron Weasley --[member_of]--> Gryffindor
- Draco Malfoy --[member_of]--> Slytherin
- Draco Malfoy --[enemy_of]--> Harry Potter

**Likely Issues**:
1. "sorted into X" not matching member_of pattern
2. "were also in X" not extracting membership
3. "joined X" not matching member_of pattern
4. "rival to X" not matching enemy_of pattern

---

### ❌ Test 3.3: Leadership Relations (CRITICAL)
**Text**: "Albus Dumbledore was the headmaster of Hogwarts. The wise wizard had a phoenix named Fawkes."

**Expected Relations**:
- Albus Dumbledore --[leads]--> Hogwarts

**Previous Diagnosis**:
- Pattern exists: /\\b([A-Z][\\w'-]+(?:\\s+[A-Z][\\w'-]+)*)\\s+(?:was|is)\\s+the\\s+(?:headmaster|headmistress)\\s+of\\s+([A-Z][\\w'-]+)\\b/g
- Pattern MATCHES the text ✅
- Type guard requires: subj=['PERSON'], obj=['ORG']
- Issue: "Hogwarts" might still be classified as PLACE (even with ORG_INDICATORS fix?)

**Action**: Verify entity types in extraction

---

### ❌ Test 3.5: Complex Family Relations (CRITICAL)
**Text**: "The Weasley family lived at the Burrow. Molly Weasley was Arthur's wife. Their children included Ron, Ginny, Fred, and George."

**Expected Relations**:
- Molly Weasley --[lives_in]--> Burrow
- Arthur --[lives_in]--> Burrow
- Molly Weasley --[married_to]--> Arthur
- Ron --[child_of]--> Molly Weasley
- Ron --[child_of]--> Arthur
- Ginny --[child_of]--> Molly Weasley
- Ginny --[child_of]--> Arthur

**Likely Issues**:
1. "The Weasley family lived at X" not extracting lives_in for Molly + Arthur
2. "X was Y's wife" possessive pattern not matching
3. "Their children included A, B, C, D" list extraction not working
4. Need to resolve "Their" → Molly & Arthur (coreference)

---

### ❌ Test 3.8: Marriage Relations
**Text**: "After the war, Harry Potter married Ginny Weasley. They had three children together. Ron Weasley married Hermione Granger."

**Expected Relations**:
- Harry Potter --[married_to]--> Ginny Weasley
- Ginny Weasley --[married_to]--> Harry Potter (symmetric)
- Ron Weasley --[married_to]--> Hermione Granger
- Hermione Granger --[married_to]--> Ron Weasley (symmetric)

**Likely Issues**:
1. "X married Y" pattern missing or not matching
2. Symmetric inverse not being generated

---

### ❌ Test 3.9: Teaching & Leadership Relations
**Text**: "Professor McGonagall taught Transfiguration at Hogwarts. She was also the head of Gryffindor House. Professor Snape taught Potions. The stern professor later became headmaster."

**Expected Relations**:
- Professor McGonagall --[teaches_at]--> Hogwarts
- Professor McGonagall --[leads]--> Gryffindor
- Professor Snape --[teaches_at]--> Hogwarts
- Professor Snape --[leads]--> Hogwarts

**Likely Issues**:
1. "taught X at Y" not extracting teaches_at
2. "head of X" not matching leads pattern
3. "became headmaster" (past tense) not matching leads pattern

---

## Pattern Coverage Gaps

### Missing or Broken Patterns

**1. Marriage Relations**
```
Pattern needed: "X married Y" → married_to (symmetric)
File: app/engine/narrative-relations.ts
Status: Unknown - needs verification
```

**2. Organizational Membership**
```
Patterns needed:
- "X was sorted into Y" → member_of
- "X joined Y" → member_of
- "X were in Y" → member_of
File: app/engine/narrative-relations.ts
Status: Likely missing
```

**3. Enemy/Rival Relations**
```
Patterns needed:
- "X became a rival to Y" → enemy_of
- "X was Y's enemy" → enemy_of
File: app/engine/narrative-relations.ts
Status: Likely missing
```

**4. Teaching Relations**
```
Patterns needed:
- "X taught Y at Z" → teaches_at
- "X teaches at Y" → teaches_at
File: app/engine/narrative-relations.ts
Status: Likely missing
```

**5. Leadership Relations (Variant Forms)**
```
Patterns needed:
- "X was the head of Y" → leads
- "X became headmaster" → leads (requires context)
File: app/engine/narrative-relations.ts
Status: Partial - some variants missing
```

**6. Complex Family Relations**
```
Patterns needed:
- "X was Y's wife/husband" → married_to (possessive form)
- "Their children included A, B, C" → child_of (list extraction with coreference)
- "The X family lived at Y" → lives_in (family group extraction)
File: app/engine/narrative-relations.ts
Status: Likely broken or partial
```

---

## Root Causes Summary

### 1. Missing Narrative Patterns (PRIMARY)
**Impact**: 40-50% of missing relations
- Marriage: "X married Y"
- Membership: "sorted into", "joined"
- Enemy: "rival to", "enemy of"
- Teaching: "taught at"

### 2. Pattern Variant Coverage (SECONDARY)
**Impact**: 20-30% of missing relations
- "head of" vs "headmaster of"
- "became X" (past tense variants)
- "were in X" (plural forms)

### 3. Complex Construction Handling (TERTIARY)
**Impact**: 20-30% of missing relations
- List extraction: "Their children included A, B, C, D"
- Possessive forms: "X was Y's wife"
- Family group: "The X family lived at Y"
- Coreference resolution: "Their" → Molly & Arthur

### 4. False Positives (PRECISION)
**Impact**: 16% false positive rate (63.7% precision)
- Overly broad patterns matching wrong contexts
- Type guards not strict enough
- Duplicate relations not being filtered

---

## Fix Priority

### 🔴 Priority 1: Add Missing Core Patterns (60 min)

Add patterns for:
1. Marriage: "X married Y"
2. Membership: "sorted into", "joined"
3. Enemy: "rival", "enemy"
4. Teaching: "taught at", "teaches at"

**Expected Impact**: Relations 66% → 75% F1

---

### 🟡 Priority 2: Fix Complex Family Relations (45 min)

Fix patterns for:
1. Possessive marriage: "X was Y's wife"
2. List extraction: "Their children included A, B, C"
3. Family group: "The X family lived at Y"

**Expected Impact**: Relations 75% → 82% F1

---

### 🟢 Priority 3: Improve Precision (30 min)

Tighten type guards and filter false positives:
1. More specific context requirements
2. Stricter entity type validation
3. Better duplicate filtering

**Expected Impact**: Precision 63.7% → 80%+

---

## Next Action

**Recommended**: Start with Priority 1 (add missing core patterns)

**Steps**:
1. Read `app/engine/narrative-relations.ts` to see existing patterns
2. Add missing patterns for marriage, membership, enemy, teaching
3. Run Stage 3 tests to verify improvement
4. If relations reach 75%+, move to Priority 2
5. If relations reach 80%+, move to Priority 3 for precision

**Time Estimate**: 2-3 hours to complete all priorities

---

**Prepared by**: Claude Code (Sonnet 4.5)
**Next Step**: Add missing narrative patterns
**Goal**: Achieve 80%+ relation F1 for Stage 3 completion
