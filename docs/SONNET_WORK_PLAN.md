# ARES Development Work Plan for Claude Sonnet

**Version:** 1.0
**Created:** 2025-12-30
**Duration:** 12 months (52 weeks)
**Owner:** Claude Opus (architectural oversight)

---

## CRITICAL INSTRUCTIONS FOR SONNET

### You MUST Follow These Rules

1. **SEQUENTIAL EXECUTION**: Complete tasks in exact order. Do NOT skip ahead.
2. **ONE TASK AT A TIME**: Finish current task fully before starting next.
3. **UPDATE TODOS**: Use TodoWrite after each task completion.
4. **ZERO REGRESSIONS**: All existing tests must pass before and after your changes.
5. **COMMIT OFTEN**: Commit after each completed task with descriptive message.
6. **ASK FOR HELP**: If stuck >30 minutes, ask the user (linguistic expert).
7. **REPORT PROGRESS**: End each session with a summary of completed/remaining tasks.

### Before Starting ANY Task

```bash
# 1. Check tests pass
npm test tests/ir/ 2>&1 | tail -5  # Expect: 507 passed

# 2. Read relevant source files
# 3. Update todo list with current task as "in_progress"
# 4. Complete task
# 5. Run tests again
# 6. Commit with descriptive message
# 7. Update todo list with task as "completed"
```

### Prohibited Actions

- ❌ DO NOT create new systems without explicit approval
- ❌ DO NOT modify extraction engine core without approval
- ❌ DO NOT skip tasks or work out of order
- ❌ DO NOT batch multiple tasks into one commit
- ❌ DO NOT add dependencies without user approval
- ❌ DO NOT remove existing tests

---

## PHASE 1: UI INTEGRATION (Weeks 1-4)

### Sprint 1.1: Lab Entity Wiki Integration (Week 1-2)

**Goal:** Update Extraction Lab to display wiki pages for extracted entities

#### Task 1.1.1: Create IR Adapter Hook
- **File:** `app/ui/console/src/hooks/useIRAdapter.ts`
- **Action:** Create React hook that converts extraction results to IR
- **Input:** Extraction result (entities, relations, spans)
- **Output:** ProjectIR object
- **Tests:** Add unit test for adapter hook
- **Commit:** `feat(ui): Add useIRAdapter hook for extraction-to-IR conversion`

```typescript
// Expected signature
export function useIRAdapter(
  extraction: ExtractionResult | null
): ProjectIR | null;
```

#### Task 1.1.2: Create Wiki Panel Component
- **File:** `app/ui/console/src/components/WikiPanel.tsx`
- **Action:** Create panel that renders entity wiki pages
- **Features:**
  - Entity selector dropdown
  - Markdown renderer for wiki content
  - Type badge display
  - Cross-link navigation
- **Commit:** `feat(ui): Add WikiPanel component for entity wiki display`

#### Task 1.1.3: Integrate Wiki Panel into ExtractionLab
- **File:** `app/ui/console/src/pages/ExtractionLab.tsx`
- **Action:** Add WikiPanel as collapsible sidebar
- **Trigger:** Click on entity in extraction results
- **Commit:** `feat(ui): Integrate WikiPanel into ExtractionLab`

#### Task 1.1.4: Add Entity Type Filter
- **File:** `app/ui/console/src/components/WikiPanel.tsx`
- **Action:** Filter entities by type (PERSON, PLACE, ITEM, etc.)
- **Commit:** `feat(ui): Add entity type filter to WikiPanel`

#### Task 1.1.5: Add Timeline View Tab
- **File:** `app/ui/console/src/components/WikiPanel.tsx`
- **Action:** Add tab to switch between wiki and timeline view
- **Uses:** `renderTimeline()` from IR
- **Commit:** `feat(ui): Add timeline view tab to WikiPanel`

### Sprint 1.2: Summarization Testing Feature (Week 3-4)

**Goal:** Create UI for testing ARES summarization capability

#### Task 1.2.1: Create SummarizationPage
- **File:** `app/ui/console/src/pages/SummarizationPage.tsx`
- **Action:** Create new page with text input area
- **Layout:**
  - Left: Input textarea
  - Right: Summary output
  - Bottom: Control panel
- **Commit:** `feat(ui): Add SummarizationPage skeleton`

#### Task 1.2.2: Integrate Existing Summarizer
- **File:** `app/ui/console/src/pages/SummarizationPage.tsx`
- **Action:** Wire existing summarization code to UI
- **Find:** Locate existing summarization in `app/engine/`
- **Commit:** `feat(ui): Wire summarizer to SummarizationPage`

#### Task 1.2.3: Add Summary Metrics Display
- **File:** `app/ui/console/src/pages/SummarizationPage.tsx`
- **Action:** Show word count, compression ratio, key entities
- **Commit:** `feat(ui): Add summary metrics display`

#### Task 1.2.4: Add Summary Comparison Mode
- **File:** `app/ui/console/src/pages/SummarizationPage.tsx`
- **Action:** Side-by-side comparison of different summary lengths
- **Commit:** `feat(ui): Add summary comparison mode`

#### Task 1.2.5: Add Route and Navigation
- **File:** `app/ui/console/src/App.tsx`
- **Action:** Add route `/summarize` and nav link
- **Commit:** `feat(ui): Add summarization route and navigation`

---

## PHASE 2: IR ENHANCEMENT (Weeks 5-12)

### Sprint 2.1: Event Coverage (Week 5-6)

#### Task 2.1.1: Add MEET Event Builder
- **File:** `app/engine/ir/event-builder.ts`
- **Action:** Derive MEET events from proximity assertions
- **Pattern:** Two entities mentioned in same sentence → potential MEET
- **Tests:** Add 10+ tests for MEET derivation
- **Commit:** `feat(ir): Add MEET event derivation`

#### Task 2.1.2: Add ATTACK Event Builder
- **File:** `app/engine/ir/event-builder.ts`
- **Action:** Derive ATTACK from conflict predicates
- **Predicates:** `attacked`, `fought`, `killed`, `wounded`
- **Tests:** Add 10+ tests
- **Commit:** `feat(ir): Add ATTACK event derivation`

#### Task 2.1.3: Add CREATE Event Builder
- **File:** `app/engine/ir/event-builder.ts`
- **Action:** Derive CREATE from creation predicates
- **Predicates:** `created`, `made`, `built`, `forged`, `wrote`
- **Tests:** Add 10+ tests
- **Commit:** `feat(ir): Add CREATE event derivation`

#### Task 2.1.4: Add GROUP Event Builder
- **File:** `app/engine/ir/event-builder.ts`
- **Action:** Derive events for group formations
- **Pattern:** `joined`, `formed`, `led`
- **Commit:** `feat(ir): Add GROUP event derivation`

### Sprint 2.2: Relation Coverage (Week 7-8)

#### Task 2.2.1: Add Occupation Relations
- **File:** `app/engine/ir/fact-builder.ts`
- **Action:** Add occupation predicates to relation facts
- **Predicates:** `occupation`, `profession`, `role`, `title`
- **Commit:** `feat(ir): Add occupation relation facts`

#### Task 2.2.2: Add Affiliation Relations
- **File:** `app/engine/ir/fact-builder.ts`
- **Action:** Add affiliation predicates
- **Predicates:** `member_of`, `belongs_to`, `affiliated_with`
- **Commit:** `feat(ir): Add affiliation relation facts`

#### Task 2.2.3: Add Temporal Relations
- **File:** `app/engine/ir/fact-builder.ts`
- **Action:** Add birth/death temporal facts
- **Predicates:** `born_in_year`, `died_in_year`, `age_at`
- **Commit:** `feat(ir): Add temporal relation facts`

#### Task 2.2.4: Improve Inverse Relations
- **File:** `app/engine/ir/fact-builder.ts`
- **Action:** Complete inverse mapping table
- **Ensure:** All directional relations have inverses
- **Commit:** `feat(ir): Complete inverse relation mapping`

### Sprint 2.3: Renderer Enhancement (Week 9-10)

#### Task 2.3.1: Add Organization Page Renderer
- **File:** `app/engine/ir/entity-renderer.ts`
- **Action:** Add `renderOrgPage()` function
- **Sections:** Leadership, Members, History, Location
- **Tests:** Add 15+ tests
- **Commit:** `feat(ir): Add organization page renderer`

#### Task 2.3.2: Add Event Page Renderer
- **File:** `app/engine/ir/entity-renderer.ts`
- **Action:** Add `renderEventPage()` function
- **Sections:** Participants, Location, Time, Consequences
- **Tests:** Add 15+ tests
- **Commit:** `feat(ir): Add event page renderer`

#### Task 2.3.3: Add Work Page Renderer
- **File:** `app/engine/ir/entity-renderer.ts`
- **Action:** Add `renderWorkPage()` for books/documents
- **Sections:** Author, Characters, Summary
- **Tests:** Add 10+ tests
- **Commit:** `feat(ir): Add work page renderer`

#### Task 2.3.4: Add Comparison View
- **File:** `app/engine/ir/entity-renderer.ts`
- **Action:** Add `renderEntityComparison()` for side-by-side
- **Tests:** Add 5+ tests
- **Commit:** `feat(ir): Add entity comparison renderer`

### Sprint 2.4: Timeline Enhancement (Week 11-12)

#### Task 2.4.1: Add Causal Links
- **File:** `app/engine/ir/timeline-builder.ts`
- **Action:** Derive CAUSES/ENABLES/PREVENTS links
- **Pattern:** Detect causal language in evidence
- **Tests:** Add 10+ tests
- **Commit:** `feat(ir): Add causal link derivation`

#### Task 2.4.2: Add Timeline Visualization Data
- **File:** `app/engine/ir/timeline-builder.ts`
- **Action:** Add function to export timeline as JSON for D3/SVG
- **Format:** Nodes (events) + edges (links) + swimlanes (entities)
- **Commit:** `feat(ir): Add timeline visualization export`

#### Task 2.4.3: Add Period Detection
- **File:** `app/engine/ir/timeline-builder.ts`
- **Action:** Detect narrative periods (childhood, war, etc.)
- **Pattern:** Cluster events by time and theme
- **Commit:** `feat(ir): Add period detection`

#### Task 2.4.4: Add Story Arc Detection
- **File:** `app/engine/ir/timeline-builder.ts`
- **Action:** Detect rising action, climax, resolution
- **Uses:** Event density + sentiment (if available)
- **Commit:** `feat(ir): Add story arc detection`

---

## PHASE 3: EXTRACTION QUALITY (Weeks 13-24)

### Sprint 3.1: Confidence Calibration (Week 13-14)

#### Task 3.1.1: Add Evidence-Based Confidence
- **File:** `app/engine/ir/extraction-diagnostics.ts`
- **Action:** Enhance calibrateConfidence with more signals
- **Signals:** Evidence length, entity frequency, pattern reliability
- **Commit:** `feat(ir): Enhance evidence-based confidence`

#### Task 3.1.2: Add Cross-Validation Scoring
- **File:** `app/engine/ir/extraction-diagnostics.ts`
- **Action:** Score based on corroborating evidence
- **Pattern:** Same fact from multiple sources → higher confidence
- **Commit:** `feat(ir): Add cross-validation confidence scoring`

#### Task 3.1.3: Add Confidence Decay
- **File:** `app/engine/ir/extraction-diagnostics.ts`
- **Action:** Reduce confidence for facts without recent evidence
- **Pattern:** Old facts with no new mentions → lower confidence
- **Commit:** `feat(ir): Add confidence decay model`

### Sprint 3.2: Validation Enhancement (Week 15-16)

#### Task 3.2.1: Add Contradiction Detection
- **File:** `app/engine/ir/extraction-diagnostics.ts`
- **Action:** Detect contradictory facts
- **Pattern:** A married_to B AND A married_to C at same time
- **Commit:** `feat(ir): Add contradiction detection`

#### Task 3.2.2: Add Type Consistency Checks
- **File:** `app/engine/ir/extraction-diagnostics.ts`
- **Action:** Validate entity types are consistent with predicates
- **Pattern:** PERSON cannot be located_in PERSON
- **Commit:** `feat(ir): Add type consistency validation`

#### Task 3.2.3: Add Temporal Consistency Checks
- **File:** `app/engine/ir/extraction-diagnostics.ts`
- **Action:** Validate temporal ordering
- **Pattern:** Birth before death, child after parent birth
- **Commit:** `feat(ir): Add temporal consistency validation`

#### Task 3.2.4: Add Evidence Quality Scoring
- **File:** `app/engine/ir/extraction-diagnostics.ts`
- **Action:** Score evidence spans for quality
- **Factors:** Length, specificity, narrator reliability
- **Commit:** `feat(ir): Add evidence quality scoring`

### Sprint 3.3: Metrics Dashboard (Week 17-18)

#### Task 3.3.1: Create Metrics Dashboard Page
- **File:** `app/ui/console/src/pages/MetricsDashboard.tsx`
- **Action:** Create dashboard for extraction metrics
- **Charts:** Entity types, confidence distribution, coverage
- **Commit:** `feat(ui): Add extraction metrics dashboard`

#### Task 3.3.2: Add Trend Tracking
- **File:** `app/ui/console/src/pages/MetricsDashboard.tsx`
- **Action:** Track metrics over time/documents
- **Storage:** Local storage for historical metrics
- **Commit:** `feat(ui): Add metrics trend tracking`

#### Task 3.3.3: Add Quality Alerts
- **File:** `app/ui/console/src/pages/MetricsDashboard.tsx`
- **Action:** Show alerts for quality issues
- **Triggers:** Low confidence, contradictions, orphans
- **Commit:** `feat(ui): Add quality alerts to dashboard`

### Sprint 3.4: Pattern Expansion (Week 19-24)

#### Task 3.4.1: Add Family Pattern Detection
- **File:** `app/engine/narrative-relations.ts`
- **Action:** Detect family relationships from context
- **Patterns:** "X's mother Y", "siblings X and Y"
- **Commit:** `feat(extract): Add family pattern detection`

#### Task 3.4.2: Add Dialog Attribution
- **File:** `app/engine/narrative-relations.ts`
- **Action:** Improve speaker attribution in dialogue
- **Pattern:** Said-verbs, quotation context
- **Commit:** `feat(extract): Improve dialog attribution`

#### Task 3.4.3: Add Event Sequence Detection
- **File:** `app/engine/narrative-relations.ts`
- **Action:** Detect event sequences from temporal markers
- **Patterns:** "then", "after", "before", "while"
- **Commit:** `feat(extract): Add event sequence detection`

#### Task 3.4.4-3.4.12: Pattern Iteration
- **Action:** Add 2 patterns per week for 6 weeks
- **Focus:** Most common extraction misses
- **Method:** Analyze test failures, add patterns, verify

---

## PHASE 4: PERFORMANCE (Weeks 25-32)

### Sprint 4.1: Caching (Week 25-26)

#### Task 4.1.1: Add IR Cache Layer
- **File:** `app/engine/ir/cache.ts`
- **Action:** Cache computed IR results
- **Key:** Document hash + extraction config
- **Commit:** `feat(ir): Add IR result caching`

#### Task 4.1.2: Add Incremental IR Update
- **File:** `app/engine/ir/cache.ts`
- **Action:** Update IR incrementally for text changes
- **Pattern:** Only recompute affected sections
- **Commit:** `feat(ir): Add incremental IR updates`

### Sprint 4.2: Parallel Processing (Week 27-28)

#### Task 4.2.1: Parallelize Event Building
- **File:** `app/engine/ir/event-builder.ts`
- **Action:** Process events in parallel batches
- **Constraint:** Maintain deterministic output order
- **Commit:** `feat(ir): Parallelize event building`

#### Task 4.2.2: Parallelize Fact Building
- **File:** `app/engine/ir/fact-builder.ts`
- **Action:** Process facts in parallel
- **Commit:** `feat(ir): Parallelize fact building`

### Sprint 4.3: Lazy Loading (Week 29-30)

#### Task 4.3.1: Add Lazy Entity Page Loading
- **File:** `app/engine/ir/entity-renderer.ts`
- **Action:** Compute page sections on-demand
- **Pattern:** Return iterator/generator for sections
- **Commit:** `feat(ir): Add lazy entity page loading`

#### Task 4.3.2: Add Pagination for Large IRs
- **File:** `app/engine/ir/timeline-builder.ts`
- **Action:** Add cursor-based pagination
- **Commit:** `feat(ir): Add timeline pagination`

### Sprint 4.4: Benchmarking (Week 31-32)

#### Task 4.4.1: Create Performance Benchmark Suite
- **File:** `tests/performance/ir-benchmark.spec.ts`
- **Action:** Benchmark all IR operations
- **Metrics:** Time, memory, throughput
- **Commit:** `test(perf): Add IR benchmark suite`

#### Task 4.4.2: Add Performance Regression Tests
- **File:** `tests/performance/ir-regression.spec.ts`
- **Action:** Fail tests if performance degrades
- **Threshold:** <10% regression allowed
- **Commit:** `test(perf): Add performance regression tests`

---

## PHASE 5: ADVANCED FEATURES (Weeks 33-44)

### Sprint 5.1: Character Arcs (Week 33-36)

#### Task 5.1.1: Add Character State Tracking
- **File:** `app/engine/ir/character-arc.ts`
- **Action:** Track character state over timeline
- **States:** Alive/dead, location, possessions, relationships
- **Commit:** `feat(ir): Add character state tracking`

#### Task 5.1.2: Add Character Arc Visualization
- **File:** `app/ui/console/src/components/CharacterArc.tsx`
- **Action:** Visualize character journey over time
- **Commit:** `feat(ui): Add character arc visualization`

### Sprint 5.2: Knowledge Graph Export (Week 37-40)

#### Task 5.2.1: Add Neo4j Export
- **File:** `app/engine/ir/export/neo4j.ts`
- **Action:** Export IR as Cypher statements
- **Commit:** `feat(ir): Add Neo4j Cypher export`

#### Task 5.2.2: Add RDF Export
- **File:** `app/engine/ir/export/rdf.ts`
- **Action:** Export IR as RDF/Turtle
- **Commit:** `feat(ir): Add RDF/Turtle export`

#### Task 5.2.3: Add JSON-LD Export
- **File:** `app/engine/ir/export/jsonld.ts`
- **Action:** Export IR as JSON-LD
- **Commit:** `feat(ir): Add JSON-LD export`

### Sprint 5.3: Search & Query (Week 41-44)

#### Task 5.3.1: Add Full-Text Search
- **File:** `app/engine/ir/search.ts`
- **Action:** Search across entities, events, evidence
- **Commit:** `feat(ir): Add full-text search`

#### Task 5.3.2: Add Query Language
- **File:** `app/engine/ir/query.ts`
- **Action:** Simple query language for IR
- **Syntax:** `FIND entities WHERE type = 'PERSON' AND alive = true`
- **Commit:** `feat(ir): Add IR query language`

---

## PHASE 6: TESTING & DOCS (Weeks 45-52)

### Sprint 6.1: Test Coverage (Week 45-48)

#### Task 6.1.1: Achieve 90% IR Test Coverage
- **Action:** Add tests for all uncovered branches
- **Tool:** Use coverage report to find gaps
- **Commit:** Multiple commits for coverage

#### Task 6.1.2: Add Integration Tests
- **File:** `tests/integration/ir-pipeline.spec.ts`
- **Action:** End-to-end IR pipeline tests
- **Commit:** `test: Add IR pipeline integration tests`

#### Task 6.1.3: Add Golden Tests
- **File:** `tests/golden/ir-golden.spec.ts`
- **Action:** Snapshot tests for IR output stability
- **Commit:** `test: Add IR golden snapshot tests`

### Sprint 6.2: Documentation (Week 49-52)

#### Task 6.2.1: Complete API Documentation
- **File:** `docs/API_REFERENCE.md`
- **Action:** Document all public IR functions
- **Commit:** `docs: Add IR API reference`

#### Task 6.2.2: Create Tutorial Series
- **File:** `docs/tutorials/`
- **Action:** Step-by-step tutorials for common tasks
- **Commit:** `docs: Add IR tutorials`

#### Task 6.2.3: Update CLAUDE.md
- **File:** `CLAUDE.md`
- **Action:** Update with all new IR capabilities
- **Commit:** `docs: Update CLAUDE.md with IR system`

---

## Weekly Reporting Template

After each work session, create a brief status update:

```markdown
## Session Report - [Date]

### Completed Tasks
- [ ] Task X.Y.Z: Description (commit: abc123)

### In Progress
- Task X.Y.Z: Description - Status

### Blockers
- Description of any blockers

### Tests
- IR Tests: X/507 passing
- New tests added: Y

### Next Session
- Task X.Y.Z: Description
```

---

## Success Criteria

### Per Phase
- Phase 1: Wiki panel + Summarization page working in UI
- Phase 2: 8 new event types, 600+ IR tests
- Phase 3: <5% false positive rate, confidence calibrated
- Phase 4: <100ms IR build for 10K entities
- Phase 5: Full knowledge graph export working
- Phase 6: 90% test coverage, complete docs

### Overall
- Zero regressions in existing tests
- All commits follow conventional format
- All code has tests
- Documentation kept up to date

---

**END OF WORK PLAN**
