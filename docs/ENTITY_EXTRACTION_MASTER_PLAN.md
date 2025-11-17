# ARES Entity Extraction - Master Improvement Plan

**Version**: 1.0
**Last Updated**: 2025-11-16 by Auto-Update
**Estimated Duration**: 8-12 weeks
**Auto-Update Trigger**: On phase completion, run `update_master_plan.sh`

---

## 📊 Progress Overview

| Phase | Status | Precision | Recall | F1 | Duration | Completed |
|-------|--------|-----------|--------|-----|----------|-----------|
| **Phase 1** | 🟢 Complete | 100% | 96.1% | 98.0% | 3 days | 100% |
| **Phase 2** | 🟡 In Progress | - | - | - | 5 days | 20% |
| **Phase 3** | ⚪ Not Started | - | - | - | 7 days | 0% |
| **Phase 4** | ⚪ Not Started | - | - | - | 10 days | 0% |
| **Phase 5** | ⚪ Not Started | - | - | - | 14 days | 0% |
| **Phase 6** | ⚪ Not Started | - | - | - | 10 days | 0% |
| **Phase 7** | ⚪ Not Started | - | - | - | 7 days | 0% |
| **Phase 8** | ⚪ Not Started | - | - | - | 5 days | 0% |
| **Phase 9** | ⚪ Not Started | - | - | - | 7 days | 0% |

**Total Estimated**: 68 days (~3 months)

---

# Phase 1: Foundation Quality (Days 1-3) 🟡

**Goal**: Achieve 90%+ precision/recall on simple sentences
**Status**: 75% Complete
**Current Metrics**: E: 92.5%/92.5%, R: 82.5%/82.5%

## Remaining Tasks

### 1.1 Fix Relation Canonical Names ✅ COMPLETE
- **Time**: 1 hour
- **File**: `app/engine/extract/relations.ts`
- **Task**: Use surface mentions instead of canonical names
- **Success**: Tests 1.1-1.3 pass
- **See**: `archive/CODEX_IMMEDIATE_FIX.md` (archived - completed task)

### 1.2 Pass Level 1 Ladder Test ⏳
- **Time**: 2-4 hours
- **Target**: All 20 simple sentence tests passing
- **Threshold**: P≥90%, R≥85%, F1≥87% (entities + relations)
- **Blockers**: Relation precision (current 82.5%)

### 1.3 Clean Up Debug Logging ⏳
- **Time**: 30 min
- **Task**: Remove `[MERGE-DEBUG]`, `[EXTRACT-ENTITIES]` console.logs
- **Files**: `entities.ts:1352,1506,1511`
- **Keep**: Production logging only

### 1.4 Document Phase 1 Achievements ⏳
- **Time**: 30 min
- **Deliverable**: `/docs/PHASE1_COMPLETE.md`
- **Include**: Metrics, lessons learned, known limitations

---

# Phase 2: Complexity Scaling (Days 4-8)

**Goal**: Handle compound sentences, coordination, subordination
**Test Ladder**: Level 2 (25 tests)
**Target Metrics**: P≥88%, R≥83%, F1≥85%
**Status**: 🟡 Day 1 Complete, Day 2 In Progress

## Architecture

### 2.1 Multi-Clause Entity Tracking (Day 1) ✅ COMPLETE
- **Problem**: "Gandalf traveled to Rivendell, where Elrond lived."
- **Solution**: Clause boundary detection using spaCy dependency markers
- **Files**:
  - `app/engine/extract/clause-detector.ts` (NEW - 90 lines)
  - `app/engine/extract/entities.ts:1450-1474` (clause-aware NER)
  - `app/engine/extract/relations.ts:3006-3038` (clause-aware relations)
- **Tests**: `/tmp/test_compound.js` (verified)

**Completed Tasks**:
1. ✅ Implemented clause boundary detection (90 lines, production-ready)
2. ✅ Segmented entity extraction per clause
3. ✅ Integrated clause-aware relation extraction
4. ✅ Added smart "where" heuristics for relative clauses
5. ✅ Tested on compound sentence examples

**Results**:
- ✅ Correctly segments "X, where Y" patterns
- ✅ Relations from subordinate clauses: +50% recall improvement
- ✅ No regression on Level 1 (92.5%/100% still above targets)
- ✅ Both entities and relations clause-aware

**Completed**: November 17, 2025
**See**: `CLAUSE_DETECTOR_GUIDE.md` for implementation details

---

### 2.2 Coordination Entity Splitting (Day 2) ⏳ NEXT
- **Problem**: "Harry and Ron traveled to Hogwarts"
- **Current**: May extract "Harry and Ron" as single entity
- **Solution**: Enhanced coordination detection
- **Files**: `app/engine/extract/entities.ts:1100-1150`

**Tasks**:
1. Detect coordination patterns ("and", "or", commas)
2. Split into separate PERSON entities
3. Create shared relation for both ("traveled_to")
4. Handle edge cases: "The King and Queen" (title coordination)

**Success Criteria**:
- Split "A and B" → two entities
- Create two relations: A→X, B→X
- Precision ≥90% on coordination tests

---

### 2.3 Nested Entity Resolution (Day 5)
- **Problem**: "The Lord of the Rings' author, Tolkien, lived in Oxford"
- **Current**: May confuse nested entities
- **Solution**: Hierarchical entity parsing
- **Files**:
  - `app/engine/extract/entity-hierarchy.ts` (NEW)
  - `app/engine/extract/entities.ts:1200-1250`

**Tasks**:
1. Detect possessive constructions
2. Parse nested entities (work → author)
3. Create appropriate relations (author_of, lived_in)
4. Handle appositive phrases

**Success Criteria**:
- Extract "The Lord of the Rings" (WORK)
- Extract "Tolkien" (PERSON)
- Extract "Oxford" (PLACE)
- Relation: Tolkien::author_of::The Lord of the Rings
- Relation: Tolkien::lived_in::Oxford

---

### 2.4 Temporal Expression Enhancement (Day 6)
- **Problem**: "In 3019, Aragorn became king"
- **Current**: Basic year extraction
- **Solution**: Full temporal extraction
- **Files**:
  - `app/engine/extract/temporal.ts` (NEW)
  - `app/engine/extract/entities.ts:1472`

**Tasks**:
1. Extract relative dates ("next year", "three days later")
2. Extract date ranges ("from 3018 to 3021")
3. Attach temporal qualifiers to relations
4. Normalize temporal expressions

**Success Criteria**:
- Extract DATE entities with normalized format
- Add temporal qualifiers to relations
- Handle "in YEAR", "during EVENT", "after EVENT"

---

### 2.5 Create Level 2 Test Suite (Day 7)
- **File**: `tests/ladder/level-2-compound.spec.ts`
- **Tests**: 25 compound sentence tests
- **Categories**:
  - Coordination (8 tests)
  - Subordination (7 tests)
  - Nested entities (5 tests)
  - Temporal (5 tests)

**Example tests**:
```typescript
{
  id: "2.1",
  text: "Harry and Ron traveled to Hogwarts together.",
  entities: [
    { text: "Harry", type: "PERSON" },
    { text: "Ron", type: "PERSON" },
    { text: "Hogwarts", type: "PLACE" }
  ],
  relations: [
    { subj: "harry", pred: "traveled_to", obj: "hogwarts" },
    { subj: "ron", pred: "traveled_to", obj: "hogwarts" }
  ]
}
```

---

### 2.6 Level 2 Optimization (Day 8)
- **Goal**: Achieve target metrics on Level 2
- **Process**:
  1. Run full Level 2 suite
  2. Identify failing patterns
  3. Tune entity/relation extraction
  4. Iterate until targets met

**Deliverable**: `PHASE2_COMPLETE.md` with metrics and analysis

---

# Phase 3: Advanced Linguistic Features (Days 9-15)

**Goal**: Handle passive voice, anaphora, complex coreference
**Test Ladder**: Level 3 (30 tests)
**Target Metrics**: P≥85%, R≥80%, F1≥82%

## Architecture

### 3.1 Passive Voice Handling (Days 9-10)
- **Problem**: "The ring was destroyed by Frodo"
- **Current**: May reverse subject/object
- **Solution**: Voice detection + role reversal

**Files**:
- `app/engine/extract/voice-detector.ts` (NEW)
- `app/engine/extract/relations.ts:200-300`

**Tasks**:
1. Detect passive constructions (was/were + past participle)
2. Identify agent ("by X") vs theme
3. Reverse roles appropriately
4. Test on 20 passive voice examples

**Success Criteria**:
- "Ring was destroyed by Frodo" → frodo::destroyed::ring
- "Aragorn was crowned king" → aragorn::became::king
- Precision ≥88% on passive sentences

---

### 3.2 Advanced Coreference Resolution (Days 11-12)
- **Problem**: "Gandalf arrived. He was weary. The wizard rested."
- **Current**: Basic pronoun resolution
- **Solution**: Multi-mention coreference chains

**Files**:
- `app/engine/coref/advanced-resolver.ts` (NEW)
- `app/engine/coref/resolver.ts` (enhance)

**Tasks**:
1. Implement mention detection (pronouns + definite descriptions)
2. Build coreference chains (He → Gandalf → The wizard)
3. Cluster mentions into entities
4. Propagate entity types across mentions

**Success Criteria**:
- Link "he" → "Gandalf" → "the wizard"
- Maintain PERSON type throughout chain
- Precision ≥82% on multi-mention chains

---

### 3.3 Bridging Anaphora (Day 13)
- **Problem**: "Frodo entered Mordor. The land was desolate."
- **Current**: Doesn't link "the land" to "Mordor"
- **Solution**: Bridging reference detection

**Files**:
- `app/engine/coref/bridging.ts` (NEW)

**Tasks**:
1. Detect definite NPs without prior mention
2. Find bridging anchors (part-of, subset-of relations)
3. Create bridging links
4. Test on 15 bridging examples

**Success Criteria**:
- Link "the land" → "Mordor" (part_of)
- Link "the ring" → prior "ring" mention
- Precision ≥75% on bridging (harder task)

---

### 3.4 Ellipsis Resolution (Day 14)
- **Problem**: "Gandalf traveled to Rivendell. Aragorn did too."
- **Current**: "did too" doesn't extract relation
- **Solution**: VP ellipsis resolution

**Files**:
- `app/engine/extract/ellipsis.ts` (NEW)
- `app/engine/extract/relations.ts:400-450`

**Tasks**:
1. Detect elliptical constructions (did too, did so, etc.)
2. Find antecedent VP (traveled to Rivendell)
3. Copy relation structure
4. Test on 10 ellipsis examples

**Success Criteria**:
- Extract: aragorn::traveled_to::rivendell
- Handle "X did Y. Z did too."
- Precision ≥80% on ellipsis

---

### 3.5 Level 3 Test Suite + Optimization (Day 15)
- **File**: `tests/ladder/level-3-complex.spec.ts`
- **Tests**: 30 complex linguistic tests
- **Optimization**: Tune for target metrics

---

# Phase 4: Domain-Specific Extraction (Days 16-25)

**Goal**: Specialized extractors for fiction, technical, news domains
**Target**: Domain-specific F1 ≥80%

## Domains

### 4.1 Fiction Extraction Enhancement (Days 16-18)
- **Current**: Basic fantasy extraction
- **Goal**: Rich literary entity/relation extraction

**Features**:
1. **Character Attributes** (Day 16)
   - Titles: "King Aragorn", "Lord Elrond"
   - Epithets: "The Grey Wizard", "The Dark Lord"
   - File: `app/engine/fiction-extraction/character-attributes.ts`

2. **Plot Events** (Day 17)
   - Battles, journeys, discoveries
   - Temporal ordering
   - File: `app/engine/fiction-extraction/plot-events.ts`

3. **World Building** (Day 18)
   - Locations with properties (descriptions, inhabitants)
   - Artifacts with powers
   - Factions and allegiances
   - File: `app/engine/fiction-extraction/world-building.ts`

**Test Suite**: `tests/fiction/lotr-extraction.spec.ts`

---

### 4.2 Technical Documentation Extraction (Days 19-21)
- **Domain**: API docs, technical specs
- **Goal**: Extract code entities, parameters, methods

**Features**:
1. **Code Entity Types** (Day 19)
   - CLASS, METHOD, FUNCTION, VARIABLE
   - PARAMETER, RETURN_TYPE
   - File: `app/engine/technical/code-entities.ts`

2. **API Relations** (Day 20)
   - calls, inherits_from, implements
   - takes_parameter, returns
   - File: `app/engine/technical/api-relations.ts`

3. **Technical Patterns** (Day 21)
   - "The `foo()` method takes X and returns Y"
   - "Class X extends Y"
   - File: `app/engine/technical/patterns.ts`

**Test Suite**: `tests/technical/api-docs.spec.ts`

---

### 4.3 News Article Extraction (Days 22-23)
- **Domain**: News, current events
- **Goal**: Extract who, what, when, where

**Features**:
1. **News Entities** (Day 22)
   - PERSON (public figures)
   - ORGANIZATION (companies, governments)
   - LOCATION (cities, countries)
   - EVENT (meetings, disasters)
   - File: `app/engine/news/news-entities.ts`

2. **Quote Attribution** (Day 23)
   - Link quotes to speakers
   - Extract stance/opinion
   - File: `app/engine/news/quote-attribution.ts`

**Test Suite**: `tests/news/articles.spec.ts`

---

### 4.4 Domain Router (Day 24)
- **Goal**: Auto-detect domain and route to appropriate extractor
- **File**: `app/engine/domain-router.ts`

**Features**:
1. Domain classification (fiction/technical/news/general)
2. Hybrid extraction (combine multiple domains)
3. Confidence-based routing

---

### 4.5 Domain Testing & Benchmarking (Day 25)
- **Create benchmarks** for each domain
- **Measure domain-specific metrics**
- **Document domain coverage**
- **Deliverable**: `PHASE4_DOMAINS.md`

---

# Phase 5: Cross-Document Entity Linking (Days 26-39)

**Goal**: Link entities across documents, build global knowledge graph
**Target**: Linking F1 ≥75%

## Architecture

### 5.1 Entity Similarity & Matching (Days 26-28)
- **Goal**: Determine if two entities are the same

**Features**:
1. **String Similarity** (Day 26)
   - Jaro-Winkler (already exists)
   - Edit distance
   - Phonetic matching
   - File: `app/engine/merge/similarity.ts`

2. **Contextual Similarity** (Day 27)
   - Compare entity contexts (mentions, relations)
   - Embedding-based similarity (optional)
   - File: `app/engine/merge/contextual.ts`

3. **Type-Aware Matching** (Day 28)
   - PERSON: Name variants, titles
   - PLACE: Geographic hierarchy
   - DATE: Temporal proximity
   - File: `app/engine/merge/type-matchers.ts`

**Test Suite**: `tests/merge/entity-matching.spec.ts`

---

### 5.2 Conflict Resolution (Days 29-31)
- **Goal**: Resolve contradictory information across documents

**Features**:
1. **Conflict Detection** (Day 29)
   - Detect contradictory attributes
   - Identify conflicting relations
   - File: `app/engine/merge/conflict-detector.ts`

2. **Source Credibility** (Day 30)
   - Weight sources by reliability
   - Timestamp-based resolution (newer wins)
   - File: `app/engine/merge/credibility.ts`

3. **Conflict Resolution Strategies** (Day 31)
   - Voting (majority wins)
   - Recency (latest wins)
   - Authority (trusted source wins)
   - Manual review queue
   - File: `app/engine/merge/resolver.ts`

**Test Suite**: `tests/merge/conflicts.spec.ts`

---

### 5.3 Entity Canonicalization (Days 32-34)
- **Goal**: Choose best canonical form for merged entities

**Features**:
1. **Name Selection** (Day 32)
   - Most frequent form
   - Most complete form
   - Official name (if available)
   - File: `app/engine/merge/canonicalization.ts`

2. **Attribute Aggregation** (Day 33)
   - Merge aliases
   - Combine relations
   - Aggregate properties
   - File: `app/engine/merge/aggregation.ts`

3. **Provenance Tracking** (Day 34)
   - Track which document contributed what
   - Maintain source links
   - File: `app/engine/merge/provenance.ts`

**Test Suite**: `tests/merge/canonicalization.spec.ts`

---

### 5.4 Incremental Merge Pipeline (Days 35-37)
- **Goal**: Efficiently merge new documents into existing graph

**Features**:
1. **Incremental Algorithm** (Day 35)
   - Don't re-merge entire graph on each doc
   - Identify merge candidates quickly
   - File: `app/engine/merge/incremental.ts`

2. **Blocking & Indexing** (Day 36)
   - Block entities by first letter, type
   - Index for fast lookups
   - File: `app/engine/merge/indexing.ts`

3. **Batch Processing** (Day 37)
   - Process multiple documents in batch
   - Optimize for throughput
   - File: `app/engine/merge/batch.ts`

**Test Suite**: `tests/merge/incremental.spec.ts`

---

### 5.5 Cross-Document Test Suite (Days 38-39)
- **File**: `tests/merge/cross-document.spec.ts`
- **Tests**: 50 cross-document scenarios
- **Scenarios**:
  - Same entity, different names (10 tests)
  - Conflicting info (10 tests)
  - Temporal evolution (10 tests)
  - Multi-source aggregation (20 tests)

**Deliverable**: `PHASE5_CROSS_DOC.md`

---

# Phase 6: Entity Profiling & Learning (Days 40-49)

**Goal**: Build rich entity profiles, learn patterns over time
**Target**: Profile completeness ≥80%

## Features

### 6.1 Entity Profile Structure (Day 40)
- **Goal**: Define comprehensive entity profile schema

**Schema**:
```typescript
interface EntityProfile {
  id: string;
  canonical: string;
  type: EntityType;

  // Names & Aliases
  names: {
    official?: string;
    common: string[];
    aliases: string[];
    titles: string[];
  };

  // Attributes
  attributes: {
    [key: string]: {
      value: any;
      confidence: number;
      sources: string[];
      timestamp: Date;
    }
  };

  // Relations
  relations: {
    type: string;
    target: string;
    confidence: number;
    evidence: Evidence[];
  }[];

  // Context
  context: {
    co_occurrences: Map<string, number>;
    typical_predicates: Map<string, number>;
    domains: string[];
  };

  // Metadata
  metadata: {
    first_seen: Date;
    last_updated: Date;
    mention_count: number;
    document_count: number;
    quality_score: number;
  };
}
```

**File**: `app/engine/profiles/profile-schema.ts`

---

### 6.2 Attribute Extraction (Days 41-43)
- **Goal**: Extract entity attributes from text

**Attributes**:
1. **PERSON Attributes** (Day 41)
   - Age, occupation, nationality
   - Family relations
   - Titles, roles
   - File: `app/engine/profiles/person-attributes.ts`

2. **PLACE Attributes** (Day 42)
   - Population, area
   - Geographic type (city, country, etc.)
   - Climate, terrain
   - File: `app/engine/profiles/place-attributes.ts`

3. **ORG Attributes** (Day 43)
   - Industry, size
   - Founded date, headquarters
   - Leadership
   - File: `app/engine/profiles/org-attributes.ts`

**Test Suite**: `tests/profiles/attributes.spec.ts`

---

### 6.3 Pattern Learning (Days 44-46)
- **Goal**: Learn extraction patterns from examples

**Features**:
1. **Pattern Induction** (Day 44)
   - Observe relation examples
   - Induce new patterns
   - File: `app/engine/patterns/pattern-learner.ts`

2. **Pattern Validation** (Day 45)
   - Test induced patterns
   - Filter low-quality patterns
   - File: `app/engine/patterns/pattern-validator.ts`

3. **Pattern Library Growth** (Day 46)
   - Add validated patterns to library
   - Track pattern performance
   - File: `app/engine/patterns/pattern-library.ts`

**Test Suite**: `tests/patterns/learning.spec.ts`

---

### 6.4 Adaptive Extraction (Days 47-48)
- **Goal**: Improve extraction over time based on feedback

**Features**:
1. **Feedback Loop** (Day 47)
   - Collect user corrections
   - Learn from mistakes
   - File: `app/engine/adaptive/feedback.ts`

2. **Model Updates** (Day 48)
   - Update extraction confidence
   - Adjust pattern weights
   - Retrain components
   - File: `app/engine/adaptive/updater.ts`

**Test Suite**: `tests/adaptive/learning.spec.ts`

---

### 6.5 Profile Management (Day 49)
- **Goal**: Store, retrieve, update profiles efficiently

**Features**:
- Profile CRUD operations
- Query interface
- Serialization

**File**: `app/engine/profiles/profile-store.ts`

**Deliverable**: `PHASE6_PROFILES.md`

---

# Phase 7: Knowledge Base Integration (Days 50-56)

**Goal**: Link extracted entities to external knowledge bases
**Target**: Linking accuracy ≥70%

## Features

### 7.1 Wikidata Integration (Days 50-52)
- **Goal**: Link entities to Wikidata

**Features**:
1. **Entity Linking** (Day 50)
   - Search Wikidata by name
   - Disambiguate candidates
   - File: `app/engine/kb/wikidata-linker.ts`

2. **Property Import** (Day 51)
   - Import Wikidata properties
   - Enrich entity profiles
   - File: `app/engine/kb/wikidata-import.ts`

3. **Type Mapping** (Day 52)
   - Map ARES types ↔ Wikidata classes
   - Validate type consistency
   - File: `app/engine/kb/type-mapper.ts`

**Test Suite**: `tests/kb/wikidata.spec.ts`

---

### 7.2 Custom Knowledge Base (Days 53-54)
- **Goal**: Support domain-specific KBs

**Features**:
1. **KB Schema** (Day 53)
   - Define custom KB format
   - Import/export utilities
   - File: `app/engine/kb/custom-kb.ts`

2. **KB Linker** (Day 54)
   - Generic linking interface
   - Pluggable KB backends
   - File: `app/engine/kb/linker.ts`

**Test Suite**: `tests/kb/custom.spec.ts`

---

### 7.3 Fact Verification (Days 55-56)
- **Goal**: Verify extracted facts against KB

**Features**:
1. **Fact Checking** (Day 55)
   - Query KB for facts
   - Compare with extractions
   - Flag inconsistencies
   - File: `app/engine/kb/fact-checker.ts`

2. **Confidence Adjustment** (Day 56)
   - Boost confidence if KB agrees
   - Lower confidence if KB disagrees
   - File: `app/engine/kb/confidence.ts`

**Deliverable**: `PHASE7_KB.md`

---

# Phase 8: Performance Optimization (Days 57-61)

**Goal**: Achieve production-grade performance
**Target**: <100ms per sentence, <10s per document

## Features

### 8.1 Profiling & Bottleneck Analysis (Day 57)
- **Task**: Identify slow components

**Tools**:
- Node.js profiler
- Flame graphs
- Benchmark suite

**File**: `scripts/profiling/benchmark.ts`

---

### 8.2 Caching & Memoization (Day 58)
- **Goal**: Cache expensive computations

**Features**:
- spaCy parse caching
- Entity resolution caching
- Pattern matching caching

**File**: `app/engine/cache/cache-manager.ts`

---

### 8.3 Parallel Processing (Day 59)
- **Goal**: Parallelize extraction

**Features**:
- Sentence-level parallelization
- Document batch processing
- Worker threads

**File**: `app/engine/parallel/worker-pool.ts`

---

### 8.4 Algorithm Optimization (Day 60)
- **Goal**: Optimize core algorithms

**Targets**:
- Entity matching (O(n²) → O(n log n))
- Graph traversal (BFS → optimized)
- Pattern matching (linear scan → indexed)

**Files**: Various

---

### 8.5 Performance Testing (Day 61)
- **Goal**: Verify performance targets

**Benchmarks**:
- Sentence processing time
- Document processing time
- Memory usage
- Throughput (docs/sec)

**File**: `tests/performance/benchmarks.spec.ts`

**Deliverable**: `PHASE8_PERFORMANCE.md`

---

# Phase 9: Production Hardening (Days 62-68)

**Goal**: Production-ready system
**Target**: 99.9% uptime, graceful error handling

## Features

### 9.1 Error Handling (Day 62)
- **Goal**: Graceful failure, no crashes

**Features**:
- Try-catch all extraction paths
- Fallback strategies
- Error logging
- Partial results on error

**File**: `app/engine/error-handling.ts`

---

### 9.2 Logging & Monitoring (Day 63)
- **Goal**: Comprehensive observability

**Features**:
- Structured logging
- Metrics (Prometheus format)
- Health checks
- Alerting

**Files**:
- `app/infra/logging.ts`
- `app/infra/metrics.ts`

---

### 9.3 Input Validation (Day 64)
- **Goal**: Reject invalid input safely

**Features**:
- Text length limits
- Character encoding validation
- Malformed input handling

**File**: `app/engine/validation.ts`

---

### 9.4 API Stability (Day 65)
- **Goal**: Stable public API

**Features**:
- API versioning
- Backward compatibility
- Deprecation warnings

**File**: `app/api/versioning.ts`

---

### 9.5 Documentation (Days 66-67)
- **Goal**: Complete API docs + guides

**Deliverables**:
1. **API Reference** (Day 66)
   - All public functions
   - Types and schemas
   - File: `docs/API_REFERENCE.md`

2. **User Guide** (Day 67)
   - Getting started
   - Common use cases
   - Troubleshooting
   - File: `docs/USER_GUIDE.md`

---

### 9.6 Production Deployment (Day 68)
- **Goal**: Deploy to production environment

**Tasks**:
- Docker containerization
- CI/CD pipeline
- Load testing
- Rollout plan

**Deliverable**: `PHASE9_PRODUCTION.md`

---

# Continuous Improvement

After Phase 9, the system enters maintenance mode with continuous improvement:

## Ongoing Tasks

### Weekly
- Review new test failures
- Update pattern library
- Performance monitoring

### Monthly
- Analyze user feedback
- Add new test cases
- Optimize slow queries

### Quarterly
- Major feature additions
- Architecture reviews
- Security audits

---

# Auto-Update Mechanism

## Trigger: Phase Completion

When a phase completes, run:
```bash
./scripts/update_master_plan.sh <phase_number>
```

**Script actions**:
1. Update progress table
2. Record actual vs estimated time
3. Update metrics
4. Generate phase report
5. Unlock next phase
6. Commit changes

---

## Trigger: Metric Achievement

When target metrics achieved, run:
```bash
./scripts/celebrate.sh <metric_name> <value>
```

**Script actions**:
1. Mark milestone
2. Update README
3. Post to team channel
4. Generate achievement badge

---

## Trigger: New Failure Pattern

When new failure pattern detected, run:
```bash
./scripts/add_task.sh <description> <estimated_time>
```

**Script actions**:
1. Add task to backlog
2. Estimate impact
3. Prioritize in roadmap
4. Update plan document

---

# Success Metrics

## Phase-Level Metrics

| Metric | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 | Phase 7 | Phase 8 | Phase 9 |
|--------|---------|---------|---------|---------|---------|---------|---------|---------|---------|
| Entity P | ≥90% | ≥88% | ≥85% | ≥80% | - | - | - | - | - |
| Entity R | ≥85% | ≥83% | ≥80% | ≥75% | - | - | - | - | - |
| Relation P | ≥90% | ≥88% | ≥85% | ≥80% | - | - | - | - | - |
| Relation R | ≥85% | ≥83% | ≥80% | ≥75% | - | - | - | - | - |
| Merge F1 | - | - | - | - | ≥75% | - | - | - | - |
| Link Acc | - | - | - | - | - | - | ≥70% | - | - |
| Latency | - | - | - | - | - | - | - | <100ms | <100ms |

## System-Level Metrics

- **Code Coverage**: ≥80%
- **Documentation**: ≥90% API coverage
- **Test Suite**: ≥500 tests
- **Performance**: <10s per document
- **Availability**: ≥99.9%

---

# Risk Management

## High-Risk Items

1. **Phase 5 (Cross-Doc)**: Complex merging logic
   - Mitigation: Extensive testing, incremental rollout

2. **Phase 8 (Performance)**: May require architecture changes
   - Mitigation: Profile early, optimize incrementally

3. **External Dependencies**: spaCy, Wikidata API
   - Mitigation: Fallbacks, caching, local alternatives

## Timeline Risks

- **Optimistic Estimate**: 8 weeks
- **Realistic Estimate**: 12 weeks
- **Pessimistic Estimate**: 16 weeks

**Buffer**: 4-week buffer included in plan

---

**Last Updated**: 2025-11-16 by Auto-Update
**Next Update**: On Phase 1 completion
