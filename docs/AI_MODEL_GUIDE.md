# ARES AI Model Selection Guide

**Version:** 1.0
**Purpose:** Optimize AI usage by selecting the right model for each task

---

## Quick Reference: Model Selection

```
┌─────────────────────────────────────────────────────────────────┐
│                     BEFORE STARTING ANY TASK                     │
│                                                                  │
│  ASK: "What's the minimum model that can do this well?"         │
│                                                                  │
│  Simple edit/search?     → HAIKU                                │
│  Feature implementation? → SONNET                               │
│  Architecture/debugging? → OPUS                                 │
│  Code completion?        → CODEX                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Model Tier Definitions

### Tier 1: OPUS (Claude Opus / GPT-4o)
**Cost:** $$$$  |  **Use sparingly**

**USE OPUS FOR:**
- Architecture and system design decisions
- Multi-file refactoring (>5 files)
- Complex debugging that has stumped other models
- Research interpretation and strategy
- Algorithm design and optimization
- Cross-cutting concerns affecting entire codebase

**⚠️ WARNING - DO NOT USE OPUS FOR:**
- Simple bug fixes (use SONNET)
- Adding test cases (use HAIKU)
- Documentation updates (use HAIKU)
- Single-file changes (use SONNET)
- Pattern additions (use SONNET)

### Tier 2: SONNET (Claude Sonnet / GPT-4-turbo)
**Cost:** $$  |  **Default for development**

**USE SONNET FOR:**
- Feature implementation (1-3 files)
- Bug fixes and debugging
- Test writing and expansion
- Pattern library additions
- Code review
- Moderate refactoring
- Documentation rewrites

**⚠️ WARNING - UPGRADE TO OPUS IF:**
- Task requires understanding >5 files simultaneously
- You've been stuck >30 minutes
- Architectural decisions needed
- The change affects core algorithms

**⚠️ WARNING - DOWNGRADE TO HAIKU IF:**
- Simple find/replace
- Adding single test case
- Fixing typos
- Comment updates

### Tier 3: HAIKU (Claude Haiku / GPT-3.5-turbo)
**Cost:** $  |  **Use liberally for simple tasks**

**USE HAIKU FOR:**
- Simple file edits
- Adding individual test cases
- Code formatting
- Comment and docstring updates
- Boilerplate generation
- Search and grep tasks
- Typo fixes
- Simple pattern matching

**⚠️ WARNING - UPGRADE TO SONNET IF:**
- Task requires reasoning about code behavior
- Multiple related changes needed
- Implementation logic is non-trivial

### Tier 4: CODEX (GitHub Copilot / OpenAI Codex)
**Cost:** $ (subscription)  |  **Use for completions**

**USE CODEX FOR:**
- Inline code completion
- Function stub generation
- Type annotations
- Import suggestions
- Repetitive pattern completion

**⚠️ WARNING - DO NOT RELY ON CODEX FOR:**
- Business logic
- Security-sensitive code
- Algorithm implementation
- Test assertions

---

## Task-Specific Model Recommendations

### Entity Extraction Development

| Task | Model | Rationale |
|------|-------|-----------|
| Design new extraction pipeline | OPUS | Architecture |
| Add relation pattern | SONNET | Implementation |
| Add test case for existing pattern | HAIKU | Simple addition |
| Debug why entities merge incorrectly | OPUS | Complex reasoning |
| Fix off-by-one in span offset | SONNET | Bug fix |
| Add comment explaining function | HAIKU | Documentation |

### Linguistic Pattern Work

| Task | Model | Rationale |
|------|-------|-----------|
| Design coreference resolution algorithm | OPUS | Algorithm design |
| Implement pronoun resolution | SONNET | Feature work |
| Add pattern for "X, son of Y" | SONNET | Pattern work |
| Add test case for appositive | HAIKU | Test addition |
| Understand why test 3.5 fails | OPUS → User | Ask user if linguistic |

### Documentation Work

| Task | Model | Rationale |
|------|-------|-----------|
| Restructure documentation strategy | OPUS | Strategic |
| Update HANDOFF.md with session notes | HAIKU | Simple update |
| Write new architecture doc | SONNET | Content creation |
| Fix typo in README | HAIKU | Simple edit |
| Create comprehensive guide | SONNET | Documentation |

### Testing Work

| Task | Model | Rationale |
|------|-------|-----------|
| Design new testing stage | OPUS | Architecture |
| Implement stage runner | SONNET | Implementation |
| Add 10 new test cases | HAIKU | Repetitive addition |
| Debug why tests are flaky | SONNET | Debugging |
| Refactor test infrastructure | OPUS | Multi-file refactor |

---

## Warning System for AI Agents

### CLAUDE.md Integration

Add this to your system prompt or CLAUDE.md:

```markdown
## Model Self-Check

Before proceeding with any task, evaluate:

1. **COMPLEXITY CHECK:**
   - Is this a simple edit? → Consider HAIKU
   - Does this need implementation? → SONNET is appropriate
   - Does this affect architecture? → Escalate to OPUS

2. **FILE COUNT CHECK:**
   - 1 file → HAIKU or SONNET
   - 2-5 files → SONNET
   - >5 files → OPUS

3. **TIME CHECK:**
   - Should take <5 min → HAIKU
   - Should take 5-30 min → SONNET
   - Complex/uncertain → OPUS

4. **STUCK CHECK:**
   - If stuck >30 minutes on debugging, STOP
   - Ask user if this is a linguistic issue
   - Escalate to OPUS or request human guidance
```

### Warning Messages to Emit

When a model detects it may not be optimal for a task, it should emit:

**For OPUS handling simple tasks:**
```
⚠️ MODEL EFFICIENCY WARNING: This task appears simple enough for SONNET or HAIKU.
Consider using a lighter model to conserve resources.
Task type: [simple edit / test addition / documentation fix]
Recommended model: [HAIKU / SONNET]
```

**For HAIKU/SONNET handling complex tasks:**
```
⚠️ MODEL CAPABILITY WARNING: This task may require more capable reasoning.
Consider escalating to a higher-tier model.
Task type: [architecture / multi-file refactor / complex debugging]
Recommended model: OPUS
Reason: [requires >5 files / architectural decision / stuck >30min]
```

**For any model handling linguistic issues:**
```
⚠️ LINGUISTIC EXPERTISE WARNING: This task involves natural language understanding.
The user is an English language expert.
STOP debugging code and ASK THE USER for linguistic guidance.
Question template: "What's the linguistic rule for [specific ambiguity]?"
```

---

## Cost Optimization Guidelines

### Daily Usage Targets

For a typical development session:
- OPUS: 0-2 calls (only for architecture/complex issues)
- SONNET: 5-15 calls (main development work)
- HAIKU: 10-50 calls (simple tasks, searches)
- CODEX: As needed (inline completions)

### Batch Similar Tasks

Instead of:
```
SONNET: "Add test case for parent_of"
SONNET: "Add test case for child_of"
SONNET: "Add test case for married_to"
```

Do:
```
HAIKU: "Add test cases for parent_of, child_of, and married_to relations"
```

### Minimize Context for Simple Tasks

Instead of:
```
[Load entire CLAUDE.md + VISION.md + HANDOFF.md]
"Fix typo on line 42 of README.md"
```

Do:
```
[Load only README.md]
"Fix typo on line 42"
```

---

## Implementation Checklist

To enable model warnings in ARES development:

- [ ] Add MODEL_SELF_CHECK section to CLAUDE.md
- [ ] Add model recommendation to task templates
- [ ] Configure IDE/agent to suggest appropriate models
- [ ] Track model usage for cost analysis
- [ ] Review weekly: were expensive models used appropriately?

---

## Summary Decision Tree

```
START
  │
  ├─> Is this a simple edit/search?
  │     YES → HAIKU
  │     NO ↓
  │
  ├─> Does this require implementation?
  │     YES → SONNET (default)
  │     NO ↓
  │
  ├─> Does this involve architecture or >5 files?
  │     YES → OPUS
  │     NO ↓
  │
  ├─> Is this inline code completion?
  │     YES → CODEX
  │     NO ↓
  │
  └─> Default: SONNET
```

---

**Document maintained by:** ARES Team
**Last updated:** 2025-12-05
