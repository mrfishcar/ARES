# Changelog

All notable changes to ARES will be documented in this file.

Format: `[Date] - [AI Model/Developer Name]`

---

## 2025-11-10 - Claude Code (Sonnet 4.5)

### Added
- **Selective pattern integration**: Added 45 high-quality dependency path patterns
  - Location family: 10 patterns (18% → 47% coverage, +29%)
  - Part-whole family: 10 patterns (10% → 42% coverage, +32%)
  - Employment family: 8 patterns (16% → 42% coverage, +26%)
  - Ownership family: 10 patterns (24% → 59% coverage, +35%)
  - Communication family: 7 patterns (32% → 53% coverage, +21%)
- New pattern sections in `/app/engine/extract/relations/dependency-paths.ts`:
  - Lines 254-278: NEW EMPLOYMENT PATTERNS (Phase 1)
  - Lines 294-298: NEW OWNERSHIP PATTERNS (Phase 2)
  - Lines 424-454: NEW LOCATION PATTERNS (Phase 1)
  - Lines 792-813: NEW COMMUNICATION PATTERNS (Phase 2)
  - Lines 901-908: NEW PART-WHOLE PATTERNS (Phase 1)

### Changed
- Overall pattern coverage: 26% → 36% (+10 percentage points)
- Total integrated patterns: 125 → 170 (+45 patterns)

### Quality Improvements
- All patterns manually reviewed for semantic correctness
- Avoided predicate mapping errors (e.g., "married" → "parent_of")
- Included diverse syntactic constructions:
  - Active/passive voice variations
  - Appositive constructions ("X, owner of Y")
  - Copula constructions ("X is owner of Y")
  - Nominal phrases ("owner of X")
  - Participial phrases ("X, located in Y")

### Testing
- Test suite: 453/467 tests passing (96.6%)
- TypeScript compilation: Clean (no errors)
- No breaking changes to existing functionality

### Performance
- Pattern coverage bottleneck addressed (26% → 36%)
- Ready for full evaluation against test corpus
- Expected improvement in relation extraction recall

---

## 2025-01-26 - Claude Code (Sonnet 4.5)

### Added
- **Automatic inverse relation generation** in `/app/engine/extract/orchestrator.ts:301-318`
  - Auto-creates bidirectional relations for predicates with inverse mappings
  - Example: `parent_of(A, B)` automatically creates `child_of(B, A)`
  - Uses `INVERSE` mapping from schema.ts
- New test files for fiction extraction:
  - `/test-sherlock.ts` - Victorian literature test
  - `/test-barty.ts` - Modern fantasy fiction test
  - `/test-barty-debug.ts` - Parser debugging for fiction

### Changed
- Modified deduplication in orchestrator.ts to process `allRelationsWithInverses` instead of `allRelationSources`
- Added imports to orchestrator.ts:
  - `import { INVERSE } from '../schema';`
  - `import { v4 as uuid } from 'uuid';`

### Fixed
- **Symmetric relation counts**: parent_of and child_of now have matching counts (24 each)
- All bidirectional predicates in INVERSE map now automatically create reverse relations

### Performance
- **test-mega-001** (modern biographical text):
  - Before: 141 relations
  - After: 167 relations
  - Improvement: +26 relations (+18%)
  - Achievement: 111% of 150 relation target ✅

### Discovered Limitations
- **Fiction extraction fails with current spaCy model**:
  - test-sherlock.ts: 9 relations from 8,527 words (0.1 per 100 words)
  - test-barty.ts: 2 relations from 3,974 words (0.1 per 100 words)
  - Root cause: `en_core_web_sm` trained on news/Wikipedia, not narrative fiction
  - Symptoms: Misidentified entities (chapter titles as LAW, metaphors as PERSON), poor relation extraction

### Notes
- The `INVERSE` mapping existed in schema.ts since project inception but was never utilized
- Now all predicates with inverse mappings automatically generate bidirectional relations:
  - `married_to` ↔ `married_to` (symmetric)
  - `parent_of` ↔ `child_of` (inverse pair)
  - `sibling_of` ↔ `sibling_of` (symmetric)
  - `ally_of` ↔ `ally_of` (symmetric)
  - `enemy_of` ↔ `enemy_of` (symmetric)
  - `friends_with` ↔ `friends_with` (symmetric)
  - `alias_of` ↔ `alias_of` (symmetric)
- System is production-ready for biographical/professional text
- Fiction extraction requires different NLP backend (BookNLP, LitBank, or LLM-based)

### User Context
- User approaching weekly Claude Code limit
- User's primary interest: testing on their own fiction writing
- Fiction test revealed fundamental limitation of spaCy-based approach for literary text
- Decision made: User chose to pursue fiction support (Option 2)

---

## 2025-01-26 (Session 2) - Claude Code (Sonnet 4.5)

### Added
- **Fiction-specific extraction module** `/app/engine/fiction-extraction.ts`
  - `extractFictionCharacters()`: Pattern-based character detection
    - Dialogue attribution: "X said", "X replied", "X asked"
    - Possessive patterns: "X's [something]"
    - Action verbs: "X walked", "X turned", "X looked"
    - Character introductions: "X, a/the [role]"
    - Filters out pronouns and common false positives
  - `extractFictionRelations()`: Fiction-specific relation patterns
    - Dialogue: "X said to Y", "X told Y"
    - Conflict: "X fought Y", "X attacked Y"
    - Cooperation: "X helped Y", "X saved Y"
    - Family: "X, son/daughter of Y"
    - Social: "X and Y were friends", "X met Y"
    - Co-occurrence detection: Characters appearing together 2+ times
- New predicates in schema.ts:
  - `spoke_to` - Communication/dialogue relations
  - `met` - Character encounters/interactions
- New extractor types: `fiction-dialogue`, `fiction-action`, `fiction-family`
- Test file: `/test-fiction-patterns.ts` - Tests fiction extraction patterns

### Changed
- Updated `Relation` interface in schema.ts to accept fiction extractor types
- Enhanced character filtering to exclude pronouns (He, She, It, They, I, We, You)
- Lowered co-occurrence threshold from 3 to 2 for fiction (less dense than biographical text)
- Made co-occurrence matching case-insensitive

### Tested
- **Option A: Better spaCy model (en_core_web_lg)**
  - Downloaded and tested 400MB large model
  - Result: NO improvement (same training data as small model)
  - Reverted to small model to save memory

- **Option B: Fiction-specific patterns (test-fiction-patterns.ts)**
  - Test on user's "Barty Beauregard" fiction (~4,000 words)
  - Characters detected: 3 (Frederick, Barty, Preston) ✅
  - Relations found: 1 (Barty met Preston) ✅
  - Improvement: From 2 garbage relations to 1 real relation

### Performance
- **test-barty.ts with spaCy alone**:
  - 79 entities (mostly false positives: "Adrenaline", "Always", "Bad")
  - 2 relations (garbage: "Maybe I" enemy_of "It")

- **test-fiction-patterns.ts with new patterns**:
  - 3 characters (clean, real characters) ✅
  - 1 relation (Barty-Preston interaction) ✅
  - Successfully filtered out all false positives

### Notes
- Fiction extraction works independently of spaCy parser (pattern-based)
- Current patterns detect co-occurrence; more specific patterns needed for richer relations
- Next steps for improvement:
  1. Add more action patterns: "watched", "noticed", "asked", "told"
  2. Integrate fiction extraction into main orchestrator
  3. Add dialogue attribution: `"...", X said`
  4. Add character role detection (protagonist, antagonist, etc.)
  5. Combine with spaCy for dependency-based extraction of actions
- System now has two modes:
  - **Biographical text**: Use spaCy + dependency paths (167 relations on test-mega-001)
  - **Fiction text**: Use pattern-based extraction (1+ relations on test-barty)

### Files Created
- `/app/engine/fiction-extraction.ts` - Core fiction extraction logic
- `/scripts/parser_service_lg.py` - Large spaCy model service (tested but not used)
- `/test-fiction-patterns.ts` - Fiction pattern test harness

### User Context
- User chose to pursue fiction support despite budget constraints
- Fiction patterns show promise: clean character detection, real relation found
- Foundation is in place for future fiction extraction improvements
- When budget resets, can integrate fiction extraction into main orchestrator

---

## 2025-01-27 - ChatGPT Codex (GPT-5)

### Added
- Expanded fiction dialogue/action verb coverage in `app/engine/fiction-extraction.ts`, recognising richer speech verbs (warned, begged, promised), assistance verbs (comforted, supported), and conflict verbs (betrayed, chased, threatened).
- Added canonical-name normalisation plus regex helpers (`buildNamePattern`, `buildVerbAlternation`) to safely build patterns and map matches back to known characters.
- Created `tests/fiction/fiction-relations.spec.ts` to lock in expected dialogue, aid, and conflict relations.
- Exported `extractFictionEntities` providing consolidated "notable entity" discovery (characters, artifacts, locations, addresses, organisations) driven by new heuristics.
- Wired fiction entity highlights into `extractFromSegments`/`appendDoc`, exposing them to the CLI and desktop tester UI.
- Added descriptive phrase capture for lower-case roles (e.g. "the devil's niece", "the two lovers", "the couple") so non-proper figureheads surface in fiction highlights.

### Changed
- Fiction relation extraction now deduplicates matches and handles case/spacing variants, preventing duplicate relations while matching uppercase text.
- Broadened fiction character detection to include the new verb set so subjects like "Barty begged Preston" are surfaced for subsequent relation extraction.
- Character scoring now weights introductions, dialogue, and action verbs (threshold 1.5) so sparsely mentioned but significant actors surface in shorter passages.
- Proper-noun harvesting now catches multi-word titles (e.g. `Song for the City No. 12`) and descriptive phrases (e.g. `The Weathered Record Player`, `The Black Gate`) with type classification.

### Fixed
- Ensured inline attribution (`"..." Name shouted to Name`) and direct-address verbs (`Name warned Name`) emit `spoke_to` relations alongside ally/enemy updates.

### Notes
- Patterns now cover additional ally/enemy verbs (`comforted`, `worked with`, `betrayed`, `chased`, etc.), providing broader narrative coverage ahead of orchestrator integration.
- The new unit test captures dialogue, assistance, and conflict scenarios to guard against regressions as fiction support expands.
- Notable-entity extraction now surfaces address cues (`Number 6067`), artefacts, and scene landmarks without needing spaCy, offering richer world-building hooks for the fiction workflow.
- Desktop tester now displays the top fiction highlights (characters/artifacts/locations) returned from ingestion for quick narrative review.

## Template for Future Entries

```markdown
## [Date] - [AI Model/Developer Name]

### Added
- New features or capabilities

### Changed
- Modifications to existing functionality

### Fixed
- Bug fixes

### Performance
- Metrics before/after (entities/relations counts, processing time)
- Test results with improvements

### Notes
- Important context for future work
- Decisions made and rationale
- Known issues or limitations discovered
```
