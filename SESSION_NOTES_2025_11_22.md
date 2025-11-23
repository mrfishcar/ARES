# ARES Entity Highlighting & Tag Hiding Implementation
## Session Notes: November 22, 2025

---

## 🎯 Mission Accomplished

Successfully implemented a clean, production-ready solution for entity tag hiding in pretty mode that:
- Shows only normalized entity names (hides all tag syntax)
- Preserves right-click context menu functionality
- Maintains seamless single highlight block across entire entity
- Properly handles rejected entities with zero visual highlighting
- Supports multi-word entities with bracketed syntax
- Preserves rejection tracking and blacklist learning system

---

## 📋 Key Problems Solved

### Problem 1: Widget Event Interception
**Issue**: Using `Decoration.replace()` with widgets removed DOM elements, blocking right-click events from reaching the CodeMirror event handler.

**Root Cause**: Widgets create DOM nodes that intercept and consume events before they bubble to handlers.

**Solution**: Switched from `Decoration.replace()` → `Decoration.mark()`
- Keeps text in DOM
- Events propagate normally
- Context menus work reliably

**Learning**: In CodeMirror 6, decorations that modify DOM fundamentally break event routing. Marks are always safer than replacements for interactive features.

---

### Problem 2: Tag Syntax Hiding Without Breaking Layout
**Issue**: Needed to hide tag syntax (e.g., `#`, `:TYPE`) visually without:
- Removing text from DOM (breaks event coords)
- Creating blank spaces (breaks layout)
- Fragmenting the highlight into multiple blocks

**Root Cause**: Previous attempts used widget overlays and DOM replacement, which caused fragmentation and event issues.

**Solution**: CSS-based hiding with transparent marks
```css
.cm-tag-syntax-hidden {
  color: transparent !important;           /* Hide visually */
  fontSize: 0 !important;                  /* Collapse width */
  letterSpacing: -0.5em;                   /* Remove any traces */
  userSelect: 'none';                      /* Prevent selection */
  pointerEvents: 'none';                   /* Let clicks through */
}
```

**Key Insight**: Three strategies work in CodeMirror:
1. ✅ **CSS hiding** (transparency + font-size: 0) - Best for text you want hidden but need in DOM
2. ✅ **Mark decorations** - Keep text in DOM, just style it
3. ❌ **Replace decorations** - Break event handling if interactive

---

### Problem 3: Rejected Entities Showing Gray Highlighting
**Issue**: When rejecting multi-word entities, gray highlighting appeared on rejected words.

**Root Cause**: The `buildEntityDecorations` function (which highlights auto-detected entities) was still applying highlight marks to regions that contained rejected entity syntax.

**Solution**: Added rejection region detection in entity highlighting
```typescript
// Find all rejected regions to exclude them
const rejectedRegions = [];
const rejectionRegex = /\[([^\]]+)\]:REJECT_ENTITY|(\w+)(?:[.,!?;-]*):REJECT_ENTITY/g;
// ... scan text for rejection patterns

// Skip highlighting entities that overlap with rejected regions
if (isInRejectedRegion(entity.start, entity.end)) {
  continue; // Don't apply highlight
}
```

**Learning**: Decorations are applied independently. To coordinate behavior between decoration layers, must either:
1. Filter entities before applying decorations (what we did)
2. Share state via StateField
3. Check text patterns in decoration builders

---

### Problem 4: Multi-Word Rejection Syntax Not Using Brackets
**Issue**: When rejecting "Boromir the Great", only the first word was captured by rejection regex, leaving rest unhidden.

**Root Cause**: Rejection regex only matched single-word pattern: `(\w+):REJECT_ENTITY`

**Solution**: Added bracketed rejection syntax parallel to type-changing syntax
```typescript
// Updated regex with both patterns:
const tagRegex = /\[([^\]]+)\]:REJECT_ENTITY|(\w+)(?:[.,!?;-]*):REJECT_ENTITY/g;

// In handleReject:
const rejectTag = entity.text.includes(' ')
  ? `[${entity.text}]:REJECT_ENTITY`      // Multi-word
  : `${entity.text}:REJECT_ENTITY`;       // Single-word
```

**Learning**: Consistency matters. Multi-word entities must use the same syntactic pattern across all tag types:
- `#[Multi Word]:TYPE` for type changes
- `[Multi Word]:REJECT_ENTITY` for rejections
- Allows same regex patterns and parsing logic

---

## 🏗️ Architecture Decisions

### Three-Part Decoration Strategy

For each manual tag in pretty mode, we apply three distinct decorations:

**1. Parent Mark Decoration (Full Span)**
- Spans entire tag: `matchStart` → `matchEnd`
- Applies Kindle-style gradient highlighting (feathered edges)
- Adds `data-entity` attribute for context menu detection
- **Skipped for rejected entities** (no visual highlighting)

**2. Syntax Hiding via Nested Marks**
- Identifies syntax elements by tag pattern:
  - `#[Multi Word]:TYPE` → hide `#[` and `]:TYPE`
  - `#Entity:TYPE` → hide `#` and `:TYPE`
  - `[Multi Word]:REJECT_ENTITY` → hide `[` and `]:REJECT_ENTITY`
  - `Word:REJECT_ENTITY` → hide `:REJECT_ENTITY`
- Applies `.cm-tag-syntax-hidden` CSS class
- Text stays in DOM for proper event routing

**3. Optional Overlay Widget** (Not currently used)
- Could display normalized name on top with `pointerEvents: none`
- Not needed since syntax hiding works well
- Kept for future if additional visual embellishment needed

### Why This Approach?

1. **Separation of Concerns**: Each decoration has one job
2. **Composability**: Can adjust one layer without breaking others
3. **Performance**: Marks are lightweight, no DOM manipulation
4. **Robustness**: Doesn't break event routing or layout
5. **Simplicity**: No complex widget logic or DOM mutations

---

## 💡 Key Learnings

### 1. CodeMirror 6 Decoration Philosophy
CodeMirror decorations should be **visual only**. Never use decorations to:
- Remove text from DOM (breaks event coordinates)
- Manipulate DOM structure (breaks event bubbling)
- Replace widgets with interactive elements (breaks event routing)

Instead:
- Use **marks** for styling text that needs to stay in DOM
- Use **replace** only for pure visual overlays (non-interactive)
- Use **line decorations** for structural changes (gutters, backgrounds)

### 2. Event Routing in CodeMirror
```
User Action (click/right-click)
    ↓
DOM Event on CodeMirror DOM
    ↓
Widget's DOM node (if replace()) → CONSUMES EVENT
    OR
Text node (if mark()) → PROPAGATES to CodeMirror handler
    ↓
CodeMirror Event Handler gets event with position
```

**Critical**: Only marks preserve event routing to CodeMirror handlers.

### 3. Rejection Tracking System Requirements
Synthetic entities must be created for rejected terms because:
1. **Rejection Counting**: Tracks how many times a term has been rejected
2. **Blacklist Learning**: After 2+ rejections, term gets blacklisted
3. **Blacklist Override**: When user manually creates entity from blacklisted term, it's automatically removed from blacklist

These are project-level learning features, not document-level. Must persist even if entity has no visual highlighting.

**Design Pattern**: Create synthetic entity → Don't apply highlights → Backend still processes for learning

### 4. Regex Patterns for Manual Tags
Support multiple syntaxes consistently:
```
Type Changes:
  #Entity:TYPE              → Single word with type
  #[Multi Word]:TYPE        → Multi-word with type

Aliases:
  Entity:ALIAS_OF_Canonical:TYPE → Short mention → full entity link

Rejections:
  Word:REJECT_ENTITY        → Single word rejection
  [Multi Word]:REJECT_ENTITY → Multi-word rejection
```

**Pattern**: Brackets always indicate spaces in entity name, apply consistently across all tag types.

---

## 🔧 Technical Implementation Details

### Files Modified
1. **`src/components/CodeMirrorEditor.tsx`** (Main implementation)
   - `buildEntityDecorations()` - Skip highlighting rejected regions
   - `buildTagHidingDecorations()` - Create marks for syntax hiding
   - `handleReject()` - Add brackets for multi-word entities
   - Editor theme CSS - Add `.cm-tag-syntax-hidden` class

2. **`src/pages/ExtractionLab.tsx`** (Already fixed in previous work)
   - `stripIncompleteTagsForExtraction()` - Preserve complete tags

### Decoration Building Logic

**For each manual tag matched in pretty mode:**

```typescript
if (match[1]) {
  // #[Multi Word]:TYPE
  // Hide: #[ and ]:TYPE, show: Multi Word

} else if (match[3]) {
  // #Entity:TYPE
  // Hide: # and :TYPE, show: Entity

} else if (match[5]) {
  // Entity:ALIAS_OF_Canonical:TYPE
  // Hide: :ALIAS_OF_Canonical:TYPE, show: Entity

} else if (match[8]) {
  // [Multi Word]:REJECT_ENTITY
  // Hide: [ and ]:REJECT_ENTITY, show: Multi Word
  // NO highlight mark applied

} else if (match[9]) {
  // Word:REJECT_ENTITY
  // Hide: :REJECT_ENTITY, show: Word
  // NO highlight mark applied
}
```

### CSS Hiding Strategy

```css
.cm-tag-syntax-hidden {
  color: transparent !important;     /* Invisible */
  fontSize: 0 !important;            /* Zero width */
  letterSpacing: -0.5em;             /* Negative spacing to collapse */
  userSelect: 'none';                /* Prevent selection of hidden chars */
  pointerEvents: 'none';             /* Events pass through */
}
```

**Why this works**: The character is still in DOM (events work), but:
- Renders with zero width (no layout impact)
- Transparent (not visible)
- Prevents accidental selection

---

## ✅ Acceptance Criteria (All Met)

- [x] Tags are hidden visually in pretty mode
- [x] Only normalized entity names display (no syntax visible)
- [x] Seamless single highlight block across entire tag
- [x] Right-click context menu works on tags
- [x] Raw mode shows full tag syntax
- [x] Toggle between raw/pretty preserves text integrity
- [x] Rejected entities show NO highlighting
- [x] Rejected entities hide colon and :REJECT_ENTITY syntax
- [x] Multi-word entities use brackets in all tag types
- [x] No blank spaces or layout shifts
- [x] Markdown rendering works cleanly
- [x] Rejection tracking preserved for blacklist learning

---

## 🚀 Ready for Testing & Deployment

**Dev Server**: Running on `http://localhost:3003/`

**Test Workflow**:
1. Type: "Boromir the Great ruled Mount Doom."
2. Wait for auto-detection
3. Right-click "Boromir the Great" → Reject
   - Verify: Plain text `Boromir the Great`, NO gray
4. Right-click "Mount Doom" → Change Type → ORG
   - Verify: Text becomes `#[Mount Doom]:ORG`, displays as `Mount Doom` with ORG color
5. Right-click on displayed "Mount Doom" → menu appears ✅
6. Toggle "Show Raw Text" → see full syntax
7. Toggle back → syntax hidden again ✅

---

## 📚 References & Future Work

### If Extending This System:
- **Alias syntax**: Already supported (`Entity:ALIAS_OF_Canonical:TYPE`)
- **Custom rejection reasons**: Could add to `:REJECT_ENTITY` syntax
- **Type history**: Backend already tracks type changes per entity
- **Visual indicators**: Could add hover tooltips showing hidden syntax

### Potential Optimizations:
- Memoize rejection region detection (currently rebuilds on every decoration update)
- Cache regex matches if performance becomes an issue
- Consider pre-parsing manual tags on text change to reduce regex work

### Known Constraints:
- Rejection regex must be kept in sync in two places (entity highlighting + syntax hiding)
- Consider extracting to shared utility
- Multi-word entity brackets MUST be used consistently across all tag types

---

## 🎓 Summary

Today we solved a complex problem in CodeMirror 6: **how to visually hide tag syntax while maintaining text in the DOM for proper event routing**.

The key insight was realizing that CodeMirror decoration strategies have different implications:
- **Marks** = text stays in DOM, events work, pure visual styling
- **Replaces** = text removed from DOM, events don't work, but true visual replacement
- **Widgets** = DOM nodes that can intercept/consume events, breaking parent handlers

By using **CSS-based hiding via marks** instead of DOM replacement, we achieved the impossible: complete syntax hiding while preserving interactive functionality.

This is now a reusable pattern for any CodeMirror editor that needs to hide markup while keeping interactive features working.
