# Long-Form Extraction: Plan to Rival LLM Quality

**Goal:** Build algorithm-first extraction system that rivals local LLMs on contemporary long-form writing

**Target:** Extract entities, relations, and events from 2000-5000 word chapters with:
- 90%+ entity precision/recall
- 85%+ relation precision/recall
- Full event chains and temporal ordering
- Wiki-ready knowledge graphs

---

## Phase 1: Test Corpus Preparation (30 minutes)

### Objective
Create diverse test corpus of long chapters (2000-5000 words each)

### Sources
1. **Harry Potter** - Contemporary fantasy (1990s-2000s)
   - Chapter 1: The Boy Who Lived (~2500 words)
   - Chapter 5: Diagon Alley (~3500 words)

2. **Lord of the Rings** - Classic fantasy (1950s)
   - Book I, Chapter 1: A Long-expected Party (~4000 words)
   - Book III, Chapter 6: The King of the Golden Hall (~3800 words)

3. **Contemporary Fiction** (if available in tests/fixtures/)
   - Modern prose samples
   - Biographical narratives

### Deliverables
- `/corpus/hp-chapter-01.txt` (2500 words)
- `/corpus/hp-chapter-05.txt` (3500 words)
- `/corpus/lotr-chapter-01.txt` (4000 words)
- `/corpus/lotr-chapter-06.txt` (3800 words)
- Gold standard annotations for 20% sample (for validation)

---

## Phase 2: Baseline Extraction (1 hour)

### Objective
Run current extraction pipeline on long chapters and measure performance

### Metrics to Collect
1. **Entity Extraction:**
   - Total entities extracted
   - Entities by type (PERSON, PLACE, ORG, etc.)
   - Entity precision/recall (vs. gold standard sample)
   - Duplicate entity count (entity resolution quality)

2. **Relation Extraction:**
   - Total relations extracted
   - Relations by predicate
   - Relation precision/recall (vs. gold standard)
   - False positive rate

3. **Performance:**
   - Processing time per 1000 words
   - Memory usage
   - Context window utilization

4. **Coreference Quality:**
   - Pronoun resolution accuracy
   - Cross-paragraph entity linking
   - Deictic reference resolution ("there", "here")

### Test Script
```typescript
// extract-long-chapter.ts
async function extractChapter(filePath: string) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const startTime = Date.now();

  await appendDoc('chapter', text, graphPath);
  const graph = loadGraph(graphPath);

  return {
    processingTime: Date.now() - startTime,
    entityCount: graph.entities.length,
    relationCount: graph.relations.length,
    entities: graph.entities,
    relations: graph.relations
  };
}
```

### Deliverables
- Baseline metrics report
- Entity/relation dumps for manual review
- Performance benchmarks

---

## Phase 3: Systematic Failure Analysis (1-2 hours)

### Objective
Identify and categorize all extraction failures

### Analysis Categories

#### 3.1 Entity Failures
- **Missing entities** (recall issues)
  - Common patterns: nicknames, titles, indirect references
- **Wrong entity types**
  - Pattern: Context misclassification
- **Duplicate entities** (entity resolution)
  - Pattern: Different mentions not merged

#### 3.2 Relation Failures
- **Missing relations** (pattern gaps)
  - Identify verb patterns not covered
  - Cross-sentence relation gaps
- **False positive relations** (precision issues)
  - Over-broad patterns
  - Type guard violations
- **Wrong relation types**
  - Similar verb confusion (e.g., "ruled" vs. "governed")

#### 3.3 Coreference Failures
- **Pronoun resolution errors**
  - Long-distance pronouns (>3 sentences back)
  - Gender/number mismatches
- **Nominal back-references**
  - "the wizard" → which wizard?
  - "the young boy" → character from 2 paragraphs ago
- **Event coreference**
  - "the battle" → which battle mentioned earlier?

#### 3.4 Long-Form Specific Issues
- **Context window limitations**
  - Information beyond 200-char window
- **Multi-paragraph narrative arcs**
  - Character introductions → later references
  - Event sequences across pages
- **Implicit relations**
  - Family relationships inferred from context
  - Social hierarchies not explicitly stated

### Deliverables
- Failure taxonomy document
- Top 10 failure patterns with examples
- Priority ranking for fixes

---

## Phase 4: Algorithmic Enhancements (2-4 hours)

### Priority 1: Multi-Paragraph Entity Tracking

**Problem:** Entities introduced early in chapter not recognized later

**Solution:**
```typescript
// Entity Introduction Registry
interface EntityIntroduction {
  entityId: string;
  firstMention: number; // character offset
  descriptors: string[]; // "the young wizard", "the boy"
  attributes: Record<string, string>; // age, appearance, etc.
}

// Build introduction registry during first pass
// Use for long-distance coreference resolution
```

**Implementation:**
- Track entity introductions in first N paragraphs
- Build descriptor index for nominal references
- Extend coreference window from 500 → 2000 chars

### Priority 2: Long-Distance Coreference

**Problem:** "the young wizard" 10 paragraphs later not linked to Harry

**Solution:**
```typescript
// Semantic similarity for descriptors
function matchDescriptor(
  descriptor: string,  // "the young wizard"
  entities: EntityIntroduction[]
): Entity | null {
  // Check descriptor index
  // Match attributes (young, wizard)
  // Return most recent compatible entity
}
```

**Implementation:**
- Build TF-IDF index of entity descriptors
- Semantic matching for nominal phrases
- Recency bias with confidence decay

### Priority 3: Event Chain Extraction

**Problem:** Events scattered across paragraphs not linked

**Solution:**
```typescript
interface EventChain {
  events: Event[];
  timeline: Date[];
  participants: Set<string>; // entity IDs
  location: string; // entity ID
}

// Detect event sequences:
// "The battle began" → "Harry fought" → "Voldemort fell"
```

**Implementation:**
- Temporal marker detection ("then", "later", "after")
- Event clustering by participants and location
- Build directed acyclic graph of events

### Priority 4: Context Window Expansion

**Problem:** 200-char window misses long-range dependencies

**Solution:**
- **Sentence-level:** 200 chars (keep for efficiency)
- **Paragraph-level:** 1000 chars for complex patterns
- **Document-level:** Full chapter for entity resolution

**Implementation:**
```typescript
// Three-tier extraction:
// 1. Fast patterns (200 chars)
// 2. Complex patterns (1000 chars - batch N sentences)
// 3. Global patterns (full document - coreference, events)
```

### Priority 5: Implicit Relation Inference

**Problem:** Family relations not stated explicitly

**Solution:**
```typescript
// Inference rules:
// X parent_of Y + Y parent_of Z → X grandparent_of Z
// X married_to Y + Y parent_of Z → X parent_of Z (step-parent)
// X lives_in Y + Y part_of Z → X lives_in Z (transitive)
```

**Implementation:**
- Build transitive closure for relations
- Add confidence decay for inferred relations
- Type-check inferred relations

### Priority 6: Temporal Ordering

**Problem:** Events extracted but not ordered

**Solution:**
```typescript
interface TemporalRelation {
  event1: string; // entity ID of EVENT
  event2: string;
  order: 'before' | 'after' | 'during';
  confidence: number;
}

// Extract from text:
// "After the battle, Harry returned home"
// → Battle BEFORE Harry's return
```

**Implementation:**
- Temporal marker detection
- Event dependency parsing
- Build timeline graph

---

## Phase 5: LLM-Quality Validation (1 hour)

### Objective
Validate that algorithmic extraction rivals LLM quality

### Comparison Metrics

**vs. GPT-3.5/4 prompting:**
- Entity extraction F1
- Relation extraction F1
- Processing speed
- Consistency/reproducibility

**vs. spaCy + custom rules (current):**
- Coverage improvement
- Precision improvement
- Long-form handling

### Test Cases
- Harry Potter Chapter 1 (full extraction)
- Lord of the Rings Chapter 1 (full extraction)
- Compare against human annotations
- Compare against LLM extraction

### Success Criteria
- ≥85% entity F1 (match or exceed LLM)
- ≥80% relation F1
- 10x faster than LLM prompting
- 100% reproducible (deterministic)

---

## Phase 6: Wiki Generation Algorithm (1-2 hours)

### Objective
Design algorithm to generate wiki pages from extracted knowledge

### Wiki Page Structure

```markdown
# [Entity Name]

## Overview
[1-2 sentence summary from most confident facts]

## Biography / Description
[Chronological narrative from event chains]

## Relationships
- **Family:** [parent_of, child_of, married_to]
- **Affiliations:** [member_of, leads, ally_of]
- **Locations:** [lives_in, traveled_to]

## Timeline
- **[DATE]:** [EVENT] [evidence]
- **[DATE]:** [EVENT] [evidence]

## Mentioned In
- [Document 1] (10 references)
- [Document 2] (5 references)

## Related Entities
[Graph of connected entities with relation types]
```

### Algorithm Components

#### 6.1 Summary Generation
```typescript
function generateSummary(entity: Entity, graph: Graph): string {
  // Extract top 3 most confident facts
  const facts = graph.relations
    .filter(r => r.subj === entity.id || r.obj === entity.id)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  // Generate natural language summary
  return templateFill(summaryTemplate, facts);
}
```

#### 6.2 Timeline Construction
```typescript
function buildTimeline(entity: Entity, graph: Graph): Timeline {
  // Find all events involving entity
  const events = graph.relations
    .filter(r => hasTemporalQualifier(r) && involves(r, entity.id));

  // Sort by temporal order
  const ordered = topologicalSort(events);

  return { events: ordered, dates: extractDates(ordered) };
}
```

#### 6.3 Relationship Clustering
```typescript
function clusterRelationships(entity: Entity, graph: Graph) {
  return {
    family: getFamilyRelations(entity, graph),
    social: getSocialRelations(entity, graph),
    professional: getProfessionalRelations(entity, graph),
    locations: getLocationRelations(entity, graph)
  };
}
```

### Deliverables
- Wiki generation algorithm
- Sample wiki pages for Harry, Hermione, Gandalf
- Quality assessment

---

## Phase 7: End-to-End Testing (1 hour)

### Objective
Test complete pipeline: extraction → wiki generation

### Test Workflow
```bash
# Extract full chapter
npx ts-node extract-chapter.ts corpus/hp-chapter-01.txt

# Generate wikis for all entities
npx ts-node generate-wikis.ts output/hp-chapter-01.json

# Review wiki quality
cat output/wikis/Harry_Potter.md
```

### Quality Checks
- Wiki completeness (all major characters covered)
- Fact accuracy (cross-reference with source)
- Readability (natural language, not robotic)
- Citations (every fact has evidence)

---

## Success Criteria Summary

**Extraction Quality:**
- ✅ 90%+ entity F1 on long chapters
- ✅ 85%+ relation F1 on long chapters
- ✅ Event chains correctly ordered
- ✅ Multi-paragraph coreference working

**Performance:**
- ✅ Process 1000 words in <5 seconds
- ✅ Deterministic/reproducible
- ✅ Memory efficient (<500MB for 5000 word chapter)

**Wiki Quality:**
- ✅ Readable, coherent summaries
- ✅ Accurate timelines
- ✅ Properly clustered relationships
- ✅ Evidence citations

**vs. LLM Baseline:**
- ✅ Match or exceed GPT-3.5 F1 scores
- ✅ 10x faster processing
- ✅ 100% reproducible

---

## Timeline Estimate

| Phase | Time | Deliverable |
|-------|------|-------------|
| Phase 1: Corpus Prep | 30 min | Test chapters + annotations |
| Phase 2: Baseline | 1 hr | Metrics + benchmarks |
| Phase 3: Failure Analysis | 1-2 hr | Failure taxonomy |
| Phase 4: Enhancements | 2-4 hr | Algorithmic improvements |
| Phase 5: LLM Validation | 1 hr | Quality comparison |
| Phase 6: Wiki Generation | 1-2 hr | Wiki algorithm |
| Phase 7: End-to-End Test | 1 hr | Complete pipeline |

**Total: 7.5-11.5 hours of autonomous work**

---

## User Can Close Browser

This is a long autonomous session. All work will be:
- Committed regularly
- Documented thoroughly
- Reported in final summary

User can safely close browser and check back later for comprehensive results.
