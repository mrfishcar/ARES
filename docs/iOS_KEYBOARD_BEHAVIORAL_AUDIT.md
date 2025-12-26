# iOS Safari Keyboard Behavior - Comprehensive Audit

**Date**: 2025-12-26
**Commit Base**: 30ae6b3
**Purpose**: Understand iOS Safari keyboard handling to fix viewport shifting and caret visibility issues

---

## Executive Summary

**Problem**: When typing long text on iOS Safari, dismissing the keyboard, then tapping back into the editor:
1. Viewport shifts upward unexpectedly
2. Editor appears to shrink instead of extending behind keyboard
3. Caret becomes invisible after keyboard reopen

**Root Cause**: Conflicting strategies between:
- JavaScript trying to track viewport height changes (App.tsx)
- CSS using 100dvh (which IS correct)
- Mobile scroll container pattern (which IS correct)

---

## Part 1: iOS Safari Keyboard Behavior Research

### How iOS Safari ACTUALLY Works

**Window.innerHeight vs visualViewport.height:**

```
BEFORE KEYBOARD:
window.innerHeight: 800px (browser chrome + viewport)
visualViewport.height: 800px (visible area)
document.documentElement.clientHeight: 800px

KEYBOARD OPENS:
window.innerHeight: 800px (UNCHANGED - this is the layout viewport)
visualViewport.height: 400px (visible area shrinks)
visualViewport.offsetTop: 0
```

**Critical Understanding:**
- `window.innerHeight` = **Layout Viewport** (doesn't change when keyboard opens)
- `visualViewport.height` = **Visual Viewport** (shrinks when keyboard opens)
- Safari uses visualViewport for scrolling calculations

### The 100dvh CSS Unit

**What is dvh (Dynamic Viewport Height)?**

```css
height: 100dvh; /* Accounts for browser chrome, BUT stays constant */
```

**Behavior:**
- Initial: 100dvh = 800px (full screen minus browser chrome)
- Keyboard opens: 100dvh = 800px (STAYS THE SAME)
- Visual viewport: 400px (keyboard is overlaying, not resizing)

**This is CORRECT behavior** - content should extend behind keyboard!

### iOS Safari's scrollIntoView Behavior

When an input/contentEditable element is focused:

1. **Safari finds the scroll container** by walking up the DOM tree
2. **Looks for**: element with `overflow-y: auto`, `overflow-y: scroll`, or `overflow-y: visible`
3. **Ignores**: elements with `overflow: hidden` (can't scroll them)
4. **Scrolls the container** to bring focused element into visual viewport
5. **Accounts for keyboard** automatically using visualViewport dimensions

**Problem if Safari can't find scroll container:**
- Falls back to scrolling `window` (the entire page)
- This causes "viewport jumping" - page shifts instead of content scrolling

---

## Part 2: Current Architecture Analysis (commit 30ae6b3)

### Layout Hierarchy

```
html (height: 100%)
└─ body (height: 100%)
   └─ #root (min-height: 100dvh)
      └─ .extraction-lab (height: 100dvh, overflow: hidden)
         ├─ .lab-toolbar-stack (position: fixed)
         └─ .lab-content (flex: 1)
            └─ .editor-wrapper
               └─ .editor-panel (overflow: hidden)
                  └─ .editor-with-indicators-wrapper
                     └─ .rich-editor-shell (overflow: hidden)
                        └─ .rich-editor-surface (overflow-y: auto) ← SCROLL CONTAINER
                           └─ .rich-content (min-height: 500px)
```

### Desktop Pattern (>768px)

```css
.extraction-lab {
  height: 100dvh;
  overflow: hidden; /* Container doesn't scroll */
}

.lab-content {
  flex: 1;
  overflow: hidden; /* Passes to children */
}

.rich-editor-surface {
  overflow-y: auto; /* THE SCROLL CONTAINER */
}
```

**Result**: `.rich-editor-surface` scrolls (just the editor content)

### Mobile Pattern (≤768px) - CRITICAL DIFFERENCE

```css
@media (max-width: 768px) {
  .lab-content {
    overflow-y: auto; /* MOBILE SCROLL CONTAINER */
    -webkit-overflow-scrolling: touch;
  }
}
```

**Result**: `.lab-content` scrolls (entire app below toolbar)

**Why this is correct:**
- On mobile, viewport ≈ editor (full screen app)
- Scrolling entire content feels natural
- Toolbar stays fixed at top
- Matches iOS Notes, Google Docs mobile, etc.

---

## Part 3: The visualViewport Tracking Problem

### Current Code (App.tsx:87-105)

```typescript
const updateViewportHeight = () => {
  const height = window.visualViewport?.height ?? window.innerHeight;
  docEl.style.setProperty('--app-viewport-height', `${height}px`);
};

window.visualViewport?.addEventListener('resize', updateViewportHeight);
```

### What Happens:

**Initial Load:**
```
visualViewport.height: 800px
--app-viewport-height: 800px
.extraction-lab height: 100dvh (800px)
```

**Keyboard Opens:**
```
visualViewport.height: 400px ← SHRINKS!
--app-viewport-height: 400px ← JavaScript updates this
.extraction-lab height: var(--app-viewport-height) = 400px ← CONTAINER SHRINKS!
```

**PROBLEM**: Container is SHRINKING to make room for keyboard, instead of extending behind it!

### The Conflict

**CSS says**: `height: 100dvh` (stay at 800px)
**JavaScript says**: `--app-viewport-height: 400px` (shrink to visible area)
**JavaScript wins** because it's more specific

**Result**:
- Container shrinks from 800px → 400px
- Content has nowhere to go
- Safari can't scroll properly
- Viewport jumps around trying to compensate

---

## Part 4: The Correct Mental Model

### iOS Notes App Pattern

**What iOS Notes does:**

1. **Container**: Fixed height (full screen)
2. **Keyboard appears**: Overlays bottom portion
3. **Content**: Extends behind keyboard
4. **Scroll container**: Clearly defined, single element
5. **No JavaScript**: Safari handles everything

**Visual:**
```
┌─────────────────┐
│   Toolbar       │ ← Fixed position
├─────────────────┤
│                 │
│   Scrollable    │
│   Content       │ ← Scroll container
│                 │
│                 │
├─────────────────┤ ← visualViewport.height (visible area)
│   [Keyboard]    │ ← Keyboard overlays
└─────────────────┘
     ↑
     Container extends to here (100dvh)
```

### Our Implementation Should Be:

**Desktop (>768px):**
```
.extraction-lab (100dvh, overflow: hidden)
  └─ .lab-content (flex: 1, overflow: hidden)
     └─ .rich-editor-surface (overflow-y: auto) ← Scrolls
```

**Mobile (≤768px):**
```
.extraction-lab (100dvh, overflow: hidden)
  └─ .lab-content (overflow-y: auto) ← Scrolls
     └─ .rich-editor-surface (overflow: visible) ← Doesn't interfere
```

---

## Part 5: Root Causes Identified

### Issue #1: JavaScript Fighting CSS

**Problem**:
- CSS: `100dvh` (wants to stay at 800px)
- JS: `--app-viewport-height: 400px` (forces shrink)

**Fix**: REMOVE visualViewport tracking entirely. Let 100dvh do its job.

### Issue #2: ScrollIntoViewPlugin Targeting Wrong Container

**Current**: Always targets `.rich-editor-surface`
**Problem**: On mobile, scroll container is `.lab-content`
**Fix**: Detect viewport width and target correct container

### Issue #3: Nested Scroll Containers on Mobile

**Current**: Both `.lab-content` AND `.rich-editor-surface` have `overflow-y: auto`
**Problem**: Safari gets confused about which to scroll
**Fix**: On mobile, make `.rich-editor-surface` use `overflow: visible`

---

## Part 6: Implementation Plan

### Change 1: Remove visualViewport Tracking (App.tsx)

```typescript
// DELETE THIS ENTIRE EFFECT
useEffect(() => {
  // NO viewport tracking!
  // Let 100dvh handle everything
}, []);
```

**Rationale**: CSS 100dvh already handles iOS keyboard correctly.

### Change 2: Fix Mobile Scroll Container (index.css)

```css
@media (max-width: 768px) {
  .lab-content {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* PREVENT nested scroll container */
  .rich-editor-surface {
    overflow: visible; /* Let parent handle scroll */
  }
}
```

**Rationale**: Single, clear scroll container for Safari to find.

### Change 3: Update ScrollIntoViewPlugin

```typescript
// Detect correct scroll container based on viewport
let scrollContainer;
if (window.innerWidth <= 768) {
  // Mobile: scroll .lab-content
  scrollContainer = editorElement.closest('.lab-content');
} else {
  // Desktop: scroll .rich-editor-surface
  scrollContainer = editorElement.closest('.rich-editor-surface');
}
```

**Rationale**: Target the actual scroll container for each viewport size.

### Change 4: Simplify Scroll Logic

```typescript
// SIMPLIFIED: Just use scrollIntoView
element.scrollIntoView({
  behavior: 'smooth',
  block: 'nearest',
  inline: 'nearest'
});
```

**Rationale**: Safari's native implementation handles visualViewport correctly.

---

## Part 7: Expected Behavior After Fix

### Typing Long Text, Dismissing Keyboard, Reopening

**Before (broken):**
1. Type long text ✓
2. Dismiss keyboard → container shrinks back to 800px
3. Tap into editor → container shrinks to 400px → VIEWPORT JUMPS
4. Caret invisible → scroll container confused

**After (fixed):**
1. Type long text ✓
2. Dismiss keyboard → container stays at 800px (100dvh)
3. Tap into editor → keyboard overlays bottom → container STAYS 800px
4. Safari scrolls `.lab-content` to bring caret into view ✓
5. Caret visible, no jumping ✓

---

## Part 8: Testing Checklist

### Test on iPad Safari:

- [ ] Open editor, type 5-10 lines
- [ ] Tap outside to dismiss keyboard
- [ ] Tap back into editor
- [ ] ✅ No viewport shifting
- [ ] ✅ Caret stays visible
- [ ] ✅ Smooth scroll to caret
- [ ] ✅ Container doesn't shrink

### Test on iPhone Safari:

- [ ] Same as iPad
- [ ] ✅ Works in portrait
- [ ] ✅ Works in landscape

### Debug Mode:

```javascript
window.ARES_DEBUG_SCROLL = true
```

Should log:
- Correct scroll container (`.lab-content` on mobile)
- Caret position relative to visualViewport
- Scroll operations (direction, amount)

---

## Part 9: Key Principles

### DO:
- ✅ Use 100dvh for container height
- ✅ Single clear scroll container per viewport size
- ✅ Trust Safari's native scrollIntoView
- ✅ Let keyboard overlay content, don't resize

### DON'T:
- ❌ Track visualViewport.resize in JavaScript
- ❌ Update container height when keyboard appears
- ❌ Create nested scroll containers on mobile
- ❌ Override Safari's scroll behavior with manual math

---

## Part 10: References

**CSS Values:**
- [100dvh spec](https://developer.mozilla.org/en-US/docs/Web/CSS/length#dvh)
- Visual Viewport API: https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API

**iOS Safari Behavior:**
- Keyboard overlays, doesn't resize layout viewport
- visualViewport.height changes, window.innerHeight doesn't
- scrollIntoView uses visualViewport for calculations

**Industry Patterns:**
- iOS Notes: Fixed container, overlay keyboard
- Google Docs Mobile: Same pattern
- GitHub Mobile: Same pattern

---

**Conclusion**: The fix is to STOP fighting Safari and LET IT WORK.
