# Exact Working Commit Structure (be09094b)

This document shows the EXACT CSS and HTML structure from the working commit that we need to replicate.

---

## Key Discovery: We Over-Engineered It

**Problem**: We made `.editor-scroll-container` literally THE ONLY scroll owner and forced everything else to be `position: fixed`. This broke iOS scroll handling.

**Solution**: Go back to the simple, natural layout from commit `be09094b`.

---

## EXACT CSS from Working Commit

### 1. Page Lock (html/body)

```css
/* Working commit had NO position: fixed! */
html {
  font-size: 100%;
  -webkit-text-size-adjust: 100%;
  background: var(--bg-primary);
  /* NO position: fixed */
  /* NO touch-action: none */
}

html,
body {
  background: var(--bg-primary);
  /* NO position: fixed! Just simple height constraint */
  height: 100%;  /* NOT 100vh or 100dvh */
  margin: 0;
  padding: 0;
  /* NO overflow property on body */
}
```

### 2. Container Structure

```css
.extraction-lab {
  display: flex;
  flex-direction: column;
  height: 100vh;  /* NOT 100dvh */
  background: var(--bg-primary);
  overflow: hidden;  /* ✅ Lock the page */
  /* NO position: fixed */
  /* NO position: relative */
}

.lab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 32px;
  background: white;
  border-bottom: 1px solid var(--border-soft);
  box-shadow: var(--shadow-soft);
  /* NO position: fixed - it's in the flex flow */
}

.lab-content {
  display: grid;  /* ✅ GRID, not flex! */
  grid-template-columns: 1fr 420px;  /* ✅ Two columns */
  gap: 24px;
  flex: 1;  /* ✅ Takes remaining space */
  padding: 24px;
  overflow: hidden;  /* ✅ Constrains children! */
  /* NO overflow: visible */
  /* NO position: fixed children */
}
```

### 3. Editor Panel

```css
.editor-panel {
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-soft);
  overflow: auto;  /* ✅ Panel can scroll naturally */
  /* NO .editor-scroll-container wrapper */
  /* NO forced "THE ONLY scroll owner" */
}

.panel-header {
  padding: 24px 24px 16px;
  border-bottom: 1px solid var(--border-soft);
  /* Header stays at top of panel naturally */
}

/* CodeMirror inside .editor-panel */
.CodeMirror {
  /* Scrolls naturally inside .editor-panel */
  /* No special viewport locking needed */
}
```

### 4. Results Panel

```css
.results-panel {
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-soft);
  overflow: auto;  /* Can scroll independently */
}
```

---

## Current (BROKEN) CSS

### What We Did Wrong

```css
html,
body {
  position: fixed;  /* ❌ BREAKS iOS! */
  inset: 0;
  overflow: hidden;
  touch-action: none;  /* ❌ Too aggressive */
}

.extraction-lab {
  position: fixed;  /* ❌ OR position: relative */
  height: 100dvh;  /* ❌ dvh instead of vh */
}

.lab-toolbar-stack {
  position: fixed;  /* ❌ Toolbar is fixed */
  top: 16px;
  left: 50%;
  z-index: 50;
}

.lab-content {
  display: flex;  /* ❌ Should be grid */
  overflow: visible;  /* ❌ Should be hidden */
  /* NO constraint on children */
}

.editor-scroll-container {
  overflow-y: auto;  /* ❌ Forced as THE ONLY scroll owner */
  /* Everything else is position: fixed */
}
```

**Why this breaks:**
1. `position: fixed` on html/body creates stacking context that confuses iOS
2. Toolbar being `position: fixed` means it's not in the layout flow
3. `.lab-content` has `overflow: visible` - doesn't constrain children
4. `.editor-scroll-container` is forced as "THE ONLY" scroll owner
5. Too much fighting with the browser instead of natural flow

---

## EXACT HTML Structure from Working Commit

```jsx
<div className="extraction-lab">
  {/* Header - in the flex flow, NOT fixed */}
  <div className="lab-header">
    <div className="lab-title">
      <span className="lab-icon">🧪</span>
      <h1>ARES Extraction Lab</h1>
    </div>
    <div className="lab-stats">
      {/* Stats badges */}
    </div>
  </div>

  {/* Main Content - grid layout */}
  <div className="lab-content">
    {/* Left: Editor Panel */}
    <div className="editor-panel">
      <div className="panel-header">
        <h2>Write or paste text...</h2>
        {/* Checkboxes */}
      </div>
      <CodeMirrorEditor
        value={text}
        onChange={(newText) => setText(newText)}
        minHeight="calc(100vh - 280px)"
      />
    </div>

    {/* Right: Results Panel */}
    <EntityResultsPanel
      entities={entities}
      relations={relations}
    />
  </div>
</div>
```

**Key points:**
- ✅ NO `.editor-scroll-container` wrapper
- ✅ NO `position: fixed` on toolbar
- ✅ Simple grid layout (two columns side by side)
- ✅ Natural document flow
- ✅ Panels scroll independently

---

## Current (BROKEN) HTML Structure

```jsx
<div className="extraction-lab">
  {/* Hamburger - position: fixed */}
  <button className="hamburger-btn" />

  {/* Toolbar - position: fixed */}
  <LabToolbar />

  {/* Sidebar - position: fixed */}
  <DocumentsSidebar />

  {/* Main Content */}
  <div className="lab-content">
    {/* ❌ Forced scroll container */}
    <div className="editor-scroll-container">
      <RichEditorPane />
    </div>

    {/* Pinned sidebar - also forced positioning */}
    {layout.entityPanelMode === 'pinned' && (
      <div>
        <EntityReviewSidebar mode="pinned" />
      </div>
    )}
  </div>

  {/* Floating elements */}
  <FloatingActionButton />
  <EntityModal />
</div>
```

**What's wrong:**
- ❌ Hamburger, toolbar, sidebar all `position: fixed`
- ❌ `.editor-scroll-container` forced as THE ONLY scroll owner
- ❌ No natural grid layout
- ❌ Fighting iOS instead of working with it

---

## Viewport Height Variables

### Working Commit

```css
/* Used simple 100vh */
.extraction-lab {
  height: 100vh;
}

.editor-panel {
  min-height: calc(100vh - 280px);
}

/* NO dvh */
/* NO JavaScript viewport height syncing */
/* NO --app-viewport-height variables */
```

### Current (BROKEN)

```css
/* Over-engineered with dvh and CSS variables */
.extraction-lab {
  height: 100dvh;
  min-height: 100dvh;
  height: var(--app-viewport-height);  /* JavaScript synced */
}

/* iOS viewport fix with JavaScript */
html.kb-open .extraction-lab {
  height: var(--vvh, 100dvh) !important;
}
```

**Why simple is better:**
- iOS handles `100vh` correctly in `overflow: hidden` containers
- No need for JavaScript syncing
- No need for `dvh` fallbacks
- Browser does the right thing naturally

---

## Scroll Behavior Variables

### Working Commit

```css
/* NONE! No special scroll variables */
/* No overscroll-behavior tweaks */
/* No -webkit-overflow-scrolling */
/* No touch-action */
```

### Current (BROKEN)

```css
html, body {
  overscroll-behavior: none;
  touch-action: none;  /* Too aggressive */
}

.editor-scroll-container {
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  isolation: isolate;
}
```

**Why simple is better:**
- Don't need to block all touch actions
- Browser's default scroll behavior works fine
- No need for isolation tricks

---

## Summary of Changes Needed

### 1. Remove ALL position: fixed from layout

```diff
- .lab-toolbar-stack { position: fixed; }
- .hamburger-btn { position: fixed; }
- .documents-sidebar { position: fixed; }
+ /* All in natural document flow */
```

### 2. Change .lab-content to grid

```diff
- .lab-content { display: flex; overflow: visible; }
+ .lab-content {
+   display: grid;
+   grid-template-columns: 1fr 420px;
+   overflow: hidden;
+ }
```

### 3. Remove .editor-scroll-container wrapper

```diff
- <div className="editor-scroll-container">
-   <RichEditorPane />
- </div>
+ <div className="editor-panel">
+   <div className="panel-header">{/* ... */}</div>
+   <RichEditorPane />
+ </div>
```

### 4. Simplify CSS

```diff
- html, body { position: fixed; inset: 0; touch-action: none; }
+ html, body { height: 100%; }

- .extraction-lab { height: 100dvh; position: relative; }
+ .extraction-lab { height: 100vh; }
```

### 5. Remove iOS viewport fixes

```diff
- /* Remove all --vvh, --app-viewport-height variables */
- /* Remove iosViewportFix.ts */
- /* Remove kb-open class logic */
+ /* Just use simple overflow: hidden */
```

---

## Migration Steps

1. **Backup current CSS** - Save current index.css before changes
2. **Update .extraction-lab** - Remove position: fixed, use 100vh
3. **Update .lab-content** - Change to grid, add overflow: hidden
4. **Update HTML structure** - Remove .editor-scroll-container wrapper
5. **Move toolbar into flow** - Remove position: fixed from toolbar
6. **Simplify html/body** - Remove position: fixed, touch-action
7. **Test on iPad** - Verify scrolling works naturally

---

## Expected Behavior After Fix

✅ **Viewport locked** - Page doesn't scroll (overflow: hidden on .extraction-lab)
✅ **Editor scrolls** - .editor-panel can scroll naturally
✅ **Results scroll** - .results-panel can scroll independently
✅ **No scroll fighting** - Browser handles everything naturally
✅ **No viewport issues** - Simple layout works with iOS
✅ **Caret tracking works** - Natural scroll container behavior

---

## Testing Checklist

- [ ] Page doesn't scroll when keyboard opens
- [ ] Editor can scroll (overflow: auto on .editor-panel works)
- [ ] Toolbar stays visible (in natural flow, not fixed)
- [ ] Grid layout works (editor + results side by side)
- [ ] No winY changes (window.scrollY stays 0)
- [ ] Caret stays visible when typing
- [ ] Works on iPad Safari
- [ ] Works on desktop Chrome/Firefox

---

## Reference Files

**Working commit:**
- `git show be09094b:app/ui/console/src/index.css`
- `git show be09094b:app/ui/console/src/pages/ExtractionLab.tsx`

**Current files:**
- `/home/user/ARES/app/ui/console/src/index.css`
- `/home/user/ARES/app/ui/console/src/pages/ExtractionLab.tsx`

---

**Last Updated**: December 26, 2024
**Status**: ✅ IMPLEMENTED - ExactWorkingReplica ready for testing

## Implementation Status

✅ **COMPLETE**: ExactWorkingReplica.tsx created with full be09094b structure
- Two-column grid layout (1fr 420px)
- CodeMirror editor component
- Complete CSS replication
- All container properties match exactly

**Test Page**: `/` (default route)
**Verification Doc**: `docs/EXACT_WORKING_REPLICA_VERIFICATION.md`

**Next Step**: iPad testing to verify viewport scrolling behavior
