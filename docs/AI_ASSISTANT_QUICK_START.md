# AI Assistant Quick Start Guide
Purpose: minimal onboarding for AI assistants working on ARES.

## Status
- Phase 1: complete (100/100)
- Phase 2: in progress (coordination splitting)
- Level 1 tests: 20/20 ✅
- Level 2 tests: in progress (compound sentences)
- Level 1 metrics: Entities 92.5% P/R; Relations 100% P/R

## Read First
1. GROUND_TRUTHS.md – expected outputs
2. DEV_LOOP.md – workflow and testing
3. ENTITY_EXTRACTION_MASTER_PLAN.md – 9-phase roadmap
4. AI_ASSISTANT_PHASE2_START.md – current implementation guide
5. CLAUSE_DETECTOR_GUIDE.md – clause detection
6. PHASE1_COMPLETE.md – Phase 1 summary
7. MERGE_FIX_COMPLETE.md – merge improvements
- Archives: archive/CODEX_IMMEDIATE_FIX.md, archive/CODEX_RELATIONS_TASK.md

## Workflow
1. Check phase: `grep -A10 "Phase 2" docs/ENTITY_EXTRACTION_MASTER_PLAN.md`
2. Check tests: `npx vitest run tests/ladder/level-1-simple.spec.ts > /tmp/latest_test.log 2>&1; tail -30 /tmp/latest_test.log | grep -A10 "LEVEL 1 RESULTS"`
3. Review ground truths: `head -100 docs/GROUND_TRUTHS.md`
4. Skim dev loop: `head -100 docs/DEV_LOOP.md` (cycle, workflows, tests, debugging)
5. Follow current guide: `cat docs/AI_ASSISTANT_PHASE2_START.md`
6. Use `/tmp/ares_work` for scratch: `mkdir -p /tmp/ares_work`

## Paths
- Source: app/engine/extract/{entities.ts,relations.ts,orchestrator.ts,clause-detector.ts}
- Tests: tests/ladder/level-1-simple.spec.ts, level-2-multisentence.spec.ts, level-3-complex.spec.ts
- Docs: docs/ (archives in docs/archive/)
- Temp workspace: /tmp/
