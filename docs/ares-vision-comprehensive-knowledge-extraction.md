# ARES Vision: Comprehensive Knowledge Extraction
## Building Wikipedia/Fan-Wiki Level Databases from Any Documentation

**Last Updated:** 2025-01-25
**Status:** Phase 1 Complete (Dependency Path Algorithm), Scaling to Phase 2

---

## Executive Summary

**Mission:** Create an algorithmic system so powerful it can extract and structure ALL significant information from any documentation into a comprehensive, queryable knowledge graph - matching the depth and breadth of Wikipedia or fan wikis, but fully automated and deterministic.

**Target Output:** From any corpus (novels, technical docs, historical records, scientific papers), automatically extract:
- **Entities**: Every person, place, organization, object, concept
- **Events**: Battles, founding dates, marriages, discoveries, meetings
- **Relationships**: Who knows whom, who works where, who founded what, who taught whom
- **Temporal Information**: When things happened, how long they lasted, sequences
- **Spatial Information**: Where events occurred, movement patterns, geographic relationships
- **Attributes**: Physical descriptions, properties, capabilities, roles
- **Nested Structures**: Organizations contain departments, places contain sub-locations
- **Causal Chains**: X led to Y, Y enabled Z

**Non-Negotiable Constraints:**
1. **Deterministic** - Same input → same output, always
2. **Local** - No cloud dependencies, no API costs
3. **Fast** - Process thousands of words per second
4. **Explainable** - Show why each fact was extracted
5. **Testable** - Unit tests for every pattern and rule
6. **Algorithmic** - LLMs only as absolute last resort (<5% of cases)

---

## Current State (Phase 1 Complete)

### What We've Built

**1. Dependency Path Extraction Algorithm** (`dependency-paths.ts`)
- Uses dependency grammar (not surface patterns)
- Robust to inserted clauses, passive voice, relative clauses
- 30+ patterns across 6 relation types
- Handles complex constructions like:
  - "She, upon finding him deliriously handsome, made him a husband" ✓
  - "DataVision Systems, which had been founded by Eric Nelson" ✓
  - "Y had been founded by X" (past perfect passive) ✓

**2. Entity Classification System**
- SpaCy NER + context-based refinement
- KNOWN_ORGS/KNOWN_PLACES whitelists
- Keyword detection (Computing, Systems, Technologies → ORG)
- Context patterns ("founded X" → X is ORG)

**3. Results on 3376-Word Narrative**
- **93 relations** extracted
- **98 entities** (PERSON, ORG, PLACE)
- **10 relation types**: married_to, parent_of, child_of, sibling_of, member_of, attended, studies_at, teaches_at, lives_in, leads
- **Processing speed**: 267 words/sec
- **No LLMs used**

### Limitations (What We Need to Add)

**Missing Relation Types:**
- ✓ `leads` - WORKING (1 found)
- ❌ `advised_by` - patterns exist but 0 found
- ❌ `invested_in` - patterns exist but 0 found
- ❌ `founded_by` - use `leads` (already works)
- ❌ Many more needed (see Phase 2)

**Missing Entity Types:**
- CONCEPT - ideas, theories, products, projects
- OBJECT - physical items, artifacts, weapons, vehicles
- TITLE - books, papers, songs, artworks
- MONEY - amounts, currencies, valuations
- QUANTITY - measurements, counts, percentages

**Missing Capabilities:**
- Event extraction (battles, meetings, discoveries)
- Temporal resolution (dates, durations, sequences)
- Coreference resolution (he/she/it/they → entity)
- Multi-sentence reasoning
- Nested entity structures
- Attribute extraction (age, height, color, etc.)

---

## The Full Vision: Five Phases to Comprehensive Extraction

### Phase 2: Complete Relationship Coverage (2-3 weeks)

**Goal:** Extract 50+ relationship types covering all major human interactions

#### Core Relationships (High Priority)

**Professional:**
- `leads` ✓ - already working
- `advised_by` - mentorship, coaching, guidance
- `invested_in` - financial backing
- `employed_by` - works for, reports to
- `manages` - supervises, leads team
- `collaborated_with` - worked together on project
- `succeeded_by` / `preceded_by` - job succession
- `competed_with` - business rivals, competitors

**Family & Social:**
- `married_to` ✓ - already working
- `parent_of` / `child_of` ✓ - already working
- `sibling_of` ✓ - already working
- `divorced_from` - ended marriage
- `engaged_to` - planning marriage
- `adopted_by` / `adopted` - adoption relationships
- `guardian_of` - legal guardianship
- `friend_of` - friendship
- `rival_of` - personal rivals
- `enemy_of` - antagonistic

**Academic:**
- `studied_under` - student-teacher
- `attended` ✓ - already working
- `graduated_from` - degree completed
- `teaches_at` ✓ - already working
- `researched` - research topics/areas
- `authored` - wrote paper/book
- `cited_by` - academic citations
- `peer_reviewed` - reviewed papers

**Geographic:**
- `lives_in` ✓ - already working
- `born_in` - place of birth
- `died_in` - place of death
- `traveled_to` - visited location
- `moved_from` / `moved_to` - relocation
- `located_in` - physical location
- `borders` - geographic adjacency
- `part_of` - region within larger region

**Ownership & Control:**
- `owns` - property ownership
- `acquired` - purchase/acquisition
- `sold_to` - sale transaction
- `founded` - started organization (use `leads`)
- `controls` - has authority over
- `subsidiary_of` - corporate structure
- `merged_with` - corporate merger
- `spun_off_from` - corporate spinoff

**Implementation:**
1. Add 40+ new patterns to `dependency-paths.ts`
2. Test each pattern on 10+ examples
3. Collect real failing cases from narratives
4. Iterate patterns to achieve 70%+ coverage per type
5. Add semantic fallbacks for creative expressions

**Success Metrics:**
- 40+ relation types extracted
- 150+ relations from 3376-word narrative (vs 93 now)
- <5% false positives
- 70%+ precision/recall per type

---

### Phase 3: Event Extraction (2-3 weeks)

**Goal:** Extract discrete events with participants, locations, and timeframes

#### Event Types to Detect

**Historical Events:**
- Battles / Wars
- Treaties / Agreements
- Discoveries / Inventions
- Expeditions / Journeys
- Coronations / Inaugurations
- Rebellions / Revolutions

**Corporate Events:**
- Company founding
- IPO / public offering
- Merger / Acquisition
- Product launch
- Bankruptcy / Closure
- Funding rounds

**Personal Events:**
- Birth / Death
- Marriage / Divorce
- Education milestones
- Career changes
- Awards / Honors
- Crimes / Trials

**Scientific Events:**
- Experiments
- Publications
- Discoveries
- Collaborations
- Conferences

#### Event Schema

```typescript
interface Event {
  id: string;
  type: EventType;
  name: string;
  participants: {
    entity_id: string;
    role: ParticipantRole; // 'leader', 'victim', 'witness', etc.
  }[];
  location?: string; // entity_id of PLACE
  start_date?: TemporalExpression;
  end_date?: TemporalExpression;
  duration?: Duration;
  description: string;
  evidence: Evidence[];
  related_events: {
    event_id: string;
    relation: EventRelation; // 'caused_by', 'led_to', 'part_of'
  }[];
}
```

**Implementation:**
1. Detect event trigger words (fought, discovered, launched, married)
2. Extract participants from dependency structure
3. Extract location from prepositional phrases
4. Extract temporal expressions (see Phase 4)
5. Build event network (causal chains)

**Example:**
```
"In 1998, Zenith Computing acquired DataVision Systems, which had been
founded by Eric Nelson in 1991 in Sunnyvale."

→ Events:
1. Founding Event:
   - Type: company_founding
   - Name: "DataVision Systems founded"
   - Participants: Eric Nelson (founder)
   - Location: Sunnyvale
   - Date: 1991

2. Acquisition Event:
   - Type: acquisition
   - Name: "Zenith acquires DataVision"
   - Participants:
     - Zenith Computing (acquirer)
     - DataVision Systems (acquired)
   - Date: 1998
   - Related: caused closure of DataVision
```

---

### Phase 4: Temporal Reasoning (1-2 weeks)

**Goal:** Extract and normalize all temporal information

#### Temporal Expression Types

**Absolute Dates:**
- "January 15, 1985"
- "1998"
- "March 2010"
- "Q2 2015"

**Relative Dates:**
- "three years later"
- "the following year"
- "a decade earlier"
- "after graduation"

**Durations:**
- "for five years"
- "during the 1990s"
- "throughout his career"
- "a brief period"

**Sequences:**
- "before founding the company"
- "after the merger"
- "while working at IBM"
- "until 2000"

**Temporal Schema:**

```typescript
interface TemporalExpression {
  type: 'absolute' | 'relative' | 'duration' | 'range';
  value?: Date;
  start?: Date;
  end?: Date;
  reference?: string; // entity_id or event_id for relative dates
  duration_value?: number;
  duration_unit?: 'year' | 'month' | 'day' | 'decade';
  certainty: number; // 0-1, how certain we are
}

interface Timeline {
  entity_id: string;
  events: {
    event_id: string;
    timestamp: TemporalExpression;
    description: string;
  }[];
}
```

**Implementation:**
1. Use HeidelTime or SUTime for temporal extraction
2. Normalize to absolute dates where possible
3. Build timeline for each entity
4. Resolve relative references
5. Detect temporal inconsistencies

**Example:**
```
"Robert Morrison graduated from MIT in 1982. Three years later, he
founded Zenith Computing."

→ Timeline (Robert Morrison):
  1982: Graduated from MIT
  1985: Founded Zenith Computing (3 years after graduation)
```

---

### Phase 5: Coreference Resolution & Multi-Sentence Reasoning (2-3 weeks)

**Goal:** Connect pronouns to entities and reason across sentence boundaries

#### Coreference Chains

**Example:**
```
"Sarah Chen co-founded Zenith Computing in 1985. She served as CTO
until 1999, when she stepped back to focus on her family. Her husband,
Peter Kim, was a professor at Stanford."

→ Coreference Chains:
- "Sarah Chen" = "She" (sentence 2) = "she" (sentence 2) = "Her" (sentence 3)
- "Peter Kim" = "Her husband"
```

**Implementation:**
1. Use neural coref model (e.g., spaCy's neuralcoref)
2. Build mention clusters
3. Resolve pronouns to canonical entities
4. Re-extract relations with resolved entities

#### Cross-Sentence Reasoning

**Example:**
```
"Eric Nelson founded DataVision Systems in 1991. The company specialized
in database software. It was acquired by Zenith in 1998."

→ Multi-sentence relations:
- "The company" → DataVision Systems
- "It" → DataVision Systems
- Eric Nelson founded DataVision Systems (sentence 1)
- DataVision Systems specialized_in database software (sentence 2)
- Zenith acquired DataVision Systems (sentence 3)
```

---

### Phase 6: Attribute Extraction (1-2 weeks)

**Goal:** Extract properties and characteristics of entities

#### Attribute Types

**Person Attributes:**
- Age, birth year, death year
- Nationality, ethnicity
- Physical description (height, hair color, etc.)
- Occupation, title
- Education level
- Notable skills/abilities

**Organization Attributes:**
- Industry, sector
- Size (employees, revenue)
- Founded date
- Headquarters location
- Products/services
- Parent company

**Place Attributes:**
- Population
- Area/size
- Climate
- Government type
- Notable features

**Object Attributes:**
- Material, composition
- Color, shape, size
- Function, purpose
- Value, cost
- Age, condition

**Attribute Schema:**

```typescript
interface Attribute {
  entity_id: string;
  attribute_type: string;
  value: string | number | Date;
  unit?: string;
  certainty: number;
  evidence: Evidence[];
  temporal_scope?: {
    start?: Date;
    end?: Date;
  };
}
```

**Example:**
```
"Robert Morrison, a 35-year-old electrical engineer from Detroit,
graduated from MIT with honors."

→ Attributes (Robert Morrison):
- age: 35 years
- occupation: electrical engineer
- origin: Detroit
- education: MIT degree (with honors)
```

---

### Phase 7: Nested Structures & Hierarchies (1 week)

**Goal:** Capture part-whole and hierarchical relationships

#### Structure Types

**Organizational Hierarchy:**
```
Zenith Computing
├── Engineering Division
│   ├── AI Team (led by Dr. Tanaka)
│   └── Cloud Services Team
├── Sales Division
└── Operations Division
```

**Geographic Hierarchy:**
```
United States
├── California
│   ├── San Francisco
│   │   └── Palo Alto
│   └── Los Angeles
└── New York
```

**Temporal Hierarchy:**
```
20th Century
├── 1980s
│   ├── 1985
│   │   ├── Q1 1985
│   │   └── March 1985
```

**Conceptual Hierarchy:**
```
Computer Science
├── Artificial Intelligence
│   ├── Machine Learning
│   │   ├── Neural Networks
│   │   └── Decision Trees
```

**Implementation:**
1. Detect part-whole patterns ("X contains Y", "Y within X")
2. Build hierarchy trees
3. Support multiple inheritance (entity in multiple hierarchies)
4. Query by ancestor/descendant

---

## Phase 8: Quality & Confidence (Ongoing)

**Goal:** Ensure high precision and provide confidence scores

### Confidence Scoring

**Factors:**
- Pattern match strength (0.9 for exact match)
- Context similarity (0.7-0.9)
- Semantic fallback (0.6-0.8)
- Multiple evidence (boost +0.1 per additional source)
- Conflicting evidence (reduce -0.2)

### Quality Assurance

**Validation Rules:**
1. Type guard enforcement (no "company married person")
2. Temporal consistency (birth before death, founding before acquisition)
3. Geographic feasibility (can't be in two places at once)
4. Logical constraints (can't be parent and sibling)

**Error Detection:**
1. Identify contradictions
2. Flag low-confidence extractions
3. Detect missing expected relations
4. Surface ambiguous cases for review

**Human-in-Loop:**
1. Review mode for low-confidence (<0.7)
2. Correction feedback loop
3. Pattern refinement from corrections
4. A/B testing of pattern changes

---

## Phase 9: Domain-Specific Patterns (Future)

### Fantasy/Fiction
- Magic systems (spells, enchantments)
- Mythical creatures and races
- Prophecies and legends
- Artifacts and magical items
- Allegiances and factions

### Scientific Papers
- Hypotheses and theories
- Experimental methods
- Results and findings
- Statistical relationships
- Citations and influences

### Legal Documents
- Parties and roles
- Obligations and rights
- Conditions and terms
- Legal precedents
- Case references

### Medical Records
- Diagnoses
- Treatments and medications
- Symptoms and conditions
- Test results
- Doctor-patient relationships

---

## Phase 10: Scale & Performance (Future)

**Goal:** Process millions of documents efficiently

### Architecture

**Distributed Processing:**
1. Sentence-level parallelization
2. Document-level batching
3. Incremental updates
4. Streaming ingestion

**Indexing:**
1. Entity index (fast lookup by name)
2. Relation index (fast lookup by type)
3. Temporal index (fast lookup by date)
4. Spatial index (fast lookup by location)

**Storage:**
1. Graph database (Neo4j, or custom)
2. Document store (original text)
3. Index store (fast queries)
4. Cache layer (frequently accessed)

**Performance Targets:**
- 1000+ words/sec on single CPU
- 100k+ docs/day on standard hardware
- <100ms query response time
- 99.9% uptime

---

## Success Criteria: Wikipedia-Level Database

### Quantitative Metrics

From a 100,000-word fantasy novel, extract:
- **1000+ entities** (characters, places, items, factions)
- **5000+ relations** (who knows whom, who went where, who owns what)
- **500+ events** (battles, meetings, discoveries, deaths)
- **2000+ attributes** (ages, descriptions, capabilities)
- **90%+ precision** (facts are correct)
- **70%+ recall** (most facts are found)

### Qualitative Metrics

**Can answer complex queries:**
- "Show me the family tree of House Stark"
- "What events led to the Battle of Helm's Deep?"
- "Who taught whom in the Harry Potter series?"
- "Map the journey of Frodo from Bag End to Mount Doom"
- "Timeline of Zenith Computing from founding to IPO"
- "Network of investors in Silicon Valley startups, 1980-2000"

**Comparable to human-generated wikis:**
- Lord of the Rings Wiki: 7000+ articles
- Harry Potter Wiki: 15000+ articles
- ARES should automatically generate 80%+ of this content from the source texts

---

## Technology Stack

**Core NLP:**
- spaCy 3.x (dependency parsing, NER)
- Custom dependency path algorithm (this project)
- HeidelTime/SUTime (temporal extraction)
- Neural coref (coreference resolution)

**Data Storage:**
- SQLite (local, portable)
- Optional: Neo4j (graph queries)

**Programming:**
- TypeScript (type safety, maintainability)
- Node.js (runtime)
- Python (NLP preprocessing)

**Quality:**
- Vitest (unit tests)
- Property-based testing
- Golden dataset evaluation
- Continuous benchmarking

---

## Philosophical Principles

### 1. Algorithms Over AI

**Why:**
- Algorithms are deterministic, testable, explainable
- AI is non-deterministic, expensive, requires cloud
- For 80% of patterns, algorithms work perfectly
- Reserve AI for truly ambiguous 5-10%

**Hierarchy:**
1. Exact pattern match (90% confidence)
2. Dependency path (85% confidence)
3. Semantic pattern (75% confidence)
4. LLM fallback (70% confidence, cached)

### 2. Linguistic Structure Over Surface Text

**Why:**
- "She made him a husband" - surface patterns fail
- Dependency structure: `she:↑nsubj:make:↓dobj:him` - works
- Robust to insertions, reorderings, paraphrasing

### 3. Evidence-Based Extraction

**Every fact must include:**
- Source document
- Character offset span
- Sentence context
- Confidence score
- Extraction method (pattern name)
- Conflicting evidence (if any)

### 4. Fail Fast, Explain Always

**On error:**
- Log the sentence
- Log the pattern that failed
- Log why it failed
- Surface to developer for pattern refinement
- Never silently drop potential facts

---

## Development Roadmap

**Q1 2025:**
- ✅ Phase 1: Dependency path algorithm (COMPLETE)
- [ ] Phase 2: 50+ relationship types
- [ ] Phase 3: Event extraction basics

**Q2 2025:**
- [ ] Phase 4: Temporal reasoning
- [ ] Phase 5: Coreference resolution
- [ ] Phase 6: Attribute extraction

**Q3 2025:**
- [ ] Phase 7: Nested structures
- [ ] Phase 8: Quality & confidence system
- [ ] Benchmark on multiple domains

**Q4 2025:**
- [ ] Phase 9: Domain-specific patterns
- [ ] Phase 10: Scale & performance
- [ ] Production release 1.0

---

## Conclusion

We're building an algorithmic system that extracts and structures human knowledge at Wikipedia scale - automatically, deterministically, and locally. Phase 1 (dependency paths) is complete and working. The next 9 phases will expand coverage from 10 relation types to 50+, from relations only to events+attributes+timelines, and from single sentences to cross-document reasoning.

The goal is not to replace human knowledge curation, but to make it 100x faster by providing an 80% complete structured database automatically, requiring only human review and refinement for the final 20%.

**Current State:** Proof of concept working
**Target State:** Production-ready knowledge extraction pipeline
**Timeline:** 12-18 months to full vision
**Philosophy:** Algorithms first, AI last, always local, always deterministic
