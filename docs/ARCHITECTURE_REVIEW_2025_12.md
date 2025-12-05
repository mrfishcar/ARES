# ARES Architecture Review & Strategic Roadmap
**Date:** 2025-12-05
**Reviewer:** Claude (Opus 4)
**Status:** COMPREHENSIVE REVIEW

---

## Executive Summary

After thorough review of ARES documentation, research materials, architecture designs, and the entity-extraction-sota.pdf research paper, I can confirm that **ARES is on the correct path** with a critical integration priority identified. The core philosophy of local-first, deterministic extraction with human-in-the-loop correction is validated by cutting-edge NER research as the optimal approach for high-quality entity extraction.

**Key Finding #1:** ARES's manual override approach aligns perfectly with the research paper's recommendation of "Active Learning for NER" - the human-in-the-loop paradigm that "could supercharge development" by having users verify/correct entities that then "feed back into training."

**Key Finding #2 (CRITICAL):** The backend infrastructure for document persistence, knowledge graphs, and wiki generation **already exists** but is **not exposed in the Lab UI**. The Lab UI currently operates in ephemeral mode - extractions are lost on refresh. Connecting existing backend to Lab UI is the highest priority.

---

## Part 1: Architecture Assessment

### 1.1 Current State (Verified)

| Component | Status | Quality |
|-----------|--------|---------|
| **Stage 1-3** | ✅ PASSED | Entity: 90.2% P, 91.3% R |
| **Level 5** | ✅ 96.3% | 52/54 tests passing |
| **Performance** | ✅ ~190 w/s | Exceeds 100 w/s target |
| **HERT System** | ✅ Implemented | Stable entity IDs |
| **Chunked Extraction** | ✅ Implemented | 55k+ word documents |
| **Manual Override UI** | ⚠️ Partial | Core missing component |

### 1.2 Architecture Alignment with Research SOTA

**CONFIRMED CORRECT:**

1. **Local-First Design** ✅
   - Research validates: "No cloud dependencies for core paths"
   - ARES: SQLite + spaCy = fully offline capability

2. **Multi-Pass Extraction** ✅
   - Research: "Multi-modal extraction... combining approaches yields stronger system"
   - ARES: NER + Dependency + Patterns + Coreference (exactly right)

3. **Transformer + Rules Hybrid** ✅
   - Research: "Modern NER systems often blend ideas from multiple eras"
   - ARES: spaCy (transformer-based) + rule patterns + gazetteers

4. **Human-in-the-Loop** ✅
   - Research: "Active Learning... users verify or correct entities... feed back into training"
   - ARES Vision: Manual override as PRIMARY feature, not fallback

5. **Evidence Provenance** ✅
   - Research: "Post-processing and validation... consistency checks"
   - ARES: Every fact includes source text + location (doc, paragraph, token range)

### 1.3 Gaps Identified

| Gap | Priority | Research Basis |
|-----|----------|----------------|
| Manual Override UI | CRITICAL | "Human-in-the-loop approach could quickly adapt the model" |
| Feedback Loop | CRITICAL | "Corrections then feed back into training" |
| Zero-Shot Entity Types | HIGH | GLiNER: "extract entities of those types in zero-shot fashion" |
| Weak Supervision | MEDIUM | "Programmatically labeling data... can be as effective as hand-labeling" |
| Graph-Based Context | LOW | "GCNs for capturing long-distance context" |

---

## Part 1B: Lab UI vs. Backend - Critical Gap Analysis

### ⚠️ KEY FINDING: Infrastructure Exists, UI Doesn't Expose It

The following capabilities **exist in the backend** but are **NOT accessible from the Extraction Lab UI**:

| Capability | Backend | Lab UI | Gap |
|------------|---------|--------|-----|
| **Document Memory** | ✅ `storage.ts`: JSON persistence, `appendDoc()` | ❌ sessionStorage only | CRITICAL |
| **Knowledge Graph** | ✅ `global-graph.ts`: GlobalKnowledgeGraph class | ❌ Ephemeral per-extraction | CRITICAL |
| **Wiki Generation** | ✅ `wiki-generator.ts`: Type-specific templates | ⚠️ WikiModal exists (on-the-fly) | HIGH |
| **Cross-Doc Resolution** | ✅ Entity merging in `mergeEntitiesAcrossDocs()` | ❌ Single-doc only | HIGH |
| **Provenance Tracking** | ✅ `ProvenanceEntry` with doc/paragraph/token | ⚠️ Partial (spans only) | MEDIUM |

### 1B.1 What Exists in Backend

**Storage System (`app/storage/storage.ts`):**
```typescript
// KnowledgeGraph interface - fully implemented
interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
  conflicts: Conflict[];
  provenance: Map<string, ProvenanceEntry>;
  profiles: Map<string, EntityProfile>;  // Adaptive learning
  metadata: { created_at, updated_at, doc_count, doc_ids };
}

// Functions available:
saveGraph(graph, filePath)     // Persist to ares_graph.json
loadGraph(filePath)            // Load from disk
appendDoc(docId, text, path)   // Add document, merge entities
clearStorage()                 // Reset for testing
```

**Global Knowledge Graph (`app/engine/global-graph.ts`):**
```typescript
class GlobalKnowledgeGraph {
  addDocument(docId, text, entities, relations)  // Add + merge
  findEntitiesByName(name, type?)                // Query entities
  getEntitiesByType(type)                        // Filter by type
  getRelations(entityId, direction?)             // Get relations
  export({ entityTypes?, documentIds? })         // Export filtered
}
```

**Wiki Generator (`app/generate/wiki-generator.ts`):**
```typescript
class WikiGenerator {
  generatePage(eid, options)           // Generate full wiki page
  generatePersonPage(entity, opts)     // Person-specific template
  generatePlacePage(entity, opts)      // Place-specific template
  generateOrgPage(entity, opts)        // Org-specific template
  // ... 5 more type-specific generators
}

renderWikiPageToMarkdown(page)         // Export to markdown
```

### 1B.2 What Lab UI Currently Does

The Extraction Lab (`app/ui/console/src/pages/ExtractionLab.tsx`):

1. **Sends text** → `/extract-entities` API → Gets entities + relations
2. **Displays results** → EntityModal, WikiModal (on-the-fly)
3. **Manual tagging** → `#Entity:TYPE` syntax in editor
4. **Session storage only** → `sessionStorage` (lost on refresh)

**What's Missing in Lab UI:**
- No "Save Document" button → `appendDoc()` never called
- No "Load Project" → `loadGraph()` never called
- No persistent graph → `GlobalKnowledgeGraph` not used
- No cross-document wiki → Each extraction is isolated
- No document list → No way to see/manage saved docs

### 1B.3 Required Lab UI Integrations

To fulfill the vision, the Lab UI needs:

```
┌─────────────────────────────────────────────────────────────────┐
│              LAB UI INTEGRATION REQUIREMENTS                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. DOCUMENT MANAGEMENT                                          │
│  ├── "Save to Project" button → calls appendDoc()               │
│  ├── Document list sidebar → shows saved docs                   │
│  ├── "Load Document" → retrieves from storage                   │
│  └── "New Document" → creates fresh extraction                  │
│                                                                  │
│  2. PERSISTENT KNOWLEDGE GRAPH                                   │
│  ├── Display cumulative entities (not just current doc)         │
│  ├── Show cross-document relations                              │
│  ├── Entity merge suggestions from global graph                 │
│  └── "View Full Graph" → visualization of all docs              │
│                                                                  │
│  3. INTEGRATED WIKI                                              │
│  ├── Wiki pages from persistent graph (not current extraction)  │
│  ├── "Generate Wiki" button → calls WikiGenerator               │
│  ├── Wiki page list for all entities                           │
│  └── Export wiki as markdown/HTML                               │
│                                                                  │
│  4. CORRECTION TRACKING                                          │
│  ├── Log manual type changes to correction store                │
│  ├── Track entity merges/splits                                 │
│  └── Feed corrections into pattern learning                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 2: Path Confirmation & Course Corrections

### 2.1 CONFIRMED: Core Path is Correct

The ARES development path is **validated by research**:

```
Current Path (CORRECT):
┌─────────────────────────────────────────────────┐
│  spaCy Parser → Entity Extraction → Relations   │
│  → Coreference → Knowledge Graph → Manual UI    │
└─────────────────────────────────────────────────┘

Research Recommendation (matches ARES):
┌─────────────────────────────────────────────────┐
│  "Transformer + CRF is go-to recipe for NER"    │
│  "Ensemble/hybrid systems yield stronger system"│
│  "Human-in-loop could supercharge development"  │
└─────────────────────────────────────────────────┘
```

### 2.2 Course Corrections (Minor)

**Correction 1: Prioritize Manual Override UI**
- Current: 70% complete, UI partially built
- Issue: This is the DIFFERENTIATOR that makes ARES unique
- Action: Move to top priority over new extraction features

**Correction 2: Add Zero-Shot Entity Type Support**
- Research: GLiNER "takes entity type prompts and can extract in zero-shot fashion"
- Application: Authors should be able to define custom entity types (ARTIFACT, SPELL, KINGDOM) without retraining
- Implementation: Add entity type prompts to extraction config

**Correction 3: Implement Pattern Learning from Corrections**
- Research: "Corrections then feed back into training"
- Current Gap: Manual corrections don't update extraction patterns
- Action: Build correction → pattern refinement pipeline

---

## Part 3: AI Model Utilization Strategy

### 3.1 Model Tier System

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARES AI MODEL HIERARCHY                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TIER 1: OPUS (Claude Opus / GPT-4)                             │
│  ├── Architecture decisions                                      │
│  ├── Algorithm design                                            │
│  ├── Complex debugging (>30 min stuck)                          │
│  ├── Documentation strategy                                      │
│  ├── Multi-file refactoring                                      │
│  └── Research interpretation                                     │
│                                                                  │
│  TIER 2: SONNET (Claude Sonnet / GPT-4-turbo)                   │
│  ├── Feature implementation                                      │
│  ├── Test writing                                                │
│  ├── Bug fixes (straightforward)                                │
│  ├── Pattern expansion                                           │
│  ├── Code review                                                 │
│  └── Documentation updates                                       │
│                                                                  │
│  TIER 3: HAIKU (Claude Haiku / GPT-3.5)                         │
│  ├── Simple file edits                                           │
│  ├── Code formatting                                             │
│  ├── Boilerplate generation                                      │
│  ├── Test case expansion                                         │
│  ├── Comment updates                                             │
│  └── Grep/search tasks                                           │
│                                                                  │
│  TIER 4: CODEX (GitHub Copilot / Codex)                         │
│  ├── Inline code completion                                      │
│  ├── Function stubs                                              │
│  ├── Type annotations                                            │
│  ├── Import suggestions                                          │
│  └── Pattern repetition                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Task-to-Model Mapping

| Task Type | Model | Reason |
|-----------|-------|--------|
| "Design the feedback loop system" | OPUS | Architecture |
| "Implement entity merge function" | SONNET | Feature work |
| "Add test case for married_to" | HAIKU | Simple addition |
| "Complete this function" | CODEX | Completion |
| "Why is Harry/Lily merging?" | OPUS | Complex debugging |
| "Fix typo in VISION.md" | HAIKU | Simple edit |
| "Refactor orchestrator to pipeline" | OPUS | Multi-file refactor |
| "Add new relation pattern" | SONNET | Pattern work |

### 3.3 Cost-Efficiency Guidelines

**OPUS Usage Rules:**
- Only for tasks requiring >3 files of context
- Only for tasks where wrong answer costs >1 hour
- Never for simple find/replace
- Never for boilerplate code

**SONNET Usage Rules:**
- Default for implementation tasks
- Use when HAIKU would likely need multiple attempts
- Appropriate for code review

**HAIKU Usage Rules:**
- Prefer for any task completable in <5 minutes
- Use for high-volume, low-complexity tasks
- Default for documentation fixes

---

## Part 4: Documentation Efficiency Analysis

### 4.1 Current Documentation Issues

| Issue | Impact | Files Affected |
|-------|--------|----------------|
| Redundant status info | Token waste | HANDOFF.md, STATUS.md, README.md |
| Outdated phase info | Confusion | VISION.md (Nov dates), INTEGRATED_TESTING_STRATEGY.md |
| Verbose CLAUDE.md | ~800 lines | Token cost per session |
| Duplicate vision docs | Confusion | VISION.md, ares-vision-comprehensive.md |

### 4.2 Recommended Documentation Structure

```
RECOMMENDED STRUCTURE:
/
├── README.md                    # Single source of truth (current)
├── HANDOFF.md                   # Active session state only
├── CLAUDE.md                    # → Slim to 300 lines max
├── docs/
│   ├── VISION.md               # Strategic vision (keep)
│   ├── FOR_AGENTS.md           # AI onboarding (keep, slim)
│   ├── LINGUISTIC_REFERENCE.md # Linguistic patterns (keep)
│   ├── AI_MODEL_GUIDE.md       # NEW: Model selection guide
│   └── architecture/
│       ├── PIPELINE_ARCHITECTURE.md  # Keep
│       └── [others as needed]
└── [archive deprecated docs]
```

### 4.3 Token Efficiency Recommendations

1. **Consolidate Status:** Single STATUS section in README.md only
2. **Slim CLAUDE.md:** Remove examples covered in LINGUISTIC_REFERENCE.md
3. **Archive Historical:** Move phase/sprint docs to archive/
4. **Single Vision:** Archive ares-vision-comprehensive.md (covered by VISION.md)

---

## Part 5: Step-by-Step Implementation Plan

### ⚠️ REVISED PRIORITY: Lab UI Integration First

The original roadmap focused on building new backend features. **This revision prioritizes connecting the Lab UI to existing backend infrastructure**, which is the critical gap preventing the vision from being realized.

### Phase 0: Lab UI Foundation (Week 1) - NEW PRIORITY

**Week 1: Connect Lab UI to Persistent Storage**
```
Priority: CRITICAL (Blocker for everything else)
Model: SONNET for implementation

Files to Modify:
- app/ui/console/src/pages/ExtractionLab.tsx
- app/ui/console/src/lib/api.ts (add new endpoints)
- app/api/server.ts (expose storage endpoints)

Tasks:
1. Add API endpoints for storage operations:
   - POST /api/projects/:id/documents (save doc + extraction)
   - GET /api/projects/:id/documents (list saved docs)
   - GET /api/projects/:id/graph (get merged graph)
   - DELETE /api/projects/:id/documents/:docId (remove doc)

2. Lab UI changes:
   - "Save to Project" button → calls appendDoc()
   - Document list sidebar (collapsible)
   - "Load Document" from list
   - Project selector dropdown

3. State management:
   - useProject hook for current project
   - useDocuments hook for document list
   - Persist project selection in localStorage

Success Criteria:
- User can save extraction → persists after browser refresh
- User can load previous documents
- User can see document list
```

**Backend code already exists:**
```typescript
// These functions are ready to use:
import { saveGraph, loadGraph, appendDoc } from 'app/storage/storage';
```

### Phase 1: Complete Core Vision (Weeks 2-5)

**Week 2: Integrate Knowledge Graph in Lab UI**
```
Priority: CRITICAL
Model: SONNET for implementation

Tasks:
1. Add "View Full Graph" button → GraphPage with all entities
2. Show cumulative entity count (not just current doc)
3. Cross-document entity suggestions when typing
4. Merge indicator when entity matches existing global entity

Backend exists: GlobalKnowledgeGraph class in global-graph.ts

Success: User sees entities accumulating across documents
```

**Week 3: Integrate Wiki Generator in Lab UI**
```
Priority: HIGH
Model: SONNET for implementation

Tasks:
1. WikiPage from persistent graph (not current extraction only)
2. "Generate All Wiki Pages" bulk action
3. Wiki page list in sidebar (alphabetical by entity)
4. Export wiki to markdown files
5. Wiki page navigation (click entity → wiki page)

Backend exists: WikiGenerator class with 8 type-specific templates

Success: User can generate and browse persistent wiki pages
```

**Week 4: Manual Override UI Enhancement**
```
Priority: CRITICAL
Model: SONNET for implementation, OPUS for design decisions

Tasks:
1. Entity correction interface (change types) - partially exists
2. Entity merge/split operations - needs implementation
3. Relationship add/edit/delete - needs implementation
4. Confidence override capability - needs implementation
5. Batch operations for multiple entities

Success: Author can fix any extraction error via UI
```

**Week 5: Feedback Loop & Correction Tracking**
```
Priority: CRITICAL
Model: OPUS for architecture, SONNET for implementation

Tasks:
1. Correction tracking system (log all manual changes)
2. Pattern extraction from corrections
3. Confidence boost for validated patterns
4. Initial learning algorithm

Success: System logs corrections and adjusts confidence
```

### Phase 2: Research-Informed Enhancements (Weeks 6-9)

**Week 6: Reactive Wiki**
```
Priority: HIGH
Model: SONNET

Tasks:
1. Auto-regeneration on data changes (via subscription)
2. Version history tracking
3. Change propagation to related pages
4. Rollback functionality

Success: Wiki updates within 1s of correction
```

**Week 7-8: Zero-Shot Entity Types**
```
Priority: HIGH
Model: OPUS for design, SONNET for implementation

Research Basis: GLiNER "extract entities of those types in zero-shot fashion"

Tasks:
1. Entity type prompt system
2. Custom type definitions (ARTIFACT, SPELL, KINGDOM)
3. Type inheritance (KINGDOM extends PLACE)
4. User-defined type UI

Success: Authors can add new entity types without code changes
```

**Week 9: Weak Supervision Bootstrap**
```
Priority: MEDIUM
Model: SONNET

Research Basis: "Weak supervision... can be as effective as hand-labeling"

Tasks:
1. Labeling function framework
2. Gazetteer-based weak labeling
3. Pattern-based weak labeling
4. Conflict resolution

Success: New domains bootstrapped with <100 manual labels
```

### Phase 3: Scale & Polish (Weeks 10-12)

**Week 10-11: Stage 4 Testing**
```
Priority: MEDIUM
Model: SONNET

Tasks:
1. Performance benchmarks (≥100 words/sec)
2. Memory profiling
3. Mega regression (P≥75%, R≥70%)

Success: All Stage 4 metrics pass
```

**Week 12: Production Readiness**
```
Priority: MEDIUM
Model: SONNET for implementation, HAIKU for test expansion

Tasks:
1. Canary corpus evaluation
2. Multi-domain testing
3. Edge case coverage
4. Documentation polish

Success: Stage 5 complete, ready for beta users
```

---

## Part 6: Research-Backed Feature Priorities

Based on entity-extraction-sota.pdf analysis:

### IMPLEMENT NOW (High ROI, Validated):

1. **Active Learning Loop** (Research: "supercharge development")
   - Already planned in Manual Override
   - Add uncertainty sampling for review queue

2. **Ensemble Approach** (Research: "combining multiple approaches")
   - Current: NER + Dependency + Patterns ✅
   - Add: Confidence voting between methods

3. **Post-Processing Rules** (Research: "consistency checks")
   - Ensure same entity text → same label
   - Merge split tags ("New" + "York" → "New York")

### CONSIDER LATER (Experimental):

1. **Graph Neural Networks** (Research: "GCNs for long-distance context")
   - Only if cross-paragraph relations remain problematic
   - High implementation cost

2. **Reinforcement Learning** (Research: "RL for nested NER")
   - Only for nested entity edge cases
   - Complex training regime

---

## Part 7: MIT Resource Note

No specific MIT resource was found in the repository. The research paper references:
- **Stanford NER** (CRF-based, Stanford NLP Group)
- **Stanford CoreNLP** (toolkit)
- **Snorkel** (Stanford weak supervision framework)

These Stanford resources are relevant and recommended for ARES:
- Snorkel patterns for weak supervision bootstrapping
- Stanford coreference resolution techniques

---

## Conclusion: Path Validation

**VERDICT: ARES IS ON THE CORRECT PATH - WITH INTEGRATION PRIORITY**

The architecture, philosophy, and implementation approach are validated by:

1. ✅ Local-first design matches "no cloud dependencies" best practice
2. ✅ Multi-pass extraction matches "hybrid systems" recommendation
3. ✅ Manual override matches "human-in-the-loop" active learning
4. ✅ HERT system provides stable entity references
5. ✅ Progressive testing ladder ensures quality gates

### ⚠️ CRITICAL FINDING: Lab UI Integration Gap

**The backend infrastructure is more complete than initially assessed.** Key capabilities exist but are not exposed in the Lab UI:

| Backend Component | Status | Lab UI Status |
|-------------------|--------|---------------|
| Document Persistence | ✅ Complete (`storage.ts`) | ❌ Not integrated |
| Knowledge Graph | ✅ Complete (`global-graph.ts`) | ❌ Not integrated |
| Wiki Generation | ✅ Complete (`wiki-generator.ts`) | ⚠️ On-the-fly only |
| Cross-Doc Merging | ✅ Complete (`mergeEntitiesAcrossDocs`) | ❌ Not integrated |

**Revised Primary Focus:**
1. **Connect Lab UI to Storage** (CRITICAL - Week 1 priority)
2. **Integrate Knowledge Graph in Lab UI** (CRITICAL - Week 2)
3. **Wire Wiki Generator to Persistent Graph** (HIGH - Week 3)
4. Complete Manual Override UI (CRITICAL - Week 4)
5. Implement Feedback Loop (CRITICAL - Week 5)

**Do Not Deviate For:**
- LLM-based extraction (conflicts with deterministic goal)
- Cloud dependencies (conflicts with local-first)
- Complex ML training (conflicts with "algorithms over AI" philosophy)
- Building new backend features before Lab UI integration

---

**Document Version:** 1.1 (Revised with Lab UI gap analysis)
**Next Review:** After Phase 0 (Lab UI Foundation) completion
