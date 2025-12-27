# Exact Working Replica Verification

**Date**: 2024-12-26
**Purpose**: Verify ExactWorkingReplica matches be09094b structure exactly
**Status**: ✅ COMPLETE - Ready for iPad testing

---

## What Was Replicated

### Page: `/` (ExactWorkingReplica.tsx)

**Complete structural match to working commit be09094b:**

✅ **HTML Structure**
```jsx
<div className="extraction-lab">
  <div className="lab-header">...</div>
  <div className="lab-content">
    <div className="editor-panel">
      <div className="panel-header">...</div>
      <CodeMirrorEditor ... />
    </div>
    <div className="results-panel">...</div>
  </div>
</div>
```

✅ **CSS Container Properties**

| Container | Property | Value | Match |
|-----------|----------|-------|-------|
| `html` | (none) | Browser defaults | ✅ |
| `body` | font-family | -apple-system, ... | ✅ |
| `body` | background | #FFF9F0 | ✅ |
| `body` | NO height | - | ✅ |
| `body` | NO overflow | - | ✅ |
| `.extraction-lab` | display | flex | ✅ |
| `.extraction-lab` | flex-direction | column | ✅ |
| `.extraction-lab` | height | 100vh | ✅ |
| `.extraction-lab` | overflow | hidden | ✅ |
| `.lab-header` | display | flex | ✅ |
| `.lab-header` | padding | 20px 32px | ✅ |
| `.lab-header` | background | white | ✅ |
| `.lab-content` | display | grid | ✅ |
| `.lab-content` | grid-template-columns | 1fr 420px | ✅ |
| `.lab-content` | gap | 24px | ✅ |
| `.lab-content` | flex | 1 | ✅ |
| `.lab-content` | padding | 24px | ✅ |
| `.lab-content` | overflow | hidden | ✅ |
| `.editor-panel` | display | flex | ✅ |
| `.editor-panel` | flex-direction | column | ✅ |
| `.editor-panel` | overflow | auto | ✅ |
| `.results-panel` | display | flex | ✅ |
| `.results-panel` | flex-direction | column | ✅ |
| `.results-panel` | overflow-y | auto | ✅ |

✅ **NO Problematic Properties**
- ❌ NO `position: fixed` on html/body
- ❌ NO `position: fixed` on containers
- ❌ NO `touch-action: none`
- ❌ NO `height: 100dvh` (uses simple `100vh`)
- ❌ NO `.editor-scroll-container` wrapper
- ❌ NO viewport height JavaScript syncing

✅ **Editor Component**
- Using `CodeMirrorEditor` (same as working commit)
- minHeight: `calc(100vh - 280px)` (same as working commit)
- Props: value, onChange, disableHighlighting, enableWYSIWYG

---

## What's Different (Intentional Simplifications)

### Content-Only Differences (Should NOT affect scroll behavior)

1. **Header badges**: Simplified static badges instead of processing state
2. **Results panel**: Placeholder content instead of EntityResultsPanel component
3. **Entity extraction**: No actual extraction logic (CodeMirror is just a text editor)
4. **Checkboxes**: Still present but don't affect behavior since no extraction

**These differences are cosmetic - they don't change the container structure or scroll behavior.**

---

## Critical Match Points (Why This Should Work)

### 1. ✅ Viewport Locking
```css
/* Working commit approach */
.extraction-lab {
  height: 100vh;        /* Simple vh, not dvh */
  overflow: hidden;     /* Page cannot scroll */
}
```
- NO position: fixed
- NO touch-action blocking
- Browser defaults for html/body

### 2. ✅ Natural Grid Layout
```css
.lab-content {
  display: grid;                      /* GRID, not flex */
  grid-template-columns: 1fr 420px;   /* Two columns */
  overflow: hidden;                   /* Constrains children */
}
```
- Both panels can scroll independently
- Natural browser behavior
- No forced scroll owners

### 3. ✅ Editor Scroll Container
```css
.editor-panel {
  display: flex;
  flex-direction: column;
  overflow: auto;         /* Can scroll naturally */
}
```
- NO wrapper div
- Direct overflow: auto on the panel
- CodeMirror inside can scroll

---

## Testing Checklist

### On iPad Safari:

- [ ] Page loads at `/`
- [ ] Can see two-column layout (editor left, results right)
- [ ] Can type in CodeMirror editor
- [ ] Tap in editor → keyboard opens
- [ ] **CRITICAL**: Does viewport scroll up? (Should NOT scroll)
- [ ] **CRITICAL**: Can still see caret? (Should stay visible)
- [ ] Can scroll editor content independently
- [ ] Can scroll results panel independently
- [ ] Close keyboard → does page scroll back down? (Should NOT need to)
- [ ] window.scrollY stays at 0 (use browser console to check)

---

## If Still Broken - Next Steps

### Incremental Comparison Approach

1. **Start with working deployment** (commit be09094b)
2. **Load ExactWorkingReplica** (current replica)
3. **Compare one property at a time:**
   - Change grid columns to 1fr (one column) - does it break?
   - Remove results panel - does it break?
   - Add position: fixed to html - does it break?
   - Change 100vh to 100dvh - does it break?

4. **Check runtime differences:**
   - Event listeners on document/window
   - JavaScript that modifies viewport
   - CodeMirror configuration
   - Any global scripts in index.html

5. **Browser DevTools inspection:**
   - Computed styles on all containers
   - Stacking contexts (3D layers panel)
   - Scroll containers (scroll snap overlay)
   - Touch event listeners

---

## Key Files Reference

**Working Commit (be09094b):**
- `git show be09094b:app/ui/console/src/pages/ExtractionLab.tsx`
- `git show be09094b:app/ui/console/src/index.css`

**Current Replica:**
- `/home/user/ARES/app/ui/console/src/pages/ExactWorkingReplica.tsx`

**Test Pages Available:**
- `/` - ExactWorkingReplica (CodeMirror, two columns)
- `/test` - WorkingCommitTest (Lexical, one column, simplified)
- `/minimal` - UltraMinimalTest (textarea with diagnostics)

---

## Technical Notes

### Why Two Columns Matter

Even though scroll behavior should be the same with one vs two columns, having EXACTLY the same structure eliminates variables:
- Same grid calculations
- Same available space for editor
- Same constraint propagation
- Same layout paint/composite

### Why CodeMirror Matters

Working commit uses CodeMirror, not Lexical. Different editors have different:
- DOM structure
- Event handling
- Scroll management
- Focus/selection behavior

Using the same editor eliminates this variable.

### Why Browser Defaults Matter

Working commit relies on browser defaults for html/body. This means:
- No fighting with browser's natural behavior
- No stacking context issues
- No transform/position containing blocks
- iOS Safari can handle scrolling naturally

---

**Last Updated**: 2024-12-26
**Status**: Ready for iPad testing
**Next**: User tests on iPad, reports if viewport still scrolls
