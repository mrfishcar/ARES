## Entity Extraction Debug Notes (2025-11-15)

Context gathered while diagnosing why `extractEntities()` returned zero entities even on trivial text.

### Temporary Logging
- Added `L3_DEBUG`-gated instrumentation in `app/engine/extract/entities.ts` (and mirrored in `.js`) so `L3_DEBUG=1` prints:
  - High-level counts (`mergedEntries`, `finalEntries`, confidence filter stats).
  - Canonical candidate info per entity (name set, normalized keys, dedupe reasons).
  - Emission decisions (why an entity was skipped or emitted).
- When `L3_DEBUG` is unset the extractor remains quiet.

### Root Cause Identified
- The runtime actually loads the transpiled `app/engine/extract/entities.js`. The generated JS down-leveled the `for (const name of nameSet)` loop into an array-style loop (`for (_i = 0, nameSet_1 = nameSet; _i < nameSet_1.length; _i++)`), but `Set` objects do **not** expose `.length`. The loop never executed, leaving `normalizedMap` empty and causing every entity to be skipped.
- Fix: explicitly iterate over `Array.from(nameSet)` so both the TypeScript source and the compiled JS walk real arrays.

### Files Touched
1. `app/engine/extract/entities.ts`
   - Declares `DEBUG_ENTITIES` flag, adds multiple debug `console.log`/`console.warn` statements under `L3_DEBUG`.
   - Wraps the canonical-name loop with `Array.from(nameSet)` so compilation yields array-safe iteration.
2. `app/engine/extract/entities.js`
   - Mirrors the same debug hooks and the `Array.from(nameSet)` change to ensure current runtime behavior uses the fix immediately (since `npx tsc` currently fails, we patched the emitted JS directly).
3. `app/api/graphql.ts` (`/extract-entities` endpoint)
   - The Extraction Lab UI now receives the raw entities/relations emitted by `appendDoc` before registry merges rename anything. This eliminates the “Song/Perched” fallback and ensures spans match the text.

### How To Revert After Proper Rebuild
1. Remove or comment the `L3_DEBUG` logging blocks if they are no longer needed.
2. Once the TypeScript project compiles cleanly, regenerate `entities.js` via `npx tsc` so manual JS edits are replaced by compiler output (the `Array.from(nameSet)` change in TS will keep the fix intact).

### Usage
Run any ts-node script with `L3_DEBUG=1` to see the detailed entity debug trace, e.g.:
```bash
L3_DEBUG=1 npx ts-node test-meaning-layer.ts
```
This now shows the point at which entities enter/exit the pipeline, making it easier for Claude (or future agents) to understand extraction failures.
