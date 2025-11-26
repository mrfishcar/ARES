# Phase Three Testing Status Update (for ChatGPT)

## Context
- Remote sync: Unable to pull latest from `main` because no Git remote is configured in this environment. Current branch: `work`.
- Scope: Summarizes latest documentation on the testing ladder, current position on Phase/Stage 3, and where Claude's prior work left the team.

## Latest Testing Ladder Position
- Stages 1 & 2 are documented as **passing** after the precision defense rollout (entity filter, relation deduplication, confidence thresholding).
- Stage 3 (complex multi-paragraph narratives) remains **failing** and is considered at a **fundamental limit** for the current rule-based approach.
- Test coverage and commands are stable; guardrails improve precision on earlier levels but reduce Stage 3 precision.

## Claude's Latest Documented Status
- Current ladder snapshot: Stage 1 passing; Stage 2 initially blocked on test 2.12 appositive parsing; Stage 3-5 not yet started. Claude's Iteration 37 notes highlight partial name variant matching and pronoun filtering as recent work.
- Architectural takeaway: high-level extraction pipeline unchanged; improvements targeted alias/coreference quality and precision guardrails.

## Stage/Phase Three Findings
- Metrics: Stage 3 sits around 56–61% precision (target 80%) and ~65.9% entity recall / 20% relation precision in architectural analysis—far below the gate.
- Root cause hypothesis: segmentation and context loss—relations are extracted per paragraph-sized segment with only ±200 char context, so cross-paragraph relations and deep coreference chains are missed.
- Experiments tried: enabling 103 dynamic patterns, lowering confidence thresholds, and removing guardrails—all failed to move precision toward the target.

## Recommended Next Actions
1. **Validate segmentation impact** using the Stage 3 debug flow (`DEBUG_DEP=1 npm test tests/ladder/level-3-complex.spec.ts`) to confirm context windows and segment counts.
2. **Option A (quick win):** expand relation-extraction context windows (e.g., ±500–1000 chars) to see if recall/precision improves without major refactors.
3. **Option B (targeted for Stage 3):** add a global extraction mode that processes the whole document as one segment; run Stage 3 again to measure relation lift.
4. **If still short:** consider two-pass global extraction or post-segment stitching to link cross-paragraph relations and coreference chains.
5. Keep guardrails enabled for Stages 1–2; Stage 3 tuning should be isolated to avoid regressing earlier levels.

## New Controls Implemented for Phase 3 Experiments
- `ARES_SEGMENT_CONTEXT_WINDOW` / `ARES_RELATION_CONTEXT_WINDOW` / `ARES_COREF_RELATION_CONTEXT_WINDOW` let you widen segment and relation windows without code changes (defaults remain 200/200/1000 to keep Stage 1–2 guardrails stable).
- `ARES_GLOBAL_RELATIONS=1` (or `true`) enables an additional global relation-extraction pass across the full document using all spans + coref links, aimed at catching cross-paragraph relations without loosening lower-stage defenses.

## Latest Experiment Notes (current session)
- Baseline (no env overrides): Stages 1–3 green; Stage 3 still constrained by short default windows but passes the ladder fixture.
- Mild + aggressive window bumps (400/400/1200 and 800/800/1600) both kept Stages 1–3 green, giving more headroom for cross-paragraph evidence without obvious runtime impact.
- Global pass refinements:
  - Now gated to long/multi-paragraph docs (>=5 segments, >600 chars, or contains paragraph breaks) to keep Stage 1–2 safe even if `ARES_GLOBAL_RELATIONS=1` is set.
  - Global relations are filtered to only add high-confidence triples not already found in segment/coref/narrative passes and now use a tight allowlist (family, membership, location, school/teaching, leadership, and part_of) with type guards.
  - With `ARES_GLOBAL_RELATIONS=1` plus aggressive windows, all three ladder levels stay green and Stage 3 sees improved cross-paragraph coverage.

### Recommended configurations
- **Default / safety:** keep env vars unset (200/200/1000 windows, global pass off). All stages green.
- **Stage 3 tuning:** `ARES_SEGMENT_CONTEXT_WINDOW=800`, `ARES_RELATION_CONTEXT_WINDOW=800`, `ARES_COREF_RELATION_CONTEXT_WINDOW=1600`, `ARES_GLOBAL_RELATIONS=1`. This widens context and adds the global sweep only for long narratives, improving cross-paragraph relations while protecting lower stages.
