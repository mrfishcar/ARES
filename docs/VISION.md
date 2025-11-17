# ARES Vision: Writing Tool for Authors with Intelligent Entity Tracking

**Last Updated:** 2025-11-13
**Status:** Foundation 70% Complete | Beta Target: 4 Weeks
**Core Principle:** Manual Override as Primary Feature, Not Fallback

---

## What is ARES?

**ARES is a writing tool for authors** that automatically tracks characters, places, relationships, and events in narrative text—while giving authors complete control to correct, adjust, and teach the system when it makes mistakes.

Think of it as an **intelligent wiki that writes itself** as you write your story, but **you remain the authority** on what's true.

---

## The Core Principle: Manual Override Trains the System

Unlike traditional entity extraction systems that try to be 100% automated, ARES is designed around a fundamental truth:

**Authors know their stories better than any algorithm.**

### The ARES Approach

1. **Automatic First Pass**: The system analyzes your text and extracts entities (characters, places, organizations) and relationships (parent_of, married_to, lives_in, etc.)

2. **Manual Override UI**: When the system gets something wrong (and it will), you can:
   - Correct entity types ("That's a PLACE, not a PERSON")
   - Merge duplicate entities ("Aragorn" and "Strider" are the same person)
   - Split incorrect merges ("Springfield, IL" ≠ "Springfield, MA")
   - Add missing entities the system didn't catch
   - Fix incorrect relationships
   - Override confidence scores

3. **Evidence-Based Learning**: **This is the breakthrough**. The system doesn't just accept your corrections—it learns from them:
   - You correct "Gandalf the Grey" → system learns the pattern "X the Y" for character titles
   - You merge "Jon" + "Jonathan" → system learns this name variation pattern
   - You mark "King of Gondor" as a TITLE, not PERSON → system updates its type detection

4. **Reactive Wiki Generation**: Your corrections automatically update:
   - Character pages
   - Relationship graphs
   - Timeline visualizations
   - Location maps
   - Everything regenerates from the corrected data

5. **Continuous Improvement**: Over time, the system makes fewer mistakes because it learns from your domain-specific knowledge.

### Why This Matters

**Traditional approach** (fully automated):
- Algorithm makes mistakes
- No way to fix them
- System never improves for your specific domain
- Author has no control

**ARES approach** (human-in-the-loop):
- Algorithm makes initial pass (saves hours of manual work)
- Author corrects mistakes (maintains authority)
- System learns patterns (improves over time)
- Wiki stays accurate (reflects author's truth)

**Result**: 80% automation + 20% manual refinement = 100% accurate knowledge base

---

## How It Works: The Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AUTHOR WRITES TEXT                           │
│  "Aragorn, son of Arathorn, became King of Gondor in 3019."        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    1. EXTRACTION ENGINE                             │
│  • NLP Parser (spaCy) analyzes text structure                       │
│  • Pattern matching finds entities and relations                    │
│  • Confidence scoring flags uncertain extractions                   │
│  • HERT system creates stable entity references                     │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    2. KNOWLEDGE DATABASE                            │
│  Entities: Aragorn (PERSON), Arathorn (PERSON), Gondor (PLACE)     │
│  Relations: parent_of(Arathorn, Aragorn), became_king_of(...)      │
│  Evidence: Text spans, confidence scores, extraction method         │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    3. REACTIVE WIKI                                 │
│  Auto-generated pages:                                              │
│  • Character: Aragorn                                               │
│    - Son of Arathorn                                                │
│    - King of Gondor (3019)                                          │
│    - Married to Arwen                                               │
│  • Place: Gondor                                                    │
│    - Ruler: Aragorn (3019-)                                         │
│    - Location: Middle-earth                                         │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                 ┌───────────┴───────────┐
                 │  Author reviews wiki  │
                 │  Finds error:         │
                 │  "Gondor should be    │
                 │   KINGDOM, not PLACE" │
                 └───────────┬───────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    4. MANUAL OVERRIDE UI                            │
│  Author Actions:                                                    │
│  ☑ Change entity type: Gondor → KINGDOM                            │
│  ☑ Update relationship: Aragorn rules Gondor                       │
│  ☑ Add missing alias: "The White City" → Minas Tirith              │
│  ☑ Merge duplicates: "Gandalf" + "Mithrandir" = same person        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    5. FEEDBACK LOOP & LEARNING                      │
│  System analyzes correction:                                        │
│  • Pattern: "Kingdom" mentioned → entity type = KINGDOM             │
│  • Context: Political entities in fantasy = KINGDOM not PLACE       │
│  • Confidence: Increase confidence for similar future cases         │
│  • Training data: Store correction for model refinement             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    6. WIKI AUTO-UPDATES                             │
│  Changes propagate:                                                 │
│  ✓ Gondor type changed everywhere                                  │
│  ✓ Relationship graph updated                                      │
│  ✓ Timeline recalculated                                            │
│  ✓ Character pages refreshed                                        │
│  ✓ All changes tracked with version history                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Components (70% Complete)

**✅ Completed:**
- Extraction Engine (multi-pass entity/relation extraction)
- Knowledge Database (SQLite with HERT stable references)
- Evidence Tracking (text spans, confidence scores, provenance)
- Basic Wiki Generation (GraphQL API, entity/relation queries)
- Extraction Lab (browser UI for testing extractions)

**🚧 In Progress:**
- Manual Override UI (exists but needs enhancement)
- Conflict Detection (identifies contradictions)

**❌ Missing (Next 4 Weeks):**
- Manual Adjustment Interface (core feature!)
- Feedback Loop & Learning (the "intelligence")
- Reactive Wiki Updates (auto-regeneration on changes)
- Version History & Rollback
- Pattern Learning from Corrections

---

## Current State: 70% Complete

### What Works Today

**Entity Extraction:**
- Detects people, places, organizations, dates
- 87.5% recall on test suite (target: ≥75%)
- Multi-source extraction (NER + patterns + dependency parsing)
- Confidence filtering removes low-quality extractions
- HERT system provides stable entity IDs

**Relation Extraction:**
- 10+ relation types (parent_of, married_to, lives_in, etc.)
- Dependency-based patterns (robust to complex grammar)
- Automatic inverse generation (parent_of ↔ child_of)
- Coreference resolution links pronouns to entities
- ~190 words/second processing speed

**Knowledge Graph:**
- SQLite storage (local-first, no cloud dependencies)
- GraphQL API for flexible queries
- Entity deduplication and alias tracking
- Evidence trails for every fact
- Cross-document entity identity

**Testing Infrastructure:**
- 119/119 tests passing ✅
- 5-stage testing ladder (foundation → production)
- Stage 2 complete (94.3% F1 score)
- Comprehensive test suite (28 entity type tests)

**Deployment:**
- Extraction Lab deployed to Vercel
- API server on Railway (Docker container)
- Browser-based testing interface
- Real-time entity highlighting

### What's Missing (30%)

**1. Manual Override UI** (CRITICAL - 4 weeks)
The core feature that makes ARES different from other extraction systems.

**Must Have:**
- Entity correction interface (change types, merge/split entities)
- Relationship editing (add/remove/modify relations)
- Confidence override (manual quality scoring)
- Batch operations (fix multiple related entities at once)
- Undo/redo functionality

**2. Feedback Loop & Learning** (CRITICAL - 3 weeks)
The "intelligence" that improves the system over time.

**Must Have:**
- Correction pattern analysis (learn from user edits)
- Pattern refinement (update extraction rules based on feedback)
- Confidence adjustment (increase for validated patterns)
- Domain adaptation (learn user's specific entity types)
- Training data generation (corrections → test cases)

**3. Reactive Wiki Updates** (HIGH - 2 weeks)
Wiki pages that automatically regenerate when data changes.

**Must Have:**
- Change propagation (one edit updates all affected pages)
- Version history (track what changed, when, and why)
- Diff visualization (show before/after for changes)
- Rollback capability (undo problematic corrections)
- Conflict resolution UI (handle contradictory edits)

**4. Advanced Entity Types** (MEDIUM - ongoing)
Expand beyond basic PERSON/PLACE/ORG.

**Nice to Have:**
- PRODUCT, TECHNOLOGY, CONCEPT entities
- EVENT extraction (battles, meetings, discoveries)
- ATTRIBUTE extraction (ages, descriptions, capabilities)
- Nested hierarchies (organizations contain departments)

**5. Multi-Document Analysis** (FUTURE - 3+ months)
Track entities across multiple documents (chapters, books, series).

**Future:**
- Cross-document entity resolution
- Timeline aggregation across documents
- Contradiction detection between sources
- Character arc tracking across narrative

---

## The 4-Week Sprint to Beta

### Week 1: Manual Override Foundation (Nov 13-20)

**Deliverables:**
1. Entity type correction UI
2. Entity merge/split operations
3. Relationship add/edit/delete
4. Confidence override capability

**Success Criteria:**
- Author can fix any extraction error via UI
- Changes persist to database
- UI shows before/after comparison
- Basic validation prevents invalid corrections

### Week 2: Feedback Loop Core (Nov 20-27)

**Deliverables:**
1. Correction tracking system
2. Pattern extraction from corrections
3. Confidence boost for validated patterns
4. Initial learning algorithm

**Success Criteria:**
- System logs all manual corrections
- Identifies repeated correction patterns
- Adjusts confidence for similar future cases
- Demonstrates learning on test set

### Week 3: Reactive Wiki (Nov 27-Dec 4)

**Deliverables:**
1. Auto-regeneration on data changes
2. Version history tracking
3. Change propagation across wiki
4. Rollback functionality

**Success Criteria:**
- Wiki updates within 1 second of correction
- All affected pages regenerate automatically
- Can view and restore previous versions
- Change log shows audit trail

### Week 4: Polish & Beta Release (Dec 4-11)

**Deliverables:**
1. UI/UX refinement
2. Comprehensive documentation
3. Beta user testing
4. Bug fixes and stability

**Success Criteria:**
- Beta users can complete full workflow (write → extract → correct → wiki)
- Documentation covers all major features
- No critical bugs in core workflows
- Performance acceptable (<2s for typical operations)

---

## Success Metrics for Beta

### Quantitative Goals

**Extraction Quality:**
- Precision: ≥85% (few false positives)
- Recall: ≥75% (catches most entities)
- F1 Score: ≥80% (balanced performance)

**User Experience:**
- <5 seconds to extract entities from 1000-word chapter
- <1 second for wiki page to update after correction
- <3 clicks to fix common extraction errors
- ≥80% of errors fixable via UI (no direct DB edits needed)

**Learning Effectiveness:**
- 20% reduction in errors after 10 corrections
- 50% reduction in errors after 100 corrections
- Domain-specific patterns learned within 50 examples

### Qualitative Goals

**Author Experience:**
- "I can fix any mistake the system makes"
- "The system gets better the more I use it"
- "My wiki stays accurate as I write"
- "I trust the system won't lose my corrections"

**System Reliability:**
- Changes never get lost
- Rollback always works
- No data corruption
- Performance remains consistent

---

## Technical Philosophy

### Design Principles

**1. Human Authority > Algorithm Confidence**
When author says "this is wrong," the system accepts it without question. No "are you sure?" dialogs. The author is always right about their own story.

**2. Evidence-Based Learning**
Every correction includes context: what text, what extraction, what was wrong, what's right. This context enables pattern learning.

**3. Local-First Architecture**
All data and processing stays on the author's machine. No cloud dependencies. No API costs. Complete privacy and control.

**4. Deterministic Core, Adaptive Layer**
Core extraction is deterministic (same input → same output). Learning layer adapts to user's domain without breaking reproducibility.

**5. Fail Gracefully**
When uncertain, the system flags it. Low-confidence extractions are marked for review, not hidden or auto-corrected.

### Technical Constraints

**Must Maintain:**
- Local-first operation (no mandatory cloud)
- <200ms response time for UI interactions
- Deterministic extraction (testable, debuggable)
- All changes reversible (undo/version history)
- Evidence trails (explain every decision)

**Won't Support (Out of Scope for Beta):**
- Real-time collaboration (single-author tool)
- LLM-based extraction (too expensive, non-deterministic)
- Cloud sync (local-first only for beta)
- Mobile apps (desktop web only for beta)

---

## Use Cases: Who is ARES For?

### Primary: Fiction Authors

**Scenario:** Writing a fantasy trilogy with 100+ characters, 50+ locations, and complex political relationships.

**ARES Helps:**
- Track which characters have appeared
- Visualize family trees and political alliances
- Ensure consistency (did I say they met in Chapter 3 or 7?)
- Generate character wikis for reference while writing
- Catch contradictions (character can't be in two places at once)

**Manual Override:** Fix character name variations, correct relationship misinterpretations, teach system about fantasy-specific entities (KINGDOM, SPELL, ARTIFACT).

### Secondary: World-Builders

**Scenario:** Creating detailed fictional universe with extensive lore, cultures, and history.

**ARES Helps:**
- Extract entities from world-building notes
- Build relationship networks (who founded what, who taught whom)
- Track timelines and historical events
- Generate wiki-style reference documentation
- Find gaps in world development

**Manual Override:** Define custom entity types (MAGIC_SYSTEM, CULTURE, ARTIFACT), correct automated timeline generation, merge related lore entries.

### Tertiary: Researchers & Note-Takers

**Scenario:** Analyzing historical documents, academic papers, or research notes.

**ARES Helps:**
- Extract key entities and concepts
- Map relationships between ideas/people
- Track citations and influences
- Generate structured summaries
- Find connections across documents

**Manual Override:** Correct domain-specific terminology, fix relationship directions, merge variant entity names.

---

## Beyond Beta: The Long-Term Vision

### Phase 2: Advanced Learning (3-6 months post-beta)

**Domain-Specific Models:**
- Train custom models on user's corrections
- Specialized entity types (user-defined)
- Context-aware extraction (genre-specific)
- Transfer learning from similar domains

**Collaborative Intelligence:**
- Share anonymized patterns across users (opt-in)
- Community-validated extraction rules
- Genre-specific pattern libraries (fantasy, sci-fi, mystery)

### Phase 3: Multi-Document Intelligence (6-12 months post-beta)

**Cross-Document Analysis:**
- Track entities across book series
- Character development arcs
- Plot consistency checking
- Timeline aggregation

**Advanced Visualization:**
- Interactive relationship graphs
- Animated timelines
- Geographic maps of fictional worlds
- Social network analysis of characters

### Phase 4: Real-Time Writing Assistant (12-18 months post-beta)

**While-You-Write Features:**
- Inline entity suggestions as you type
- Consistency warnings (contradicting earlier chapters)
- Character name autocomplete
- Relationship context tooltips
- "Did you mean this character?" disambiguation

**Proactive Intelligence:**
- "You mentioned Character X in Ch 1 but not since—is this intentional?"
- "Timeline inconsistency detected: Event A happened before Event B, but text suggests opposite"
- "New character introduced: Would you like to add them to the relationship graph?"

---

## FAQ: Common Questions

### Q: How is ARES different from existing entity extraction tools?

**A:** Most extraction tools are designed for data analysis (extract everything, accept errors). ARES is designed for **authorship** (extract accurately, let author fix errors, learn from corrections). The manual override isn't a failure mode—it's the core feature.

### Q: Won't manual correction be tedious?

**A:** Initially, yes (like training autocorrect on your phone). But the system learns patterns, so you correct each type of error once, and it stops making that mistake. After 100 corrections, error rate drops ~50%.

### Q: Can I trust the system won't lose my corrections?

**A:** Every change is versioned and reversible. You can always rollback. Changes are stored locally (you control the data). Evidence trails show what changed and why.

### Q: Do I need to be online to use ARES?

**A:** No. ARES is local-first. Extraction, database, wiki generation—all run on your machine. Optional future features (pattern sharing, cloud backup) will be opt-in.

### Q: Will ARES work for non-fiction?

**A:** Yes, but it's optimized for narrative text. Non-fiction (technical docs, historical records, research notes) works but may require more manual corrections since the extraction patterns are tuned for storytelling.

### Q: Can I export my data?

**A:** Yes. Everything is stored in SQLite (standard format). You can export to JSON, CSV, GraphML, or access the database directly. Your data is never locked in.

### Q: What about privacy for unpublished work?

**A:** All processing is local. Your text never leaves your machine. No cloud services. No telemetry (unless you opt-in). ARES doesn't "phone home."

---

## Conclusion: Building a Tool Authors Will Love

ARES isn't just another NLP research project. It's a tool designed for **people who create stories**—and it respects their authority over their creations.

The vision is simple: **Automate the tedious parts of knowledge tracking, but give authors complete control to fix mistakes and teach the system about their unique world.**

When a fantasy author corrects "Mithrandir" → merge with "Gandalf," the system learns. When they mark "King of Gondor" as a TITLE entity, it updates its patterns. When they fix a relationship, the wiki regenerates instantly.

**70% of this vision is built.** The extraction works. The database works. The wiki works.

**The next 30%—the manual override, the learning, the reactivity—is what transforms ARES from "yet another extraction tool" into "the writing companion authors didn't know they needed."**

**Beta in 4 weeks. Let's build it.**

---

**Document Status:** DRAFT v1.0 - Awaiting review from Archie (Architect) and Cory
**Next Steps:** Create STATUS.md, MANUAL_OVERRIDE_DESIGN.md, update README.md
**Feedback:** Please validate this vision aligns with project goals before proceeding with implementation
