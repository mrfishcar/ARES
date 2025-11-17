# ARES Ground Truth Reference

**Purpose**: Centralized documentation of expected system behavior for entity and relation extraction
**Last Updated**: 2025-11-17
**Status**: Comprehensive reference for all test levels

---

## Overview

This document defines what "correct" extraction looks like in ARES. It serves as the authoritative source of truth for developers and AI assistants working on the extraction engine.

**Key Concepts**:
- Ground truth = hand-labeled correct extractions
- Test ladder = progressive difficulty levels (1-5)
- Metrics = Precision, Recall, F1 score
- Success thresholds vary by level

---

## Test Ladder System

### Level 1: Simple Sentences
**Complexity**: Single sentence, simple grammar
**Test Count**: 20 tests
**Target Metrics**: P≥90%, R≥85%, F1≥87%
**Test File**: `/Users/corygilford/ares/tests/ladder/level-1-simple.spec.ts`

### Level 2: Multi-Sentence Narratives
**Complexity**: Multiple sentences, pronoun resolution, coordination
**Test Count**: 15 tests
**Target Metrics**: P≥85%, R≥80%, F1≥82%
**Test File**: `/Users/corygilford/ares/tests/ladder/level-2-multisentence.spec.ts`

### Level 3: Complex Narratives
**Complexity**: Multi-paragraph, complex coreference, nested entities
**Test Count**: 10 tests
**Target Metrics**: P≥80%, R≥75%, F1≥77%
**Test File**: `/Users/corygilford/ares/tests/ladder/level-3-complex.spec.ts`

### Levels 4-5: Future
**Status**: Not yet defined
**Planned**: Real-world documents, edge cases, adversarial examples

---

## Entity Types

ARES recognizes 8 core entity types:

| Type | Description | Examples |
|------|-------------|----------|
| PERSON | People, characters, individual beings | "Harry Potter", "Gandalf", "Hermione" |
| PLACE | Locations, geographic entities | "Hogwarts", "Mordor", "London", "Shire" |
| ORG | Organizations, institutions, groups | "Hogwarts School", "Ministry of Magic", "Gryffindor" |
| DATE | Dates, years, temporal references | "3019", "1991", "in 3019" |
| HOUSE | Houses, noble families | "House Stark", "House Lannister" |
| ITEM | Objects, artifacts, items | "the Ring", "Hogwarts Express" |
| WORK | Creative works, publications | "The Quibbler", "Lord of the Rings" |
| EVENT | Events, battles, occurrences | "Battle of Pelennor Fields" |

**Important**: Entity types are case-sensitive in the schema but case-insensitive in matching.

---

## Relation Types

ARES extracts 15+ relation types:

### Family Relations
- `parent_of` / `child_of` (bidirectional)
- `married_to` (bidirectional)

### Social Relations
- `friends_with` (bidirectional)
- `enemy_of` (bidirectional)

### Location Relations
- `lives_in` (PERSON → PLACE)
- `traveled_to` (PERSON → PLACE)

### Organizational Relations
- `member_of` (PERSON → ORG)
- `teaches_at` (PERSON → ORG)
- `studies_at` (PERSON → ORG)
- `attended` (PERSON → ORG)
- `leads` (PERSON → ORG)
- `rules` (PERSON → PLACE)

### Other Relations
- `fought_in` (PERSON → EVENT)
- `part_of` (ORG → ORG)
- `created` (PERSON → ITEM)
- `author_of` (PERSON → WORK)

**Bidirectional Relations**: Some relations create inverse pairs automatically (married_to, friends_with, enemy_of).

---

## Level 1 Ground Truths (20 Tests)

### Category: Family Relations

#### Test 1.1: Parent-child with appositive
**Text**: "Aragorn, son of Arathorn, married Arwen."

**Expected Entities**:
- PERSON::Aragorn
- PERSON::Arathorn
- PERSON::Arwen

**Expected Relations**:
- aragorn::child_of::arathorn
- arathorn::parent_of::aragorn
- aragorn::married_to::arwen
- arwen::married_to::aragorn

**Notes**:
- Appositive phrase "son of Arathorn" must be parsed correctly
- Marriage creates bidirectional relation

---

#### Test 1.2: Simple parent-child
**Text**: "Frodo is the son of Drogo."

**Expected Entities**:
- PERSON::Frodo
- PERSON::Drogo

**Expected Relations**:
- frodo::child_of::drogo
- drogo::parent_of::frodo

**Notes**: Standard "is the son of" pattern

---

#### Test 1.3: Marriage
**Text**: "Harry married Ginny."

**Expected Entities**:
- PERSON::Harry
- PERSON::Ginny

**Expected Relations**:
- harry::married_to::ginny
- ginny::married_to::harry

**Notes**: Simple marriage, bidirectional

---

### Category: Travel/Location

#### Test 1.4: Travel to place
**Text**: "Gandalf traveled to Rivendell."

**Expected Entities**:
- PERSON::Gandalf
- PLACE::Rivendell

**Expected Relations**:
- gandalf::traveled_to::rivendell

**Notes**: Unidirectional travel relation

---

#### Test 1.5: Lives in place
**Text**: "Bilbo lived in the Shire."

**Expected Entities**:
- PERSON::Bilbo
- PLACE::Shire

**Expected Relations**:
- bilbo::lives_in::shire

**Notes**: "the Shire" → canonicalized to "Shire"

---

#### Test 1.6: Travel to organization
**Text**: "Hermione went to Hogwarts."

**Expected Entities**:
- PERSON::Hermione
- ORG::Hogwarts

**Expected Relations**:
- hermione::traveled_to::hogwarts

**Notes**: Hogwarts typed as ORG (school), not PLACE

---

### Category: Organizational Relations

#### Test 1.7: Teaching
**Text**: "Dumbledore teaches at Hogwarts."

**Expected Entities**:
- PERSON::Dumbledore
- ORG::Hogwarts

**Expected Relations**:
- dumbledore::teaches_at::hogwarts

**Notes**: Standard teaching relation

---

#### Test 1.8: Studying
**Text**: "Ron studies at Hogwarts."

**Expected Entities**:
- PERSON::Ron
- ORG::Hogwarts

**Expected Relations**:
- ron::studies_at::hogwarts

**Notes**: Student relation to school

---

### Category: Leadership/Governance

#### Test 1.9: Became king
**Text**: "Aragorn became king of Gondor."

**Expected Entities**:
- PERSON::Aragorn
- PLACE::Gondor

**Expected Relations**:
- aragorn::rules::gondor

**Notes**: "became king of" → rules relation

---

#### Test 1.10: Ruled
**Text**: "Theoden ruled Rohan."

**Expected Entities**:
- PERSON::Theoden
- PLACE::Rohan

**Expected Relations**:
- theoden::rules::rohan

**Notes**: Direct rule relation

---

### Category: Social Relations

#### Test 1.11: Friendship
**Text**: "Legolas was friends with Gimli."

**Expected Entities**:
- PERSON::Legolas
- PERSON::Gimli

**Expected Relations**:
- legolas::friends_with::gimli
- gimli::friends_with::legolas

**Notes**: Friendship is bidirectional

---

#### Test 1.12: Enmity
**Text**: "Frodo fought against Gollum."

**Expected Entities**:
- PERSON::Frodo
- PERSON::Gollum

**Expected Relations**:
- frodo::enemy_of::gollum
- gollum::enemy_of::frodo

**Notes**: "fought against" → enemy_of (bidirectional)

---

### Category: Temporal Qualifiers

#### Test 1.13: Marriage with year
**Text**: "Aragorn married Arwen in 3019."

**Expected Entities**:
- PERSON::Aragorn
- PERSON::Arwen
- DATE::3019

**Expected Relations**:
- aragorn::married_to::arwen (qualifiers: {time: "3019"})
- arwen::married_to::aragorn (qualifiers: {time: "3019"})

**Notes**:
- DATE entity extracted for year
- Temporal qualifier attached to both relations

---

#### Test 1.14: Travel with year
**Text**: "Gandalf traveled to Minas Tirith in 3019."

**Expected Entities**:
- PERSON::Gandalf
- PLACE::Minas Tirith
- DATE::3019

**Expected Relations**:
- gandalf::traveled_to::minas tirith (qualifiers: {time: "3019"})

**Notes**: Multi-word place name preserved

---

### Category: Multi-Word Entities

#### Test 1.15: Multi-word person and org
**Text**: "Harry Potter attended Hogwarts School."

**Expected Entities**:
- PERSON::Harry Potter
- ORG::Hogwarts School

**Expected Relations**:
- harry potter::attended::hogwarts school

**Notes**: Both entities have multiple words

---

#### Test 1.16: Multi-word person and place
**Text**: "Frodo Baggins lived in Bag End."

**Expected Entities**:
- PERSON::Frodo Baggins
- PLACE::Bag End

**Expected Relations**:
- frodo baggins::lives_in::bag end

**Notes**: Entity boundaries must be correct

---

### Category: Additional Coverage

#### Test 1.17: Travel (single word)
**Text**: "Sam traveled to Mordor."

**Expected Entities**:
- PERSON::Sam
- PLACE::Mordor

**Expected Relations**:
- sam::traveled_to::mordor

**Notes**: Simple single-word entities

---

#### Test 1.18: Parent-child (standard)
**Text**: "Boromir is the son of Denethor."

**Expected Entities**:
- PERSON::Boromir
- PERSON::Denethor

**Expected Relations**:
- boromir::child_of::denethor
- denethor::parent_of::boromir

**Notes**: Standard pattern

---

#### Test 1.19: Event participation
**Text**: "Eowyn fought in the Battle of Pelennor Fields."

**Expected Entities**:
- PERSON::Eowyn
- EVENT::Battle of Pelennor Fields

**Expected Relations**:
- eowyn::fought_in::battle of pelennor fields

**Notes**:
- Critical test for entity boundary detection
- "Battle of Pelennor Fields" must be single EVENT entity
- Common failure: splitting into "Battle" + "Pelennor Fields"

---

#### Test 1.20: Dwelt (archaic verb)
**Text**: "Elrond dwelt in Rivendell."

**Expected Entities**:
- PERSON::Elrond
- PLACE::Rivendell

**Expected Relations**:
- elrond::lives_in::rivendell

**Notes**: "dwelt" → lives_in relation

---

## Level 2 Ground Truths (15 Tests)

### Category: Pronoun Resolution

#### Test 2.1: Basic pronoun (he)
**Text**: "Harry went to Hogwarts. He studied magic there."

**Expected Entities**:
- PERSON::Harry
- ORG::Hogwarts

**Expected Relations**:
- harry::traveled_to::hogwarts
- harry::studies_at::hogwarts

**Notes**:
- "He" resolves to Harry
- "there" resolves to Hogwarts
- Creates relations from both sentences

---

#### Test 2.2: Basic pronoun (she)
**Text**: "Hermione lives in London. She studies at Hogwarts."

**Expected Entities**:
- PERSON::Hermione
- PLACE::London
- ORG::Hogwarts

**Expected Relations**:
- hermione::lives_in::london
- hermione::studies_at::hogwarts

**Notes**: "She" resolves to Hermione

---

#### Test 2.3: Basic pronoun (he, travel)
**Text**: "Frodo lived in the Shire. He traveled to Mordor."

**Expected Entities**:
- PERSON::Frodo
- PLACE::Shire
- PLACE::Mordor

**Expected Relations**:
- frodo::lives_in::shire
- frodo::traveled_to::mordor

**Notes**: Two different locations

---

### Category: Gender-Aware Pronoun Resolution

#### Test 2.4: He/her pronouns
**Text**: "Aragorn married Arwen. He loved her deeply."

**Expected Entities**:
- PERSON::Aragorn
- PERSON::Arwen

**Expected Relations**:
- aragorn::married_to::arwen
- arwen::married_to::aragorn

**Notes**:
- "He" → Aragorn (male)
- "her" → Arwen (female)
- Second sentence adds context but no new relations

---

#### Test 2.5: She pronoun
**Text**: "Ginny studied at Hogwarts. She married Harry."

**Expected Entities**:
- PERSON::Ginny
- ORG::Hogwarts
- PERSON::Harry

**Expected Relations**:
- ginny::studies_at::hogwarts
- ginny::married_to::harry
- harry::married_to::ginny

**Notes**: "She" → Ginny

---

### Category: Multi-Entity Pronoun Resolution

#### Test 2.6: Multiple entities
**Text**: "Gandalf traveled to Rivendell. Elrond lived there. He welcomed Gandalf."

**Expected Entities**:
- PERSON::Gandalf
- PLACE::Rivendell
- PERSON::Elrond

**Expected Relations**:
- gandalf::traveled_to::rivendell
- elrond::lives_in::rivendell

**Notes**:
- "He" in 3rd sentence → most recent male entity (Elrond)
- "welcomed Gandalf" doesn't map to standard relation (ignored)

---

### Category: Coordination

#### Test 2.7: "and" coordination (2 people)
**Text**: "Harry and Ron studied at Hogwarts."

**Expected Entities**:
- PERSON::Harry
- PERSON::Ron
- ORG::Hogwarts

**Expected Relations**:
- harry::studies_at::hogwarts
- ron::studies_at::hogwarts

**Notes**:
- "Harry and Ron" splits into 2 entities
- Each gets separate relation to Hogwarts

---

#### Test 2.8: "and" coordination (travel)
**Text**: "Frodo and Sam traveled to Mordor."

**Expected Entities**:
- PERSON::Frodo
- PERSON::Sam
- PLACE::Mordor

**Expected Relations**:
- frodo::traveled_to::mordor
- sam::traveled_to::mordor

**Notes**: Standard coordination split

---

### Category: Title Back-Links

#### Test 2.9: Title reference ("the king")
**Text**: "Aragorn became king of Gondor. The king ruled wisely."

**Expected Entities**:
- PERSON::Aragorn
- PLACE::Gondor

**Expected Relations**:
- aragorn::rules::gondor

**Notes**:
- "The king" → Aragorn (title back-reference)
- "ruled wisely" adds no new relations

---

#### Test 2.10: Title reference ("the wizard")
**Text**: "Dumbledore is a wizard. The wizard teaches at Hogwarts."

**Expected Entities**:
- PERSON::Dumbledore
- ORG::Hogwarts

**Expected Relations**:
- dumbledore::teaches_at::hogwarts

**Notes**: "The wizard" → Dumbledore

---

### Category: Family Relations with Pronouns

#### Test 2.11: Son relationship with pronoun
**Text**: "Boromir is the son of Denethor. He was a brave warrior."

**Expected Entities**:
- PERSON::Boromir
- PERSON::Denethor

**Expected Relations**:
- boromir::child_of::denethor
- denethor::parent_of::boromir

**Notes**:
- Standard parent-child
- "He was a brave warrior" adds no relations

---

#### Test 2.12: Appositive with travel and rule
**Text**: "Aragorn, son of Arathorn, traveled to Gondor. He became king there."

**Expected Entities**:
- PERSON::Aragorn
- PERSON::Arathorn
- PLACE::Gondor

**Expected Relations**:
- aragorn::child_of::arathorn
- arathorn::parent_of::aragorn
- aragorn::traveled_to::gondor
- aragorn::rules::gondor

**Notes**:
- Combines multiple patterns
- "He" → Aragorn
- "became king there" → rules relation

---

### Category: Three-Sentence Narratives

#### Test 2.13: Three sentences, pronouns
**Text**: "Legolas was an elf. He was friends with Gimli. They traveled together."

**Expected Entities**:
- PERSON::Legolas
- PERSON::Gimli

**Expected Relations**:
- legolas::friends_with::gimli
- gimli::friends_with::legolas

**Notes**:
- "He" → Legolas
- "They" → Legolas + Gimli
- "traveled together" doesn't map to standard relation

---

#### Test 2.14: Possessive pronouns
**Text**: "Theoden ruled Rohan. Eowyn was his niece. She lived in Rohan."

**Expected Entities**:
- PERSON::Theoden
- PLACE::Rohan
- PERSON::Eowyn

**Expected Relations**:
- theoden::rules::rohan
- eowyn::lives_in::rohan

**Notes**:
- "his niece" → family relation, but "niece" not in standard relations
- Only extract relations we have predicates for

---

### Category: Complex Coreference Chain

#### Test 2.15: Multiple referring expressions
**Text**: "Elrond dwelt in Rivendell. The elf lord welcomed travelers. He was wise and ancient."

**Expected Entities**:
- PERSON::Elrond
- PLACE::Rivendell

**Expected Relations**:
- elrond::lives_in::rivendell

**Notes**:
- "The elf lord" → Elrond (title)
- "He" → Elrond
- "welcomed travelers" and "was wise" don't map to standard relations

---

## Level 3 Ground Truths (10 Tests)

Level 3 tests are complex multi-paragraph narratives. See test file for full details.

### Key Patterns in Level 3

**Test 3.1**: Harry Potter family narrative
- Multiple generations (Harry → James/Lily, Ron → Arthur)
- Cross-family friendships
- Complex entity relationships

**Test 3.2**: House membership
- Multiple students in same house
- Rival relationships between houses

**Test 3.3**: Title coreference chains
- "Albus Dumbledore" → "the wise wizard" → "He" → "the headmaster"
- Long-distance coreference

**Test 3.4**: Temporal event sequence
- Year entities (1991)
- Multi-year narratives
- Event participation

**Test 3.5**: Large family (Weasleys)
- Multiple children
- Parent-child relations for all
- Organizational ties

**Test 3.6-3.10**: Additional complex patterns
- See test file for details

---

## Common Edge Cases

### Entity Boundary Issues

**Problem**: Multi-word entities incorrectly split
- Bad: "Battle" (EVENT) + "Pelennor Fields" (PLACE)
- Good: "Battle of Pelennor Fields" (EVENT)

**Fix**: Use "of" as entity connector for event/work names

---

### Pronoun Ambiguity

**Problem**: Multiple candidates for pronoun resolution
- "Harry talked to Ron. He laughed." (He = Harry or Ron?)

**Strategy**: Recency bias (most recent entity of matching gender)

---

### Coordination Ambiguity

**Problem**: "King and Queen" vs "Harry and Ron"
- "King and Queen" could be title pair OR two people

**Strategy**: Context-dependent. If proper names follow, split. If generic titles, may be single entity.

---

### Relation Canonicalization

**Problem**: Surface text vs canonical name mismatch
- Text: "Harry married Ginny"
- Canonical names: "Harry Potter", "Ginny Weasley"
- Gold expects: "harry::married::ginny" (surface form)

**Fix**: Relations use surface mentions, not post-merge canonical names

---

## Success Criteria by Level

### Level 1 (Simple Sentences)
- Entity Precision: ≥90%
- Entity Recall: ≥85%
- Relation Precision: ≥90%
- Relation Recall: ≥85%
- F1 Score: ≥87%

### Level 2 (Multi-Sentence)
- Entity Precision: ≥85%
- Entity Recall: ≥80%
- Relation Precision: ≥85%
- Relation Recall: ≥80%
- F1 Score: ≥82%

### Level 3 (Complex)
- Entity Precision: ≥80%
- Entity Recall: ≥75%
- Relation Precision: ≥80%
- Relation Recall: ≥75%
- F1 Score: ≥77%

**Note**: Thresholds decrease with complexity, reflecting increased difficulty.

---

## Metrics Calculation

### Precision
```
Precision = (Correct Extractions) / (Total Extractions)
```
Measures accuracy: "Of what we extracted, how much was correct?"

### Recall
```
Recall = (Correct Extractions) / (Total Gold Standard)
```
Measures completeness: "Of what should be extracted, how much did we find?"

### F1 Score
```
F1 = 2 * (Precision * Recall) / (Precision + Recall)
```
Harmonic mean of precision and recall.

---

## Test Format

### Entity Format
```typescript
{ text: "Entity Name", type: "TYPE" }
```
- text: Exact surface form as it appears in text
- type: One of 8 entity types

### Relation Format
```typescript
{
  subj: "subject_canonical",
  pred: "relation_type",
  obj: "object_canonical",
  qualifiers?: { time?: "date", place?: "location" }
}
```
- subj/obj: Lowercase canonical names
- pred: Relation type from standard set
- qualifiers: Optional temporal/location context

---

## Known Limitations

### Current System (Phase 1 Complete)
- Simple sentences: Excellent (92-100%)
- Compound sentences: Needs work (Phase 2)
- Complex coreference: Not yet implemented
- Cross-document merging: Not yet implemented

### Planned Improvements
- Phase 2: Clause detection, coordination splitting
- Phase 3: Advanced coreference resolution
- Phase 4: Domain-specific extraction
- Phase 5: Cross-document entity linking

---

## Related Documentation

- Test files: `/Users/corygilford/ares/tests/ladder/*.spec.ts`
- Master plan: `/Users/corygilford/ares/docs/ENTITY_EXTRACTION_MASTER_PLAN.md`
- Development workflow: `/Users/corygilford/ares/docs/DEV_LOOP.md`
- Quick start: `/Users/corygilford/ares/docs/AI_ASSISTANT_QUICK_START.md`

---

## Using This Document

### For Developers
- Reference when implementing new patterns
- Verify expected behavior before debugging
- Add new test cases following these patterns

### For AI Assistants
- Check ground truths before modifying extraction logic
- Understand what "correct" means for each pattern
- Use as success criteria for implementations

### For Testing
- Generate new test cases matching these patterns
- Validate extraction results against ground truths
- Report discrepancies as bugs or enhancement requests

---

**Last Updated**: 2025-11-17
**Maintainer**: ARES Project Team
**Questions**: See `/Users/corygilford/ares/docs/FOR_AGENTS.md`
