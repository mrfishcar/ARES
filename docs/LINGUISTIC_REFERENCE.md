# ARES Linguistic Reference (v0.6)

## Purpose
A practical, pattern-based English handbook for ARES and its AI debuggers, focused on
reference and entity behavior in narrative fiction.

**This file is for AI systems and tools (Claude, Codex, etc.) working on ARES.**
Whenever a failing test is about "who/what does this refer to?", consult this file before
inventing new heuristics.

---

## Table of Contents

0. [Core Concepts](#0-core-concepts)
1. [Global Reference Resolution Pipeline](#1-global-reference-resolution-pipeline)
   - [1.1 Quick Reference: Resolution Priority](#11-quick-reference-resolution-priority)
2. [Personal Pronouns](#2-personal-pronouns-he-she-they-it-we-you)
3. [Demonstratives](#3-demonstratives-this-that-these-those)
4. [Reflexives, Reciprocals, and "One" Anaphora](#4-reflexives-reciprocals-and-one-anaphora)
5. [Definite Noun Phrases & Descriptions](#5-definite-noun-phrases--descriptions)
6. [Names, Surnames, Titles, and Epithets](#6-names-surnames-titles-and-epithets)
7. [Groups, Families, and Collectives](#7-groups-families-and-collectives)
8. [Bridging Anaphora](#8-bridging-anaphora-non-identity-reference)
9. [Apposition, Renaming, and Identity](#9-apposition-renaming-and-identity)
10. [Event / Clause / VP Anaphora](#10-event--clause--vp-anaphora)
11. [Salience, Ambiguity, Confidence, and HUMAN_QUESTION](#11-salience-ambiguity-confidence-and-human_question)
12. [Indefinite Pronouns and Quantifiers](#12-indefinite-pronouns-and-quantifiers)
13. [Cataphora (Forward Reference)](#13-cataphora-forward-reference)
14. [Generic vs Specific Reference](#14-generic-vs-specific-reference)
15. [Usage & Extension Principles](#15-usage--extension-principles)
16. [Dialogue and Quotation Handling](#16-dialogue-and-quotation-handling)
17. [Ellipsis and Gapping](#17-ellipsis-and-gapping)
18. [Relative Clauses and Embedded References](#18-relative-clauses-and-embedded-references)
19. [Coordination Ambiguity](#19-coordination-ambiguity)
20. [Discourse Connectives](#20-discourse-connectives)
21. [Nominalizations](#21-nominalizations)
22. [Idioms and Fixed Expressions](#22-idioms-and-fixed-expressions)
23. [Quantifier Scope and Ambiguity](#23-quantifier-scope-and-ambiguity)
24. [Temporal Expressions](#24-temporal-expressions)
25. [Locative Expressions](#25-locative-expressions)
26. [Non-finite Clauses](#26-non-finite-clauses)
27. [Discourse-Level Phenomena](#27-discourse-level-phenomena)
28. [Error Cases and Malformed Input](#28-error-cases-and-malformed-input)
29. [Cross-Document Coreference](#29-cross-document-coreference)
30. [Common Resolution Failures (Debugging Guide)](#30-common-resolution-failures-debugging-guide)
31. [Implementation Sketches](#31-implementation-sketches-non-binding-examples)
32. [Testing: Pattern Validation Templates](#32-testing-pattern-validation-templates)

---

## 0. Core Concepts

### Entity
A real or fictional thing we track: PERSON, GROUP, ORG, PLACE, OBJECT,
CREATURE, EVENT, TIME, KIND, etc.

### Mention
A span of text that refers to an entity, event, or proposition:
- proper names, noun phrases, pronouns, demonstratives, titles, epithets, etc.

### Antecedent / Postcedent
- **Antecedent**: earlier mention an anaphor refers back to.
- **Postcedent**: later mention an expression refers forward to (cataphora).

### Anaphora / Cataphora
- **Anaphora**: expression interpreted using previous material.
  - "Harry walked in. He sat down."
- **Cataphora**: expression interpreted using later material.
  - "Before he spoke, Harry took a breath."

### Alias
Alternative surface forms for the same entity:
- "Harry", "Harry Potter", "Potter", "the boy who lived", "the headmaster".

### Group Entity
An entity for a collection: "the Potters", "the Dursleys", "the students".

### Bridging Anaphora
Non-identity reference that presupposes a relationship:
- "the door" after "the house"; "the driver" after "the car".

### Salience
Approximation of how "in focus" an entity is, based on:
- Recency of mention
- Grammatical role (subject > object > oblique)
- Repeated mention in current scene
- Discourse position / topic status
- "Protagonist" status if known

---

## 1. Global Reference Resolution Pipeline

Whenever resolving a reference (pronoun, description, surname, group phrase, etc.):

1. **Collect Candidates**
   - Look back over the last N sentences (recommended: 3–5).
   - Collect entities with compatible:
     - Type (PERSON/GROUP/ORG/PLACE/OBJECT/EVENT/etc.)
     - Number (singular/plural)
     - Gender (if known and relevant).

2. **Apply Hard Filters**
   - Enforce number agreement.
   - Enforce type compatibility:
     - he/she/they → typically PERSON
     - it → typically OBJECT / PLACE / EVENT (non-human by default).
   - Optionally enforce gender when explicit.

3. **Compute Salience + Confidence**
   - Use a salience score per entity (see §11).
   - Combine:
     - salience
     - recency
     - pattern strength (e.g., reflexive binding is very high confidence)
   - Derive a resolution confidence (e.g., high/medium/low; 0–1 float).

4. **Rank and Decide**
   - Rank candidates by (confidence, salience_score, recency).
   - If a single clear winner with high confidence → choose it.
   - If multiple tie or confidence is low:
     - apply specialized rules (pronouns, surnames, group, bridging, dialogue, etc.).
   - If still ambiguous:
     - Non-interactive mode: prefer no binding over a risky guess.
     - Interactive mode: issue a HUMAN_QUESTION (§11 / §27 / §28).

---

### 1.1 QUICK REFERENCE: Resolution Priority

1. **Agreement first**
   - Number, gender (if known), type (PERSON/GROUP/PLACE/OBJECT/EVENT)

2. **Local window**
   - Limit to last 3–5 sentences unless no candidates exist

3. **Grammatical role**
   - Subject > object > other roles

4. **Recency**
   - Among compatible candidates, newer mentions beat older ones

5. **Salience boosts**
   - Named protagonists, repeated mentions, current speaker in dialogue

6. **Special patterns**
   - Dialogue rules (§16), bridging (§8), families/groups (§7), relative clauses (§18)

7. **Ambiguity handling**
   - If still unclear:
     - interactive mode → HUMAN_QUESTION
     - non-interactive mode → no binding

---

## 2. Personal Pronouns (he, she, they, it, we, you)

### 2.1 Core Constraints

**PR-1. Agreement**
- Must agree with antecedent in:
  - Number (singular/plural)
  - Person (1st / 2nd / 3rd)
  - Gender where known (he vs she vs they)

**PR-2. One Clear Antecedent**

Prefer a reading with one plausible antecedent.
If multiple are equally plausible → ambiguous.

**PR-3. Locality**

Prioritize candidates from the same sentence or immediately previous sentence; older mentions are downgraded.

---

### 2.2 "He / She / They / It" in Narrative

#### Pattern PR-P1 – Simple Subject Continuation

```
"Harry picked up the wand. He examined it."
```

- "He" → last salient PERSON subject ("Harry").
- "it" → last salient non-human object ("wand").

#### Pattern PR-P2 – Multiple Candidates in Previous Sentence

```
"Harry glared at James. He turned away."
```

- Candidates: Harry (subject), James (object).
- Subject preference:
  - If nothing else disambiguates, "he" = prior subject (Harry).
  - If both are plausible in context:
    - treat as ambiguous or ask via HUMAN_QUESTION.

#### Pattern PR-P3 – Singular "They"

```
"Someone knocked at the door. They sounded nervous."
```

- Treat singular "they" as 3rd-person, effectively singular, gender-neutral.
- Bind to nearest indefinite singular NP ("someone", "anybody", etc.) that fits.

#### Pattern PR-P4 – Plural "They"

```
"Harry and Ron left the hall. They walked toward the lake."
```

- Bind to:
  - explicit GROUP ("the students"), or
  - composite group from conjoined NPs (Harry+Ron).

#### Pattern PR-P5 – Generic "You / They / We"

```
"In this town, they say the forest is haunted."
"If you're a wizard, you never really retire."
```

- Mark as GENERIC_PRONOUN (no concrete entity).
- Heuristic cues:
  - proverbs, general truths, instructions, "they say that…", etc.

#### Pattern PR-P6 – Expletive/Dummy "It"

```
"It is raining."
"It seems that the castle is moving."
```

- Mark as EXPLETIVE_IT (non-entity).
- Template: "It + be/seem/appear + adjective/clause/weather/time".

### 2.3 Possessive Pronouns ("his", "her", "their")

#### Pattern PR-P7 – Possessive Pronouns as Full Anaphors

```
"Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic."
```

- "His" must be resolved using the **same pipeline** as subject/object pronouns:
  - Candidate set: PERSON entities compatible in gender/number.
  - Salience: prefer **most recent subject** (`Ron` in this example), with recency penalty applied as in §11.
- Once the owner is resolved:
  - attach possessive NP as a relation if a kinship pattern is recognized (e.g. "his father", "their children"),
  - or treat it as a descriptor NP over that owner.

**Rule:**

1. When encountering a possessive pronoun (`his/her/their/its`) as determiner of a noun:
   - Run full pronoun-resolution algorithm (agreement + salience).
   - Do **not** default to the earlier subject if a more recent subject exists.

2. For "His/Her father/mother/son/daughter/child/niece/nephew…":
   - Trigger kinship relation patterns (see §7 Kinship below).

---

## 3. Demonstratives (this, that, these, those)

#### Pattern DM-1 – "This/That/These/Those + NOUN"

```
"Harry picked up a wand. This wand felt different."
"He hated those relatives."
```

- Treat as definite NP; bind by head noun + recency + type.

#### Pattern DM-2 – Bare "This/That" as Event/Proposition

```
"Harry failed the exam. This upset him deeply."
"Ron told a joke. That made everyone laugh."
```

- Mark as EVENT_OR_PROPOSITION_REF, not a concrete entity.

#### Pattern DM-3 – Bare "This/That" Introducing an Entity

```
"This is Harry's new broom."
```

- In copular structures, "this/that" can introduce an entity; bind to NP that follows.

---

## 4. Reflexives, Reciprocals, and "One" Anaphora

#### Pattern RF-1 – Reflexives

```
"Harry blamed himself."
"The twins blamed themselves."
```

- Bind reflexive pronoun to clause subject, matching number/person.

#### Pattern RF-2 – Reciprocal Pronouns

```
"Harry and Ron stared at each other."
```

- Antecedent is plural subject ("Harry and Ron").

#### Pattern RF-3 – "One/Ones"

```
"Harry tried a red wand and a blue one."
"He liked the green books more than the red ones."
```

- "one/ones" → head noun of earlier NP with compatible semantics.

---

## 5. Definite Noun Phrases & Descriptions

#### Pattern DN-1 – Indefinite → Definite

```
"A boy entered the room. The boy sat down."
```

- "the boy" → previously introduced "a boy".

#### Pattern DN-2 – Simple Descriptions

```
"Harry saw a man at the counter. The man looked nervous."
```

- Bind "the man" to most recent PERSON matching description.

#### Pattern DN-3 – Descriptions with Modifiers

```
"A boy with glasses entered. The boy sat quietly."
```

- Use modifiers (with glasses) to choose among multiple "boy" entities when possible.

---

## 6. Names, Surnames, Titles, and Epithets

#### Pattern NM-1 – Canonical Names
- Prefer shortest unambiguous full name as canonical, e.g. "Harry Potter".

#### Pattern NM-2 – Surname-Only Mentions

```
"Harry Potter entered. Potter stared at the Sorting Hat."
```

- Only one Potter → surname is strong alias.
- Multiple Potters → surname is ambiguous alias:
  - filter by surname, then salience/recency.
  - **never merge distinct entities solely by surname**.

#### Pattern NM-3 – Titles + Names

```
"Professor McGonagall", "Mr. Dursley"
```

- "Title + Name" is strong alias for that PERSON.
- Bare title ("Professor") is ambiguous unless unique in context.

#### Pattern NM-4 – Role Titles

```
"the Potions Master", "the headmaster"
```

- If role uniquely associated to one entity → alias.
- Else: separate ROLE/PERSON or generic entity.

#### Pattern NM-5 – Epithets

```
"the Boy Who Lived", "the Dark Lord"
```

- Once the text links epithet to a PERSON, treat as strong alias for that entity.

####Pattern NM-6 – Canonical Names with Titles

```
"Professor McGonagall taught Transfiguration at Hogwarts."
"Professor Snape taught Potions."
"Doctor Smith arrived." (if consistently used)
```

**Rule:**

1. If a PERSON is **first introduced** with a professional or honorific title + surname:
   - e.g. "Professor McGonagall", "Professor Snape", "Doctor Watson"
2. And that exact form is used consistently in the narrative as the character's main handle:
   - then the **canonical name** should preserve the title:
     - canonical: "Professor McGonagall", not just "McGonagall".

3. Shorter aliases (e.g. "McGonagall", "Snape") should be stored as **aliases**, not canonical replacements:
   - `aliases = ["McGonagall"]`, `canonical = "Professor McGonagall"`.

4. Exceptions:
   - If later the text clearly prefers a different full name (e.g. "Minerva McGonagall") and uses it consistently, the system may promote that to canonical while retaining the titled form as an alias.

**Implementation Guidance:**

- In canonical-name selection logic:
  - When multiple surface forms exist:
    - prefer the earliest **longest** form that includes a stable title (Professor/Doctor/etc.) over bare surnames,
    - unless an even more complete name (with given name) appears and is used frequently.

---

## 7. Groups, Families, and Collectives

#### Pattern GR-1 – Family Groups

```
"The Weasleys arrived at the station."
```

- Create GROUP entity ("Weasley family").
- Link individual Weasleys via member_of.
- "they" → group, not a single member.

#### Pattern GR-2 – Ad-hoc Groups (Conjoined NPs)

```
"Harry and Ron entered. They looked nervous."
```

- Create temporary GROUP {Harry, Ron}; "they" → that group.

#### Pattern GR-3 – Collective Nouns

```
"the team", "the class", "the crowd"
```

- Treat as GROUP entities.
- "they" → group.

### 7.1 Sibling Indicators vs Parent Roles

#### Pattern FM-1 – Sibling Indicators (NOT Parents)

```
"Bill Weasley, the eldest son, worked for Gringotts Bank."
"She was the youngest daughter."
"Their twin sons, Fred and George, were troublemakers."
```

**SIBLING_INDICATORS** (non-exhaustive):

- eldest / oldest son / daughter / child / brother / sister
- younger / youngest son / daughter / brother / sister / child
- twin / twin brother / twin sister / twins

**Rule:**

- If an NP describing a PERSON X includes a **sibling indicator** and appears in the context of a known **parental couple** and **their children**, then:
  - X should be treated as a **sibling** of the other children, **not** as a parent.
- Explicitly:
  - Never infer `parent_of` or `child_of` from phrases like "the eldest son/daughter/child" alone.
  - Instead, allow `sibling_of` to be inferred between X and other children **if needed**, but default is just a descriptor.

**Example (Weasley family):**

```
"Their children included Ron, Ginny, Fred, and George.
Bill Weasley, the eldest son, worked for Gringotts Bank."
```

- Parents: Molly Weasley, Arthur Weasley (from context).
- "Their children" → {Ron, Ginny, Fred, George}.
- "Bill … the eldest son":
  - X = Bill; descriptor "eldest son" ⇒ Bill is **also** a child of Molly & Arthur.
  - DO NOT emit `Bill parent_of Ron/Ginny/Fred/George`.

### 7.2 "Their children included X, Y, Z"

#### Pattern FM-2 – Children Enumeration

```
"Their children included Ron, Ginny, Fred, and George."
"Their sons were Bill and Charlie."
```

**Rule:**

1. Resolve "Their":
   - use pronoun resolution to find the **owning couple**:
     - Most often the most recent `married_to` pair or explicit parents mentioned (e.g. Molly + Arthur).

2. Identify child list:
   - Coordination of names following "children included", "sons were", "daughters were", etc.
     - "children included X, Y, Z"
     - "children were X, Y, Z"
     - "sons/daughters were X, Y, Z"

3. For each child `C` in that list:
   - Emit:
     - `C child_of Parent1`
     - `C child_of Parent2` (if pair known)
   - And corresponding inverses:
     - `Parent1 parent_of C`
     - `Parent2 parent_of C`

4. **Do not** infer any child's children from these lines (no grandchildren).

### 7.3 Family Group Lives-In Distribution

#### Pattern GR-4 – Family Group Residence Distribution

```
"The Weasley family lived at the Burrow."
```

- There is a FAMILY GROUP entity ("Weasley family").
- Parents (e.g. Molly & Arthur) are known by name from nearby context.

**Rule:**

1. When a FAMILY GROUP ("The [Surname] family") is said to `live at` PLACE:
   - always emit `lives_in(FAMILY_GROUP, PLACE)`.

2. Additionally, if named **adult family members** (parents) are known:
   - emit `lives_in(parent, PLACE)` for each adult parent:
     - `Molly Weasley lives_in Burrow`
     - `Arthur Weasley lives_in Burrow`

3. **Do not automatically emit** `lives_in` for **unnamed** children:
   - only propagate to named adults and/or children mentioned explicitly elsewhere.

### 7.4 Group Nouns & Couple References

#### Pattern GN-1 – "the couple / the pair / the two / the duo"

```
"Harry Potter married Ginny Weasley. They had three children together.
Ron Weasley married Hermione Granger. The couple had two children."
```

- "the couple" should refer to the **most recent couple** introduced (Ron + Hermione), not the earlier one.

**GROUP_NOUNS**:

- the couple, the pair, the two, the duo
- (optionally) the newlyweds, the two friends (later)

**Rule:**

1. Maintain a stack/list of **recently formed groups**, especially:
   - couples from `married_to` relations,
   - ad-hoc groups from "X and Y" with relationship verbs ("married", "friends with", "formed a trio").

2. When encountering "the couple / the pair / the two / the duo":
   - Resolve to the **most recent 2-person group** in the current paragraph or immediately preceding paragraph.

3. If multiple couples are equally recent and compatible:
   - treat as ambiguous; in interactive mode, issue `HUMAN_QUESTION`.

4. Do not create a new group; this phrase is a *reference* to an existing group.

---

## 8. Bridging Anaphora (Non-Identity Reference)

#### Pattern BR-1 – Part–Whole

```
"I entered a house. The door was red."
```

- "the door" is part_of(house).

#### Pattern BR-2 – Set–Member and Member–Set

```
"The class took their seats. One student looked nervous."
"A student walked in. The class watched silently."
```

- Set→member: member_of(student, class).
- Member→set: weaker group relation.

#### Pattern BR-3 – Possessor / Ownership

```
"Harry bought a wand. The handle was carved with runes."
```

- "handle" is part_of(wand).

```
"She parked the car. The driver got out."
```

- "driver" is role; driver_of(driver, car).

#### Pattern BR-4 – Event-Based Bridging

```
"Harry cast a spell. The effect was immediate."
```

- "effect" is result_of(spell_event).

---

## 9. Apposition, Renaming, and Identity

#### Pattern AP-1 – Simple Apposition

```
"Harry, a skinny boy with glasses, walked in."
```

- Both NPs → same PERSON entity; attach descriptors.

#### Pattern AP-2 – Description → Proper Name

```
"The boy who lived stood there. Harry Potter didn't feel brave at all."
```

- Merge "the boy who lived" with "Harry Potter" once equivalence is clear.

#### Pattern AP-3 – Name + Role Apposition

```
"Severus Snape, the Potions Master, frowned."
```

- "Severus Snape" and "the Potions Master" → same PERSON + role relation.

---

## 10. Event / Clause / VP Anaphora

#### Pattern EV-1 – VP Anaphora ("do so / do it / did too")

```
"Harry raised his wand. Ron did so too."
"Harry opened the door, and Ron did it as well."
```

- VP anaphora repeats prior event/action.
- Treat as referring to earlier EVENT, not as new ENTITY.

#### Pattern EV-2 – "So" (Proposition/State)

```
"Harry failed the exam, and rightly so."
"She was angry, and understandably so."
```

- "so" refers to prior proposition/state; mark as EVENT/STATE reference.

#### Pattern EV-3 – "Such"

```
"Harry faced a danger. Such was his destiny."
```

- "such" refers to prior situation; treat similarly.

#### Pattern EV-4 – Temporal/Locative Adverbs ("then", "there")

```
"Harry went to the forest. There, he met a centaur."
"She studied for hours. Then she slept."
```

- These reference prior time or place; see §§24–25.

---

## 11. Salience, Ambiguity, Confidence, and HUMAN_QUESTION

Per entity, track:
- `lastMentionSentenceIndex`
- `mentionCountInScene`
- `lastRole` (subject/object/other)
- `baseSalience` (optionally higher for main characters)

### 11.1 Enhanced Salience Factors

Example scoring (tunable):
- +10 for subject in current sentence
- +8 for subject in previous sentence
- +6 for proper name mention
- +5 for repeated epithet/title
- +3 for object position
- +2 for other mentions
- Protagonist boost: +5 for known main characters

Decay per sentence:
- Multiply salience by ~0.7 per sentence (faster decay than 0.9).

### 11.2 Confidence Scoring (Sketch)

Combine:
- salience difference between best and second-best candidate
- type/number/gender alignment
- pattern strength (reflexive binding = high confidence; long-distance pronoun = low)

Map to [0, 1] or tiers (high/medium/low).
Low confidence + multiple candidates → potential ambiguity.

### 11.3 Ambiguity Criteria

Treat as ambiguous if:
- ≥ 2 candidates:
  - pass agreement + type filters, and
  - have similar salience, and
  - no pattern here clearly selects one, and
  - confidence is below threshold (e.g., < 0.7).

### 11.4 HUMAN_QUESTION (Interactive Mode)

When ambiguous and tests require a specific choice, emit:

```
HUMAN_QUESTION:
- kind: <pronoun_resolution | surname_alias | group_reference | bridging | dialogue | ellipsis | other>
- text_span: "<the ambiguous phrase>"
- context_excerpt: "<1–3 sentences of context>"
- candidates: ["Entity A", "Entity B", ...]
- your_best_guess: "Entity A" or "null"
- reasoning: "<brief explanation of why this is ambiguous>"
```

Non-interactive mode: prefer no binding over a blind guess.

---

### 11.5 Implementation Sketch – Salience Tracking (Example)

```python
class EntitySalience:
    def __init__(self):
        self.scores = {}         # entity_id -> float
        self.last_mention = {}   # entity_id -> sentence_idx

    def decay(self, current_sentence_idx: int):
        for eid, last_idx in self.last_mention.items():
            distance = current_sentence_idx - last_idx
            if distance > 0:
                # Example: exponential decay per sentence
                self.scores[eid] *= (0.7 ** distance)

    def update_mention(self, entity_id: str, role: str, sentence_idx: int, protagonist=False):
        base = {
            "subject_current": 10,
            "subject_prev": 8,   # if you're updating retrospectively
            "object": 3,
            "other": 2,
        }
        bonus = 0
        if protagonist:
            bonus += 5
        # Here we only illustrate one role:
        increment = base.get(role, 2) + bonus
        self.scores[entity_id] = self.scores.get(entity_id, 0) + increment
        self.last_mention[entity_id] = sentence_idx
```

---

## 12. Indefinite Pronouns and Quantifiers

#### Pattern QF-1 – "Everyone / Everybody / All the X"

```
"Everyone was watching. They held their breath."
```

- GROUP or GENERIC PEOPLE entity.
- "They" → that group.

#### Pattern QF-2 – "Someone / Anyone / No one / Nobody"

```
"Someone knocked. They didn't speak."
```

- Specific-but-unknown PERSON.
- "They" → that entity.

#### Pattern QF-3 – "None / Neither / Either / Each"

```
"Neither boy spoke. Each stared at the floor."
```

- Bind to previously mentioned set ("the boys").
- Interpret quantifier in relation to that set.

---

## 13. Cataphora (Forward Reference)

#### Pattern CA-1 – Pronoun Before Name

```
"Before he spoke, Harry took a breath."
```

- If no backward antecedent:
  - allow forward search within same sentence or clause.
  - Bind "he" to "Harry" when they agree.

#### Pattern CA-2 – Cleft "It"

```
"It was Harry who spoke first."
```

- "It" is expletive; real subject = Harry.
- Mark "it" as EXPLETIVE_IT.

---

## 14. Generic vs Specific Reference

#### Pattern GN-1 – Generic Kind Statements

```
"Dragons breathe fire."
"A dragon is a dangerous creature."
```

- Describe KIND-level, not specific instances.

#### Pattern GN-2 – Scene-Specific Instances

```
"A dragon appeared on the hill."
```

- Create specific CREATURE entity.

---

## 15. Usage & Extension Principles

- When debugging:
  - identify if failure involves pronoun, surname, group, bridging, dialogue, ellipsis, etc.
  - Find relevant pattern section.
  - Apply rule as written.
  - If no pattern fits:
    - define a new pattern with ID (e.g., PR-P7, BR-6), examples, rules, HUMAN_QUESTION trigger.
    - add here and update code accordingly.
- Don't silently contradict existing patterns. If they're wrong, change the pattern and then the code.

---

## 16. Dialogue and Quotation Handling

### 16.1 Speaker Attribution

#### Pattern DG-1 – Standard Speaker Tag

```
"Harry said, 'I'm tired.' He sat down."
```

- Speaker of "I'm tired." = Harry.
- After speech, "He sat down.":
  - default target = last explicit speaker (currentSpeaker = Harry).

#### Pattern DG-2 – Tag After Speech

```
"'I'm tired,' Harry said. He sat down."
```

- Same as DG-1; speaker = Harry; pronoun "He" → Harry.

**Rules:**
1. For "SPEECH" + tag patterns ("...", said X / X said / X whispered / etc.):
   - set currentSpeaker = X.
2. For next narrator sentence:
   - if pronoun he/she appears and no new explicit subject:
     - prefer currentSpeaker.

---

### 16.2 Pronoun Resolution Across Dialogue

#### Pattern DG-3 – Inside Quotation

```
"'He's late again,' said Hermione. 'He'll miss the train.'"
```

- Both "He" pronouns are in Hermione's discourse.
- They usually refer to the same external PERSON (not Hermione).

**Implementation:**
- Inside each speech segment, resolve pronouns mainly against that segment's context, while still referring back to prior narrative entities.

#### Pattern DG-4 – After Dialogue

```
"'Is he coming?' asked Ron. He frowned."
```

- "He" outside quotes:
  - by default → Ron (subject of asked), not the "he" inside the quote.

**Ambiguity / HUMAN_QUESTION:**
- If both Ron and the in-speech "he" are plausible referents for the narrator's "He" and tests depend on which, escalate.

---

### 16.3 Ellipsis and Dropped Subjects in Dialogue

#### Pattern DG-5 – Short Elliptical Utterances

```
"'Coming?' asked Ron."
"'Coming,' said Harry."
```

- Interpreted as "Are you coming?" / "I am coming."
- Subjects are implicit (speaker or addressee).

**ARES:**
- Treat these as events or state changes attached to speaker/addressee.
- Usually no new entity; use as context for speaker reference.

#### Pattern DG-6 – Minimal Answers

```
"'Ready?' Hermione asked.
'Always,' said Harry."
```

- "Always" corresponds to "I am always ready."
- Attach as property/event of Harry.

---

## 17. Ellipsis and Gapping

### 17.1 Coordinated Gapping

#### Pattern EL-1 – Gapping in Coordination

```
"Harry liked the red wand, and Ron the blue."
```

**Underlying:**
- Harry liked the red wand.
- Ron liked the blue (wand).

**Rules:**
1. Detect pattern:
   - Clause 1: NP1 V NP2
   - Clause 2: and NP3 NP4 (missing verb).
2. Reconstruct:
   - Clause 2 verb = Clause 1 verb ("liked").
   - Object: NP4 (blue wand) with head same as NP2 ("wand").

**Entity effect:**
- Create likes(Harry, red_wand), likes(Ron, blue_wand).

---

### 17.2 Elliptical Objects

#### Pattern EL-2 – Elliptical Objects

```
"Harry had a wand and Ron a broom."
```

- Underlying:
  - Harry had a wand.
  - Ron had a broom.

Same detection as EL-1.

---

### 17.3 Answer Ellipsis

#### Pattern EL-3 – Question/Answer Pairs

```
"'Who went to the forest?'
'Harry and Ron.'"
```

- Underlying: "Harry and Ron went to the forest."
- ARES can reconstruct event with subject group {Harry, Ron} if tests require.

**HUMAN_QUESTION:**
- If multiple potential verbs/roles from question and ellipsis doesn't make it obvious, escalate.

---

## 18. Relative Clauses and Embedded References

### 18.1 Subject Relatives

#### Pattern RC-1 – "who/which/that" as Subject

```
"The boy who lived was famous."
"The wand that chose Harry was peculiar."
```

- "who/that" refer to head noun ("boy", "wand").
- Relative clauses attach properties/events to that entity.

---

### 18.2 Object Relatives

#### Pattern RC-2 – Object Relatives

```
"The boy that Harry saw was pale."
```

- Relative pronoun still → head NP ("boy").
- Introduces other entities inside clause ("Harry").

---

### 18.3 Restrictive vs Non-Restrictive

#### Pattern RC-3 – Non-Restrictive

```
"Harry, who was exhausted, sat down."
```

- Adds extra info about Harry; pronoun → Harry.

#### Pattern RC-4 – Restrictive

```
"The boy who lived stood there."
```

- Narrows down which "boy"; pronoun still → "boy".

---

### 18.4 Ambiguous Attachment

#### Pattern RC-5 – Ambiguous Attachment

```
"Harry met the friend of Ron who smiled."
```

- "who smiled" can attach to "friend" or "Ron".
- Heuristic:
  - Prefer nearest compatible NP ("friend").
  - If both are plausible and no extra cues → ambiguous; escalate if test depends on it.

---

## 19. Coordination Ambiguity

### 19.1 Simple Coordination

#### Pattern CO-1 – "X and Y"

```
"Harry and Ron entered."
```

- Entities: Harry, Ron, group {Harry, Ron}.

#### Pattern CO-2 – "X, Y, and Z"

```
"Harry, Ron, and Hermione entered."
```

- Entities: Harry, Ron, Hermione; optional group {H, R, Hm}.

---

### 19.2 Mixed Coordination and Scope

#### Pattern CO-3 – "Harry and Ron or Hermione"

```
"Harry and Ron or Hermione will lead the group."
```

**Readings:**
1. (Harry and Ron) OR Hermione.
2. Harry AND (Ron or Hermione).

**ARES:**
- Record all individuals; candidate groups:
  - {Harry, Ron}
  - {Hermione}
  - {Ron, Hermione} (if context indicates this grouping).
- Do not over-commit unless tests demand specific grouping.

---

### 19.3 Inclusive vs Exclusive "or"

#### Pattern CO-4 – "or"

```
"Harry or Ron will go."
"Harry or Ron or Hermione may stay."
```

- "or" may be inclusive/exclusive; usually irrelevant to entity identity.
- Represent all candidates, mark choice as disjunctive if needed.

---

### 19.4 Distributive Verbs with Conjoined PERSON Subjects

#### Pattern CO-5 – Distributive Relations

```
"Frodo and Sam traveled to Mordor."
"Harry and Ron studied at Hogwarts."
```

**Distributive verbs** describe actions where each individual performs the action independently:
- Movement: `traveled_to`, `went_to`, `arrived_at`, `left_from`
- State: `studies_at`, `lives_in`, `works_at`
- Experience: `saw`, `heard`, `felt`

**Rule:**
When subject = coordination of PERSONs + distributive verb:
- Extract RELATION(person, object) for **each** person in the coordination
- Optionally: Keep RELATION(group, object) for pronoun binding

**Examples:**
```
"Frodo and Sam traveled to Mordor."
→ Extract:
  - Frodo traveled_to Mordor
  - Sam traveled_to Mordor
  - GROUP{Frodo, Sam} traveled_to Mordor (optional)
```

```
"Harry, Ron, and Hermione studied at Hogwarts."
→ Extract:
  - Harry studies_at Hogwarts
  - Ron studies_at Hogwarts
  - Hermione studies_at Hogwarts
```

**Contrast with collective verbs:**
- Collective verbs describe actions performed together as a unit:
  - "lifted", "carried", "surrounded", "voted"
- For collective verbs, prefer GROUP relation:
  - "Harry and Ron lifted the table." → GROUP{Harry, Ron} lifted table

**Implementation:**
1. Maintain DISTRIBUTIVE_VERBS list (traveled_to, studies_at, lives_in, etc.)
2. When extracting relation with coordinated subject:
   - If verb ∈ DISTRIBUTIVE_VERBS:
     - Split coordination into individual PERSONs
     - Emit relation for each
   - Else (collective verb):
     - Keep as GROUP relation

---

## 20. Discourse Connectives

### 20.1 Event-Level Connectives

#### Pattern DC-1 – Contrastives

```
"Harry wanted to leave. However, he stayed."
```

- "However" connects events; no change to entity mapping.

#### Pattern DC-2 – Causal Connectives

```
"Harry broke the rules. Therefore, he was punished."
```

- Signal cause/result between events, not new entities.

### 20.2 Entity-Level Parallelism

#### Pattern DC-3 – Parallel Contrast

```
"Harry was brave. Ron, however, was afraid."
```

- "however" contrasts entities already explicit; no special entity effect.

---

## 21. Nominalizations

### 21.1 Event Nominalizations

#### Pattern NMZ-1 – Action Nouns

```
"His refusal shocked them."
"The attack on the village destroyed many homes."
```

- "refusal", "attack" → EVENT entities derived from underlying verbs.

---

### 21.2 Process vs Result

#### Pattern NMZ-2 – "destruction of X"

```
"The destruction of the castle was terrifying."
```

- "destruction" = EVENT; theme = castle.

#### Pattern NMZ-3 – Ambiguous "painting"

```
"His painting impressed everyone."
```

- Could be event or object.
- Heuristics:
  - behaves like object ("He hung the painting…") → OBJECT.
  - behaves like process ("His constant painting annoyed them") → EVENT.

Escalate only if tests rely on event vs object.

---

## 22. Idioms and Fixed Expressions

### 22.1 Fully Idiomatic

#### Pattern ID-1 – Idioms

```
"He kicked the bucket."
"She spilled the beans."
```

- Recognize idioms, treat as EVENT ("died", "revealed secrets").
- Do not create literal bucket/beans entities unless context contradicts idiomatic reading.

---

### 22.2 Semi-Idiomatic

#### Pattern ID-2 – Partially Literal

```
"He broke the ice by telling a joke."
```

- "break the ice" = ease tension; usually no ice entity.

Maintain a small idiom list; default to idiomatic reading when matched.

---

## 23. Quantifier Scope and Ambiguity

### 23.1 Distributive vs Collective

#### Pattern QS-1 – "Every X V a Y. They…"

```
"Every boy carried a wand. They were heavy."
```

- "They" can refer to:
  - all wands (collective), or
  - each wand (distributive).
- ARES:
  - create GROUP of wands; "They" → group.

---

### 23.2 Indefinites: Specific vs Non-specific

#### Pattern QS-2 – "Some students failed."
- Group of unknown size, unknown membership.
- Create GROUP entity "some students".

Later:

```
"They retook the exam."
```

- "They" → same GROUP.

---

### 23.3 Multiple Quantified Groups

#### Pattern QS-3 – "Most / Few / Many"

```
"Most students passed. A few failed. They were given another chance."
```

- Distinct GROUP entities:
  - most_students and few_students.
- "They" after "A few failed" → few_students.

---

## 24. Temporal Expressions

### 24.1 Simple Temporal Adverbs

#### Pattern TM-1 – "Yesterday / Today / Tomorrow"

```
"Yesterday, he left."
"Tomorrow, they will fight."
```

- Optionally treat as TIME entities and attach as temporal modifiers.

---

### 24.2 Clock Times and Dates

#### Pattern TM-2 – "At midnight / On Monday / In 1995"

```
"At midnight, the castle moved."
"On Monday, Harry returned."
```

- Recognize as TIME entities.

---

### 24.3 Temporal Anaphora

#### Pattern TM-3 – "Then / Later / Earlier / Afterwards"

```
"Harry fell. Later, he laughed about it."
```

- Anaphoric to prior event's time; typically event-level, not entity.

---

## 25. Locative Expressions

### 25.1 Proper Place Names

#### Pattern LC-1 – Named Locations

```
"Inside Hogwarts, Harry waited."
"Near the Forbidden Forest, they camped."
```

- "Hogwarts", "Forbidden Forest" → PLACE entities.

---

### 25.2 Generic Locations

#### Pattern LC-2 – Rooms, Houses, etc.

```
"Inside the house, Harry waited."
```

- "house" can be PLACE or OBJECT; for large inhabitable structures, treat as PLACE.

---

### 25.3 Pure Adverbials

#### Pattern LC-3 – "outside", "upstairs", etc.

```
"Outside, it was raining."
"Upstairs, they argued."
```

- Locative adverbs with no explicit place entity; treat as modifiers only.

---

## 26. Non-finite Clauses

### 26.1 Purpose Infinitives

#### Pattern NF-1 – "To V…"

```
"To win the match, Harry trained daily."
```

- Non-finite clause expresses goal EVENT ("win match").

---

### 26.2 Participial Clauses

#### Pattern NF-2 – "Having finished… / Walking…"

```
"Having finished dinner, she left."
"Walking down the hall, Harry heard a noise."
```

- Subject of non-finite clause = main clause subject ("she", "Harry").
- Create events (finish dinner, walk) linked to that subject.

---

### 26.3 Gerunds as Subjects

#### Pattern NF-3 – Gerund Phrases

```
"Running through the forest was exhausting."
"Winning the match meant everything."
```

- "Running through the forest", "Winning the match" → EVENT entities (or process nouns).

---

## 27. Discourse-Level Phenomena

### 27.1 Topic Shifts

#### Pattern DS-1 – New Local Topic

```
"Harry left the room. In the garden, Ron waited. He looked nervous."
```

- Topic shifts to Ron; "He" more likely Ron.

---

### 27.2 Reactivating Dormant Entities

#### Pattern DS-2 – Reactivation

```
"Years earlier, Sirius had escaped. Now, the black dog appeared again."
```

- Use distinctive descriptors ("black dog") and "again" to revive old entity.

---

### 27.3 Long-Distance Anaphora

#### Pattern DS-3 – Pronoun After Gap

```
"Harry left Hogwarts. [several sentences later] He never forgot that day."
```

- If no local candidate but a clear story protagonist, "He" → protagonist.

---

### 27.4 Background vs Foreground

#### Pattern DS-4 – Background Entities

```
"The sun was setting and the wind blew softly as Harry walked alone."
```

- Background entities (sun, wind) get low salience vs main actor (Harry).

---

## 28. Error Cases and Malformed Input

### 28.1 Unmatched Pronouns

#### Pattern ER-1 – No Valid Antecedent

```
"He walked into the room." (start of story)
"She screamed." (no prior female)
```

- No valid antecedent:
  - mark as UNRESOLVED_PRONOUN or leave unbound.
  - Only retro-resolve via cataphora when same sentence and pattern matches.

---

### 28.2 Garden-Path Sentences

#### Pattern ER-2 – Misparse

```
"While Harry watched the man walked away."
```

- Parser must disambiguate; ARES follows best parse.
- If different parses change entity binding and text is genuinely ambiguous:
  - document known limitation; optionally use HUMAN_QUESTION for tests that depend on a specific parse.

---

### 28.3 Incomplete or Fragmentary Mentions

#### Pattern ER-3 – Fragments

```
"The boy with…"
"Because of the…"
```

- Avoid committing to full entities if NP is incomplete, unless subsequent text clarifies it.

---

### 28.4 Broken Dialogue Markers

#### Pattern ER-4 – Unmatched Quotes

```
"Harry said, "I don't know."
Ron replied, "Well, I…"
```

- If quote boundaries are unclear:
  - fall back to non-dialogue rules; treat speech as generic clauses.
  - Only escalate when this ambiguity directly affects a failing test.

---

## 29. Cross-Document Coreference

For multi-document universes (series, corpora).

### 29.1 Canonical Entity Linking

#### Pattern XD-1 – Global Registry
- Maintain a global entity registry:
  - entity_id (e.g. HP_HARRY_001)
  - canonical name ("Harry Potter")
  - aliases (epithets, titles, nicknames)
  - universe (HP, Narnia, etc.)
- Example:
  - "Harry Potter" in Book 1 → HP_HARRY_001.
  - "Harry" in Book 2 with same universe + context → link to same ID.

---

### 29.2 Document-Specific Aliases

#### Pattern XD-2 – Local Aliases
- Each document may use different aliases:
  - "the boy who lived", "the chosen one", "the youngest Weasley boy".
- Map local mentions → global ID via:
  - exact name matches
  - epithets defined in earlier docs
  - context cues (Hogwarts, Ministry, etc.)

**HUMAN_QUESTION:**
- When multiple global candidates are plausible for a local alias and context doesn't clearly pick one, escalate.

---

## 30. Common Resolution Failures (Debugging Guide)

This section is explicitly for AI debuggers. When a test fails, see if it matches one of these bug patterns.

### 30.1 Over-literal Interpretation

**Bug Pattern BG-1 – Over-splitting Entities**

**SYMPTOM:**
- Creates a new entity for every mention that looks slightly different.

**EXAMPLE:**
```
"Harry entered. The boy sat down."
→ System creates entity1 = Harry, entity2 = "the boy".
```

**FIX:**
- Apply DN-1 (Indefinite → Definite) and description rules:
  - same head noun + compatible type + local context → unify.

---

### 30.2 Dialogue Speaker Confusion

**Bug Pattern BG-2 – Mis-attributed Speech**

**SYMPTOM:**
- Speech segments are assigned to the wrong speaker or pronouns after speech are bound incorrectly.

**EXAMPLE:**
```
"'Ready?' Harry asked. 'Yes,' he said."
→ System binds "he" to Ron (or someone else) incorrectly.
```

**FIX:**
- Apply DG-1/DG-2:
  - maintain currentSpeaker from explicit tags.
  - default pronouns immediately after dialogue tags to currentSpeaker unless strong evidence suggests otherwise.

---

### 30.3 Surname Merging Errors

**Bug Pattern BG-3 – Over-Merging by Surname**

**SYMPTOM:**
- All Potters or all Weasleys are merged into one entity.

**FIX:**
- Enforce NM-2:
  - surname alone is ambiguous when multiple entities share it.
  - use salience and recency to choose a referent.
  - NEVER merge distinct entities solely because surnames match.

---

### 30.4 Group vs Individual Confusion

**Bug Pattern BG-4 – Group/Individual Collapse**

**SYMPTOM:**
- "The Weasleys" is treated as one person or merged into Arthur/Molly.

**FIX:**
- Apply GR-1/GR-2:
  - create GROUP entity separate from individual members.
  - pronouns after "The Weasleys" usually refer to the GROUP, not a single PERSON.

---

### 30.5 Ignoring Bridging

**Bug Pattern BG-5 – Missing Part–Whole Links**

**SYMPTOM:**
- "The door" after "the house" is treated as unrelated, or a new scene object.

**FIX:**
- Apply BR-1:
  - for known part–whole pairs ("house" → "door", "car" → "engine"), create part_of relation and treat as new OBJECT linked to prior entity.

---

## 31. Implementation Sketches (Non-binding Examples)

These sketches are examples, not the only correct implementation.

### 31.1 Resolution Pipeline Skeleton

```python
def resolve_reference(mention, candidates, sentence_idx, salience_model):
    # 1. Filter by type/number/gender
    filtered = [
        c for c in candidates
        if compatible(mention, c)
    ]

    if not filtered:
        return None, 0.0  # unresolved

    # 2. Compute salience
    scored = []
    for c in filtered:
        sal = salience_model.scores.get(c.id, 0.0)
        role_bonus = role_factor(c.last_role)
        recency_penalty = recency_factor(sentence_idx, c.lastMentionSentenceIndex)
        score = sal + role_bonus - recency_penalty
        scored.append((c, score))

    # 3. Sort
    scored.sort(key=lambda x: x[1], reverse=True)

    # 4. Compute a simple confidence
    if len(scored) == 1:
        confidence = 1.0
    else:
        top, second = scored[0][1], scored[1][1]
        if top <= 0:
            confidence = 0.0
        else:
            confidence = max(0.0, min(1.0, (top - second) / max(top, 1e-6)))

    best_candidate = scored[0][0]
    return best_candidate, confidence
```

---

## 32. Testing: Pattern Validation Templates

Use these templates to create targeted tests that map directly to patterns.

### 32.1 Pronoun Resolution Templates

**Test Template TT-1 – Subject Preference**

```
INPUT:
"Harry saw Ron. He waved."

EXPECTED:
"He" → Harry  (subject of prior clause)

PATTERN:
PR-P2
```

**Test Template TT-2 – Indefinite + Singular They**

```
INPUT:
"Someone knocked. They sounded nervous."

EXPECTED:
"They" → the anonymous "someone" PERSON

PATTERN:
PR-P3, QF-2
```

---

### 32.2 Bridging Anaphora Templates

**Test Template TT-3 – Part–Whole**

```
INPUT:
"The house was dark. The door creaked."

EXPECTED:
door part_of house

PATTERN:
BR-1
```

---

### 32.3 Dialogue Templates

**Test Template TT-4 – Current Speaker**

```
INPUT:
"'I am tired,' Harry said. He sat down."

EXPECTED:
"He" → Harry

PATTERN:
DG-2
```

---

### 32.4 Surname Ambiguity Templates

**Test Template TT-5 – Multiple Potters**

```
INPUT:
"James Potter entered. Harry Potter followed. Potter sat down."

EXPECTED:
"Potter" → Harry Potter (most recent Potter)

PATTERN:
NM-2, salience + recency
```

---

### 32.5 Group vs Individual Templates

**Test Template TT-6 – Family Group**

```
INPUT:
"The Weasleys arrived. They were loud."

EXPECTED:
"They" → Weasley family GROUP

PATTERN:
GR-1
```

---

## 33. Role-Based Relations

### Pattern RL-1 – Governance Role Change ("became [ROLE]")

**Pattern:**
```
"X became ROLE there/of/in/over PLACE"
→ Extract: X `rules` PLACE
```

**Examples:**
```
"Aragorn became king there."
(where "there" = Gondor from previous sentence)
→ Extract: Aragorn rules Gondor
```

```
"Eowyn became queen of Rohan."
→ Extract: Eowyn rules Rohan
```

```
"He was crowned emperor in Rome."
→ Extract: He rules Rome
```

**GOVERNANCE_ROLES list:**
- king, queen
- monarch, ruler
- emperor, empress
- sultan, pharaoh
- lord (when clearly governance, not honorific)

**Rule:**
1. Detect clause pattern: `X became/was crowned/assumed ROLE [LOCATION_REF]`
2. Check if ROLE ∈ GOVERNANCE_ROLES
3. Resolve LOCATION_REF:
   - "there" → last salient PLACE from prior sentence
   - "of PLACE" → extract PLACE directly
   - "in PLACE" → extract PLACE directly
   - "over PLACE" → extract PLACE directly
4. Extract: `rules`(X, PLACE)

**Implementation notes:**
- Combine with locative anaphora resolution (§10, EV-4)
- "there" should resolve to most recent salient PLACE
- Create both direct and inverse relations:
  - X `rules` PLACE
  - PLACE `ruled_by` X

---

### Pattern RL-2 – Professional Role Change ("became [PROFESSIONAL_ROLE]")

**Pattern:**
```
"X became ROLE there/at ORGANIZATION"
→ Extract appropriate relation based on role
```

**Examples:**
```
"Harry became headmaster there."
(where "there" = Hogwarts)
→ Extract: Harry heads Hogwarts  (or leads/manages)
```

```
"Hermione became teacher at Hogwarts."
→ Extract: Hermione teaches_at Hogwarts
```

```
"Ron became student at Hogwarts."
→ Extract: Ron studies_at Hogwarts
```

**PROFESSIONAL_ROLE → relation mapping:**
- teacher, professor, instructor → `teaches_at`
- student, pupil, apprentice → `studies_at`
- headmaster, principal, dean, director → `heads` or `leads`
- employee, worker, staff → `works_at`
- member → `member_of`

**Rule:**
1. Detect clause pattern: `X became/was appointed ROLE [LOC_ORG_REF]`
2. Check if ROLE ∈ PROFESSIONAL_ROLES
3. Resolve LOC_ORG_REF (location or organization)
4. Map ROLE → appropriate relation predicate
5. Extract: PREDICATE(X, LOC_ORG)

**When NOT to extract:**
- Descriptive roles without org attachment:
  - "became a warrior" (no specific organization)
  - "became famous" (state, not role)
  - "became wise" (adjective, not role)
- Ambiguous roles without clear relation:
  - "became a wizard" → no specific organization
  - "became a hero" → descriptive, not organizational

**Distinguish roles from states:**
```
Role (extract relation):
  - "became king there" → rules relation
  - "became teacher at X" → teaches_at relation
  - "became member of Y" → member_of relation

State (no relation):
  - "became sick" → state change
  - "became famous" → property
  - "became angry" → emotion
```

**Heuristic:**
- If "became [X]" and X is a noun with organizational context → likely role → extract relation
- If "became [X]" and X is adjective or state → no relation

---

## 34. Organizational & Membership Relations

### 34.1 Membership: "joined X"

#### Pattern ORG-1 – Joining an Organization

```
"Draco Malfoy, on the other hand, joined Slytherin."
"She joined the Order of the Phoenix."
```

- Subject: PERSON
- Object: ORG/HOUSE/GROUP

**Rule:**

- For patterns of the form `X joined ORG`:
  - emit:
    - `X member_of ORG`

- This is parallel to existing "sorted into X" → `member_of` patterns.

---

## 35. Adversarial Relations

### 35.1 Adversarial Relations: "rival / enemy / foe"

#### Pattern ADV-1 – Rivalry / Enmity

```
"He became a rival to Harry."
"Draco was an enemy of Harry Potter."
"She became a foe of Voldemort."
```

- `rival`, `enemy`, `foe`, `adversary` all imply symmetric adversarial relation.

**Rule:**

- For patterns:
  - `X became (a) rival/enemy/foe/adversary to Y`
  - `X was (a) rival/enemy/foe/adversary of Y`
- Emit:
  - `X enemy_of Y`
  - `Y enemy_of X` (symmetric relation)

- Only apply when X and Y are PERSON (or PERSON-like) entities; avoid linking to places/orgs unless explicitly required.

---

## 36. Teaching & Educational Roles

### 36.1 Teaching at an Institution

#### Pattern EDU-1 – "taught X at Y" → teaches_at

```
"Professor McGonagall taught Transfiguration at Hogwarts."
"Professor Snape taught Potions at Hogwarts."
```

- SUBJECT: PERSON (teacher)
- OBJECT: ORG/PLACE (school/house/etc.)

**Rule:**

- For patterns of the form:
  - `X taught [SUBJECT] at ORG`
  - `X taught at ORG` (subject omitted)
- Emit:
  - `X teaches_at ORG`

- The subject/curriculum (e.g. "Transfiguration") may be captured as a separate ENTITY if needed, but is optional for the `teaches_at` relation.

---

## End of ARES Linguistic Reference v0.6

**Last Updated**: 2025-11-28
**Maintainers**: ARES Team
**License**: MIT

*This reference is maintained for AI assistants and tools working on the ARES project. When linguistic bugs occur, consult this file before inventing new heuristics. If a pattern is missing, add it here first, then update the code.*
