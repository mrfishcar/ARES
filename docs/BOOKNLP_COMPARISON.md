# ARES vs BookNLP: Capability Comparison & Gap Analysis

**Date**: 2025-12-30
**Purpose**: Identify where ARES aligns with, differs from, and can improve based on the BookNLP blueprint.
**Goal**: BookNLP is the minimum quality standard. We aim to match or exceed it.

---

## Executive Summary

| Category | ARES Status | BookNLP Status | Gap |
|----------|-------------|----------------|-----|
| Tokenization | ✅ spaCy-based | ✅ Embedded | PARITY |
| POS Tagging | ✅ Comprehensive | ✅ Embedded | PARITY |
| Dependency Parsing | ✅ Full UD | ✅ Embedded | PARITY |
| Named Entity Recognition | ✅ Multi-source | ✅ Superior | **GAP: Character NER** |
| Mention Detection | ✅ Multi-stage | ✅ Embedded | PARITY |
| Alias Resolution | ✅ 5 strategies | ✅ Clustering | **ARES BETTER** |
| Coreference Resolution | ✅ Rule-based | ✅ ML-trained | **GAP: Quality** |
| Quotation Detection | ✅ Pattern-based | ✅ Pattern-based | PARITY |
| Speaker Attribution | ✅ 40+ verbs | ✅ Neural model | **GAP: Accuracy** |
| Supersense Tagging | ❌ NOT IMPLEMENTED | ✅ WordNet-based | **CRITICAL GAP** |
| Event Detection | ❌ STUB ONLY | ✅ Event tagger | **CRITICAL GAP** |
| Gender Inference | ✅ Heuristics | ✅ Pronoun evidence | PARITY |
| Character Profiling | ✅ Adaptive | ⏸️ Not exposed | **ARES BETTER** |
| Narrative Role Analysis | ⏸️ Partial | ⏸️ Data available | OPPORTUNITY |

---

## Component-by-Component Analysis

### 1. Text Preprocessing & Linguistic Analysis

#### BookNLP Blueprint Requires:
- Tokenization with byte offsets
- Sentence splitting with paragraph tracking
- POS tagging (Penn Treebank or UD)
- Dependency parsing with head/relation

#### ARES Status: ✅ FULLY ALIGNED

**Implementation:**
- `scripts/parser_service.py` - spaCy service (en_core_web_sm)
- `app/parser/HttpParserClient.ts` - Parser client
- `app/engine/grammar/parts-of-speech.ts` - 1000+ lines of POS utilities

**ARES Advantages:**
- Modular architecture (parser as separate service)
- Rich POS utilities beyond basic tagging
- Clause detection for complex sentences

**No Action Required** - ARES meets or exceeds BookNLP baseline.

---

### 2. Named Entity Recognition

#### BookNLP Blueprint Requires:
- NER for proper nouns (PER, LOC, ORG, GPE, FAC, VEH)
- Common noun entity detection ("the boy", "her sister")
- Pronoun mentions as entity category

#### ARES Status: ⚠️ PARTIAL GAP

**What ARES Has:**
```
app/engine/extract/entities.ts (2898 lines)
- spaCy NER (primary)
- Dependency-based extraction
- Pattern-based fallback
- Entity types: PERSON, PLACE, ORG, DATE, WORK, ITEM, SPECIES, EVENT
```

**Gap Analysis:**
| Feature | BookNLP | ARES | Gap? |
|---------|---------|------|------|
| Proper noun NER | ✅ | ✅ | No |
| Common noun entities | ✅ "the boy" | ⚠️ Limited | **YES** |
| Pronoun as mentions | ✅ | ✅ via coref | No |
| FAC (Facility) type | ✅ | ❌ | Minor |
| VEH (Vehicle) type | ✅ | ⚠️ As ITEM | Minor |

**Recommended Actions:**

1. **Add Common Noun Entity Detection** (Priority: HIGH)
   - BookNLP detects "the boy", "her sister" as entity mentions
   - ARES currently skips most common nouns
   - Implementation:
   ```typescript
   // app/engine/extract/entities.ts
   const HUMAN_NOUNS = new Set(['boy', 'girl', 'man', 'woman', 'child',
     'doctor', 'teacher', 'sister', 'brother', 'father', 'mother', ...]);

   // If head noun in NP is human-related, treat as entity mention
   function detectNominalEntities(sentence: ParsedSentence): Mention[] {
     const mentions: Mention[] = [];
     for (const token of sentence.tokens) {
       if (token.pos === 'NOUN' && HUMAN_NOUNS.has(token.lemma.toLowerCase())) {
         // Check if it's subject/object of main verb
         if (['nsubj', 'dobj', 'iobj'].includes(token.dep)) {
           mentions.push({
             text: getNounPhrase(token),
             type: 'PERSON',
             mentionType: 'NOM', // Nominal
             confidence: 0.7
           });
         }
       }
     }
     return mentions;
   }
   ```

2. **Add FAC/VEH Entity Types** (Priority: LOW)
   - Add to schema if needed for completeness
   - Can map FAC→PLACE, VEH→ITEM as fallback

---

### 3. Character Name Clustering (Alias Resolution)

#### BookNLP Blueprint Requires:
- Normalize names (remove honorifics)
- Match last names across mentions
- Handle nicknames (Bob → Robert)
- Handle initials (J. Smith → John Smith)
- Track canonical name per cluster

#### ARES Status: ✅ EXCEEDS REQUIREMENTS

**What ARES Has:**
```
app/engine/alias-resolver.ts - 5 strategies:
1. Exact match (case-insensitive)
2. Title variation (removes articles, epithets)
3. Profile similarity (context-based)
4. Name decomposition ("Tom Sawyer" ↔ "Tom", "Sawyer")
5. Proximity gating (~500 chars)

app/engine/hert/fingerprint.ts - Normalization:
- Remove honorifics (Mr., Dr., etc.)
- Handle prefixes (O'Brien, van der)
- Unicode normalization
```

**ARES Advantages Over BookNLP:**
- **HERT System**: Cross-document stable entity IDs
- **Profile-based matching**: Uses accumulated entity knowledge
- **Proximity gating**: Prevents false merges of common names

**No Action Required** - ARES exceeds BookNLP baseline.

---

### 4. Coreference Resolution

#### BookNLP Blueprint Requires:
- Link pronouns to entity clusters
- Gender/number matching
- Recency preference
- Syntactic prominence scoring
- Salience tracking
- Restrictive linking (don't over-merge)

#### ARES Status: ⚠️ QUALITY GAP

**What ARES Has:**
```
app/engine/ir/salience-resolver.ts (400+ lines)
- Centering theory implementation
- Gender inference from names/titles
- Recency decay (sentence/paragraph)
- Ambiguity thresholding (1.5x ratio)
- Returns UNRESOLVED when ambiguous

app/engine/coref.ts (650 lines)
- Pronoun stacks per paragraph
- Title back-links ("the king")
- Quote attribution linking
```

**Gap Analysis:**
| Feature | BookNLP | ARES | Gap? |
|---------|---------|------|------|
| Pronoun resolution | ✅ ML-trained | ✅ Rule-based | Quality |
| Gender matching | ✅ | ✅ | No |
| Recency | ✅ | ✅ | No |
| Salience | ✅ | ✅ | No |
| Restrictive linking | ✅ | ✅ | No |
| Nominal linking | ✅ Limited | ⚠️ Limited | Minor |

**BookNLP Quality Advantage:**
- Trained on LitBank + PreCo datasets (literary coreference)
- Higher accuracy on complex chains

**ARES Philosophy:**
- **Deterministic & auditable** - every decision traceable
- **Conservative** - prefers UNRESOLVED over wrong merge
- **No black-box ML** - rule-based

**Recommended Actions:**

1. **Enhance Nominal Coreference** (Priority: MEDIUM)
   ```typescript
   // Link "the wizard" to entity with "wizard" in profile
   function resolveNominal(nominal: string, entities: Entity[]): Entity | null {
     const headNoun = extractHeadNoun(nominal); // "wizard"
     for (const entity of entities) {
       if (entity.profile?.roles?.has(headNoun) ||
           entity.profile?.descriptors?.has(headNoun)) {
         return entity;
       }
     }
     return null;
   }
   ```

2. **Add Dialogue Context** (Priority: MEDIUM)
   - BookNLP considers "dialogue scope" for pronoun resolution
   - If pronoun is inside quote, prefer speaker or addressee
   ```typescript
   if (isInsideQuote(pronoun) && currentQuote.speakerId) {
     // Boost salience of speaker for "I" pronouns
     // Boost salience of addressee for "you" pronouns
   }
   ```

---

### 5. Quotation Detection & Speaker Attribution

#### BookNLP Blueprint Requires:
- Quote span detection (double quotes, smart quotes)
- Quote boundary labels (B-QUOTE, I-QUOTE, O)
- Speaker attribution via speech verbs
- Dialogue tag parsing ("said Alice")
- Turn-taking inference for multi-speaker dialogue
- Context-based attribution (preceding mention)

#### ARES Status: ✅ MOSTLY ALIGNED

**What ARES Has:**
```
app/engine/ir/quote-attribution.ts (630 lines)
- Quote detection: " " ' ' (all quote types)
- 40+ speech verbs: said, asked, replied, shouted, whispered...
- Patterns:
  - "..." , NAME said (0.9 confidence)
  - NAME said, "..." (0.9 confidence)
  - Pronoun resolution (0.7 confidence)
  - Turn-taking (0.6 confidence)
  - Adjacent mention (0.5 confidence)
```

**Gap Analysis:**
| Feature | BookNLP | ARES | Gap? |
|---------|---------|------|------|
| Quote span detection | ✅ | ✅ | No |
| B/I/O labels | ✅ | ⚠️ Different format | Minor |
| Speech verb patterns | ✅ | ✅ 40+ verbs | No |
| Turn-taking | ✅ | ✅ | No |
| Context attribution | ✅ | ✅ | No |
| Neural accuracy | ✅ | ❌ Rule-based | Quality |

**Recommended Actions:**

1. **Add Addressee Detection** (Priority: MEDIUM)
   - BookNLP detects who is being spoken TO
   - ARES only detects speaker
   ```typescript
   interface Quote {
     text: string;
     speakerId: string | null;
     addresseeId: string | null;  // NEW
     confidence: number;
   }

   // Heuristic: If dialogue, addressee is the other speaker
   // "Hello, John," said Mary. → addressee = John
   function detectAddressee(quote: Quote, entities: Entity[]): string | null {
     // Check for vocative (name at start/end of quote)
     const vocative = extractVocative(quote.text);
     if (vocative) {
       return findEntityByName(vocative, entities)?.id;
     }
     return null;
   }
   ```

---

### 6. Supersense Tagging ⚠️ CRITICAL GAP

#### BookNLP Blueprint Requires:
- 41 WordNet supersenses for nouns and verbs
- Examples: noun.person, noun.artifact, verb.motion, verb.cognition
- Enriches semantic understanding

#### ARES Status: ❌ NOT IMPLEMENTED

**What ARES Has:**
- Entity types (PERSON, PLACE, ORG, etc.) - **NOT supersenses**
- No verb semantic categorization

**Why This Matters:**
- Supersenses help distinguish **physical actions** vs **cognitive events**
- Enable better event detection and character analysis
- Provide semantic richness beyond entity typing

**Recommended Implementation:**

1. **Add WordNet Supersense Lookup** (Priority: HIGH)
   ```typescript
   // app/engine/linguistics/supersense.ts
   import wordnetData from './wordnet-supersenses.json';

   export type NounSupersense =
     | 'noun.person' | 'noun.animal' | 'noun.artifact' | 'noun.location'
     | 'noun.object' | 'noun.plant' | 'noun.time' | 'noun.group'
     | 'noun.communication' | 'noun.cognition' | 'noun.event' | 'noun.state'
     | 'noun.act' | 'noun.food' | 'noun.substance' | 'noun.body'
     | 'noun.feeling' | 'noun.attribute' | 'noun.possession' | 'noun.quantity'
     | 'noun.relation' | 'noun.motive' | 'noun.shape' | 'noun.phenomenon';

   export type VerbSupersense =
     | 'verb.motion' | 'verb.cognition' | 'verb.communication' | 'verb.social'
     | 'verb.stative' | 'verb.perception' | 'verb.emotion' | 'verb.change'
     | 'verb.creation' | 'verb.competition' | 'verb.consumption' | 'verb.contact'
     | 'verb.possession' | 'verb.body' | 'verb.weather';

   export function getSupersense(lemma: string, pos: 'NOUN' | 'VERB'): string | null {
     const key = `${lemma}.${pos.toLowerCase()}`;
     return wordnetData[key]?.supersense || null;
   }
   ```

2. **Create Lightweight WordNet JSON** (Priority: HIGH)
   - Extract just supersense mappings from WordNet
   - ~50KB compressed should cover common words
   - Fallback rules for unknown words

3. **Integrate into Token Output**
   ```typescript
   interface Token {
     text: string;
     lemma: string;
     pos: string;
     dep: string;
     supersense?: string;  // NEW
   }
   ```

---

### 7. Event Detection ⚠️ CRITICAL GAP

#### BookNLP Blueprint Requires:
- Identify narrative events (asserted, not hypothetical)
- Filter conditional/modal/negated verbs
- Extract (Actor, Action, Recipient) triples
- Link events to character clusters
- Track events per character (agent/patient)

#### ARES Status: ❌ STUB ONLY

**What ARES Has:**
```
app/engine/extract/events.ts - PLACEHOLDER
- Currently returns empty array
- Planned for Phase 4
```

**What ARES Has Instead:**
```
app/engine/narrative-relations.ts (800+ lines)
- Extracts RELATIONS not EVENTS
- married_to, parent_of, lives_in, etc.
- Not action-based events
```

**Why This Matters:**
- Events are the **core narrative actions** in fiction
- "Elizabeth slapped Darcy" = action event
- "Gandalf traveled to Mordor" = motion event
- Character analysis depends on tracking actions

**Recommended Implementation:**

1. **Event Detection Algorithm** (Priority: HIGH)
   ```typescript
   // app/engine/extract/events.ts

   interface NarrativeEvent {
     id: string;
     verb: string;
     verbLemma: string;
     supersense?: VerbSupersense;
     agentId?: string;      // Entity who does action
     patientId?: string;    // Entity affected by action
     isAsserted: boolean;   // Not hypothetical/negated
     sentence: number;
     tokenRange: [number, number];
   }

   const MODAL_VERBS = new Set(['would', 'could', 'should', 'might', 'may']);
   const NEGATION_DEPS = new Set(['neg']);
   const STATE_VERBS = new Set(['be', 'seem', 'appear', 'remain']);

   export function extractEvents(sentence: ParsedSentence): NarrativeEvent[] {
     const events: NarrativeEvent[] = [];

     for (const token of sentence.tokens) {
       if (token.pos !== 'VERB') continue;

       // Skip state-of-being verbs
       if (STATE_VERBS.has(token.lemma)) continue;

       // Check if asserted (not modal, not negated, not conditional)
       const isModal = hasModalAuxiliary(token, sentence);
       const isNegated = hasNegation(token, sentence);
       const isConditional = isInConditionalClause(token, sentence);
       const isAsserted = !isModal && !isNegated && !isConditional;

       // Extract agent (subject)
       const subject = findDependentByRel(token, ['nsubj', 'nsubj:pass'], sentence);
       const agentId = subject ? resolveToEntityId(subject) : undefined;

       // Extract patient (object)
       const object = findDependentByRel(token, ['dobj', 'iobj'], sentence);
       const patientId = object ? resolveToEntityId(object) : undefined;

       events.push({
         id: uuid(),
         verb: token.text,
         verbLemma: token.lemma,
         supersense: getSupersense(token.lemma, 'VERB'),
         agentId,
         patientId,
         isAsserted,
         sentence: sentence.index,
         tokenRange: [token.index, token.index]
       });
     }

     return events;
   }
   ```

2. **Character Event Tracking** (Priority: HIGH)
   ```typescript
   // Add to entity-profiler.ts
   interface EntityProfile {
     // ... existing fields ...
     agentEvents: string[];   // Events where entity is agent (did action)
     patientEvents: string[]; // Events where entity is patient (affected)
   }
   ```

3. **Event-Character Linking** (Priority: HIGH)
   - After extraction, accumulate events per character
   - Store in profile for narrative analysis

---

### 8. Referential Gender Inference

#### BookNLP Blueprint Requires:
- Collect pronouns in each character's coreference cluster
- Tally masculine/feminine/neutral usage
- Assign most frequent pronoun set as referential gender
- Optional: name-based prior guess

#### ARES Status: ✅ ALIGNED

**What ARES Has:**
```
app/engine/ir/salience-resolver.ts (lines 125-165)
- Title-based: Mr. → male, Mrs./Ms. → female
- Name-based: 125+ male names, 145+ female names
- Pronoun-based: he/she → infer gender
- Returns: male | female | neutral | unknown
```

**Recommended Enhancement:**

1. **Track Pronoun Distribution Per Character** (Priority: LOW)
   ```typescript
   interface EntityProfile {
     // ... existing ...
     pronounDistribution: {
       masculine: number;  // he, him, his count
       feminine: number;   // she, her, hers count
       neutral: number;    // they, them, their count
     };
     inferredGender: 'male' | 'female' | 'neutral' | 'unknown';
   }
   ```

---

### 9. Narrative Role Analysis

#### BookNLP Blueprint Requires:
- Rank characters by mention frequency
- Identify protagonist (most mentions/dialogue)
- Identify antagonist (opposition relationship)
- Character interaction network
- Optional: archetype classification

#### ARES Status: ⏸️ PARTIAL / OPPORTUNITY

**What ARES Has:**
```
app/engine/entity-profiler.ts
- mention_count per entity
- confidence_score increases with mentions
- descriptors, roles, attributes

app/engine/entity-tier-assignment.ts
- TIER_A (core), TIER_B (supporting), TIER_C (candidates)
```

**What's Missing:**
- No protagonist/antagonist detection
- No character interaction network
- No archetype classification

**Recommended Implementation:**

1. **Character Importance Scoring** (Priority: MEDIUM)
   ```typescript
   // app/engine/character-analysis.ts

   interface CharacterImportance {
     entityId: string;
     canonical: string;
     mentionCount: number;
     dialogueCount: number;  // Quotes attributed
     eventAgentCount: number;
     eventPatientCount: number;
     connectionCount: number; // Characters they interact with
     importanceScore: number;
     role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
   }

   export function analyzeCharacterImportance(
     entities: Entity[],
     quotes: Quote[],
     events: NarrativeEvent[]
   ): CharacterImportance[] {
     const scores = entities
       .filter(e => e.type === 'PERSON')
       .map(e => ({
         entityId: e.id,
         canonical: e.canonical,
         mentionCount: e.mentions?.length || 0,
         dialogueCount: quotes.filter(q => q.speakerId === e.id).length,
         eventAgentCount: events.filter(ev => ev.agentId === e.id).length,
         eventPatientCount: events.filter(ev => ev.patientId === e.id).length,
         connectionCount: countConnections(e.id, events),
         importanceScore: 0,
         role: 'minor' as const
       }));

     // Calculate importance score
     for (const s of scores) {
       s.importanceScore =
         s.mentionCount * 1.0 +
         s.dialogueCount * 2.0 +
         s.eventAgentCount * 1.5 +
         s.connectionCount * 0.5;
     }

     // Assign roles
     scores.sort((a, b) => b.importanceScore - a.importanceScore);
     if (scores.length > 0) scores[0].role = 'protagonist';
     if (scores.length > 1) scores[1].role = 'supporting';
     // Antagonist detection requires conflict analysis

     return scores;
   }
   ```

2. **Character Interaction Network** (Priority: LOW)
   ```typescript
   interface CharacterNetwork {
     nodes: { id: string; label: string; importance: number }[];
     edges: { source: string; target: string; weight: number; type: string }[];
   }

   export function buildCharacterNetwork(events: NarrativeEvent[]): CharacterNetwork {
     const edges = new Map<string, { weight: number; types: Set<string> }>();

     for (const event of events) {
       if (event.agentId && event.patientId) {
         const key = [event.agentId, event.patientId].sort().join('|');
         const edge = edges.get(key) || { weight: 0, types: new Set() };
         edge.weight++;
         edge.types.add(event.verbLemma);
         edges.set(key, edge);
       }
     }

     // Convert to graph format...
   }
   ```

---

## Implementation Priority Matrix

| Feature | Priority | Effort | Impact | Status |
|---------|----------|--------|--------|--------|
| **Supersense Tagging** | 🔴 HIGH | Medium | High | Not started |
| **Event Detection** | 🔴 HIGH | High | High | Not started |
| **Common Noun Entities** | 🟡 MEDIUM | Low | Medium | Not started |
| **Nominal Coreference** | 🟡 MEDIUM | Medium | Medium | Partial |
| **Addressee Detection** | 🟡 MEDIUM | Low | Medium | Not started |
| **Character Importance** | 🟡 MEDIUM | Medium | High | Partial via tiers |
| **Pronoun Distribution** | 🟢 LOW | Low | Low | Easy add |
| **Interaction Network** | 🟢 LOW | Medium | Low | Not started |

---

## Summary: Where ARES Stands

### ✅ ARES Meets or Exceeds BookNLP:
1. **Text preprocessing** - Modular, extensible spaCy integration
2. **Alias resolution** - 5 strategies + HERT cross-document identity
3. **Entity profiling** - Adaptive learning not available in BookNLP
4. **Relation extraction** - BookNLP's major gap; ARES strength
5. **Deterministic auditing** - No black-box ML decisions

### ⚠️ ARES Has Gaps to Address:
1. **Supersense tagging** - Not implemented (CRITICAL)
2. **Event detection** - Stub only (CRITICAL)
3. **Common noun entities** - Limited detection
4. **Coreference quality** - Rule-based vs ML-trained

### 🎯 Recommended Roadmap:

**Phase 1: Critical Gaps (2 weeks)**
1. Implement supersense tagging with WordNet lookup
2. Implement event detection with agent/patient extraction
3. Link events to entity profiles

**Phase 2: Quality Improvements (2 weeks)**
1. Add common noun entity detection
2. Enhance nominal coreference
3. Add addressee detection for quotes

**Phase 3: Advanced Features (2 weeks)**
1. Character importance analysis
2. Character interaction network
3. Archetype classification (optional)

---

## Appendix: BookNLP Blueprint Reference

The BookNLP blueprint document describes 10 components:
1. Text Preprocessing ✅
2. Named Entity Recognition ⚠️
3. Character Name Clustering ✅
4. Coreference Resolution ⚠️
5. Quotation Detection ✅
6. Supersense Tagging ❌
7. Event Detection ❌
8. Referential Gender ✅
9. Narrative Role Analysis ⏸️
10. Data Structures ✅

**BookNLP Output Files Equivalent:**
- `.tokens` → ARES has this via spaCy
- `.entities` → ARES has KnowledgeGraph.entities
- `.quotes` → ARES has via quote-attribution.ts
- `.book` (character profiles) → ARES has entity-profiler.ts

---

*This document should be updated as gaps are addressed.*
