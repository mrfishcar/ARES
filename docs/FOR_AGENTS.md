# For AI Agents: ARES Quick Onboarding

Welcome! This guide helps you get oriented in the ARES project quickly.

**Read Time**: 10 minutes
**Last Updated**: 2025-12-05

---

## ⚠️ Model Selection First

**Before doing anything, check if you're the right model for this task:**

| Your Model | Best For | Warning |
|------------|----------|---------|
| HAIKU | Simple edits, searches, test additions | Default for quick tasks |
| SONNET | Feature implementation, bug fixes | Default for development |
| OPUS | Architecture, multi-file refactors, complex debugging | Use sparingly |

**See `docs/AI_MODEL_GUIDE.md` for full criteria.**

If you're OPUS/SONNET doing a simple edit, emit:
```
⚠️ MODEL EFFICIENCY: Consider using HAIKU for this task.
```

---

## Start Here: The Essential Three

Before doing ANYTHING, read these three documents in order:

### 1. VISION.md (5 min) ← READ FIRST
**Location**: `/docs/VISION.md`

**What**: The "why" and "what" of ARES - our north star.

**Key Takeaway**: ARES is a writing tool that extracts entities/relations AND enables manual correction. The manual override system is what makes us unique.

**Current Phase**: Building the 30% that's missing (manual override UI, feedback loop, reactive wiki).

```bash
cat docs/VISION.md
```

---

### 2. STATUS.md (10 min) ← READ SECOND
**Location**: `/docs/STATUS.md`

**What**: Current state, what works, what's missing, 4-week sprint plan.

**Key Takeaway**:
- 70% complete (extraction, database, wiki work)
- Missing: Manual override UI (critical), feedback loop, reactive wiki
- Sprint focus: Build manual override system in 4 weeks

```bash
cat docs/STATUS.md
```

---

### 3. CONTRIBUTING.md (10 min) ← READ THIRD
**Location**: `/CONTRIBUTING.md`

**What**: How to contribute without breaking things - architecture patterns, common pitfalls, review checklist.

**Key Takeaway**:
- Local-first design (works offline)
- HERT system (stable entity IDs)
- Progressive testing (5 stages)
- Don't create redundant systems

```bash
cat CONTRIBUTING.md
```

---

## Quick Start Workflow

### 1. Environment Setup (5 min)

```bash
# 1. Install dependencies
npm install

# 2. Start spaCy parser (REQUIRED for extraction)
# Terminal 1:
make parser
# Wait for: "SpaCy parser running on port 8000"

# 3. Verify baseline tests pass
# Terminal 2:
npm test tests/ladder/level-1-simple.spec.ts
```

**If tests fail**: Parser isn't running or dependencies not installed.

---

### 2. Understand What You're Working On (10 min)

**Check the current sprint plan**:
```bash
# See current 4-week sprint breakdown
cat docs/STATUS.md | grep -A 50 "4-Week Sprint Plan"
```

**Check current testing status**:
```bash
# See which stage we're on
cat docs/testing/TESTING_STRATEGY.md | grep -A 5 "Current Status Summary"
```

**Typical task**: You'll be asked to work on one of:
1. Manual override UI components (Week 1-2)
2. Feedback loop / learning system (Week 2-3)
3. Reactive wiki updates (Week 3)
4. Bug fixes / extraction improvements (ongoing)

---

### 3. Before Making Changes

```bash
# 1. Create a feature branch
git checkout -b feature/your-feature-name

# 2. Verify current stage tests still pass (baseline)
npm test tests/ladder/level-1-simple.spec.ts

# 3. Make your changes incrementally

# 4. Test after EACH change (don't batch test)
npm test tests/ladder/level-1-simple.spec.ts  # Still passes?

# 5. Run relevant stage tests
npm test tests/ladder/level-2-multisentence.spec.ts  # If working on Stage 2
```

---

## Common Agent Tasks

### Task 1: Fix Entity Extraction Issue

**Example**: "Entity type coverage is low, need to detect more ORG entities"

**Workflow**:
```bash
# 1. Check current pattern coverage
npx ts-node scripts/pattern-expansion/inventory-patterns.ts

# 2. Check extraction metrics
npx tsx scripts/pattern-expansion/evaluate-coverage.ts

# 3. Identify which patterns to add
cat reports/rung1_pattern_coverage_summary.md

# 4. Add patterns to extraction config
# Edit: app/engine/extract/patterns.ts or patterns/*.json

# 5. Test improvement
npm test tests/ladder/level-1-simple.spec.ts
npx tsx scripts/pattern-expansion/evaluate-coverage.ts  # Metrics improved?
```

**Relevant Docs**:
- `docs/testing/TESTING_STRATEGY.md` - Stage 1 pattern coverage requirements
- `CONTRIBUTING.md` - Don't break existing stages

---

### Task 2: Build Manual Override UI Component

**Example**: "Create entity editor modal for changing entity types"

**Workflow**:
```bash
# 1. Check design spec
cat docs/architecture/MANUAL_OVERRIDE_DESIGN.md  # (to be created by Archie)

# 2. Understand HERT system (entity IDs)
cat CONTRIBUTING.md | grep -A 20 "HERT System"

# 3. Create React component
# File: app/ui/console/src/components/EntityEditor.tsx

# 4. Add API endpoint for corrections
# File: app/engine/api/corrections.ts

# 5. Update database schema (if needed)
# File: app/engine/storage/schema.sql

# 6. Test locally
npm run dev  # Start dev server
# Visit http://localhost:5173 and test UI
```

**Relevant Docs**:
- `docs/VISION.md` - Manual override requirements
- `docs/STATUS.md` - Week 1 deliverables
- `CONTRIBUTING.md` - Evidence provenance pattern

---

### Task 3: Debug Test Failure

**Example**: "Stage 2 recall is below target (71% vs 80%)"

**Workflow**:
```bash
# 1. Run debug runner to see detailed output
npx ts-node tests/ladder/run-level-2.ts

# 2. Identify which test cases are failing
# Look for: "❌ Missing relation: ..."

# 3. Check if it's a pattern coverage issue
npx ts-node scripts/pattern-expansion/inventory-patterns.ts
# Low coverage (<30%)? → Add more patterns

# 4. Check if it's a filtering issue
npx ts-node tests/ladder/run-level-2.ts | grep -A 5 "suppressed"
# Too many suppressions? → Adjust filters

# 5. Make targeted fix

# 6. Verify fix doesn't break other stages
npm test tests/ladder/level-1-simple.spec.ts  # Still passes?
npm test tests/ladder/level-2-multisentence.spec.ts  # Fixed?
```

**Relevant Docs**:
- `docs/testing/TESTING_STRATEGY.md` - Understanding test failures
- `CONTRIBUTING.md` - Common pitfalls (precision/recall tradeoff)

---

## File Navigation Guide

**Where to find things**:

| Need | Location |
|------|----------|
| Project vision | `/docs/VISION.md` |
| Current status | `/docs/STATUS.md` |
| Contributing guide | `/CONTRIBUTING.md` |
| Testing strategy | `/docs/testing/TESTING_STRATEGY.md` |
| Architecture designs | `/docs/architecture/` |
| Extraction code | `/app/engine/extract/` |
| Database code | `/app/engine/storage/` |
| API code | `/app/engine/api/` |
| UI code | `/app/ui/console/src/` |
| Tests | `/tests/ladder/` (stages 1-5) |
| Pattern definitions | `/patterns/*.json` |
| Test reports | `/reports/` |
| Historical docs | `/docs/archive/` |

**Quick file checks**:
```bash
# Find all docs on a topic
grep -r "manual override" docs/

# List all test files
ls tests/ladder/

# Check recent test reports
ls -lt reports/ | head -10
```

---

## Architecture Quick Reference

### HERT System (Entity IDs)
```typescript
// Entity ID format: EID_<name>_<type>_<hash>
const entityId = 'EID_Gandalf_wiz_a7b3c9';  // Stable ID

// ✅ Use HERT IDs for references
const relation = {
  subjectId: 'EID_Gandalf_wiz_a7b3c9',
  predicate: 'mentor_of',
  objectId: 'EID_Frodo_hob_d4e2f8'
};

// ❌ Don't use entity names directly
const relation = {
  subject: 'Gandalf',  // Breaks if name changes
  object: 'Frodo'
};
```

### Evidence Provenance
```typescript
// ✅ Include source text span
const relation = {
  subjectId: 'EID_Aragorn',
  predicate: 'married_to',
  objectId: 'EID_Arwen',
  evidence: {
    text: 'Aragorn married Arwen',
    sourceDoc: 'chapter-20.md',
    paragraphIndex: 5,
    tokenStart: 12,
    tokenEnd: 18
  }
};
```

### Local-First Design
```typescript
// ✅ Use local SQLite
const db = await SQLite.open({ filename: './data/ares.db' });

// ❌ Don't require cloud for core functionality
const data = await fetch('https://api.ares.com/entities');  // Bad!
```

---

## Testing Quick Reference

### Stage Gates (Must Pass in Order)

```bash
# Stage 1: Simple sentences (P≥90%, R≥85%)
npm test tests/ladder/level-1-simple.spec.ts

# Stage 2: Multi-sentence (P≥85%, R≥80%)
npm test tests/ladder/level-2-multisentence.spec.ts

# Stage 3: Complex paragraphs (P≥80%, R≥75%)
npm test tests/ladder/level-3-complex.spec.ts

# Stage 4: Large documents (P≥75%, R≥70%)
npm run test:mega

# Stage 5: Production readiness (P≥75%, R≥65%)
npx tsx scripts/pattern-expansion/evaluate-coverage.ts --canary
```

**Current Status**: Stage 1 ✅, Stage 2 ⚠️ (99%), Stage 3-5 ⏸️

### Component Health Checks

```bash
# Check pattern coverage
npx ts-node scripts/pattern-expansion/inventory-patterns.ts

# Check extraction metrics
npx tsx scripts/pattern-expansion/evaluate-coverage.ts

# Check with precision guardrails
npx tsx scripts/pattern-expansion/evaluate-coverage.ts --precision_guardrails
```

---

## Common Pitfalls to Avoid

### 1. Forgetting Parser
```bash
# ❌ Tests fail with "Connection refused"
npm test

# ✅ Start parser first
make parser  # Terminal 1
npm test     # Terminal 2
```

### 2. Breaking Lower Stages
```bash
# ❌ Fix Stage 3, break Stage 1
npm test tests/ladder/level-3-complex.spec.ts  # Passes!
npm test tests/ladder/level-1-simple.spec.ts   # Fails! Bad!

# ✅ Always verify Stage 1 still passes
npm test tests/ladder/level-1-simple.spec.ts   # Must pass
npm test tests/ladder/level-3-complex.spec.ts  # Can improve
```

### 3. Creating Redundant Docs
```bash
# ❌ Create new doc without checking
echo "# My Testing Strategy" > NEW_TESTING.md

# ✅ Check existing docs first
grep -r "testing strategy" docs/
cat docs/testing/TESTING_STRATEGY.md  # Already exists!
```

### 4. Document-Level Filtering (Too Aggressive)
```typescript
// ❌ Suppresses relation EVERYWHERE in document
if (marriedToExists) return false;

// ✅ Suppresses only in relevant context (sentence/paragraph)
if (marriedToInSameSentence) return false;
```

---

## Emergency Contacts

### Stuck on Architecture Decision?
→ Check `/docs/architecture/` for existing design docs
→ Check `/docs/VISION.md` for project direction

### Stuck on Test Failure?
→ Check `/docs/testing/TESTING_STRATEGY.md` for debugging guide
→ Run debug runners: `npx ts-node tests/ladder/run-level-X.ts`

### Stuck on Code Organization?
→ Check `/CONTRIBUTING.md` for patterns
→ Check existing code in `/app/engine/` for examples

### Need Historical Context?
→ Check `/docs/archive/` for old docs and decisions

---

## Success Checklist

Before considering your task complete:

- [ ] Read VISION.md, STATUS.md, CONTRIBUTING.md
- [ ] All previously passing tests still pass
- [ ] New functionality has tests
- [ ] No redundant systems created
- [ ] Follows architecture patterns (HERT, evidence, local-first)
- [ ] Documentation updated (if needed)
- [ ] Commit message is descriptive

---

## Quick Commands Cheat Sheet

```bash
# Setup
npm install
make parser  # Terminal 1 - keep running

# Testing
npm test tests/ladder/level-1-simple.spec.ts  # Stage 1
npm test tests/ladder/level-2-multisentence.spec.ts  # Stage 2
npm run test:mega  # Large documents
npm test  # All unit tests

# Debugging
npx ts-node tests/ladder/run-level-2.ts  # Detailed test output
npx ts-node scripts/pattern-expansion/inventory-patterns.ts  # Pattern coverage
npx tsx scripts/pattern-expansion/evaluate-coverage.ts  # Extraction metrics

# Development
npm run dev  # Start dev server (http://localhost:5173)
make parser  # Start spaCy parser (port 8000)

# Code Navigation
grep -r "topic" docs/  # Find docs on topic
ls tests/ladder/  # List stage tests
cat reports/rung1_pattern_coverage_summary.md  # Pattern coverage report
```

---

## TL;DR - The Absolute Minimum

If you only read one thing, read this:

1. **Vision**: Build manual override UI to correct extraction errors (docs/VISION.md)
2. **Status**: 70% done, need manual override system (docs/STATUS.md)
3. **Pattern**: Local-first, HERT IDs, evidence provenance (CONTRIBUTING.md)
4. **Testing**: Stage 1 must always pass (tests/ladder/level-1-simple.spec.ts)
5. **Pitfall**: Don't create redundant systems (check existing docs first)

**Start Here**:
```bash
cat docs/VISION.md      # 5 min - understand the goal
cat docs/STATUS.md      # 10 min - understand current state
make parser && npm test tests/ladder/level-1-simple.spec.ts  # Verify baseline
```

Good luck! You've got this.
