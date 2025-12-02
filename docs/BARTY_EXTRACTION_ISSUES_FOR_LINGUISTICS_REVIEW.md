# Barty Beauregard Extraction Issues - Linguistics Expert Review

**Document**: ARES Entity Extraction Quality Issues
**Date**: 2025-12-02
**Test Corpus**: "Barty Beauregard and the Fabulous Fraud" (39,283 words)
**Purpose**: Get linguistic guidance on extraction patterns and entity classification

---

## Executive Summary

ARES successfully fixed the major entity merging bug (school absorbing 123 person names), but extraction quality issues remain. We need linguistic rules for:

1. **Name Fragment Handling**: "Mont Linola Junior High" → extracting "Mont" (7x) and "Linola" (7x) as separate PERSON entities
2. **Generic Word Filtering**: Common nouns extracted as PERSON entities (Hell, Hall, Well, Friend, Trail)
3. **School Name Variants**: Multiple ORG entities for same school (Mont Linola Junior, Mont Linola Junior High, Mont Linola Junior High School)
4. **Entity Type Classification**: When is "Mont Linola Jr" a person vs organization?

---

## System Overview

### Extraction Pipeline

```
1. spaCy Parser (or MockParserClient fallback)
   ↓
2. Entity Extraction (3 stages)
   - Pattern-based aliases
   - Coreference resolution
   - Partial name variant matching
   ↓
3. Entity Classification
   - NER labels → EntityType
   - Org keyword detection (school, university, company, etc.)
   - Person heuristics (1-3 capitalized tokens, no org keywords)
   ↓
4. Global Graph Merging
   - Confidence threshold: 0.93 (very strict)
   - Type compatibility checking
   - Jaccard similarity (token overlap)
   ↓
5. Output: Entities + Relations
```

### Current Entity Type Hierarchy

```typescript
type EntityType =
  | 'PERSON'      // Individual people
  | 'ORG'         // Organizations (schools, companies, churches)
  | 'PLACE'       // Geographic locations
  | 'GPE'         // Geopolitical entities (cities, states)
  | 'DATE'        // Temporal references
  | 'EVENT'       // Named events
  | 'ARTIFACT'    // Physical objects
  | 'RACE'        // Species/races
  | 'MATERIAL'    // Substances
  | 'SPELL'       // Magic spells
  | 'DEITY'       // Gods/deities
  | ...
```

---

## Current Results (After Merge Fixes)

### Global Metrics
- **Total Entities**: 213 (vs 17 before fix)
- **Total Relations**: 26 (vs 4 before)
- **Processing Speed**: 1,977 words/second
- **Chunks**: 71 segments (400-600 words each)

### Entity Type Distribution
```
PERSON: 158 entities
RACE: 23
ORG: 11
ARTIFACT: 8
PLACE: 4
MATERIAL: 3
SPELL: 3
DATE: 2
DEITY: 1
```

### Top Entities (by mention count)
```
Barty (PERSON): 53 mentions ✅
Mildred (PERSON): 17 mentions ✅
Preston (PERSON): 11 mentions ✅
Kelly (PERSON): 11 mentions ✅
Beauregard (PERSON): 10 mentions ✅
Beau (PERSON): 9 mentions ✅
Hell (PERSON): 8 mentions ❌ (should not be PERSON)
Mont (PERSON): 7 mentions ❌ (fragment of school name)
Linola (PERSON): 7 mentions ❌ (fragment of school name)
Frederick (PERSON): 5 mentions ✅
```

---

## Issue Category 1: Name Fragment Extraction

### Problem
"Mont Linola Junior High" (the school) is being fragmented into separate PERSON entities:
- "Mont" (PERSON, 7 mentions)
- "Linola" (PERSON, 7 mentions)

While the full school name also exists:
- "Mont Linola Junior High" (ORG, 2 mentions) ✅
- "Mont Linola Junior High School" (ORG, 1 mention) ✅
- "Mont Linola Junior" (ORG, 2 mentions) ✅
- "Mont Linola" (ORG, 2 mentions)
- "Mont Linola" (PLACE, 1 mention)

### Example Text Passages

**Passage 1** (from chunk 5-6):
```
"So, it pleased him when a girl met him in the Hell Hall, an abandoned
corridor at Mont Linola Junior High, and asked him to help with a simple
task: get Beau Adams expelled."
```

**Passage 2** (from chunk 8):
```
"At a school like Mont Linola Junior High, words spread like the flu."
```

**Passage 3** (from chunk 3):
```
"Later, Barty became a rival to Percy Pratt when they both competed for
the same position at Mount Lola University."
```
*(Note: "Mount Lola University" - different institution, not Mont Linola)*

**Passage 4** (from chunk 12):
```
"The school buzzed about the soon-coming summer break and end of term dance."
```

### Current Extraction Behavior

**What's happening:**
1. spaCy/MockParser identifies capitalized sequences: "Mont Linola Junior High"
2. Entity extractor creates spans for:
   - Full phrase: "Mont Linola Junior High" → ORG ✅
   - Partial match: "Mont" → classified as PERSON ❌
   - Partial match: "Linola" → classified as PERSON ❌

3. Merging logic is too strict to merge "Mont" with "Mont Linola Junior High" (Jaccard < 0.4)

### Questions for Linguistics Expert

1. **When should partial tokens from multi-word proper nouns be extracted as standalone entities?**
   - "Mont" from "Mont Linola Junior High"
   - "Stanford" from "Stanford University"
   - "New York" from "New York City"

2. **What's the linguistic rule for distinguishing person name fragments vs place name fragments?**
   - "Mont" could be a person's nickname OR part of "Mont Linola"
   - How do we know context?

3. **Should we block extraction of single-token entities that only appear as substrings of longer entities?**
   - If "Mont" only appears within "Mont Linola Junior High", never standalone, should we extract it?

---

## Issue Category 2: Generic Nouns as PERSON Entities

### Problem
Common nouns and location descriptors are being classified as PERSON entities:
- "Hell" (PERSON, 8 mentions) - from "Hell Hall"
- "Hall" (PERSON, 5 mentions) - from "Hell Hall"
- "Well" (PERSON, 3 mentions) - probably from "Well, ..." or similar
- "Friend" (PERSON, 3 mentions) - from "friend" mentions
- "Trail" (PERSON, 3 mentions) - unclear source

### Example Text Passages

**"Hell Hall" Context** (chunk 5):
```
"So, it pleased him when a girl met him in the Hell Hall, an abandoned
corridor at Mont Linola Junior High, and asked him to help with a simple task"
```

**"Friend" Context** (multiple chunks):
```
"Barty became close friends with Mildred Plume during their school years."
```

**Potential "Well" Context**:
```
"Well, I heard she's just... odd. Talks to herself a lot."
```

### Current Classification Logic

```typescript
// In MockParserClient.ts
let label: "PERSON" | "ORG" | "GPE" = "PERSON";  // ❌ Defaults to PERSON

// Checks for org keywords
if (hasOrgKeyword(phraseLower)) {
  label = "ORG";
} else if (hasPlaceKeyword(phraseLower)) {
  label = "GPE";
}
// Otherwise: stays PERSON

// Person heuristic (in global-graph.ts)
const looksLikePerson = !hasOrgKeyword && tokens.length >= 1 && tokens.length <= 3 &&
  entity.canonical.split(/\s+/).every(t => /^[A-Z]/.test(t));
```

**Why "Hell" passes as PERSON:**
- ✅ Capitalized
- ✅ 1 token (within 1-3 range)
- ✅ No org keywords
- ❌ But it's a common noun, not a name!

### Questions for Linguistics Expert

4. **What linguistic features distinguish proper nouns (names) from capitalized common nouns?**
   - "Hell Hall" (place) vs "Harry Potter" (person)
   - "Friend" (common noun) vs "Frederick" (name)
   - Context-based? Apposition ("the friend")? Determiner ("a friend" vs "Friend")?

5. **Should we maintain a blocklist of common nouns that should never be PERSON entities?**
   - Spatial: Hall, Room, Corridor, Building
   - Temporal: Day, Week, Month, Year
   - Relational: Friend, Enemy, Brother, Sister (when lowercase in source?)
   - Exclamations: Well, Oh, Ah

6. **How do we handle capitalized common nouns at sentence starts?**
   - "Friend arrived early" vs "The friend arrived early"
   - Should we require multiple occurrences to confirm it's a name?

---

## Issue Category 3: School Name Variant Consolidation

### Problem
Same school extracted as multiple ORG entities:

```
"Mont Linola Junior High School" (ORG, 1 mention)
"Mont Linola Junior High" (ORG, 2 mentions)
"Mont Linola Junior" (ORG, 2 mentions)
"Mont Linola" (ORG, 2 mentions)
```

Plus place variants:
```
"Mont Linola" (PLACE, 1 mention)
"Mount Lola" (PLACE, 1 mention) - ❓ Same place or different?
```

### Current Merging Behavior

**Why they don't merge:**
```
Entity 1: "Mont Linola Junior High School" (7 tokens)
Entity 2: "Mont Linola Junior High" (5 tokens)

Jaccard similarity = 5 / 7 = 0.71 ✅ (above 0.7 threshold)
BUT: Substring match requires exact inclusion

"Mont Linola Junior High School".includes("Mont Linola Junior High") ✅
→ Would score 0.85 confidence

BUT: Threshold is 0.93 ❌
→ Entities remain separate
```

### Questions for Linguistics Expert

7. **What's the linguistic rule for merging name variants of organizations?**
   - "Stanford University" vs "Stanford"
   - "Mont Linola Junior High School" vs "Mont Linola Junior High" vs "Mont Linola Jr"
   - Should all variants merge into one canonical form?

8. **How do we distinguish abbreviated names from different entities?**
   - "Mont Linola Junior High" vs "Mont Linola" (city name?)
   - "Washington University" vs "Washington" (person or place?)

9. **Should places and organizations with overlapping names be separate entities?**
   - "Mont Linola" (town) vs "Mont Linola Junior High" (school in that town)
   - "Stanford" (town) vs "Stanford University" (institution)

---

## Issue Category 4: Entity Type Disambiguation

### Problem
"Mont Linola Jr" extracted as **PERSON** (1 mention) instead of ORG

### Example Context
Unknown - need to find where "Mont Linola Jr" appears in text vs "Mont Linola Junior High"

### Classification Decision Tree

```
Input: "Mont Linola Jr"

Step 1: Check org keywords
  - Contains "jr" → Could be ORG (junior high) OR PERSON (Jr. suffix)
  - ❌ Ambiguous

Step 2: Check structure
  - 3 tokens: "Mont", "Linola", "Jr"
  - All capitalized ✅
  - No determiners

Step 3: Default classification
  - Falls through to PERSON (default)
```

### Questions for Linguistics Expert

10. **What's the linguistic rule for "Jr" disambiguation?**
    - PERSON: "James Smith Jr." (person with suffix)
    - ORG: "Mont Linola Jr" or "Jr. High" (junior high school abbreviation)
    - Context clues? Word order? Preceding tokens?

11. **When does a geographic name + suffix indicate a person vs institution?**
    - "Stanford" (place) vs "Leland Stanford" (person) vs "Stanford Jr." (??)
    - "Mont Linola" (place) vs "Mont Linola Jr" (person or school?)

---

## Issue Category 5: Coreference and Pronoun Resolution

### Current Behavior
Pronouns are being resolved using recency + gender matching, BUT we added defensive checks to prevent pronouns from resolving to org/place names.

### Example Patterns

**Pattern 1: School mentioned, then pronouns**
```
"At Mont Linola Junior High, students gathered. They whispered about the dance."
```
- "They" should resolve to "students", NOT "Mont Linola Junior High" ✅

**Pattern 2: Person + pronoun**
```
"Barty Beauregard stuck out. He felt out of place."
```
- "He" resolves to "Barty Beauregard" ✅

**Pattern 3: Ambiguous pronoun**
```
"The school told Preston to leave. He refused."
```
- "He" should resolve to "Preston", not "school" ✅

### Current Defensive Guards (in coref.ts)

```typescript
// Personal pronouns (he/his/her/she) check entity name for org indicators
const ORG_INDICATORS = ['school', 'junior', 'high', 'academy', 'university', ...];
const PLACE_INDICATORS = ['city', 'valley', 'mountain', 'mont ', 'mount ', ...];

if (gender === 'male' || gender === 'female') {
  if (canonicalLower.includes(orgIndicator) || canonicalLower.includes(placeIndicator)) {
    return false; // Reject pronoun match
  }
}
```

### Questions for Linguistics Expert

12. **Are our org/place indicators comprehensive enough?**
    - Current: school, junior, high, academy, university, college, city, valley, mount, etc.
    - Missing: hall, building, corridor, institution, foundation, center?

13. **Should possessive pronouns ("their", "its") have different resolution rules than personal pronouns?**
    - "The school announced their decision" - "their" could refer to school administrators
    - "Mont Linola Junior High held its dance" - "its" refers to the school institution

---

## Current Methodology Summary

### Entity Extraction Rules

1. **Pattern-Based Extraction**
   - Capitalized sequences (2+ consecutive capitalized words)
   - NER labels from spaCy (PERSON, ORG, GPE, etc.)
   - Explicit alias patterns ("known as", "called")

2. **Classification Heuristics**
   ```
   IF contains org_keyword (school, university, company, etc.)
     THEN type = ORG
   ELSE IF contains place_keyword (city, valley, river, etc.)
     THEN type = PLACE/GPE
   ELSE IF 1-3 capitalized tokens AND no org_keywords
     THEN type = PERSON
   ELSE
     THEN type = PERSON (default)
   ```

3. **Coreference Resolution**
   - Recency-based pronoun resolution
   - Gender/number matching
   - Defensive guards against org/place pronoun matches

4. **Global Merging**
   - Confidence threshold: 0.93 (very strict)
   - Jaccard similarity (token overlap) scoring
   - Type compatibility: PERSON ≠ ORG ≠ PLACE
   - Person-specific rules: require first name + surname match

### Org Keywords (Current List)
```
school, junior, high, academy, university, college, institute,
church, foundation, company, inc, llc, ltd, corp, co,
city, valley, mount, mont, river, lake, county, state
```

### Place Keywords (Current List)
```
city, valley, mountain, river, lake, island, province, state, county, kingdom
```

---

## Requested Guidance from Linguistics Expert

### Priority 1: Name Fragment Filtering
- **When should partial tokens from multi-word names be extracted?**
- **How do we identify fragments vs legitimate short names?**
- **Rule for: "Mont" from "Mont Linola Junior High"**

### Priority 2: Common Noun Filtering
- **What features distinguish proper nouns from capitalized common nouns?**
- **Should we use determiners as signals? ("the friend" vs "Friend")**
- **Recommended blocklist of common nouns?**

### Priority 3: Name Variant Merging
- **Rules for merging org name variants** (Stanford University, Stanford U, Stanford)
- **When do variants represent same entity vs different entities?**
- **Should places and orgs with overlapping names merge?**

### Priority 4: Type Disambiguation
- **"Jr" as person suffix vs org abbreviation** - disambiguation rules?
- **Geographic name + descriptor** - when is it a person vs institution?

### Priority 5: Missing Keywords
- **What org/place keywords are we missing?**
- **Should "hall", "building", "corridor" be place indicators?**
- **Should "center", "institute", "foundation" be org indicators?**

---

## Test Cases for Validation

Once we have linguistic rules, we can validate with these test cases:

### Test Case 1: Name Fragments
```
Input: "Students at Mont Linola Junior High gathered."
Expected Entities:
  - "Mont Linola Junior High" (ORG)
NOT:
  - "Mont" (PERSON)
  - "Linola" (PERSON)
```

### Test Case 2: Common Nouns
```
Input: "The friend arrived at Hell Hall."
Expected Entities:
  - "Hell Hall" (PLACE) or maybe extract nothing if it's just a description
NOT:
  - "Hell" (PERSON)
  - "Hall" (PERSON)
  - "friend" (PERSON)
```

### Test Case 3: School Variants
```
Input:
  Doc 1: "Mont Linola Junior High School held a dance."
  Doc 2: "Students at Mont Linola Junior High celebrated."
  Doc 3: "Mont Linola Jr was founded in 1950."

Expected: All 3 variants merge into single ORG entity
```

### Test Case 4: Jr Disambiguation
```
Input 1: "John Smith Jr. attended the meeting." → "John Smith Jr." (PERSON)
Input 2: "Mont Linola Jr teaches science." → "Mont Linola Jr" (ORG)

How to distinguish?
```

---

## Sample Text Excerpts

### Opening Passage (Chunk 0-1)
```
Barty Beauregard was born on October 1, 1993. He grew up in Mount Lola,
a small town in the mountains. Barty became close friends with Mildred Plume
during their school years. They attended Oakwood Academy together. Later,
Barty became a rival to Percy Pratt when they both competed for the same
position at Mount Lola University.
```

**Current Extraction:**
- ✅ Barty Beauregard (PERSON)
- ✅ Mildred Plume (PERSON)
- ✅ Percy Pratt (PERSON)
- ✅ Mount Lola University (should be ORG)
- ✅ Oakwood Academy (should be ORG)
- ❓ Mount Lola (PLACE) - the town

### School Context (Chunk 5-8)
```
So, it pleased him when a girl met him in the Hell Hall, an abandoned
corridor at Mont Linola Junior High, and asked him to help with a simple
task: get Beau Adams expelled. [...] At a school like Mont Linola Junior High,
words spread like the flu. Kids traded gossip like trading cards.
```

**Current Extraction:**
- ❌ Hell (PERSON, 8 mentions)
- ❌ Hall (PERSON, 5 mentions)
- ✅ Mont Linola Junior High (ORG, 2 mentions)
- ❌ Mont (PERSON, 7 mentions)
- ❌ Linola (PERSON, 7 mentions)
- ✅ Beau Adams (PERSON)

### Character Interaction (Chunk 15-20)
```
"Barty Beauregard," she once began. "You look so handsome in your perfect
school uniform. Did mommy iron it this morning?" The Preppy Pinks laughed.
"Oh, good one!" "My mom died when I was three," he stated. "I iron my own
clothes." Kelly loved attention. And he would make sure she got it.
```

**Current Extraction:**
- ✅ Barty Beauregard (PERSON)
- ✅ Kelly (PERSON)
- ❓ Preppy Pinks (GROUP? ORG? PERSON?)
- ❌ "Preppy" might be extracted as PERSON

---

## Appendix: Full Entity List (Top 50)

```
1. Barty (PERSON): 53 mentions
2. Mildred (PERSON): 17 mentions
3. Preston (PERSON): 11 mentions
4. Kelly (PERSON): 11 mentions
5. Beauregard (PERSON): 10 mentions
6. Beau (PERSON): 9 mentions
7. Hell (PERSON): 8 mentions ❌
8. Mont (PERSON): 7 mentions ❌
9. Linola (PERSON): 7 mentions ❌
10. Frederick (PERSON): 5 mentions
11. Andrew (PERSON): 5 mentions
12. Prescott (PERSON): 5 mentions
13. Hall (PERSON): 5 mentions ❌
14. Laurie (PERSON): 4 mentions
15. Steamy (PERSON): 3 mentions
16. Green (PERSON): 3 mentions
17. Trail (PERSON): 3 mentions ❌
18. Friend (PERSON): 3 mentions ❌
19. Melora (PERSON): 3 mentions
20. Well (PERSON): 3 mentions ❌
... [213 total entities]
```

**Organizations (11 total):**
```
- Mont Linola Junior High (ORG): 2 mentions
- Mont Linola Junior High School (ORG): 1 mention
- Mont Linola Junior (ORG): 2 mentions
- Mont Linola (ORG): 2 mentions
- High School (ORG): 2 mentions
- Oakwood Academy (ORG): ?
- [Others]
```

---

## Request for Linguistic Expert

Please provide:

1. **Specific linguistic rules** for each issue category
2. **Decision trees** for ambiguous cases (Jr., common nouns, fragments)
3. **Recommended keyword lists** (org indicators, place indicators, blocklists)
4. **Contextual clues** we should check (determiners, apposition, word order)
5. **Test case validation** - confirm expected behavior for each test case

**Format:** Numbered rules with examples, similar to LINGUISTIC_REFERENCE.md patterns

Thank you for your expertise!

---

**Generated**: 2025-12-02
**System**: ARES Advanced Relation Extraction
**Version**: Post-merge-fix (threshold 0.93)
**Corpus**: Barty Beauregard (39,283 words)
