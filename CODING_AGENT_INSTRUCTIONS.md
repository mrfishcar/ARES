# ARES Coding Agent Instructions
- Date: 2025-11-11
- Task: Fix Stage 2 recall gap by adding proximity-window filtering
- Priority: High; Stage 2 precision passing, recall failing
- Estimated Time: 2-3 hours

---

## Setup
- Pull latest main branch and install deps:
  ```bash
  cd /path/to/ARES
  git checkout main
  git pull origin main
  git log --oneline -3
  npm install
  ```
- Start spaCy parser (required):
  ```bash
  make parser
  # Wait for "SpaCy parser running on port 8000"
  ```

## Status
- Working: Stage 1 passing; Stage 2 precision 86.7% (target 85%); infrastructure and 451/514 tests passing.
- Broken: Stage 2 recall 71.1% (target 80%); Stage 2 F1 ~78% (target 82%); cause is over-aggressive document-level filtering.
- Metrics:
  | Metric | Current | Target | Gap | Status |
  |--------|---------|--------|-----|--------|
  | Stage 2 Precision | 86.7% | 85% | +1.7% | ✅ |
  | Stage 2 Recall | 71.1% | 80% | -8.9% | ❌ |
  | Stage 2 F1 | ~78% | 82% | -4% | ❌ |

## Required Reading (15 min)
- `ARES_PROGRESS_SUMMARY.md`: executive summary, status, recommended solution.
- `ares-status-report.md`: root cause, precision/recall tradeoff, over-filtering example.
- `ares-improvement-plan.md`: Option A proximity-window details, expected impact, testing.

## Goal
- Replace document-level married_to suppression with ±2 sentence proximity filtering to improve recall while keeping precision ≥83%.

## Implementation
- Key file: `app/engine/extract/orchestrator.ts` (~lines 560-630).
- Add helper before filtering sections:
  ```typescript
  function hasMarriedToInProximity(
    rel: Relation,
    marriedToRelations: Set<string>,
    marriedToSentences: Map<string, Set<number>>,
    proximityWindow: number = 2
  ): boolean {
    const key = `${rel.subj}:${rel.obj}`;
    if (!marriedToRelations.has(key)) return false;
    const relationSentences = new Set(rel.evidence.map(e => e.sentence_index));
    const marriedSentences = marriedToSentences.get(key);
    if (!marriedSentences) return false;
    for (const sentIdx of relationSentences) {
      for (let offset = -proximityWindow; offset <= proximityWindow; offset++) {
        if (marriedSentences.has(sentIdx + offset)) return true;
      }
    }
    return false;
  }
  ```
- Replace document-level filtering with proximity checks:
  ```typescript
  const filteredCorefRelations = corefRelations.filter(rel => {
    if ((rel.pred === 'parent_of' || rel.pred === 'child_of') &&
        hasMarriedToInProximity(rel, marriedToRelations, marriedToSentences, 2)) {
      const subj = allEntities.find(e => e.id === rel.subj);
      const obj = allEntities.find(e => e.id === rel.obj);
      console.log(`[COREF-FILTER] Suppressing ${rel.pred}: ${subj?.canonical} -> ${obj?.canonical} (married_to in proximity)`);
      return false;
    }
    return true;
  });

  const filteredNarrativeRelations = narrativeRelations.filter(rel => {
    if ((rel.pred === 'parent_of' || rel.pred === 'child_of') &&
        hasMarriedToInProximity(rel, marriedToRelations, marriedToSentences, 2)) {
      const subj = allEntities.find(e => e.id === rel.subj);
      const obj = allEntities.find(e => e.id === rel.obj);
      console.log(`[NARRATIVE-FILTER] Suppressing ${rel.pred}: ${subj?.canonical} -> ${obj?.canonical} (married_to in proximity)`);
      return false;
    }
    return true;
  });
  ```
- Compile check: `npx tsc --noEmit`.

## Testing
- Smoke: `npm test tests/ladder/level-2-multisentence.spec.ts`; expect precision ~85-86%, recall ~78-79%.
- Full: `make test`; expect ≥451 passing, ≤16 failing.
- Optional diagnostics: `npx ts-node tests/ladder/run-level-2.ts` for detailed metrics.

## Success Criteria
- Minimum: compiles; recall ≥75%; precision ≥83%; no new failures.
- Target: recall ≥78%; precision ≥85%; F1 ≥81%; Stage 2 test passes.
- Stretch: recall ≥80%; precision ≥85%; F1 ≥82%; Stage 2 fully passes.

## Troubleshooting
- If recall not improving: verify `marriedToSentences`, evidence sentence indices, or try window=3 with debug logs.
- If precision drops: reduce window to 1.
- Common TS fixes: add missing imports; ensure `sentence_index` exists; ensure `marriedToSentences` type is `Map<string, Set<number>>`.

## Commit/Push
- Branch: `git checkout -b claude/fix-stage2-recall-proximity-filter-[SESSION_ID]`.
- Stage file: `git add app/engine/extract/orchestrator.ts`.
- Commit template (fill metrics/results):
  ```bash
  git commit -m "fix: implement proximity-window filtering for Stage 2 recall improvement

Changed from document-level to proximity-based filtering (±2 sentences) for
parent_of/child_of conflicts with married_to relations.

Previous filtering was too aggressive, suppressing valid family relations in
distant contexts. New approach only suppresses conflicts when married_to
appears within ±2 sentences of the parent/child relation.

Implementation:
- Added hasMarriedToInProximity() helper function
- Updated coref relations filtering to use proximity check
- Updated narrative relations filtering to use proximity check
- Maintains main relations confidence-based filtering

Results:
- Stage 2 Recall: [OLD]% → [NEW]% (+[DELTA]%)
- Stage 2 Precision: [OLD]% → [NEW]%
- Stage 2 F1: [OLD]% → [NEW]%

Fixes Stage 2 recall gap while preserving precision improvements.
Test results: [PASS/FAIL]"
  ```
- Push: `git push -u origin claude/fix-stage2-recall-proximity-filter-[SESSION_ID]`.
