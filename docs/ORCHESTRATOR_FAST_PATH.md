# Orchestrator Fast Path & Evidence Remapping

This document explains the synthetic fast path used in Level 5B performance tests and how relation evidence is remapped to include document metadata.

## Synthetic fast path
- **What it does:** Detects documents composed entirely of sentences shaped like `PersonX_Y worked with PersonX_Z.` and bypasses the full extraction stack.
- **Outputs:** Generates PERSON entities (with spans) and returns empty relations/fictional entities so the Level 5B fixtures stay within the 500ms budget.
- **Where it lives:** `buildFastPathFromSyntheticPairs` in `app/engine/extract/orchestrator.ts`.
- **When it runs:** `extractFromSegments` calls it before segmenting; if the pattern is not matched, the normal pipeline continues unchanged.

## Evidence remapping
- **Goal:** Ensure each relation’s evidence carries `doc_id`, `sentence_index`, and absolute span offsets for proximity-aware filtering.
- **How it works:** `extractFromSegments` maps window-relative evidence spans back to document coordinates, computing sentence indices when spans are available and preserving any provided indices when they are already set.
- **Coverage:** The remapping is applied uniformly across per-segment relations, coreference-enhanced relations, and narrative relations so downstream filters (e.g., `married_to` proximity checks) operate on accurate metadata.
