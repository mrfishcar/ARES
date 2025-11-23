# ARES UI Refactor Plan

**Status**: 🟡 Planning Phase
**Scope**: Refactor editor architecture per UI Fixes Directive
**Priority**: Critical - Fixes core state management issues

---

## Phase 1: Core Architecture (Today)

### 1.1 Inline Tag Parser (NEW)
- **File**: Create `app/ui/console/src/utils/inlineTagParser.ts`
- **Function**: `parseInlineTags(rawText: string) → {entities: ManualEntity[], renderedText: string}`
- **Regex**: `#([A-Za-z0-9 _'-]+):([A-Z_]+)`
- **Output**:
  - Extracts manual override entities with type
  - Returns rendered text with tags removed
  - Preserves rawText unchanged

### 1.2 Entity State Management (REFACTOR)
- **File**: Refactor `CodeMirrorEditor.tsx`
- **Change**: Implement clean state flow:
  ```
  rawText → parseInlineTags → manualEntities
         → merge with API entities → mergedEntities
         → markdown(renderedText) → renderedDOM
         → apply highlights → highlightedDOM
  ```
- **Key**: Never mutate rendered HTML, only update entity state

### 1.3 Dropdown Fix (CRITICAL BUG)
- **File**: `EntityContextMenu.tsx`
- **Bug**: Currently inserts `#Name:TYPE` into rendered HTML
- **Fix**: Update only entity state, trigger highlight re-render
- **Code Pattern**:
  ```typescript
  // WRONG (current):
  view.dispatch({ changes: { from, to, insert: `#${name}:${type}` } })

  // CORRECT (new):
  entities[id].type = type
  entities[id].source = 'manual'
  rerender()
  ```

### 1.4 Highlight Visual Update
- **File**: Refactor highlight styles in `CodeMirrorEditor.tsx`
- **Changes**:
  - Remove underline: `border-bottom: none !important;`
  - Soft glow: `box-shadow: 0 0 6px rgba(var(--entity-color), 0.4);`
  - Feathered: `background: rgba(..., 0.25);`

### 1.5 Default View Swap
- **File**: `ExtractionLab.tsx`
- **Change**:
  - Show "Pretty Rendered" view by default
  - Hide "Raw Text" behind toggle
  - Hide "HTML Debug" even further

---

## Phase 2: Enhanced Features (Follow-up)

### 2.1 Inline Tag Autocomplete
- **File**: Create `app/ui/console/src/components/InlineTagAutocomplete.tsx`
- **Trigger**: When user types `#`
- **Behavior**: Suggest entities by prefix match

### 2.2 Markdown Rendering
- **File**: Update `MarkdownEditor.tsx` or integrate markdown processor
- **Requirement**: markdown → highlights (never reverse order)

### 2.3 Copy/Paste Handling
- **File**: `CodeMirrorEditor.tsx`
- **Requirement**: Tags survive in raw mode, collapse in pretty mode

---

## Implementation Order

1. **Create inlineTagParser.ts** ✓ Plan
2. **Refactor CodeMirrorEditor state flow** (In Progress)
3. **Fix EntityContextMenu dropdown** (In Progress)
4. **Update highlight styles** (In Progress)
5. **Swap default view in ExtractionLab** (In Progress)
6. **Test all changes** (Pending)
7. **Autocomplete implementation** (Follow-up)

---

## Success Criteria

- [ ] Manual dropdown changes update without corrupting text
- [ ] Tags appear only in raw mode
- [ ] Pretty mode hides tags by default
- [ ] Markdown renders cleanly
- [ ] Highlights are soft and un-underlined
- [ ] No duplicated words or broken spans
- [ ] Entity state and renderer in sync
- [ ] All existing tests still pass

---

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `inlineTagParser.ts` | NEW | Critical |
| `CodeMirrorEditor.tsx` | State flow, styles, defaults | Critical |
| `EntityContextMenu.tsx` | Dropdown behavior | Critical |
| `ExtractionLab.tsx` | Default view swap | High |
| `MarkdownEditor.tsx` | Rendering order | Medium |
| `entityAutoReplace.ts` | Tag handling | Medium |

---

**Next**: Implement Phase 1 starting with inlineTagParser.ts
