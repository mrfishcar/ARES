# CODEX Agent Notes

Shared memory for CODEX agents working in the ARES repository. Keep this file concise but information-rich so future agents can quickly regain context.

## Repository Snapshot

- **Project**: ARES (Advanced Relation Extraction System) – local-first entity and relation extraction that builds knowledge graphs from unstructured text. The system includes entity extraction, relation extraction, alias resolution, provenance tracking, and a GraphQL API.
- **Primary docs**: Start with `README.md` for capabilities and quick start; `ENTITY_EXTRACTION_STATUS.md` for extraction details; `HANDOFF.md` for session status and next steps; architecture docs in `docs/architecture/` (HERT integration, engine evolution).
- **Key features (from README)**: Local/offline pipeline, spaCy parser service (port 8000), multi-source entity extraction, relation extraction with inverse generation, HERT stable references, alias resolution, provenance, and browser-based Extraction Lab at `/lab`.
- **Testing expectations**: `make test` (119/119 passing) and `make smoke` are the main checks. Quick start uses `make install`, `make parser`, then tests.

## Current Status (Iteration 37)

- Stage 1: **PASSED** (119/119 tests)
- Stage 2: **99% complete**, blocked on test **2.12** (appositive parsing bug)
- Entity extraction: **7/28 tests passing** (25%)
- Pattern coverage: **26%** (target ≥30%)
- Critical blocker (test 2.12): "Aragorn, son of Arathorn, traveled to Gondor" currently yields `Arathorn --[traveled_to]--> Gondor`; should be `Aragorn --[traveled_to]--> Gondor`. Cause: appositive phrase interferes with dependency parsing.

## Current Task Context

- User asked to review documentation and update this CODEX memory to ensure agents understand the project. No code changes beyond documentation.
- No AGENTS.md files detected; follow standard repository style and instructions in prompts.

## Tips for Future Agents

- Read `README.md` top-to-bottom for the latest feature overview, architecture sketch, and key documentation links.
- For architecture deep dives, consult `docs/architecture/HERT_IMPLEMENTATION.md` and related guides; for workflows use `docs/guides/QUICK_START.md`.
- If running tests, ensure dependencies via `make install`; start parser service with `make parser` before executing extraction tests.
- Treat `CODEX_ONLINE_PROMPT.md` as the active mission brief and cross-check debugging guidance in `CLAUDE.md` sections 7-9 (inverse relations, pronoun filtering, debugging guide) before modifying extraction logic.
- Keep `docs/AI_HANDOFF.md` updated with concrete status reports after each task, including test results and blockers.

## Priority Tasks

- Fix appositive parsing in `app/engine/extract/relations.ts` to resolve test 2.12.
- Improve entity extraction tests to **65%+ passing**.
- Raise pattern coverage to **30%+** if time permits.
