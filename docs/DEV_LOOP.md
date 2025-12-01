# ARES Development Loop
Purpose: step-by-step workflow for developers/AI assistants on entity extraction. Last updated: 2025-11-17.

## Quick Start
1) Clone/install:
```bash
cd /Users/corygilford/ares
npm install
```
2) Verify tests: `npx vitest run tests/ladder/level-1-simple.spec.ts`
3) Read ground truths: `cat docs/GROUND_TRUTHS.md`

## Cycle
Identify → Analyze → Implement → Test → Mirror → Verify → Document (repeat as needed).

## Step 1: Identify Issue/Feature
- Run and inspect tests:
```bash
npx vitest run tests/ladder/level-1-simple.spec.ts > /tmp/test_results.log 2>&1
tail -50 /tmp/test_results.log | grep -A10 "LEVEL 1 RESULTS"
grep "❌" /tmp/test_results.log
```
- Typical failures: low entity precision/recall or relation precision/recall.
- For features, consult plan: `cat docs/ENTITY_EXTRACTION_MASTER_PLAN.md | grep -A20 "Phase <N>"` and note success criteria/tests.

## Step 2: Analyze Root Cause
- Use template `/tmp/issue_analysis.md` to capture problem, metrics, affected tests, hypotheses, evidence (file:line, logs), and proposed solution.
- Investigation helpers:
```bash
grep -rn "extractEntities" app/engine/extract/
grep -rn "extractRelations" app/engine/extract/
grep -rn "parent_of\|child_of" app/engine/extract/relations.ts
grep -A30 "test 1.19" tests/ladder/level-1-simple.spec.ts
cat docs/GROUND_TRUTHS.md | grep -A20 "Test 1.19"
```
- Minimal reproduction (`/tmp/test_reproduction.ts`):
```typescript
import { extractFromSegments } from './app/engine/extract/orchestrator';
async function test() {
  const text = "Eowyn fought in the Battle of Pelennor Fields.";
  const result = await extractFromSegments("test", text);
  console.log("Entities:", result.entities.map(e => `${e.type}::${e.canonical}`));
  console.log("Relations:", result.relations.map(r => `${r.pred}`));
}
test();
```
Run with `npx ts-node /tmp/test_reproduction.ts`.

## Step 3: Make Changes
- Core files: app/engine/extract/* for orchestrator, entities, relations, clause detector, patterns.
- Follow plan from analysis; keep changes small and well-commented.

## Step 4: Test
- Primary suites: `npx vitest run tests/ladder/level-1-simple.spec.ts`, `.../level-2-multisentence.spec.ts`, `.../level-3-complex.spec.ts`.
- Capture logs; compare against targets per phase.

## Step 5: Mirror & Verify
- Align with golden truths and metrics; rerun affected tests until clean.

## Step 6: Document
- Update relevant docs/notes with fixes, metrics, and remaining gaps.
