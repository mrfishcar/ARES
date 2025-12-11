# ARES (Advanced Relation Extraction System)

ARES is a local-first engine that turns unstructured text into a knowledge graph with entities, relations, and provenance. It prioritizes determinism, precision/recall tracking, and clear debugging over ML black boxes.

## Project Goals
- Extract people, places, orgs, dates, events, and narrative relations with provenance.
- Support alias, pronoun, and cross-document identity resolution.
- Maintain a fast feedback loop through the Test Ladder and focused diagnostics.
- Keep documentation single-sourced in this README so future agents can ramp quickly.

## Current Architecture (high level)
1. **Parsing**: spaCy-based dependency parse to drive rule evaluation.
2. **Entity extraction**: NER + dependency patterns; alias normalization (surface + canonical); cross-document matching for exact names and known aliases; possessive pronoun handling with recency bias for sentence-openers.
3. **Relation extraction**: Dependency + narrative patterns; inverse generation; sibling/alias/coordination filters to avoid false parentage; provenance stored alongside each relation.
4. **Coreference + alias resolution**: Recency-weighted pronoun resolution, possessive pronoun bias toward prior sentence subjects, entity merging across documents by canonical/alias matches.
5. **Outputs**: Knowledge graph with HERT IDs, GraphQL/API helpers, and export utilities.

## Test Ladder (levels 1–5)
Purpose: progressive gates for extraction quality. Use the commands below; avoid the dot reporter (`--reporter=dot --silent`) due to a Vitest RangeError.

| Level | Focus | Command |
| --- | --- | --- |
| 1 | Simple sentences / core entity+relation patterns | `npm run test:ladder:1` or `npm test tests/ladder/level-1-simple.spec.ts` |
| 2 | Multi-sentence + multi-hop reasoning | `npm run test:ladder:2` or `npm test tests/ladder/level-2-multisentence.spec.ts` |
| 3 | Coreference-heavy narratives | `npm test tests/ladder/level-3-complex.spec.ts` |
| 5A | Cross-document identity/merging | `npm test tests/ladder/level-5-cross-document.spec.ts` |
| 5B | Performance + query helpers | `npm test tests/ladder/level-5b-performance.spec.ts` |
| 5C | Extended entity type coverage | `npm test tests/ladder/level-5c-new-entities.spec.ts` |

**Status snapshot (latest checks):**
- Levels 1–3 passing locally (Level 3 passes when run without the dot reporter).
- Level 5: all current 5A/5B/5C tests passing; keep an eye on coordination merges in "Harry, Ron, and Hermione" style sentences, but nothing is failing now.
- Stage 3 precision/recall targets exceeded (≈80.8% precision, 75.8% recall, 78.3% F1). Stage 4 not started.

## Phase 3 & Next Tasks
- Phase 3 goals met; keep sibling filters and possessive pronoun recency bias intact.
- Known testing quirk: Vitest dot reporter triggers `RangeError: Invalid count value: Infinity`; use default reporter instead.
- Next ladder focus after docs cleanup: re-verify Level 5 coordination/merging edge case and confirm full suite health.

## Current Behaviors to Preserve
- **Entity extraction**: NER + pattern blend, alias normalization, cross-doc matching by canonical/alias text, and provenance per mention.
- **Pronoun/alias resolution**: Recency-weighted pronouns; sentence-initial possessive pronouns bias to prior sentence subject; avoid overwriting higher-salience entities unless compatibility holds.
- **Relation extraction**: Inverse generation, sibling filters preventing false parent_of/child_of from appositives (e.g., "eldest son"), narrative patterns for teaching/joined/rivalry, and coordination guards.

## Workflow: Start Here
1. **Load context**: Read this README and the latest `HANDOFF.md` (kept lean and current).
2. **Run targeted tests**: Start with the relevant ladder level (see commands above). Avoid the dot reporter.
3. **Find the next task**: Check the "Phase 3 & Next Tasks" notes and `HANDOFF.md` for any remaining blockers (Level 5 coordination merging is the main watch item) before coding.
4. **Implement safely**: Make minimal, well-reasoned changes that preserve existing passing behavior; follow existing patterns.
5. **Update docs**: Any behavioral change must update this README (the single source of truth) and, if ongoing, `HANDOFF.md`.

## Documentation Rules
- **README.md is canonical**: All project status, workflow, and testing guidance lives here.
- **Update README.md with every change**: No feature or workflow update is complete until reflected here.
- **HANDOFF.md is for active tasks only**: Keep it concise; defer to this README for global context.
- **No redundant docs**: Obsolete or duplicative files should be removed immediately.
- **If in doubt, trust this README**: Treat any other file as outdated unless it explicitly points back here.

## File Pointers
- `HANDOFF.md`: Latest session status and remaining Level 5 issues.
- `tests/ladder/*.spec.ts`: Ladder tests and fixtures.
- `app/engine/*`: Core extraction, relation logic, and coreference handling.
- `docs/IOS_KEYBOARD_FIX.md`: **🚨 CRITICAL** - iOS/iPad keyboard fix documentation. READ BEFORE modifying CodeMirror editor code.
- `docs/AI_MODEL_GUIDE.md`: **NEW** - Model selection guide (OPUS/SONNET/HAIKU/CODEX).
- `docs/ARCHITECTURE_REVIEW_2025_12.md`: **NEW** - Architecture review and strategic roadmap.
- `docs/VISION.md`: Core product vision (writing tool for authors).
- `docs/LINGUISTIC_REFERENCE.md`: Linguistic patterns for debugging.

