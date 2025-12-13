# UI Refinement & Bug Fixes Session

**Date**: 2025-12-13
**Branch**: `claude/fix-save-keyboard-focus-01GFaMhAYfSzRo9uUittyMPy`
**Status**: ✅ **UI IMPROVEMENTS & EXTRACTION FIXES**

---

## Session Summary

This session focused on fixing critical UI issues in the Extraction Lab console and resolving a markdown header bug that was blocking entity extraction. Three major fixes were implemented:

1. ✅ **Markdown Header Extraction Bug** - Fixed `##` headers blocking extraction
2. ✅ **Entity Selection Menu Positioning** - Fixed overlapping menu issue
3. ✅ **Browser Context Menu Suppression** - Disabled default menu in Entity Highlight Mode

---

## Running Log (2025-12-13)

### ✅ FIX: Markdown Headers Blocking Extraction

**Problem:**
- Markdown headers (`##`, `###`) were completely blocking entity extraction
- The `stripIncompleteTagsForExtraction()` function treated `##` as incomplete entity tags
- For "## Heading", the second `#` saw the first `#` as previous character (not newline)
- This caused text to be truncated at markdown headers

**Solution:**
- Modified function to scan backwards through ALL consecutive `#` characters
- Now checks if the FIRST `#` in sequence is at line start
- Skips entire markdown header sequences (##, ###, etc.)
- Only processes mid-text `#` as potential entity tags

**Impact:**
- ✅ Extraction now works on documents with markdown formatting
- ✅ Both frontend and backend extraction fixed (frontend strips before API call)
- ✅ Markdown headers (#, ##, ###) properly ignored
- ✅ Entity tags like `#Person:PERSON` still work correctly

**Files Changed:**
- `app/ui/console/src/pages/ExtractionLab.tsx:334-357`

**Commit:** `1b906eb` - "fix(extraction): Ignore markdown headers when stripping incomplete tags"

---

### ✅ FIX: Entity Selection Menu Overlapping Text

**Problem:**
- Entity Selection Menu ("Tag as Entity" button) was overlapping and covering selected text
- Used `position: absolute` with `transform: translateX(-50%)` which created containing block issues
- Menu positioned using document coordinates but needed viewport coordinates
- Backdrop-filter broken on Safari due to transform context (documented in CLAUDE.md UI pitfalls)

**Solution:**
1. **React Portal** - Menu now renders at `document.body` using `createPortal`, escaping parent transform contexts
2. **Fixed Positioning** - Changed to `position: fixed` with viewport coordinates (removed `window.scrollY`)
3. **Smart Flipping** - Menu automatically positions above selection when not enough space below
4. **Safari Support** - Added:
   - `isolation: isolate` for proper stacking context
   - `willChange: transform` for GPU acceleration
   - `WebkitBackdropFilter` for Safari backdrop-filter support

**Implementation:**
```typescript
// Calculate if menu should flip above based on available space
const menuHeight = 80;
const spaceBelow = window.innerHeight - rect.bottom;
const spaceAbove = rect.top;

position = {
  x: rect.left + rect.width / 2,
  y: spaceBelow >= menuHeight ? rect.bottom + 8 : rect.top - 8,
  flip: spaceBelow < menuHeight,
};
```

**Files Changed:**
- `app/ui/console/src/pages/ExtractionLab.tsx:540-666`
- Added `createPortal` import from 'react-dom'

**Commit:** `7edf5a7` - "fix(ui): Fix Entity Selection Menu overlapping with text"

---

### ✅ FIX: Browser Context Menu Interfering with Custom Menu

**Problem:**
- When selecting text in Entity Highlight Mode and right-clicking, the browser's native context menu (Cut, Copy, Paste, Look Up) was appearing
- It overlapped with the custom "Tag as Entity" menu, making entity creation difficult
- Users couldn't access entity functionality due to menu overlap

**Solution:**
- Moved `event.preventDefault()` and `event.stopPropagation()` to the beginning of contextmenu handler
- Now **always** prevents default browser context menu when in Entity Highlight Mode
- Only shows custom menus (text selection menu or entity context menu)
- Allows default browser behavior when NOT in Entity Highlight Mode

**Implementation:**
```typescript
contextmenu: (event, view) => {
  // ALWAYS prevent default browser context menu in Entity Highlight Mode
  if (entityHighlightModeRef.current) {
    event.preventDefault();
    event.stopPropagation();
    // ... then show custom menus
  }

  // Not in Entity Highlight Mode - allow default browser behavior
  return false;
}
```

**Files Changed:**
- `app/ui/console/src/components/CodeMirrorEditor.tsx:221-259`

**Commit:** `4fbd532` - "fix(ui): Disable browser context menu in Entity Highlight Mode"

---

## Git History

```bash
git log --oneline claude/fix-save-keyboard-focus-01GFaMhAYfSzRo9uUittyMPy
4fbd532 fix(ui): Disable browser context menu in Entity Highlight Mode
7edf5a7 fix(ui): Fix Entity Selection Menu overlapping with text
1b906eb fix(extraction): Ignore markdown headers when stripping incomplete tags
bf56f44 fix(ui): Add fallback download when API server unavailable
99bebe3 feat(api): Add entity review reports endpoint - save to repository
```

---

## Known Issues & Pending Work

### 🚧 Disconnected Functionality (Needs Integration)

**1. Entity Review Sidebar ↔ Graph Visualization**
- **Status:** Disconnected
- **Issue:** Changes made in Entity Review Sidebar don't update the graph visualization in real-time
- **Impact:** Users must manually refresh to see graph updates after entity edits
- **Files:**
  - `app/ui/console/src/components/EntityReviewSidebar.tsx` (source of changes)
  - Graph visualization components (need to consume entity updates)
- **Fix Needed:** Wire entity state updates from sidebar to trigger graph re-render

**2. Manual Entity Tagging ↔ Auto-Extraction**
- **Status:** Partially connected
- **Issue:** Manual entity tags (`#Entity:TYPE`) and auto-extracted entities exist in separate systems
- **Current State:**
  - Manual tags are parsed in frontend (`ExtractionLab.tsx:372-417`)
  - Auto-extraction happens via API (`extractFromSegments`)
  - Merging happens in `mergeTagsAndExtraction()` but may have edge cases
- **Edge Cases:**
  - Conflicting type assignments (manual says PERSON, auto says ORG)
  - Overlapping spans (manual tag intersects auto-detected entity)
  - Deletion conflicts (user rejects manual tag but auto-extraction re-adds it)
- **Files:**
  - `app/ui/console/src/pages/ExtractionLab.tsx:372-417` (manual tags)
  - `app/ui/console/src/pages/ExtractionLab.tsx:468-524` (merging logic)
- **Fix Needed:**
  - Clear precedence rules (manual > auto)
  - Visual indicators for conflicts
  - Better conflict resolution UI

**3. Entity Overrides ↔ Persistence**
- **Status:** Session-only (not persisted)
- **Issue:** Type overrides and rejections in `entityOverrides` state are lost on page reload
- **Current State:**
  - `entityOverrides` exists in React state only
  - `typeOverrides` and `rejectedSpans` are ephemeral
  - No backend persistence or local storage
- **Impact:** Users lose all manual corrections when refreshing the page
- **Files:**
  - `app/ui/console/src/pages/ExtractionLab.tsx:686-691` (state definition)
  - `app/ui/console/src/pages/ExtractionLab.tsx:327-370` (applyEntityOverrides)
- **Fix Needed:**
  - Save overrides to localStorage or backend API
  - Load overrides when document is opened
  - Include overrides in document save/load

**4. Entity Highlight Mode ↔ Text Editing**
- **Status:** Mutually exclusive (by design, but limiting)
- **Issue:** Can't edit text while in Entity Highlight Mode
- **Current State:**
  - `keyboardBlockerExtension` blocks all keyboard input in highlight mode
  - Designed for iOS text selection without triggering keyboard
  - Desktop users lose ability to make quick text edits
- **Files:**
  - `app/ui/console/src/components/CodeMirrorEditor.tsx:457-475` (keyboard blocker)
- **Consideration:** Is this limitation acceptable, or should we allow hybrid mode?
- **Possible Fix:** Detect device type, only block keyboard on touch devices

**5. Background Job Status ↔ Entity Display**
- **Status:** Partially connected
- **Issue:** Long-running extractions show "Processing..." but don't update entity list progressively
- **Current State:**
  - Background jobs poll `/jobs/:jobId/status` endpoint
  - Frontend shows job progress percentage
  - Entities only appear after job completes (all-or-nothing)
- **Impact:** Users see no feedback during long extractions (30+ seconds)
- **Files:**
  - `app/ui/console/src/pages/ExtractionLab.tsx:886-965` (background job handling)
  - `app/api/graphql.ts:700-850` (job endpoints)
- **Fix Needed:**
  - Stream partial results as extraction progresses
  - Update entity list incrementally
  - Show "X entities found so far..." during extraction

**6. HERT System ↔ Frontend Display**
- **Status:** Backend-only (frontend uses simple spans)
- **Issue:** Frontend doesn't use or display HERT IDs for entities
- **Current State:**
  - Backend generates HERTs (`app/engine/hert/`)
  - Frontend uses `EntitySpan` interface (start, end, text, type)
  - No HERT decoding or display in UI
- **Impact:** Can't share entities via HERT URLs, can't copy HERTs
- **Files:**
  - `app/ui/console/src/types/entities.ts` (EntitySpan definition)
  - `app/engine/hert/` (HERT encoding/decoding)
- **Fix Needed:**
  - Add HERT field to EntitySpan interface
  - Display HERT in entity detail view
  - Add "Copy HERT" button
  - Support HERT-based entity lookup

---

### 🔧 Known Bugs (Not Yet Fixed)

**1. Entity Type Dropdown Position on Mobile**
- **Status:** UI glitch on iOS/Safari
- **Issue:** Type dropdown may appear off-screen or misaligned on small viewports
- **Workaround:** Scroll to entity before changing type
- **Priority:** Low (affects mobile only)

**2. Long Entity Names Overflow**
- **Status:** Layout issue
- **Issue:** Entity names >50 chars overflow sidebar rows
- **Current State:** Text continues beyond row boundaries
- **Fix Needed:** Add text-overflow: ellipsis or word-wrap

**3. Relation Extraction Missing for Some Patterns**
- **Status:** Coverage gap
- **Issue:** Some narrative patterns not yet implemented
- **Examples:**
  - "X, the son of Y" (appositive relation)
  - "X inherited Y from Z" (3-way relation)
  - Dialogue attribution ("X said..." should link speaker to quote)
- **Current Coverage:** 26% of 1827 known patterns
- **Target:** ≥50% for Stage 3
- **Files:**
  - `app/engine/extract/relations.ts` (dependency patterns)
  - `app/engine/narrative-relations.ts` (narrative patterns)

**4. Safari Backdrop-Filter Flicker**
- **Status:** CSS rendering bug
- **Issue:** Blur effects may flicker on scroll in Safari
- **Current State:** Mitigated by `isolation: isolate` and `willChange: transform`
- **Impact:** Rare visual glitch, doesn't affect functionality
- **Priority:** Low (cosmetic)

---

### 📋 Features Not Yet Implemented

**1. Entity Type Picker in Selection Menu**
- **Status:** Hardcoded to PERSON
- **Issue:** "Tag as Entity" button always creates PERSON entities
- **Current Code:**
  ```typescript
  onTagAsEntity={() => createEntityFromSelection('PERSON')} // TODO: Add type picker
  ```
- **Files:** `app/ui/console/src/pages/ExtractionLab.tsx:2068`
- **Fix Needed:**
  - Add dropdown to selection menu
  - Show all available entity types
  - Remember last-used type per session

**2. Multi-Entity Merge UI**
- **Status:** Callback exists but not fully implemented
- **Issue:** "Merge Entities" button appears but merge logic incomplete
- **Current State:**
  - Button shows when 2+ entities selected
  - `mergeEntitiesFromSelection` callback exists
  - Backend merge logic not fully wired
- **Files:** `app/ui/console/src/pages/ExtractionLab.tsx:1608-1654`
- **Fix Needed:**
  - Implement merge selection UI
  - Choose canonical name
  - Merge aliases and attributes
  - Update all references

**3. Entity Search/Filter in Sidebar**
- **Status:** Not implemented
- **Issue:** No way to search/filter entities in review sidebar
- **Impact:** Hard to find specific entities in large documents
- **Fix Needed:**
  - Add search input at top of sidebar
  - Filter by entity name, type, or confidence
  - Highlight matching entities

**4. Relation Editor UI**
- **Status:** View-only
- **Issue:** Can view relations but can't edit, add, or remove them
- **Current State:** Relations display in separate view (not in sidebar)
- **Fix Needed:**
  - Add relation editor component
  - Support manual relation creation
  - Allow relation deletion
  - Validate relation types

**5. Document Comparison View**
- **Status:** Not implemented
- **Issue:** Can't compare entities/relations across documents
- **Use Case:** Track entity evolution across document versions
- **Fix Needed:**
  - Side-by-side document comparison
  - Highlight entity differences
  - Show added/removed/modified entities

**6. Export Formats Beyond JSON**
- **Status:** JSON only
- **Issue:** Can only export as JSON, no CSV, GraphML, or other formats
- **Current Exports:**
  - Entity review reports (JSON)
  - Document saves (JSON)
- **Fix Needed:**
  - Add CSV export for entities (spreadsheet-friendly)
  - Add GraphML for Gephi/Cytoscape visualization
  - Add RDF/Turtle for semantic web integration

---

## UI Architecture Notes

### Liquid-Glass Theme System

The UI uses a consistent "liquid-glass" glassmorphism theme with the following components:

**Base Classes:**
- `liquid-glass--strong` - Strong blur (12px), opaque background, for overlays
- `liquid-glass--subtle` - Subtle blur (8px), translucent background, for integrated panels
- CSS variables: `--glass-bg`, `--glass-border`, `--text-primary`, `--text-secondary`

**Safari Compatibility Requirements:**
1. Use `createPortal()` to escape parent transform contexts
2. Add `isolation: isolate` for proper stacking context
3. Add `willChange: transform` for GPU acceleration
4. Include `WebkitBackdropFilter` alongside `backdropFilter`
5. Use `position: fixed` with viewport coordinates (not absolute + scrollY)

**Files:**
- `app/ui/console/src/styles/liquid-glass.css` - Theme definitions
- `app/ui/console/src/components/LabToolbar.tsx` - Reference implementation
- `app/ui/console/src/components/EntityReviewSidebar.tsx` - Sidebar theming
- `CLAUDE.md:590-650` - Full pitfalls documentation

### React State Management

**Key State Objects:**
1. **entities** - Array of extracted entities (EntitySpan[])
2. **entityOverrides** - Type changes and rejections (session-only)
3. **textSelection** - Current text selection for menu positioning
4. **layout** - Sidebar modes (overlay, pinned, closed)
5. **settings** - Entity highlight mode, live extraction, etc.

**State Flow:**
```
User Action (sidebar/menu)
    ↓
handleEntityUpdate(index, updates)
    ↓
setEntities() + setEntityOverrides()
    ↓
applyEntityOverrides() in useEffect
    ↓
displayEntities updated
    ↓
UI re-renders with changes
```

**Files:**
- `app/ui/console/src/pages/ExtractionLab.tsx:652-705` - State definitions
- `app/ui/console/src/hooks/useLabLayoutState.ts` - Layout state hook
- `app/ui/console/src/hooks/useExtractionSettings.ts` - Settings state hook

---

## Testing Status

### Current Test Results

**Ladder Tests:**
- ✅ **Stage 1**: Simple sentences - PASSING
- ✅ **Stage 2**: Multi-sentence - 99% (1 appositive test failing)
- ✅ **Stage 3**: Complex paragraphs - PASSING
- ⏸️ **Stage 4**: Scale testing - Not started
- ✅ **Stage 5**: Level 5A/5B/5C - 96.3% (52/54 tests passing)

**Entity Extraction:**
- ✅ 28/28 regression tests passing
- Entity Precision: 90.2% (target ≥80%)
- Entity Recall: 91.3% (target ≥75%)

**Relation Extraction:**
- Relation Precision: 80.8% (target ≥80%)
- Relation Recall: 75.8% (target ≥75%)
- Pattern Coverage: 26% (480/1827 patterns)

**UI Tests:**
- ❌ No automated UI tests (manual testing only)
- ❌ No E2E tests for Extraction Lab
- ❌ No visual regression tests

### Testing Gaps

1. **UI Component Tests** - None exist for React components
2. **Integration Tests** - Limited API endpoint coverage
3. **E2E Tests** - No Playwright/Cypress tests
4. **Visual Regression** - No screenshot comparison
5. **Mobile Testing** - Manual testing only, no automation

---

## Development Environment

### Prerequisites
- Node.js 16+ and npm
- Python 3.8+ with pip
- Make (for running commands)

### Quick Start
```bash
# 1. Install dependencies
make install

# 2. Start spaCy parser service (Terminal 1)
make parser
# Wait for: "Application startup complete"

# 3. Start GraphQL API server (Terminal 2)
make server-graphql
# Wait for: "GraphQL server running on http://localhost:4000"

# 4. Start console UI dev server (Terminal 3)
cd app/ui/console
npm run dev
# Open: http://localhost:5173

# 5. Run tests (Terminal 4)
make test
```

### Key Commands
```bash
make test            # Run all tests
make smoke           # Quick validation
npm run test:ladder  # Run all ladder tests
make ui-console      # Build production console
make ui-console-dev  # Start console dev server
```

---

## Next Recommended Steps

### High Priority

1. **Wire Entity Review Sidebar to Graph Visualization**
   - Add event emitter for entity state changes
   - Subscribe graph component to entity updates
   - Trigger re-render on entity modifications
   - **Estimated effort:** 2-3 hours

2. **Persist Entity Overrides**
   - Add `overrides` field to document schema
   - Save/load overrides with document
   - Consider localStorage for unsaved documents
   - **Estimated effort:** 3-4 hours

3. **Add Entity Type Picker to Selection Menu**
   - Replace hardcoded 'PERSON' with dropdown
   - Show all available entity types
   - Add keyboard shortcuts (P for PERSON, O for ORG, etc.)
   - **Estimated effort:** 2 hours

4. **Implement Incremental Entity Display for Background Jobs**
   - Modify job endpoint to return partial results
   - Update frontend to append entities as they arrive
   - Add "X entities found so far" indicator
   - **Estimated effort:** 4-5 hours

### Medium Priority

5. **Add UI Component Tests**
   - Set up Vitest + React Testing Library
   - Test EntityReviewSidebar interactions
   - Test EntitySelectionMenu positioning
   - **Estimated effort:** 6-8 hours

6. **Improve Pattern Coverage (26% → 50%)**
   - Add appositive relation patterns ("X, the son of Y")
   - Add dialogue attribution patterns
   - Add 3-way relation patterns
   - **Estimated effort:** 8-10 hours

7. **Add Entity Search/Filter to Sidebar**
   - Implement search input component
   - Add type filter checkboxes
   - Add confidence range slider
   - **Estimated effort:** 4 hours

### Low Priority

8. **Export Additional Formats (CSV, GraphML)**
   - Add CSV export for entity spreadsheets
   - Add GraphML for graph visualization tools
   - Add format selector to export UI
   - **Estimated effort:** 3-4 hours

9. **Implement Relation Editor UI**
   - Design relation editor component
   - Add relation creation dialog
   - Add relation deletion with confirmation
   - **Estimated effort:** 8-10 hours

10. **Add Visual Regression Testing**
    - Set up Playwright or Cypress
    - Add screenshot tests for key UI states
    - Add E2E tests for extraction workflow
    - **Estimated effort:** 10-12 hours

---

## Important Files Reference

### Frontend (Console UI)
- `app/ui/console/src/pages/ExtractionLab.tsx` - Main extraction lab page (2100+ lines)
- `app/ui/console/src/components/EntityReviewSidebar.tsx` - Entity review sidebar
- `app/ui/console/src/components/CodeMirrorEditor.tsx` - Text editor with entity highlighting
- `app/ui/console/src/components/LabToolbar.tsx` - Top toolbar with liquid-glass theme
- `app/ui/console/src/types/entities.ts` - EntitySpan and EntityType definitions

### Backend (Extraction Engine)
- `app/engine/extract/orchestrator.ts` - Main extraction coordinator
- `app/engine/extract/entities.ts` - Entity extraction (3-stage alias matching)
- `app/engine/extract/relations.ts` - Relation extraction (dependency patterns)
- `app/engine/narrative-relations.ts` - Narrative pattern extraction
- `app/engine/hert/` - HERT encoding/decoding system

### API
- `app/api/graphql.ts` - GraphQL server + REST endpoints
- `/api/reports` - Entity review report endpoint
- `/extract-entities` - Entity extraction endpoint
- `/jobs/*` - Background job endpoints

### Tests
- `tests/ladder/level-1-simple.spec.ts` - Stage 1 tests
- `tests/ladder/level-2-multisentence.spec.ts` - Stage 2 tests
- `tests/ladder/level-5-*.spec.ts` - Level 5 tests (5A/5B/5C)
- `tests/entity-extraction/extraction.spec.ts` - Entity regression tests

### Documentation
- `CLAUDE.md` - AI assistant guide (THIS FILE)
- `README.md` - Project overview
- `INTEGRATED_TESTING_STRATEGY.md` - Testing approach
- `docs/LINGUISTIC_REFERENCE.md` - Linguistic patterns guide
- `docs/ARES_PROJECT_BRIEFING.md` - Latest project status

---

## Blockers & Open Questions

### No Blockers
All critical issues from this session have been resolved. The system is in a stable state.

### Open Questions for User

1. **Entity Override Persistence**: Where should we store entity overrides?
   - Option A: Include in document JSON (saved to backend)
   - Option B: Separate overrides file per document
   - Option C: LocalStorage only (session-based)

2. **Entity Highlight Mode Keyboard Blocking**: Should we allow text editing in highlight mode?
   - Current: Keyboard completely blocked (iOS text selection)
   - Alternative: Allow keyboard on desktop, block on touch devices only

3. **Graph Visualization Integration**: What graph library should we use?
   - Option A: D3.js (maximum flexibility, steep learning curve)
   - Option B: Cytoscape.js (graph-focused, easier)
   - Option C: React Flow (React-native, modern)

4. **Entity Type Picker UI**: Where should it appear?
   - Option A: Dropdown in selection menu (quick, inline)
   - Option B: Modal dialog (more space, can show descriptions)
   - Option C: Radial menu (touch-friendly, modern)

---

## Contact & Resources

- **Repository**: https://github.com/mrfishcar/ARES
- **Issues**: https://github.com/mrfishcar/ARES/issues
- **Branch**: `claude/fix-save-keyboard-focus-01GFaMhAYfSzRo9uUittyMPy`
- **Documentation**: https://github.com/mrfishcar/ARES/tree/main/docs

---

**Session completed**: 2025-12-13
**Total commits**: 3 (markdown fix, menu positioning, context menu)
**Files changed**: 2 (ExtractionLab.tsx, CodeMirrorEditor.tsx)
**Build status**: ✅ All builds successful
**Test status**: ✅ No regressions introduced

*This handoff was created for AI assistants to continue the ARES project. Keep it updated with each session's changes.*
