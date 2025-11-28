# CLAUDE.md - AI Assistant Guide for ARES

**Version**: 1.0
**Last Updated**: 2025-11-25
**Repository**: Advanced Relation Extraction System (ARES)

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Development Workflows](#development-workflows)
5. [Testing Strategy](#testing-strategy)
6. [Code Organization](#code-organization)
7. [Key Conventions](#key-conventions)
8. [Common Tasks](#common-tasks)
9. [Debugging Guide](#debugging-guide)
10. [Documentation Index](#documentation-index)

---

## Project Overview

### What is ARES?

ARES is a **local-first entity and relation extraction system** that builds knowledge graphs from unstructured text. It extracts entities (people, places, organizations, dates) and their relationships (parent_of, works_at, married_to) with full provenance tracking.

**Core Philosophy:**
- **Local-first**: No cloud dependencies, runs entirely offline
- **Deterministic**: Rule-based extraction with transparent, testable patterns
- **Provenance-first**: Every fact includes source text and evidence
- **Progressive quality**: 5-stage testing ladder from simple to production-ready

### Current Status (Iteration 37)

**Test Results:**
- ✅ **Stage 1 (Foundation)**: PASSED - 119/119 tests passing
- ⚠️ **Stage 2 (Components)**: 99% complete - blocked on test 2.12 (appositive parsing)
- ⏸️ **Stage 3-5**: Not started (blocked on Stage 2)

**Extraction Quality:**
- Entity Recall: 87.5% (target ≥75%) ✅
- Precision: ~86% (target ≥80%) ✅
- Recall: ~79% (target ≥75%) ✅
- Performance: ~190 words/second

**Recent Work:**
- Partial name variant matching implemented (Iteration 37)
- Pronoun filtering from coreference-resolved aliases
- Entity extraction baseline: 7/28 tests passing (25%)

### Key Features

- **Multi-pass extraction**: Dependency parsing + pattern matching + NER + coreference
- **HERT System**: Stable, compact entity references with precise locations
- **Alias resolution**: Maps name variations to single entities
- **Cross-document identity**: Maintains entity identity across multiple documents
- **GraphQL API**: Flexible query interface with caching and rate limiting
- **Extraction Lab**: Browser-based testing interface at `/lab`

---

## Quick Start

### Prerequisites

- **Node.js** 16+ and npm
- **Python** 3.8+ with pip
- **Make** (for running commands)

### Initial Setup (5 minutes)

```bash
# 1. Install dependencies
make install

# 2. Start spaCy parser service (Terminal 1)
make parser
# Wait for: "Application startup complete"

# 3. Run tests (Terminal 2)
make test        # Expected: 119/119 passing ✅
make smoke       # Quick validation

# 4. Start development server (optional)
make server-graphql  # GraphQL API on port 4000
```

### Verify Everything Works

```bash
# Check parser is running
curl -s http://127.0.0.1:8000/health
# Should return: {"status": "ok"}

# Run Stage 1 tests
npm test tests/ladder/level-1-simple.spec.ts
# Should pass with P≥90%, R≥85%
```

---

## Architecture

### System Pipeline

```
Raw Text
    │
    ▼
┌─────────────────┐
│  spaCy Parser   │ (Python service, port 8000)
│  NLP Analysis   │ - Tokenization, POS tagging
└────────┬────────┘ - Dependency parsing, NER
         │
         ▼
┌─────────────────┐
│ Entity Extract  │ Multi-source extraction:
│ (3 stages)      │ 1. Pattern-based aliases
└────────┬────────┘ 2. Coreference resolution
         │          3. Partial name variants
         ▼
┌─────────────────┐
│ Relation Extract│ - Dependency paths
│ Confidence      │ - Pattern matching
└────────┬────────┘ - Inverse generation
         │
         ▼
┌─────────────────┐
│ Knowledge Graph │ - Entities + Relations + Evidence
│ GraphQL API     │ - Query and visualization
└─────────────────┘
```

### Core Components

**1. Engine (`app/engine/`)**
- **extract/entities.ts** (2898 lines) - Core entity extraction with 3-stage alias matching
- **extract/relations.ts** - Dependency path patterns for relation extraction
- **extract/orchestrator.ts** - Main coordinator, inverse relation generation
- **narrative-relations.ts** - Pattern-based narrative extraction
- **alias-resolver.ts** - Alias resolution and entity merging
- **coref.ts** - Coreference resolution

**2. Storage (`app/storage/`)**
- SQLite-based local storage
- HERT encoding for compact entity references
- Provenance tracking for all extractions

**3. API (`app/api/`)**
- GraphQL server with resolvers
- Caching layer for performance
- Rate limiting and pagination

**4. Parser (`app/parser/`)**
- Client for spaCy parser service
- Fallback to mock parser for testing

**5. UI (`app/ui/`)**
- **console/** - React-based extraction console
- **review-dashboard/** - Entity/relation review interface
- **Extraction Lab** - Browser-based testing at `/lab`

### HERT System (Hierarchical Entity Reference Tag)

**Format:** `HERTv1:1J8trXOyn4HRaWXrdh9TUE`

**Decodes to:**
- EID 43 (stable entity ID)
- AID 230 (surface form)
- Document fingerprint
- Paragraph 0, tokens 0-14

**Benefits:**
- **Stable**: EID doesn't change when entity name changes
- **Compact**: 20-30 chars vs 200+ for JSON
- **Precise**: Exact paragraph + token location
- **Portable**: Share via URL, no database needed

**Location:** `app/engine/hert/`

---

## Development Workflows

### Before Making ANY Changes

```bash
# 1. Read the essential docs
cat README.md                           # Project overview
cat INTEGRATED_TESTING_STRATEGY.md     # Testing approach
cat docs/ARES_PROJECT_BRIEFING.md      # Latest status

# 2. Verify baseline tests pass
make parser  # Terminal 1 (keep running)
npm test tests/ladder/level-1-simple.spec.ts  # Terminal 2

# 3. Check current status
cat INTEGRATED_TESTING_STRATEGY.md | grep "Status:"
```

### Standard Development Loop

```bash
# 1. Create feature branch
git checkout -b feature/your-feature-name

# 2. Make incremental changes
# Edit files...

# 3. Test AFTER EACH change (don't batch!)
npm test tests/ladder/level-1-simple.spec.ts

# 4. Run relevant stage tests
npm test tests/ladder/level-2-multisentence.spec.ts  # If Stage 2 work

# 5. ⚠️ STUCK ON A BUG? Ask the user for help!
# If the bug involves natural language (entity extraction, pronoun resolution,
# relation patterns, etc.), ASK THE USER immediately instead of debugging >30min.
# The user is an English language expert who can provide linguistic rules.

# 6. Commit with descriptive message
git add -A
git commit -m "feat: add support for X"

# 7. Push to designated branch
git push -u origin claude/claude-md-miex9940wrme9tpt-01Jd9AfTTZNzdiNeQ7jgvkmh
```

### Git Workflow Requirements

**CRITICAL Git Rules:**
- Always use: `git push -u origin <branch-name>`
- Branch MUST start with `claude/` and end with matching session ID
- If push fails with network error, retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s)
- NEVER use `--force` on main/master
- NEVER skip hooks with `--no-verify` unless explicitly requested
- NEVER update git config
- Check authorship before amending: `git log -1 --format='%an %ae'`

### Commit Message Format

```bash
# Use HEREDOC for proper formatting
git commit -m "$(cat <<'EOF'
feat: Add partial name variant matching for entity aliases

- Implement name decomposition for compound names
- Add proximity gating (~500 chars) to prevent false positives
- Merge abbreviated first names (Mike → Michael)
- Target: improve complex-person-002 test case

Iteration 37
EOF
)"
```

---

## Testing Strategy

### The Five-Stage Testing Ladder

ARES uses a **single progressive ladder** where each stage validates both component health AND extraction quality.

**Key Principle**: Check component health FIRST, then test extraction quality.

#### Stage 1: Foundation ✅ PASSED
```bash
# 1.1 Pattern Coverage Audit (≥30%)
npx ts-node scripts/pattern-expansion/inventory-patterns.ts

# 1.2 Entity Quality Check
# Verify entity types are valid

# 1.3 Simple Sentence Extraction (P≥90%, R≥85%)
npm test tests/ladder/level-1-simple.spec.ts
```

**Status**: ✅ PASSED
**Test Cases**: 20 simple sentences

#### Stage 2: Component Validation ⚠️ 99%
```bash
# 2.1 Synthetic Baseline (F1≥10%)
npx tsx scripts/pattern-expansion/evaluate-coverage.ts

# 2.2 Precision Guardrails Test
npx tsx scripts/pattern-expansion/evaluate-coverage.ts --precision_guardrails

# 2.3 Multi-Sentence Extraction (P≥85%, R≥80%)
npm test tests/ladder/level-2-multisentence.spec.ts
```

**Status**: ⚠️ 99% COMPLETE
**Blocker**: Test 2.12 - appositive parsing issue
**Test Cases**: 15 multi-sentence narratives

#### Stage 3: Complex Extraction ⏸️ NOT STARTED
```bash
# 3.1 Cross-Sentence Coreference
# To be created

# 3.2 Pattern Family Coverage (≥50%)
npx ts-node scripts/pattern-expansion/audit-integration.ts

# 3.3 Complex Paragraph Extraction (P≥80%, R≥75%)
npm test tests/ladder/level-3-complex.spec.ts
```

**Status**: ⏸️ NOT STARTED (blocked on Stage 2)

#### Stage 4: Scale Testing ⏸️ FUTURE
```bash
# 4.1 Performance Benchmarks (≥100 words/sec)
# 4.2 Memory Profile
# 4.3 Mega Regression Test
npm run test:mega
```

#### Stage 5: Production Readiness ⏸️ FUTURE
```bash
# 5.1 Canary Corpus Evaluation
npx tsx scripts/pattern-expansion/evaluate-coverage.ts --canary corpora/canary_realtext.jsonl
# 5.2 Real-World Validation
# 5.3 Edge Case Coverage
```

### Testing Commands Reference

```bash
# Run all tests
make test

# Run specific stage
npm test tests/ladder/level-1-simple.spec.ts  # Stage 1
npm test tests/ladder/level-2-multisentence.spec.ts  # Stage 2
npm test tests/ladder/level-3-complex.spec.ts  # Stage 3
npm run test:mega  # Stage 4

# Debug tests with verbose output
L3_DEBUG=1 npm test tests/ladder/level-2-multisentence.spec.ts

# Run debug runners
npx ts-node tests/ladder/run-level-1.ts
npx ts-node tests/ladder/run-level-2.ts

# Component health checks
npx ts-node scripts/pattern-expansion/inventory-patterns.ts
npx tsx scripts/pattern-expansion/evaluate-coverage.ts
```

### Test Failure Diagnosis

**Stage 1 failures** → Foundational issues
- Missing basic patterns
- Entity types wrong
- Parser not running

**Stage 2 failures** → Integration issues
- Low synthetic baseline (need more patterns)
- Guardrails too aggressive
- Coreference broken

**Stage 3+ failures** → Complexity issues
- Insufficient pattern coverage
- Long-distance dependencies not handled
- Performance degradation

---

## Code Organization

### Directory Structure

```
ARES/
├── app/
│   ├── engine/              # Core extraction engine
│   │   ├── extract/         # Entity & relation extraction
│   │   │   ├── entities.ts  # 3-stage entity extraction (2898 lines)
│   │   │   ├── relations.ts # Dependency path patterns
│   │   │   └── orchestrator.ts  # Main coordinator
│   │   ├── hert/            # HERT encoding/decoding
│   │   ├── grammar/         # POS tagging, sentence analysis
│   │   └── llm-providers/   # LLM integration (optional)
│   ├── storage/             # SQLite data persistence
│   ├── api/                 # GraphQL API & resolvers
│   ├── parser/              # spaCy parser client
│   ├── editor/              # Entity highlighter
│   │   └── entityHighlighter.ts  # Regex patterns (1000+ lines)
│   └── ui/                  # Web interfaces
│       ├── console/         # React extraction console
│       └── review-dashboard/  # Entity review UI
├── tests/
│   ├── ladder/              # Progressive stage tests
│   │   ├── level-1-simple.spec.ts
│   │   ├── level-2-multisentence.spec.ts
│   │   ├── level-3-complex.spec.ts
│   │   └── run-level-*.ts   # Debug runners
│   ├── golden/              # Golden corpus tests
│   ├── integration/         # API tests
│   └── entity-extraction/   # Entity extraction regression (28 tests)
├── scripts/
│   ├── pattern-expansion/   # Pattern coverage tools
│   │   ├── inventory-patterns.ts
│   │   └── evaluate-coverage.ts
│   ├── parser_service.py    # spaCy parser service
│   └── diagnose-l2.ts       # Diagnostic tools
├── docs/
│   ├── architecture/        # Technical designs
│   │   ├── HERT_IMPLEMENTATION.md
│   │   ├── ENGINE_EVOLUTION_STRATEGY.md
│   │   └── MANUAL_OVERRIDE_DESIGN.md
│   ├── guides/              # User guides
│   │   ├── QUICK_START.md
│   │   └── DESKTOP_TESTER_QUICKSTART.md
│   ├── reference/           # API reference
│   └── ARES_PROJECT_BRIEFING.md  # Latest status
├── data/                    # Local SQLite storage
├── patterns/                # Relation pattern definitions
└── reports/                 # Test reports

Key Files:
- README.md                  # Project overview
- HANDOFF.md                 # Latest session status
- INTEGRATED_TESTING_STRATEGY.md  # Testing approach
- ENTITY_EXTRACTION_STATUS.md  # Entity system docs
- CHANGELOG.md               # Version history
- Makefile                   # Build commands
- package.json               # Node dependencies
- tsconfig.json              # TypeScript config
```

### File Count by Module

- **Engine**: 72 TypeScript files
- **Tests**: 40+ test files
- **API**: 20+ resolver files
- **Documentation**: 30+ markdown files

---

## Key Conventions

### 1. Entity IDs (HERT System)

```typescript
// ✅ Use stable HERT IDs
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

### 2. Evidence Provenance

```typescript
// ✅ Always include source text span
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

### 3. Confidence Scoring

```typescript
// New entities created with confidence: 0.99
const entity = {
  id: generateEID(name, type),
  name: 'Gandalf',
  type: 'PERSON',
  confidence: 0.99,  // High confidence for explicit mentions
  aliases: ['Gandalf the Grey', 'Mithrandir']
};
```

### 4. Type Normalization

```typescript
// Test layer normalization:
ORGANIZATION → ORG
LOCATION → PLACE
PRODUCT/SOFTWARE_LIBRARY → ITEM
LAW → WORK

// Applied in: tests/entity-extraction/extraction.spec.ts
```

### 5. Deterministic Behavior

```typescript
// ✅ Alphabetical sorting for consistency
entities.sort((a, b) => a.name.localeCompare(b.name));

// ✅ Consistent field ordering
const relation = {
  id, subjectId, predicate, objectId, evidence, confidence
};

// ❌ Don't add randomness
Math.random()  // NEVER use this!
```

### 6. Local-First Design

```typescript
// ✅ Use local SQLite
const db = await SQLite.open({
  filename: './data/ares.db'
});

// ❌ Don't require cloud for core functionality
const data = await fetch('https://api.ares.com/entities');  // BAD!
```

### 7. Inverse Relations

```typescript
// Auto-generate inverse relations
const INVERSE = {
  parent_of: 'child_of',
  child_of: 'parent_of',
  married_to: 'married_to',  // Symmetric
  founded: 'founded_by',
  founded_by: 'founded',
};

// In orchestrator.ts:301-318
if (INVERSE[relation.pred]) {
  const inverse = {
    ...relation,
    id: uuid(),
    subj: relation.obj,
    obj: relation.subj,
    pred: INVERSE[relation.pred]
  };
  inverseRelations.push(inverse);
}
```

### 8. Pronoun Filtering

```typescript
// ✅ Filter context-dependent pronouns from aliases
const PRONOUNS = ['he', 'she', 'they', 'his', 'her', 'their'];
aliases = aliases.filter(a => !PRONOUNS.includes(a.toLowerCase()));

// Context: Iteration 37 - filter pronouns from coreference-resolved aliases
// Location: app/engine/extract/entities.ts:2855-2891
```

---

## Common Tasks

### Task 1: Add a New Relation Pattern

**Example:** Add support for "X founded Y" relations

```bash
# 1. Add predicate to schema (if new)
# File: app/engine/schema.ts or app/engine/extract/relations/types.ts

# In PREDICATE_WEIGHTS:
founded: 0.80,

# In INVERSE map:
founded: 'founded_by',
founded_by: 'founded',

# 2. Add dependency pattern
# File: app/engine/extract/relations.ts

{
  subj: 'nsubj',    # Subject dependency
  obj: 'dobj',      # Object dependency
  pred: 'founded',
  tokens: ['founded', 'established', 'created']
},

# 3. Add narrative pattern (optional)
# File: app/engine/narrative-relations.ts

if (sentence.includes('founded') || sentence.includes('established')) {
  // Extract entities and create relation
}

# 4. Add test case
# File: tests/ladder/level-1-simple.spec.ts

{
  text: 'Steve Jobs founded Apple in 1976.',
  gold: {
    entities: ['Steve Jobs:PERSON', 'Apple:ORG'],
    relations: ['Steve Jobs --[founded]--> Apple']
  }
}

# 5. Run tests
npm test tests/ladder/level-1-simple.spec.ts
```

### Task 2: Debug Extraction Failure

**Example:** Relations not being extracted for certain patterns

```bash
# 1. Check parser is running
curl -s http://127.0.0.1:8000/health

# 2. Create debug script
cat > debug-extraction.ts <<'EOF'
import { extractFromText } from './app/engine/extract/orchestrator'

const text = 'Your test sentence here.'
const result = await extractFromText(text)

console.log('Entities:', result.entities)
console.log('Relations:', result.relations)
EOF

# 3. Run with debug output
L3_DEBUG=1 npx ts-node debug-extraction.ts

# 4. Check spaCy output directly
curl -X POST http://127.0.0.1:8000/parse \
  -H "Content-Type: application/json" \
  -d '{"text": "Your sentence"}'

# 5. Use diagnostic tool
npx ts-node scripts/diagnose-l2.ts
```

### Task 3: Improve Pattern Coverage

**Current:** 26% (480/1827 patterns)
**Target:** ≥30% for Stage 1, ≥50% for Stage 3

```bash
# 1. Check current coverage
npx ts-node scripts/pattern-expansion/inventory-patterns.ts
# Output: reports/rung1_pattern_coverage_summary.md

# 2. Identify gaps
cat reports/rung1_pattern_coverage_summary.md

# 3. Add patterns to relevant files
# - app/engine/extract/relations.ts (dependency patterns)
# - app/engine/narrative-relations.ts (narrative patterns)
# - patterns/*.json (pattern libraries)

# 4. Validate improvement
npx tsx scripts/pattern-expansion/evaluate-coverage.ts

# 5. Run stage tests
npm test tests/ladder/level-1-simple.spec.ts
```

### Task 4: Fix Entity Type Coverage

**Example:** Missing ORGANIZATION entities in extraction

```bash
# 1. Check entity extraction test results
npx vitest tests/entity-extraction/extraction.spec.ts

# 2. Identify failing test cases
# Look for: "Missing ORGANIZATION entities: Apple, TechCrunch, FBI"

# 3. Update entity classification
# File: app/engine/extract/entities.ts

function classifyEntity(span: string, label: string): EntityType {
  // Add ORG detection logic
  if (isOrganization(span, label)) return 'ORG'
  // ...
}

# 4. Add NER patterns (if needed)
# File: app/parser/index.ts or MockParserClient

# 5. Test specific case
npx vitest tests/entity-extraction/extraction.spec.ts -t "organization-001"
```

### Task 5: Update Documentation

```bash
# 1. Check existing docs first (avoid duplication!)
grep -r "your topic" docs/

# 2. Update relevant file
# - README.md - Project overview
# - HANDOFF.md - Session status
# - docs/ARES_PROJECT_BRIEFING.md - Latest briefing
# - INTEGRATED_TESTING_STRATEGY.md - Testing approach
# - CHANGELOG.md - Version history

# 3. Follow markdown style
# - Use ## for sections, ### for subsections
# - Include code blocks with language tags
# - Add line numbers for file references
# - Keep concise and action-oriented

# 4. Commit documentation changes separately
git add docs/
git commit -m "docs: Update architecture guide with HERT examples"
```

---

## Debugging Guide

### ⚠️ CRITICAL: When to Ask for User Help

**The user is an English language expert. When you encounter bugs involving natural language understanding, ASK FOR HELP IMMEDIATELY instead of spinning your wheels on technical debugging.**

**ALWAYS ask the user for help when:**

1. **Entity/Relation Extraction Bugs** - Entities merging incorrectly, pronouns resolving wrong, coreference issues
   - Example: "Harry Potter and Lily Potter are merging into one entity"
   - ✅ Ask: "These entities with shared surnames are merging. What's the linguistic rule for handling this?"
   - ❌ Don't: Spend hours debugging merge.ts without understanding the linguistic requirement

2. **Pattern Matching Issues** - Relations not extracting for certain sentence structures
   - Example: "The system isn't catching 'His father Arthur worked...'"
   - ✅ Ask: "In 'Ron came from a family. His father Arthur worked...', should 'His' refer to Ron? What's the rule?"
   - ❌ Don't: Try random pattern variations without understanding the grammar

3. **Ambiguous Linguistic Situations** - Any case where multiple interpretations are possible
   - Example: "Should 'Potter' alone resolve to Harry or Lily?"
   - ✅ Ask: "When a surname appears alone after both 'Harry Potter' and 'Lily Potter', which should it resolve to?"
   - ❌ Don't: Implement arbitrary rules without linguistic guidance

4. **Stuck After 30+ Minutes** - If you've spent >30 minutes on any bug without progress
   - ✅ Ask: Provide the specific example, explain what you've tried, ask for linguistic guidance
   - ❌ Don't: Continue technical debugging without checking if it's a linguistic rules problem

**How to Ask for Help:**
```markdown
I'm stuck on [specific bug]. Here's the example:

Text: "[exact sentence from test]"
Expected: [what should happen]
Actual: [what's happening]

I've tried: [technical approaches]

Question: What's the linguistic rule for [the ambiguous situation]?
```

**Real Example from Harry/Lily Potter Bug:**
- ❌ Wrong approach: Spent hours modifying merge.ts to block surname-only matches
- ✅ Right approach: "These entities share 'Potter' surname and are merging. What's the linguistic rule?"
- User's answer: "Use recency - if last Potter mentioned was Harry, 'Potter' refers to Harry"
- Result: Bug fixed in 1 hour instead of spinning for days

**Remember:** The user's linguistic expertise can solve in minutes what technical debugging can't solve in hours.

---

### Parser Issues

```bash
# Check if parser is running
curl -s http://127.0.0.1:8000/health
# Expected: {"status": "ok"}

# Start parser if not running
make parser

# Check parser logs
# Terminal 1: make parser
# Look for startup messages

# Test parser directly
curl -X POST http://127.0.0.1:8000/parse \
  -H "Content-Type: application/json" \
  -d '{"text": "Aragorn married Arwen."}'

# Check for connection errors in tests
# Error: "ECONNREFUSED 127.0.0.1:8000" → Parser not running
```

### Test Failures

```bash
# Stage 1 failing?
npm test tests/ladder/level-1-simple.spec.ts
# Check: Pattern coverage, entity types, parser running

# Stage 2 failing?
npm test tests/ladder/level-2-multisentence.spec.ts
# Check: Coreference resolution, pronoun handling, multi-sentence patterns

# Run debug runner for detailed output
npx ts-node tests/ladder/run-level-2.ts
# Look for: Missing relations, suppressed extractions, entity mismatches

# Enable verbose logging
L3_DEBUG=1 npm test tests/ladder/level-2-multisentence.spec.ts

# Check specific test
npm test tests/ladder/level-2-multisentence.spec.ts -t "2.12"
```

### Entity Extraction Issues

```bash
# Run entity extraction regression suite
npx vitest tests/entity-extraction/extraction.spec.ts

# Check specific test case
npx vitest tests/entity-extraction/extraction.spec.ts -t "basic-person-001"

# Debug entity extraction with verbose output
L3_DEBUG=1 npx vitest tests/entity-extraction/extraction.spec.ts

# Check span traces
cat tmp/span-trace.log | head -50

# Diagnose entity issues
npx ts-node scripts/diagnose-entities.ts
```

### Performance Issues

```bash
# Run performance benchmark
npx ts-node tests/integration/performance.spec.ts

# Check mega test performance
npm run test:mega
# Target: ≥100 words/sec, ~190 words/sec current

# Profile memory usage
node --inspect-brk $(which npx) ts-node your-script.ts
# Open chrome://inspect in browser

# Check for bottlenecks
L3_DEBUG=1 npx ts-node your-script.ts
# Look for slow operations in logs
```

### Build Errors

```bash
# TypeScript errors
npx tsc --noEmit
# Check: Type mismatches, missing imports

# Dependency issues
rm -rf node_modules package-lock.json
npm install

# Python dependencies
rm -rf .venv
python3 -m venv .venv
. .venv/bin/activate
pip install -r scripts/requirements.txt
```

### Git Issues

```bash
# Push fails with 403?
# Check: Branch name must start with 'claude/' and end with session ID

# Push fails with network error?
# Retry with exponential backoff: 2s, 4s, 8s, 16s

# Conflict on pull?
git fetch origin claude/claude-md-miex9940wrme9tpt-01Jd9AfTTZNzdiNeQ7jgvkmh
git rebase origin/claude/claude-md-miex9940wrme9tpt-01Jd9AfTTZNzdiNeQ7jgvkmh

# Check commit authorship before amending
git log -1 --format='%an %ae'
```

---

## Documentation Index

### Essential Reading (Start Here)

1. **README.md** - Project overview, features, quick start
2. **INTEGRATED_TESTING_STRATEGY.md** - 5-stage testing ladder, current status
3. **docs/ARES_PROJECT_BRIEFING.md** - Iteration 37 status, recent work
4. **HANDOFF.md** - Latest session summary, next steps

### Development Guides

- **docs/FOR_AGENTS.md** - Quick onboarding for AI agents (10 min read)
- **CONTRIBUTING.md** - Architecture patterns, common pitfalls
- **docs/guides/QUICK_START.md** - Installation and setup
- **docs/guides/DESKTOP_TESTER_QUICKSTART.md** - Testing guide

### Architecture Documentation

- **docs/architecture/HERT_IMPLEMENTATION.md** - HERT system technical details
- **docs/architecture/HERT_INTEGRATION_GUIDE.md** - HERT integration guide
- **docs/architecture/ENGINE_EVOLUTION_STRATEGY.md** - Architecture strategy
- **docs/architecture/MANUAL_OVERRIDE_DESIGN.md** - Manual override system

### API & Reference

- **docs/reference/WIKI_QUICKSTART.md** - Wiki API quickstart
- **ENTITY_EXTRACTION_STATUS.md** - Entity detection system (744 lines)
- **CHANGELOG.md** - Version history and changes

### Testing Documentation

- **docs/testing/TESTING_STRATEGY.md** - Testing philosophy
- **docs/testing/reports/** - Test reports (pattern coverage, guardrails, etc.)

### Specialized Agents

- **.claude/agents/ares-dev.md** - Development agent instructions
- **.claude/agents/ares-guide.md** - Guide agent for architecture questions

### Historical Context

- **docs/archive/** - Historical reports and decisions
- **LESSONS_LEARNED.md** - Key insights from past work
- **SESSION_NOTES_*.md** - Session notes and findings

---

## Quick Reference Commands

### Setup & Build

```bash
make help            # Show all commands
make install         # One-time setup
make parser          # Start spaCy parser (port 8000)
make server-graphql  # Start GraphQL server (port 4000)
make clean           # Remove generated files
```

### Testing

```bash
make test            # Run all tests
make smoke           # Quick validation
npm test tests/ladder/level-1-simple.spec.ts  # Stage 1
npm test tests/ladder/level-2-multisentence.spec.ts  # Stage 2
npm run test:mega    # Large documents
L3_DEBUG=1 npm test  # Verbose output
```

### Development

```bash
npm run dev          # Start dev server
make ui-console      # Start console UI
make ui-console-dev  # Start console dev server
make ui-review       # Start review dashboard
```

### Debugging

```bash
npx ts-node tests/ladder/run-level-2.ts  # Debug runner
npx ts-node scripts/diagnose-l2.ts       # Diagnose Level 2
npx ts-node scripts/diagnose-entities.ts # Diagnose entities
```

### Pattern Coverage

```bash
npx ts-node scripts/pattern-expansion/inventory-patterns.ts  # Coverage audit
npx tsx scripts/pattern-expansion/evaluate-coverage.ts       # Metrics
npx tsx scripts/pattern-expansion/evaluate-coverage.ts --precision_guardrails  # With guardrails
```

### Git Workflow

```bash
git checkout -b feature/your-feature
# Make changes...
git add -A
git commit -m "feat: your message"
git push -u origin claude/claude-md-miex9940wrme9tpt-01Jd9AfTTZNzdiNeQ7jgvkmh
```

---

## Critical Reminders

### Always Do

- ✅ **ASK USER FOR HELP when stuck on linguistic bugs (entity extraction, pronouns, patterns)**
- ✅ Read README.md, INTEGRATED_TESTING_STRATEGY.md, and docs/ARES_PROJECT_BRIEFING.md first
- ✅ Start parser before running tests: `make parser`
- ✅ Verify Stage 1 passes before and after changes
- ✅ Test incrementally after each change (don't batch!)
- ✅ Check existing docs before creating new ones
- ✅ Include evidence provenance for all extractions
- ✅ Use HERT IDs for entity references
- ✅ Maintain deterministic behavior (no randomness!)
- ✅ Commit message format: `feat:`, `fix:`, `docs:`, `test:`
- ✅ Push to correct branch with proper naming

### Never Do

- ❌ **Spend >30 minutes debugging linguistic issues without asking user (they're an English expert!)**
- ❌ Skip reading essential documentation
- ❌ Run tests without parser running
- ❌ Break lower stages when fixing higher stages
- ❌ Create redundant documentation
- ❌ Use entity names instead of HERT IDs
- ❌ Add randomness or non-deterministic behavior
- ❌ Push to main/master without permission
- ❌ Use `--force` on shared branches
- ❌ Skip hooks with `--no-verify`
- ❌ Modify git config

---

## Success Checklist

Before considering your work complete:

- [ ] Read essential documentation (README, INTEGRATED_TESTING_STRATEGY, BRIEFING)
- [ ] Parser is running (`make parser`)
- [ ] Stage 1 tests pass (baseline verification)
- [ ] All previously passing tests still pass
- [ ] New functionality has tests
- [ ] No redundant systems or documentation created
- [ ] Follows architecture patterns (HERT, evidence, local-first)
- [ ] Code is deterministic (no randomness)
- [ ] Documentation updated (if needed)
- [ ] Commit message is descriptive with proper prefix
- [ ] Changes committed to correct branch
- [ ] Ready to push with proper branch naming

---

## Contact & Resources

- **Repository**: https://github.com/mrfishcar/ARES
- **Issues**: https://github.com/mrfishcar/ARES/issues
- **Branch**: `claude/claude-md-miex9940wrme9tpt-01Jd9AfTTZNzdiNeQ7jgvkmh`
- **Documentation**: https://github.com/mrfishcar/ARES/tree/main/docs

---

**Last Updated**: 2025-11-25 (Iteration 37)
**Maintainers**: ARES Team
**License**: MIT

*This guide is maintained for AI assistants working on the ARES project. Keep it updated with significant architectural changes, new conventions, or workflow modifications.*
