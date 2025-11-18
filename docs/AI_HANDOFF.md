# AI Handoff Document

**Status**: IN PROGRESS
**Updated**: 2025-11-17 13:20 PM
**Iteration**: 1

## Current Task
Phase 3 – Level 3 relation coverage (family residences, friendships, title-based teachers)

## Context
- Passive voice + coordination fixes are in place (Level 2 ✅ 90% / 90%)
- Level 3 relations still low (65.7% precision / 63.3% recall)
- Missing relations concentrated in tests 3.5–3.9:
  1. **3.5** – `Molly Weasley` entity filtered out → no `lives_in` / `married_to`
  2. **3.6–3.7** – Descriptive pronouns (“the eccentric girl”, “They”) don’t resolve to named friends
  3. **3.8** – Marriage/parent relations exist but alias duplication (`Hermione` vs `Hermione Granger`) causes extra entities
  4. **3.9** – Title-based names (“Professor McGonagall/Snape”) filtered, so `teaches_at`/`leads` never emitted

## Instructions for Codex
1. **Entity retention**
   - Investigate `normalizeLocal` / alias filtering so `Molly Weasley`, `Professor McGonagall`, `Professor Snape` survive storage.
   - Relax fallback filters for “Professor X” style names; ensure result mirrored to `dist/`.

2. **Friendship & pronoun resolution**
   - Enhance descriptor→name backfill (e.g., “the eccentric girl”, “They”) inside `friends_with` logic by leveraging `recentPersons`.
   - Add logging with `L3_DEBUG=1` to verify resolved pairs per test 3.6/3.7.

3. **Family residence propagation**
   - Verify new `expandFamilyResidenceRelations` is firing for 3.5 (check `/tmp/l3-spec-debug.json` after rerun).
   - If Molly still missing, trace `normalizeLocal`/`merge` path; emit debug to `/tmp/family_debug.log`.

4. **Testing**
   ```bash
   # Targeted doc runs
   L3_DEBUG=1 node scripts/run_single_test.js 3.5
   L3_DEBUG=1 node scripts/run_single_test.js 3.6

   # Full Level 3 suite
   npx vitest run tests/ladder/level-3-complex.spec.ts > /tmp/level3_results.log 2>&1
   cat /tmp/level3_results.log | tail -40
   ```
   - Update `tmp/l3-spec-debug.json` and summarize deltas here.

5. **Document progress**
   - List remaining failing tests + hypotheses.
   - Once relation P/R ≥80/75, move to next Phase 3 milestone per `ENTITY_EXTRACTION_MASTER_PLAN.md`.

## Instructions for Claude
1. Review Codex notes + logs (`/tmp/level3_results.log`, `tmp/l3-spec-debug.json`).
2. Validate entity retention and relation outputs for tests 3.5–3.9.
3. Re-run Level 3 ladder; update this file with metrics + next focus area.
4. If goals met, plan Phase 3 Day 2 tasks (advanced coref, bridging).

## NEXT: Claude
