---
archived: true
archived_date: 2025-11-13
replaced_by: /docs/testing/TESTING_STRATEGY.md
reason: Dual-ladder approach superseded by integrated single-ladder in TESTING_STRATEGY.md
original_date: 2025-11-10
---

# ARES Unified Testing Strategy

**Last Updated**: 2025-11-10
**Status**: Consolidates Progressive Levels + Diagnostic Rungs into one workflow

---

## Overview

ARES uses a **dual-ladder testing approach**:

1. **Quality Levels (1-5)**: Progressive difficulty gates that test end-to-end extraction
2. **Diagnostic Rungs (1-5)**: Pipeline component analysis to identify bottlenecks

**Key Principle**: Use **Levels** as gates, **Rungs** as diagnostics when gates fail.

---

## The Unified Testing Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  LEVEL 1: Simple Sentences (P≥90%, R≥85%, F1≥87%)          │
│  Test: tests/ladder/level-1-simple.spec.ts                  │
└─────────────────────────────────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │   PASS?     │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │ YES                    NO │
              ▼                          ▼
    ┌─────────────────┐      ┌────────────────────────┐
    │ Proceed to      │      │ Run Diagnostic Rungs:  │
    │ Level 2         │      │ 1. Pattern Coverage    │
    └─────────────────┘      │ 2. Synthetic Baseline  │
                             │ 3. Precision Controls  │
                             │ 4. Entity Quality      │
                             │                        │
                             │ Identify root cause    │
                             │ Fix blocking issue     │
                             │ Retry Level 1          │
                             └────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  LEVEL 2: Multi-Sentence (P≥85%, R≥80%, F1≥82%)            │
│  Test: tests/ladder/level-2-multisentence.spec.ts           │
└─────────────────────────────────────────────────────────────┘
                           │
                    [Same gate pattern]
                           │
                           ▼

┌─────────────────────────────────────────────────────────────┐
│  LEVEL 3: Complex Multi-Paragraph (P≥80%, R≥75%, F1≥77%)   │
│  Test: tests/ladder/level-3-complex.spec.ts                 │
└─────────────────────────────────────────────────────────────┘
                           │
                    [Same gate pattern]
                           │
                           ▼

┌─────────────────────────────────────────────────────────────┐
│  LEVEL 4: Mega Regression (Large Narratives ~1000 words)    │
│  Test: tests/mega/mega-regression.spec.ts                   │
└─────────────────────────────────────────────────────────────┘
                           │
                    [Same gate pattern]
                           │
                           ▼

┌─────────────────────────────────────────────────────────────┐
│  LEVEL 5: Production Readiness (All Families Validated)     │
│  Test: Canary corpus evaluation                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Quality Levels: Progressive Difficulty Gates

### Level 1: Simple Sentences ✅ PASSED
**Target**: P≥90%, R≥85%, F1≥87%
**Status**: ✅ PASSED (90% precision achieved)

**Test Cases**: 20 simple sentences
- File: `tests/ladder/level-1-simple.spec.ts`
- Runner: `tests/ladder/run-level-1.ts`

**Example**:
```typescript
{
  text: 'Aragorn, son of Arathorn, married Arwen.',
  gold: {
    entities: ['Aragorn:PERSON', 'Arathorn:PERSON', 'Arwen:PERSON'],
    relations: [
      'Aragorn --[child_of]--> Arathorn',
      'Aragorn --[married_to]--> Arwen'
    ]
  }
}
```

**Run**:
```bash
npm test tests/ladder/level-1-simple.spec.ts
npx ts-node tests/ladder/run-level-1.ts  # Debug
```

---

### Level 2: Multi-Sentence Narratives ⚠️ IN PROGRESS
**Target**: P≥85%, R≥80%, F1≥82%
**Current**: P=84.4%, R=80%, F1=82% (gap: 0.6% precision)

**Test Cases**: 15 multi-sentence narratives
- File: `tests/ladder/level-2-multisentence.spec.ts`
- Runner: `tests/ladder/run-level-2.ts`

**Challenges**:
- Pronoun resolution ("He" → "Harry")
- Title back-links ("the wizard" → "Dumbledore")
- Coordination ("Harry and Ron")
- Cross-sentence coreference

**Blocker**: Test 2.12 - Appositive parsing issue
- Text: "Aragorn, son of Arathorn, traveled to Gondor"
- Issue: Extracts "Arathorn traveled_to Gondor" instead of "Aragorn traveled_to Gondor"

**Run**:
```bash
npm test tests/ladder/level-2-multisentence.spec.ts
npx ts-node tests/ladder/run-level-2.ts  # Debug
```

---

### Level 3: Complex Multi-Paragraph ⚠️ NOT STARTED
**Target**: P≥80%, R≥75%, F1≥77%
**Current**: ~69% (gap: 11%)

**Test Cases**: Complex multi-paragraph narratives
- File: `tests/ladder/level-3-complex.spec.ts`

**Challenges**:
- Multiple generations (grandparents, parents, children)
- Organizational memberships (Houses, groups)
- Temporal sequences
- Long-distance pronoun resolution

**Run**:
```bash
npm test tests/ladder/level-3-complex.spec.ts
```

---

### Level 4: Mega Regression (Large Narratives) ⏸️ FUTURE
**Target**: P≥75%, R≥70%, F1≥72%

**Test Cases**: ~1000 word realistic narratives
- File: `tests/mega/mega-regression.spec.ts`
- Recent result: P=60%, R=35.3%, F1=44.6%

**Run**:
```bash
npm run test:mega
MEGA_ENFORCE=1 npm run test:mega  # With target enforcement
```

---

### Level 5: Production Readiness ⏸️ FUTURE
**Target**: P≥75%, R≥65%, F1≥69%

**Test**: Canary corpus evaluation (real-world examples)
- File: `corpora/canary_realtext.jsonl` (103 test cases)
- Current: P=16.7%, R=2.0%, F1=3.6%

**Run**:
```bash
npx tsx scripts/pattern-expansion/evaluate-coverage.ts \
  --canary corpora/canary_realtext.jsonl \
  --precision_guardrails \
  --emit_heartbeat reports/heartbeat_canary.json
```

---

## Diagnostic Rungs: Component Analysis

Use these **only when a Level gate fails** to identify the root cause.

### Rung 1: Pattern Coverage Audit ✅ COMPLETED
**Purpose**: Quantify how many patterns are integrated vs. available

**Current Result**:
- Integrated: 480 patterns (443 dependency + 37 surface)
- Available: 476 generated patterns
- **Coverage: 26%**
- **Missing: 351 patterns (74%)**

**Top Gaps**:
1. NEGATION - 31 patterns (0%) - EXCLUDED
2. LOCATION - 28 patterns (18%)
3. PART_WHOLE - 28 patterns (10%)
4. CREATION - 27 patterns (25%)
5. EMPLOYMENT - 26 patterns (16%)

**Run**:
```bash
npx ts-node scripts/pattern-expansion/inventory-patterns.ts
npx ts-node scripts/pattern-expansion/audit-integration.ts
```

**Output**: `reports/rung1_pattern_coverage_summary.md`

---

### Rung 2: Synthetic Baseline Evaluation ✅ COMPLETED
**Purpose**: Establish baseline metrics on 300 synthetic test cases

**Current Result**:
- Precision: 7.1%
- Recall: 3.1%
- F1: 4.3%
- **14/15 families have 0% extraction**

**Key Finding**: Low coverage (Rung 1) → No extraction (Rung 2)

**Run**:
```bash
npx tsx scripts/pattern-expansion/evaluate-coverage.ts
```

**Output**: `reports/heartbeat_rung2_baseline.json`

---

### Rung 3: Precision Controls ✅ COMPLETED
**Purpose**: Test if precision guardrails improve metrics

**Current Result**:
- Precision: 8.6% (+1.5pp vs Rung 2)
- Recall: 3.1% (unchanged)
- F1: 4.5% (+0.2pp)

**Guardrails Applied**:
1. Dependency path ≤ 4 hops
2. Entity type filters (Location → GPE/LOC/FAC, etc.)
3. Keyword requirements (part-whole relations)

**Key Finding**: Marginal improvement only, pattern coverage still bottleneck

**Run**:
```bash
# (Precision guardrails enabled by default in evaluate-coverage.ts)
npx tsx scripts/pattern-expansion/evaluate-coverage.ts --precision_guardrails
```

**Output**: `reports/heartbeat_rung3_guardrails.json`

---

### Rung 4: Entity Quality Pass ✅ COMPLETED
**Purpose**: Test if entity type projection improves metrics

**Current Result**:
- Precision: 8.6% (unchanged vs Rung 3)
- Recall: 3.1% (unchanged)
- F1: 4.5% (unchanged)

**Entity Pass Features**:
- Type projection: UNKNOWN → PERSON/ORG/LOC
- Better entity typing for downstream guardrails

**Key Finding**: No measurable impact because 14/15 families have 0% extraction

**Run**:
```bash
ARES_ENTITY_PASS=on npx tsx scripts/pattern-expansion/evaluate-coverage.ts --precision_guardrails
```

**Output**: `reports/heartbeat_rung4_entity_pass.json`

---

### Rung 5: Canary Evaluation (Proposed) ⏸️ DEFERRED
**Purpose**: Expand canary corpus and evaluate on real-world examples

**Status**: Deferred until pattern coverage improves
**Current Canary**: 103 lines
**Recommendation**: Run after pattern integration (50%+ coverage)

---

## When to Use Each Test

### Daily Development Workflow
```bash
# 1. Work on feature/fix
# 2. Run appropriate level test
npm test tests/ladder/level-1-simple.spec.ts

# 3. If test fails, run diagnostics
npx ts-node scripts/pattern-expansion/inventory-patterns.ts  # Check patterns
npx tsx scripts/pattern-expansion/evaluate-coverage.ts       # Check metrics

# 4. Fix issue and retry
```

### Full Testing Cycle
```bash
# Run all levels in sequence
npm test tests/ladder/level-1-simple.spec.ts
npm test tests/ladder/level-2-multisentence.spec.ts
npm test tests/ladder/level-3-complex.spec.ts
npm run test:mega

# If any level fails, run full diagnostic suite
npx ts-node scripts/pattern-expansion/inventory-patterns.ts
npx tsx scripts/pattern-expansion/evaluate-coverage.ts --precision_guardrails
ARES_ENTITY_PASS=on npx tsx scripts/pattern-expansion/evaluate-coverage.ts --precision_guardrails
```

### Pre-Commit Checks
```bash
# Minimum: Pass Level 1
npm test tests/ladder/level-1-simple.spec.ts

# Recommended: Pass current highest level (Level 2)
npm test tests/ladder/level-2-multisentence.spec.ts
```

---

## Current Status Summary

| Test Type | Status | Metrics | Next Action |
|-----------|--------|---------|-------------|
| **Level 1** | ✅ PASS | P=90%, R≥85% | Maintain |
| **Level 2** | ⚠️ 99% | P=84.4%, need 85% | Fix test 2.12 appositive issue |
| **Level 3** | ⏸️ Not Started | ~69%, need 77% | Complete Level 2 first |
| **Level 4** | ⏸️ Not Started | P=60%, R=35% | Complete Level 3 first |
| **Level 5** | ⏸️ Not Started | P=16.7%, R=2% | Complete Level 4 first |
| **Rung 1** | ✅ COMPLETE | 26% coverage | Integrate 45 patterns |
| **Rung 2** | ✅ COMPLETE | F1=4.3% | Re-run after pattern integration |
| **Rung 3** | ✅ COMPLETE | F1=4.5% | Guardrails working |
| **Rung 4** | ✅ COMPLETE | F1=4.5% | Entity Pass working |
| **Rung 5** | ⏸️ DEFERRED | - | Run after 50%+ pattern coverage |

---

## Critical Findings from Diagnostics

### Root Cause: Pattern Coverage (26%)

All diagnostic rungs converge on the same bottleneck:

| Rung | Finding | Implication |
|------|---------|-------------|
| R1 | 26% pattern coverage, 351 missing | Not enough patterns |
| R2 | 14/15 families = 0% extraction | Missing patterns = no extraction |
| R3 | +1.5pp from guardrails | Quality helps marginally |
| R4 | 0pp from entity typing | Can't fix missing patterns |

**Mathematical Reality**:
```
Extraction = Patterns × Quality
When Patterns = 0 → Quality improvements have zero impact
```

### Recommended Fix Strategy

**Phase 1: Quick Wins** (28 patterns)
- Location: +10 patterns (→ 45% coverage)
- Part_whole: +10 patterns (→ 40% coverage)
- Employment: +8 patterns (→ 40% coverage)

**Phase 2: Zero-Extraction Families** (17 patterns)
- Ownership: +10 patterns (→ 20% coverage)
- Communication: +7 patterns (→ 15% coverage)

**Phase 3: Re-evaluate**
- Run Rung 2 again
- Expected: F1 from 4.3% → 20-25%
- If targets met → Proceed to Rung 5

---

## File Structure

### Level Tests
```
tests/ladder/
├── level-1-simple.spec.ts           # 20 simple sentences
├── level-2-multisentence.spec.ts    # 15 multi-sentence narratives
├── level-3-complex.spec.ts          # Complex multi-paragraph
├── run-level-1.ts                   # Debug runner
├── run-level-2.ts                   # Debug runner
└── README.md                        # Level philosophy

tests/mega/
└── mega-regression.spec.ts          # ~1000 word narratives

corpora/
└── canary_realtext.jsonl            # 103 real-world test cases
```

### Diagnostic Reports
```
reports/
├── rung1_pattern_coverage_summary.md      # Pattern audit
├── rung3_precision_guardrails_summary.md  # Guardrails analysis
├── rung4_entity_pass_summary.md           # Entity quality analysis
├── TESTING_LADDER_COMPLETE_SUMMARY.md     # Full rung results
├── heartbeat_rung2_baseline.json          # Baseline metrics
├── heartbeat_rung3_guardrails.json        # Guardrails metrics
├── heartbeat_rung4_entity_pass.json       # Entity pass metrics
├── relation_coverage.json                 # Relation extraction coverage
├── uncovered_phrases.json                 # Missing pattern coverage
└── top_fn_fp.json                         # Top errors
```

### Documentation
```
TEST_LADDER_STRATEGY.md           # Original level strategy (SUPERSEDED)
TESTING_LADDER_COMPLETE_SUMMARY.md # Original rung results (SUPERSEDED)
UNIFIED_TESTING_STRATEGY.md       # THIS FILE - Single source of truth
```

---

## Deprecation Notice

**IMPORTANT**: The following files are **superseded** by this unified strategy:

- ~~`TEST_LADDER_STRATEGY.md`~~ → Use `UNIFIED_TESTING_STRATEGY.md`
- ~~`reports/TESTING_LADDER_COMPLETE_SUMMARY.md`~~ → Historical record, refer to unified strategy for current approach

Keep the old files for historical reference, but **this document is now the single source of truth** for testing strategy.

---

## Quick Reference Commands

### Run Level Tests
```bash
npm test tests/ladder/level-1-simple.spec.ts
npm test tests/ladder/level-2-multisentence.spec.ts
npm test tests/ladder/level-3-complex.spec.ts
npm run test:mega
```

### Run Diagnostic Rungs
```bash
# Rung 1: Pattern coverage
npx ts-node scripts/pattern-expansion/inventory-patterns.ts
npx ts-node scripts/pattern-expansion/audit-integration.ts

# Rung 2: Baseline evaluation
npx tsx scripts/pattern-expansion/evaluate-coverage.ts

# Rung 3: With precision guardrails
npx tsx scripts/pattern-expansion/evaluate-coverage.ts --precision_guardrails

# Rung 4: With entity pass
ARES_ENTITY_PASS=on npx tsx scripts/pattern-expansion/evaluate-coverage.ts --precision_guardrails

# Rung 5: Canary evaluation
npx tsx scripts/pattern-expansion/evaluate-coverage.ts \
  --canary corpora/canary_realtext.jsonl \
  --precision_guardrails \
  --emit_heartbeat reports/heartbeat_canary.json
```

### Debug Runners
```bash
npx ts-node tests/ladder/run-level-1.ts
npx ts-node tests/ladder/run-level-2.ts
npx ts-node tests/ladder/test-2.12-only.ts  # Isolate specific test
```

---

## Summary

**Two ladders, one workflow:**

1. **Levels** = Quality gates (progressive difficulty)
2. **Rungs** = Diagnostics (identify blockers)

**Use them together:**
- Run Level tests to check quality
- Run Rung diagnostics when Level tests fail
- Fix identified issues
- Retry Level tests

**Current Priority:**
1. ✅ Level 1 passed
2. ⚠️ Level 2 blocked on test 2.12 (appositive parsing)
3. 🔧 Rungs 1-4 show pattern coverage (26%) is the bottleneck
4. 📋 Next: Integrate 45 high-value patterns → Re-run Rung 2

---

**Remember**: This unified strategy ensures neither testing approach is forgotten. Always refer to this document for the complete testing workflow.
