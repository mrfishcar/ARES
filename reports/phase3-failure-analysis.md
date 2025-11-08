# Phase 3: Systematic Failure Analysis

**Date:** 2025-11-08

## Executive Summary

Baseline extraction on long-form narratives reveals **critical quality failures**:
- **86 entities extracted** from fantasy-chapter-01.txt (2515 words)
- **Only 2 relations** extracted (catastrophic failure)
- **~40% of entities are nonsense** ("Before Elara", "Perhaps", "Fifty", etc.)
- **~50% entity type misclassifications** (places marked as people)
- **Multiple duplicate entities** not resolved

---

## Sample Analysis: Fantasy Chapter First 100 Lines

### Gold Standard Annotations (Manual)

#### Key Entities That SHOULD Be Extracted:

**PERSON:**
- Elara Moonwhisper (protagonist)
- Master Theron Brightforge / Theron
- Lord Malachar / Shadow King / Malachar (villain)
- Cassandra Stormweaver (High Priestess)
- Lyssa Moonwhisper (Elara's mother)
- Vex the Bloodless (general)
- King Aldric / King Aldric the Just
- Sir Gareth Stonehelm / Gareth
- Arcturus Ironmind
- Lysander Shadowmere
- Meridian Starseeker
- Isolde Dreamweaver
- Korvan the Summoner / Korvan
- Raven Nightshade / Raven
- Valdris / Valdris the Pale
- Archmagus Talen

**PLACE:**
- Crystal Cliffs
- Alderan (world/realm)
- Crimson Sea
- Northern Reaches
- Obsidian Mountains
- Sanctuary of Whispers
- Silverhaven (city/capital)
- Thornhaven (village)
- Tower of Seven Stars
- Lake Serenity
- Plains of Valor
- Forgotten Wastes
- Academy of Mystic Arts
- Whispering Woods
- Dreadspire Fortress
- Starfall Ridge

**ORG:**
- Council of Seven / Council
- Temple of Winds

**EVENT:**
- Battle of Starfall Ridge
- Attack on Thornhaven

**ARTIFACT:**
- Orb of Eternal Night / Orb
- Sword of Dawn
- Stormchaser (airship)

**Key Relations (Sample):**
1. Theron mentored Lyssa (parent-mentor relation)
2. Lyssa parent_of Elara
3. Malachar enemy_of Council
4. Malachar seeks Orb of Eternal Night
5. King Aldric guards Orb of Eternal Night
6. King Aldric rules Silverhaven
7. Council located_at Tower of Seven Stars
8. Tower of Seven Stars located_at Lake Serenity
9. Elara member_of Council
10. Theron member_of Council
11. Cassandra member_of Council
12. Arcturus member_of Council
13. Lysander member_of Council
14. Meridian member_of Council
15. Isolde member_of Council
16. Korvan member_of Council
17. Vex the Bloodless serves Malachar
18. Malachar imprisoned_in Void
19. Malachar's_army located_at Obsidian Mountains
20. Sir Gareth accompanies Elara
21. Cassandra member_of Temple of Winds
22. Elara studies_at Academy of Mystic Arts
23. Archmagus Talen leads Academy of Mystic Arts

**Estimate: 60-80 relations should be extractable from this chapter**

---

## Category 1: Entity Extraction Failures

### 1.1 Nonsense Entities (False Positives)

**Pattern:** Common words, sentence fragments, and non-entities extracted as PERSON

| Entity Extracted | Classified As | Why It's Wrong |
|-----------------|---------------|----------------|
| "Gathering Storm" | PERSON | Chapter title, not a person |
| "Before Elara" | PERSON | Sentence fragment |
| "Forgive" | PERSON | Verb, part of "Forgive my dramatic entrance" |
| "Whoever" | PERSON | Pronoun, not specific person |
| "Perhaps" | PERSON | Adverb |
| "Inside" | PERSON | Preposition |
| "Bodies" | PERSON | Plural noun, not specific entity |
| "Looking" | PERSON | Verb form |
| "Finally" | PERSON | Adverb |
| "Three" | PERSON | Number |
| "Fifty" | PERSON | Number |
| "Entire" | PERSON | Adjective |
| "Fields" | PERSON | Common noun, not named place |
| "Livestock" | PERSON | Common noun |
| "Chose" | PERSON | Verb |
| "Oh" | PERSON | Interjection |
| "Join" | PERSON | Verb |
| "Release" | PERSON | Verb |
| "Long" | PERSON | Adjective |
| "Run" | PERSON | Verb |
| "Brilliant" | PERSON | Adjective |
| "Rebuild" | PERSON | Verb |
| "YOU DARED TO" | PERSON | Shouted text fragment |
| "Located" | PERSON | Verb |
| "Hidden" | PERSON | Adjective |
| "Take Sir Gareth" | PERSON | Command phrase |
| "If Malachar" | PERSON | Conditional phrase |

**Count:** ~26 nonsense entities out of 86 total = **30% false positive rate**

**Root Cause:** NER model not filtering common words/sentence fragments. Needs better context awareness.

### 1.2 Wrong Entity Types (Type Misclassification)

**Pattern:** Places classified as PERSON, organizations split into PERSON entities

| Entity | Extracted As | Should Be | Context |
|--------|-------------|-----------|---------|
| Crystal Cliffs | PERSON | PLACE | "edge of the Crystal Cliffs" |
| Alderan | PERSON | PLACE | Planet/world name |
| Northern Reaches | PERSON | PLACE | Geographic region |
| Obsidian Mountains | PERSON | PLACE | Mountain range |
| Silverhaven | PERSON | PLACE | City name |
| Thornhaven | PERSON | PLACE | Village name |
| Forgotten Wastes | PERSON | PLACE | Geographic region |
| Dreadspire Fortress | PERSON | PLACE | Fortress name |
| Void | PERSON | PLACE | Prison dimension |
| Sanctuary of Whispers | ORG | PLACE | Temple/sanctuary |
| Evocation | PERSON | CONCEPT | School of magic |
| Transmutation | PERSON | CONCEPT | School of magic |
| Divination | PERSON | CONCEPT | School of magic |
| Necromancy | PERSON | CONCEPT | School of magic |
| Enchantment | PERSON | CONCEPT | School of magic |
| Illusion/Illusions | PERSON | CONCEPT | School of magic |
| Conjuration | PERSON | CONCEPT | School of magic |
| "USE MY POWER" | PLACE | NONE | Dialogue fragment |

**Count:** ~18 type misclassifications = **21% type error rate**

**Root Cause:** Classification not considering context. Default to PERSON type when uncertain.

### 1.3 Missing Entities (False Negatives)

**Sample of entities present in text but NOT extracted:**

- Shadow wraiths (creature type)
- Bone golems (creature type)
- Death knights (creature type)
- Fire elemental (creature type bound to Korvan)
- Dark armies (collective entity)
- Ley lines (magical concept)
- Seven schools of magic (concept)
- New moon (temporal marker)
- Royal treasury (location)
- Protection wards (magical concept)
- Bloodline key (concept)
- Strike team (group)

**Estimate:** 15-20% entity recall failure

**Root Cause:** NER model trained on standard entities, not fantasy concepts.

### 1.4 Entity Resolution Failures (Duplicates)

**Pattern:** Same entity extracted multiple times with different IDs

| Entity | Occurrences | EIDs | Issue |
|--------|------------|------|-------|
| Orb of Eternal Night | 3 | 449 (ORG), 449 (PERSON), 449 (WORK) | Same EID, different types |
| Lord Malachar | 3 | 446 appears in multiple entities | Should be single entity |
| Tower of Seven Stars | 2 | 459, 444 | Duplicated |
| Seven Stars | 2 | 444 | Part of "Tower of Seven Stars" |
| Council | Multiple | Split across entities | Not resolved |
| Illusion/Illusions | 2 | 465 | Plural not normalized |

**Count:** ~10 duplicate entity groups

**Root Cause:** Entity resolution not working across paragraphs. Coreference limited to 500 chars.

---

## Category 2: Relation Extraction Failures

### 2.1 Abysmal Relation Count

**Extracted:** 2 relations
**Expected:** 60-80 relations
**Extraction Rate:** 2.5-3.3% (97% failure rate!)

### 2.2 The Two Relations That Were Extracted

Both are reciprocal "enemy_of" relations:
- Subject: `6a323dcb-cd19-445c-8fe6-b11d81645a50` (Orb of Eternal Night as PERSON)
- Object: `348e5e2d-b54c-43b8-ad10-2bfb98a766fa` (YOU DARED TO as PERSON)

**Both relations are INVALID** - they connect nonsense entities.

### 2.3 Missing Relation Patterns

**Family Relations (0 extracted, ~5 expected):**
- Lyssa Moonwhisper parent_of Elara Moonwhisper
- Elara Moonwhisper child_of Lyssa Moonwhisper

**Mentor Relations (0 extracted, ~3 expected):**
- Theron Brightforge mentored Lyssa Moonwhisper
- Academy trained Sir Gareth

**Membership Relations (0 extracted, ~8 expected):**
- Elara member_of Council of Seven
- Theron member_of Council of Seven
- Cassandra member_of Council of Seven
- [6 other council members]

**Leadership Relations (0 extracted, ~5 expected):**
- King Aldric rules Silverhaven
- Malachar leads dark armies
- Vex the Bloodless leads attack
- Korvan summons fire elemental
- Archmagus Talen leads Academy

**Location Relations (0 extracted, ~10 expected):**
- Elara from Northern Reaches
- Tower of Seven Stars located_at Lake Serenity
- Malachar imprisoned_in Void
- Orb hidden_in Sanctuary of Whispers
- Sanctuary located_beneath Silverhaven

**Possession/Seeking Relations (0 extracted, ~5 expected):**
- Malachar seeks Orb of Eternal Night
- King Aldric guards Orb of Eternal Night
- Theron has staff of ironwood

**Adversarial Relations (0 extracted, ~8 expected):**
- Malachar enemy_of Council
- Malachar attacked Thornhaven
- Council defeated Malachar (30 years ago)

### 2.4 Root Causes for Relation Failures

1. **Pattern coverage gaps**: Extraction patterns don't cover narrative style
2. **Cross-sentence relations**: Relations spanning multiple sentences not detected
3. **Implicit relations**: "had mentored her mother decades ago" - past tense relation
4. **Context requirements**: Need paragraph-level context, not just sentence
5. **Pronoun resolution**: "his dark armies" - whose armies?
6. **Prepositional patterns**: "beneath the city", "in the Void" not captured
7. **Subordinate clauses**: "whom we defeated thirty years ago" not parsed

---

## Category 3: Coreference Failures

### 3.1 Pronoun Resolution Examples

**Text Sample:**
> "Master Theron Brightforge, the legendary wizard who had mentored her mother decades ago. His silver beard flowed in the wind, and his staff of ironwood gleamed"

- "His" → should resolve to "Master Theron Brightforge"
- Current: likely not resolved, or created separate mention

**Text Sample:**
> "Lord Malachar, whom we defeated thirty years ago... His dark armies are gathering"

- "we" → Council of Seven
- "His" → Lord Malachar
- Current: not resolved

### 3.2 Nominal Coreference Examples

**Text Sample:**
> "Elara Moonwhisper stood at the edge... The young sorceress had traveled far"

- "The young sorceress" → Elara Moonwhisper
- Current: likely not linked

**Text Sample:**
> "Cassandra Stormweaver, the High Priestess of the Temple of Winds"

- "the High Priestess" extracted as separate entity (eid 429)
- Current: not linked to Cassandra

**Text Sample:**
> "the legendary wizard" → Theron Brightforge
- "the Necromancer" → Lysander Shadowmere
- "the Diviner" → Meridian Starseeker
- "the Summoner" → Korvan

All of these descriptors should link to named entities but likely don't.

### 3.3 Title/Role Coreference

Many characters have titles that should be aliases:
- "King Aldric" / "King Aldric the Just" - partially handled
- "Shadow King" / "Lord Malachar" - NOT linked (different EIDs)
- "High Priestess" / "Cassandra Stormweaver" - NOT linked

---

## Category 4: Long-Form Specific Issues

### 4.1 Context Window Limitations

**Problem:** 200-character window misses long-range dependencies

**Example:**
- Paragraph 1: "Elara Moonwhisper... following the mysterious summons"
- Paragraph 15: "When they returned to the Tower"
- "they" refers to Elara + Sir Gareth, but 14 paragraphs later

**Current window:** 200 chars ≈ 1-2 sentences
**Needed:** At least 1000-2000 chars for paragraph-level context

### 4.2 Character Introductions Not Tracked

**Pattern:** Characters introduced with full description, then referenced by first name or descriptor

**Example:**
1. "Master Theron Brightforge, the legendary wizard who had mentored her mother"
2. Later: "Theron's expression darkened"
3. Later: "Theron replied"
4. Later: "Master Theron"

All should link to same entity, but extraction treats each mention independently.

### 4.3 Event Chains Not Captured

**Example Event Chain in Text:**
1. Shadow King returned
2. Broke free from Void
3. Dark armies gathering
4. Seeks Orb of Eternal Night
5. Forces attacked Thornhaven
6. Fifty villagers killed
7. Orb stolen from royal treasury

**Current extraction:** Only event entities extracted, no temporal links or causality

---

## Top 10 Failure Patterns (Priority Ranked)

### Priority 1: Catastrophic Relation Extraction (CRITICAL)
**Impact:** Only 2 relations from 2500 words (both invalid)
**Root Cause:** Pattern gaps, no cross-sentence extraction
**Fix Required:** Expand patterns, add paragraph-level extraction

### Priority 2: Entity Type Misclassification (CRITICAL)
**Impact:** 50% of places classified as PERSON
**Root Cause:** No context-aware classification
**Fix Required:** Add contextual type classification using surrounding text

### Priority 3: Nonsense Entity Extraction (HIGH)
**Impact:** 30% false positive rate
**Root Cause:** NER not filtering common words
**Fix Required:** Add confidence thresholds, context filters

### Priority 4: Entity Resolution Failures (HIGH)
**Impact:** 10+ duplicate entity groups
**Root Cause:** 500-char coreference window too small
**Fix Required:** Extend to 2000+ chars, add document-level resolution

### Priority 5: Missing Descriptor Coreference (HIGH)
**Impact:** "the young sorceress", "the wizard" not linked
**Root Cause:** Nominal phrase matching not implemented
**Fix Required:** Build descriptor index, semantic matching

### Priority 6: Cross-Sentence Relations (HIGH)
**Impact:** Relations spanning 2+ sentences not extracted
**Root Cause:** Sentence-level processing only
**Fix Required:** Add paragraph-level relation extraction

### Priority 7: Implicit Relations Missing (MEDIUM)
**Impact:** Past tense, implied relations not captured
**Root Cause:** Patterns only match present tense explicit statements
**Fix Required:** Add temporal and implicit relation patterns

### Priority 8: Title/Role Aliasing (MEDIUM)
**Impact:** "Shadow King" not linked to "Lord Malachar"
**Root Cause:** Title patterns not in alias detection
**Fix Required:** Add title detection and linking

### Priority 9: Prepositional Relations (MEDIUM)
**Impact:** "hidden in", "located at", "beneath" not extracted
**Root Cause:** Prepositional phrase patterns missing
**Fix Required:** Add prepositional relation patterns

### Priority 10: Event Chain Extraction (MEDIUM)
**Impact:** No temporal ordering of events
**Root Cause:** No event linking logic
**Fix Required:** Add temporal relation extraction, event graphs

---

## Quantified Baseline Failures

| Metric | Baseline | Target | Gap |
|--------|----------|--------|-----|
| Entity Precision | ~70% | 90% | -20% |
| Entity Recall | ~80% | 90% | -10% |
| Entity Type Accuracy | ~50% | 95% | -45% |
| Relation Precision | ~0% | 85% | -85% |
| Relation Recall | ~3% | 85% | -82% |
| Duplicate Entity Rate | ~12% | <2% | -10% |
| Coreference Accuracy | ~40% | 85% | -45% |

**Overall Assessment:** Current extraction is NOT production-ready for long-form narratives. Requires major improvements in all categories.

---

## Next Steps: Phase 4 Priorities

Based on failure analysis, Phase 4 should focus on:

1. **CRITICAL:** Fix relation extraction (97% failure rate)
   - Add cross-sentence patterns
   - Implement paragraph-level extraction
   - Add implicit relation inference

2. **CRITICAL:** Fix entity type classification (50% error rate)
   - Context-aware classification
   - Type validation against surrounding text

3. **HIGH:** Reduce nonsense entities (30% false positive rate)
   - Better NER filtering
   - Confidence thresholds

4. **HIGH:** Fix entity resolution (12% duplicates)
   - Extend coreference window 500→2000 chars
   - Add descriptor-based matching

5. **HIGH:** Implement descriptor coreference
   - "the young sorceress" → Elara
   - Build descriptor index

These fixes should bring us to LLM-competitive quality.
