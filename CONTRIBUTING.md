# Contributing to ARES

Welcome to the ARES project! This guide will help you contribute effectively without breaking things.

**Last Updated**: 2025-11-13

---

## Quick Links

- **Vision**: See [docs/VISION.md](docs/VISION.md) - What we're building and why
- **Status**: See [docs/STATUS.md](docs/STATUS.md) - Current progress and priorities
- **For Agents**: See [docs/FOR_AGENTS.md](docs/FOR_AGENTS.md) - Quick onboarding for AI agents

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Patterns](#architecture-patterns)
3. [Development Workflow](#development-workflow)
4. [Testing Strategy](#testing-strategy)
5. [Common Pitfalls](#common-pitfalls)
6. [Code Organization](#code-organization)
7. [Review Checklist](#review-checklist)

---

## Project Overview

ARES is a writing tool that:
1. Extracts entities and relationships from narrative text
2. Stores knowledge in a local database (SQLite + HERT system)
3. Generates interactive wikis for authors
4. **Enables manual correction of extraction errors** (the differentiating feature)
5. Learns from corrections to improve over time

**Current Phase**: Building the manual override system (70% → 100%)

**What's Working**:
- Extraction engine (87.5% recall, 97.8% precision)
- Knowledge database (HERT, GraphQL, SQLite)
- Wiki generation (entity/relation queries)
- Deployment infrastructure (Vercel + Railway)

**What's Missing**:
- Manual override UI (correct extraction errors)
- Feedback loop (learn from corrections)
- Reactive wiki (auto-update on changes)

---

## Architecture Patterns

### 1. Local-First Design

**Principle**: All core functionality works offline with local SQLite database.

**Pattern**:
```typescript
// ✅ GOOD: Local-first with optional sync
const db = await SQLite.open({ filename: './data/ares.db' });
const entity = await db.get('SELECT * FROM entities WHERE id = ?', [entityId]);

// ❌ BAD: Cloud-dependent core functionality
const entity = await fetch('https://api.ares.com/entities/' + entityId);
```

**Why**: Authors need reliable tools that work without internet. Cloud is optional enhancement, not requirement.

---

### 2. HERT System (Hierarchical Entity Reference Tags)

**Principle**: Stable entity IDs that don't change when entity names change.

**Pattern**:
```typescript
// ✅ GOOD: Use HERT IDs for references
const relation = {
  subjectId: 'EID_Gandalf_wiz_abc123',  // HERT ID
  predicate: 'mentor_of',
  objectId: 'EID_Frodo_hob_def456'      // HERT ID
};

// ❌ BAD: Use entity names directly
const relation = {
  subject: 'Gandalf',      // What if name changes?
  predicate: 'mentor_of',
  object: 'Frodo'
};
```

**Why**: Entity names change (aliases, corrections), but relationships should persist. HERT IDs provide stability.

**HERT Format**: `EID_<name>_<type_abbrev>_<hash>`
- Example: `EID_Gandalf_wiz_a7b3c9`
- URL-safe, compact (~25 chars vs 200+ for JSON)
- Collision-resistant (hash of canonical name + type)

---

### 3. Evidence Provenance

**Principle**: Every extracted fact includes source text span and location.

**Pattern**:
```typescript
// ✅ GOOD: Include evidence
const relation = {
  subjectId: 'EID_Aragorn',
  predicate: 'married_to',
  objectId: 'EID_Arwen',
  confidence: 0.95,
  evidence: {
    text: 'Aragorn married Arwen in Minas Tirith',
    sourceDoc: 'chapter-20.md',
    paragraphIndex: 5,
    tokenStart: 12,
    tokenEnd: 18
  }
};

// ❌ BAD: No evidence
const relation = {
  subject: 'Aragorn',
  predicate: 'married_to',
  object: 'Arwen'
};
```

**Why**: Manual override requires showing users WHERE the extraction came from to enable informed corrections.

---

### 4. Progressive Enhancement

**Principle**: Build in stages, validate each stage before advancing.

**Testing Ladder**:
```
Stage 1: Simple sentences (P≥90%, R≥85%) ✅
Stage 2: Multi-sentence (P≥85%, R≥80%) ⏸️
Stage 3: Complex paragraphs (P≥80%, R≥75%) ⏸️
Stage 4: Large documents (P≥75%, R≥70%) ⏸️
Stage 5: Production readiness (P≥75%, R≥65%) ⏸️
```

**Pattern**:
```bash
# ✅ GOOD: Pass current stage before advancing
npm test tests/ladder/level-1-simple.spec.ts  # Must pass
npm test tests/ladder/level-2-multisentence.spec.ts  # Then this

# ❌ BAD: Jump ahead without validating foundation
npm test tests/ladder/level-5-production.spec.ts  # Will fail if Stage 1-4 broken
```

**Why**: Prevents wasting time optimizing Stage 5 when Stage 2 is broken.

---

### 5. Don't Create Redundant Systems

**Principle**: Check for existing solutions before building new ones.

**Anti-Pattern**: Creating multiple testing strategies
- `TEST_LADDER_STRATEGY.md` (levels only)
- `UNIFIED_TESTING_STRATEGY.md` (dual-ladder)
- `INTEGRATED_TESTING_STRATEGY.md` (consolidated) ✅

**Pattern**:
```bash
# ✅ GOOD: Check existing docs first
grep -r "testing strategy" docs/
cat docs/testing/TESTING_STRATEGY.md  # Single source of truth

# ❌ BAD: Create yet another testing doc without checking
echo "# My New Testing Approach" > ANOTHER_TESTING_STRATEGY.md
```

**Why**: Redundancy creates confusion, maintenance burden, and conflicting information.

---

## Development Workflow

### 1. Before You Start

```bash
# 1. Read the vision
cat docs/VISION.md

# 2. Check current status and priorities
cat docs/STATUS.md

# 3. Verify parser is running (REQUIRED for extraction tests)
make parser
# Wait for: "SpaCy parser running on port 8000"

# 4. Run existing tests to verify baseline
npm test tests/ladder/level-1-simple.spec.ts
```

### 2. Making Changes

```bash
# 1. Create a branch (use your session ID or feature name)
git checkout -b feature/manual-override-ui

# 2. Make incremental changes
# 3. Test after each change (don't batch test at the end)

npm test tests/ladder/level-1-simple.spec.ts  # Stage 1 still passes?
npm test tests/ladder/level-2-multisentence.spec.ts  # Stage 2?

# 4. Commit with descriptive messages
git commit -m "feat: add entity type correction UI component

- Adds EntityEditor modal component
- Supports changing entity type (PERSON, ORG, PLACE, etc.)
- Includes validation to prevent invalid types
- Updates database on save

Addresses: Manual override requirement from VISION.md"
```

### 3. Testing Requirements

**Minimum**: Pass all tests that passed before your changes
```bash
# Must pass Stage 1
npm test tests/ladder/level-1-simple.spec.ts
```

**Recommended**: Pass current highest stage
```bash
# Pass Stage 2 (once unblocked)
npm test tests/ladder/level-2-multisentence.spec.ts
```

**Full Test Suite**:
```bash
# Run all unit tests
npm test

# Run stage tests
npm test tests/ladder/

# Run mega regression (large documents)
npm run test:mega
```

### 4. Debugging Workflow

```bash
# 1. Identify which stage is failing
npm test tests/ladder/level-2-multisentence.spec.ts

# 2. Run debug runner to see detailed output
npx ts-node tests/ladder/run-level-2.ts

# 3. Check component health (if extraction quality is low)
npx ts-node scripts/pattern-expansion/inventory-patterns.ts  # Pattern coverage
npx tsx scripts/pattern-expansion/evaluate-coverage.ts       # Baseline metrics

# 4. Fix identified issue

# 5. Re-run stage test to verify fix
npm test tests/ladder/level-2-multisentence.spec.ts
```

---

## Testing Strategy

See [docs/testing/TESTING_STRATEGY.md](docs/testing/TESTING_STRATEGY.md) for complete details.

**Quick Summary**:
- **5 Stages**: Foundation → Components → Complex → Scale → Production
- **Stage Gates**: Must pass current stage before advancing
- **Component Checks**: Verify component health before testing extraction quality
- **Current Status**: Stage 1 ✅, Stage 2 ⚠️ (99% complete)

**Key Commands**:
```bash
# Run stage tests
npm test tests/ladder/level-1-simple.spec.ts
npm test tests/ladder/level-2-multisentence.spec.ts
npm test tests/ladder/level-3-complex.spec.ts

# Check component health
npx ts-node scripts/pattern-expansion/inventory-patterns.ts  # Pattern coverage
npx tsx scripts/pattern-expansion/evaluate-coverage.ts       # Extraction metrics
```

---

## Common Pitfalls

### 1. Forgetting to Start Parser

**Symptom**: Tests fail with "Connection refused" or "Parser not responding"

**Fix**:
```bash
# Terminal 1: Start parser
make parser

# Terminal 2: Run tests
npm test
```

**Why**: Extraction engine requires spaCy parser running on port 8000.

---

### 2. Breaking Stage 1 While Fixing Stage 2

**Symptom**: Stage 2 improves but Stage 1 starts failing

**Why**: Changes that improve complex extraction can hurt simple extraction (over-filtering, over-complexity).

**Fix**: Always run Stage 1 tests after changes
```bash
npm test tests/ladder/level-1-simple.spec.ts  # Must still pass
npm test tests/ladder/level-2-multisentence.spec.ts  # New improvement
```

---

### 3. Precision/Recall Tradeoff Mistakes

**Symptom**: Improving precision tanks recall (or vice versa)

**Example**: Adding aggressive filtering
```typescript
// ❌ BAD: Too aggressive - hurts recall
if (relation.confidence < 0.95) return false;  // Filters out too much

// ✅ GOOD: Balanced threshold
if (relation.confidence < 0.75) return false;  // Reasonable filter
```

**Rule**: Watch F1 score (harmonic mean). If F1 drops, the tradeoff was bad.

---

### 4. Document-Level Filtering When Sentence-Level Needed

**Symptom**: Recall drops because relations are suppressed across entire document

**Example**:
```typescript
// ❌ BAD: Document-level suppression
if (marriedToRelations.has(`${subj}:${obj}`)) {
  return false;  // Suppresses EVERYWHERE
}

// ✅ GOOD: Sentence-level suppression
if (marriedSentences.has(sentenceId)) {
  return false;  // Only suppresses in that sentence
}
```

**Why**: "Aragorn married Arwen" in paragraph 1 shouldn't suppress "Arathorn, father of Aragorn" in paragraph 5.

---

### 5. Creating Redundant Documentation

**Symptom**: Multiple docs saying similar things, team doesn't know which is current

**Fix**:
1. Check existing docs first: `grep -r "topic" docs/`
2. Update existing doc if found
3. Only create new doc if truly new topic
4. Archive old doc if superseded (add frontmatter pointing to new doc)

---

## Code Organization

### Directory Structure

```
ares/
├── app/
│   ├── engine/           # Extraction engine
│   │   ├── extract/      # Entity/relation extraction
│   │   ├── storage/      # HERT database
│   │   └── api/          # GraphQL API
│   └── ui/               # Frontend
│       └── console/      # Extraction Lab UI
├── docs/
│   ├── VISION.md         # Project vision ← READ FIRST
│   ├── STATUS.md         # Current status
│   ├── FOR_AGENTS.md     # Agent onboarding
│   ├── architecture/     # Design docs
│   ├── testing/          # Testing strategy
│   ├── guides/           # User guides
│   └── archive/          # Historical docs
├── tests/
│   ├── ladder/           # Stage tests (1-5)
│   └── mega/             # Large document tests
├── patterns/             # Extraction patterns
├── scripts/              # Utility scripts
└── reports/              # Test reports
```

### Where to Add New Code

**Entity extraction improvements**:
- `app/engine/extract/` - Core extraction logic
- `patterns/` - Pattern definitions

**Database changes**:
- `app/engine/storage/` - HERT storage layer

**API changes**:
- `app/engine/api/` - GraphQL resolvers

**UI changes**:
- `app/ui/console/src/` - React components

**Tests**:
- `tests/ladder/` - Stage-based tests (preferred)
- `tests/unit/` - Unit tests for specific modules

**Documentation**:
- `docs/` - High-level docs (vision, status, guides)
- `docs/architecture/` - Design decisions
- `README.md` - Project overview (keep short)

---

## Review Checklist

Before submitting changes, verify:

### Functionality
- [ ] Changes align with project vision (see `docs/VISION.md`)
- [ ] No redundant systems created (checked existing docs/code)
- [ ] Local-first design maintained (works offline)
- [ ] Evidence provenance included (source spans for extracted facts)

### Testing
- [ ] All previously passing tests still pass
- [ ] New functionality has tests
- [ ] Current stage tests pass (minimum: Stage 1)
- [ ] No regression in F1 score (precision/recall balance)

### Code Quality
- [ ] Follows existing patterns (HERT IDs, evidence tracking)
- [ ] No hardcoded values (use constants/config)
- [ ] Error handling added (graceful degradation)
- [ ] TypeScript types defined (no `any` unless necessary)

### Documentation
- [ ] Updated relevant docs (if architecture/API changed)
- [ ] Added code comments for complex logic
- [ ] Commit message is descriptive
- [ ] No new redundant documentation created

### Performance
- [ ] No obvious performance regressions
- [ ] Reasonable memory usage (no leaks)
- [ ] Scales to expected input sizes

### Manual Override Readiness (if applicable)
- [ ] Changes support future manual override UI
- [ ] Correction history can be tracked
- [ ] Changes are reversible (undo support)

---

## Questions?

- **Project Direction**: See [docs/VISION.md](docs/VISION.md)
- **Current Status**: See [docs/STATUS.md](docs/STATUS.md)
- **Testing**: See [docs/testing/TESTING_STRATEGY.md](docs/testing/TESTING_STRATEGY.md)
- **Architecture**: See [docs/architecture/](docs/architecture/)
- **For AI Agents**: See [docs/FOR_AGENTS.md](docs/FOR_AGENTS.md)

---

**Remember**: The goal is not perfect extraction - it's extraction good enough to be correctable. The manual override system is what makes ARES unique. Build with that in mind.
