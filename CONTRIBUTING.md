# Contributing to ARES
Friendly guide to contribute without breaking things. Last updated: 2025-11-13.

## Quick Links
- Vision: docs/VISION.md
- Status: docs/STATUS.md
- AI onboarding: docs/FOR_AGENTS.md

## Project Snapshot
- Purpose: extract entities/relations from narrative text, store locally (SQLite + HERT), generate wikis, allow manual corrections, and learn from them.
- Current phase: build manual override (70% → 100%).
- Working: extraction (87.5% recall, 97.8% precision), HERT/GraphQL/SQLite, wiki generation, deploy infra.
- Missing: manual override UI, feedback loop, reactive wiki.

## Core Patterns
- **Local-first**: everything must run offline on SQLite. No cloud dependencies for core paths.
- **HERT IDs**: stable entity references (`EID_<name>_<type>_<hash>`). Never use raw names in relations.
- **Evidence required**: each fact must include source text + location (doc, paragraph, token range).
- **Progressive enhancement**: advance through testing ladder in order (Stage1→5). Pass current stage before moving on.
- **Avoid redundancy**: reuse existing docs/strategies; update instead of adding duplicates.

## Development Workflow
### Before coding
```bash
cat docs/VISION.md
cat docs/STATUS.md
make parser  # wait for "SpaCy parser running on port 8000"
npm test tests/ladder/level-1-simple.spec.ts  # baseline
```

### While coding
```bash
git checkout -b <feature-branch>
# Make small changes + frequent tests
npm test tests/ladder/level-1-simple.spec.ts
npm test tests/ladder/level-2-multisentence.spec.ts
```
Commit with clear messages describing feature, validation, and references.

### Testing expectations
- Minimum: previously passing tests still pass (Stage 1 at least).
- Recommended: current highest stage (Stage 2 when unblocked).
- Full suite (when needed):
```bash
npm test               # unit + ladder
npm test tests/ladder/ # stage tests
npm run test:mega      # large-doc regression
```

### Debugging
```bash
npm test tests/ladder/level-2-multisentence.spec.ts
npx ts-node tests/ladder/run-level-2.ts
npx ts-node scripts/pattern-expansion/inventory-patterns.ts
npx tsx scripts/pattern-expansion/evaluate-coverage.ts
```
Always rerun Stage 1 + Stage 2 after fixes.

## Common Pitfalls
- Parser not running → start with `make parser` before tests.
- Fixing Stage 2 while breaking Stage 1 → rerun Stage 1 after every change.
- Over-aggressive filtering → prefer balanced thresholds; watch F1, not just precision/recall.
- Document-level suppression when sentence-level needed → scope filters narrowly.
- Duplicating docs → search `grep -r "topic" docs/` and update existing sources.

## Code Organization
- Core extraction: app/engine/extract/
- Storage: app/engine/storage/
- API: app/engine/api/
- UI: app/ui/console/src/
- Patterns: patterns/
- Tests: tests/ladder/ (stages), tests/mega/ (large), tests/unit/
- Docs: docs/ (+ architecture/testing/guides/archive)

## Review Checklist
- Functionality: matches vision, stays local-first, uses HERT IDs with evidence, avoids redundant systems.
- Testing: prior tests pass; new behavior covered; F1 not degraded; current stage green.
- Code quality: consistent patterns, no hardcoded values, good error handling, typed interfaces.
- Documentation: update relevant files/comments; avoid new duplicates; descriptive commits.
- Performance: no obvious slowdowns or memory issues; supports expected scale.
- Manual override readiness (when relevant): supports correction tracking and reversibility.

## Need Help?
- Vision: docs/VISION.md
- Status: docs/STATUS.md
- Testing: docs/testing/TESTING_STRATEGY.md
- Architecture: docs/architecture/
- Agents: docs/FOR_AGENTS.md

Remember: ARES aims for correctable extraction. Build with manual override in mind.
