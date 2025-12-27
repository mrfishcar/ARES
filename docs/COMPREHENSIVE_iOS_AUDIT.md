# Comprehensive iOS Safari Keyboard Audit
**Date**: 2025-12-26
**Branch**: claude/refactor-lab-extraction-page-P8qzw
**Commit**: b51183c

---

## CRITICAL FINDINGS

### 🚨 PROBLEM #1: Multiple Conflicting CSS Definitions for html/body

The `index.css` file has **4 DIFFERENT definitions** of html/body styles that override each other:

#### Definition 1 (Lines 8-16) - FIRST
```css
html, body {
  margin: 0;
  padding: 0;
  height: 100%;  /* ← Regular 100% */
  font-size: 100%;
  -webkit-text-size-adjust: 100%;
  background: var(--bg-primary);
}
```

#### Definition 2 (Lines 162-173) - SECOND ⚠️ CRITICAL
```css
html, body, #root {
  height: 100%;
  min-height: 100dvh;
  overflow: hidden;  /* ← BLOCKS Safari from finding scroll containers! */
  overscroll-behavior: none;
  -webkit-overflow-scrolling: touch;
}
```

#### Definition 3 (Lines 233-236) - THIRD
```css
html, body {
  background-color: var(--app-surface);
}
```

#### Definition 4 (Lines 370-381) - FOURTH
```css
body {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-size: var(--font-size-base);
  font-weight: 400;
  line-height: var(--line-height-base);
  background-color: var(--app-surface);
  color: var(--text-primary);
  position: relative;
  min-height: 100%;
}
```

**CRITICAL ISSUE**: Definition #2 has `overflow: hidden` which prevents Safari from finding scroll containers!

---

### 🚨 PROBLEM #2: ScrollIntoViewPlugin is DISABLED

**File**: `app/ui/console/src/editor2/RichTextEditor.tsx`
**Line 180**: `{/* <ScrollIntoViewPlugin /> */}`

The plugin is commented out! But it's the one that targets the correct scroll container based on viewport size.

From system reminder, I can see the full plugin implementation exists and:
- Targets `.lab-content` on mobile (≤768px)
- Targets `.rich-editor-surface` on desktop (>768px)
- Has comprehensive logging with `window.ARES_DEBUG_SCROLL = true`

**Without this plugin, there's NO caret tracking logic at all!**

---

### 🚨 PROBLEM #3: App.tsx Viewport Tracking is NO-OP

**File**: `app/ui/console/src/App.tsx`
**Lines 90-93**:
```typescript
useEffect(() => {
  // NO-OP: Removed viewport tracking
  // Keeping effect for documentation purposes
}, []);
```

This was intentionally removed to let `100dvh` handle everything. This is **correct in theory**, but...

**THE ISSUE**: If ScrollIntoViewPlugin is disabled, there's NO JavaScript handling scroll at all!

---

## HTML Meta Viewport Analysis

**File**: `/home/user/ARES/app/ui/console/index.html`
**Line 7**:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-visual" />
```

**Analysis**:
- ✅ `interactive-widget=resizes-visual` is **CORRECT**
- This tells iOS to use `visualViewport` for interactive widgets (keyboard)
- This is the modern, correct approach for iOS 15+

**What this does**:
- `window.innerHeight` stays constant (layout viewport)
- `visualViewport.height` shrinks when keyboard opens
- Content extends behind keyboard
- Browser uses visualViewport for scrollIntoView calculations

**This is CORRECT!**

---

## Container Hierarchy Audit

### Level 1: html/body

```css
html, body, #root {
  height: 100%;
  min-height: 100dvh;
  overflow: hidden;  /* ← PROBLEM! */
  overscroll-behavior: none;
}
```

**Issue**: `overflow: hidden` prevents Safari from finding scroll containers!

### Level 2: .extraction-lab

```css
.extraction-lab {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  min-height: 100dvh;
  background: var(--bg-primary);
  overflow: hidden;  /* ← Container doesn't scroll */
  position: relative;
}
```

**Status**: ✅ Correct - container is fixed height, children handle scroll

### Level 3: .lab-content

**Desktop (>768px)**:
```css
.lab-content {
  display: flex;
  gap: 0;
  padding: 0;
  padding-top: 20px;
  flex: 1;
  min-height: 0;
  overflow: hidden;  /* ← Passes to children */
  align-items: stretch;
}
```

**Mobile (≤768px)**:
```css
@media (max-width: 768px) {
  .lab-content {
    overflow-y: auto;  /* ← SCROLL OWNER on mobile */
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }
}
```

**Status**: ✅ Correct scroll pattern

### Level 4: .editor-wrapper

```css
.editor-wrapper {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background-color: var(--bg-primary);
}
```

**Status**: ✅ Pass-through container

### Level 5: .rich-editor-shell

```css
.rich-editor-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 600px;
  height: 100%;
  background: var(--bg-primary, #0f1115);
  color: var(--text-primary, #e5e7eb);
  border-radius: 12px;
  border: none;
  overflow: hidden;  /* ← Contains scroll */
  overscroll-behavior: contain;
}
```

**Status**: ✅ Correct - contains scroll, prevents chaining

### Level 6: .rich-editor-surface

**Desktop (>768px)**:
```css
.rich-editor-surface {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;  /* ← SCROLL OWNER on desktop */
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}
```

**Mobile (≤768px)**:
```css
@media (max-width: 768px) {
  .rich-editor-surface {
    overflow: visible;  /* ← Let parent scroll */
    -webkit-overflow-scrolling: auto;
  }
}
```

**Status**: ✅ Correct - prevents nested scroll on mobile

---

## The Safari Scroll Container Finding Algorithm

When keyboard opens and user types, Safari needs to find the scroll container to bring caret into view.

**Safari's algorithm**:
1. Start at focused element (contentEditable)
2. Walk up DOM tree
3. Look for first ancestor with `overflow-y: auto` or `overflow-y: scroll`
4. **SKIP** elements with `overflow: hidden`
5. **STOP** at first scrollable element found
6. Scroll that element to bring caret into view

**Current situation on mobile**:

```
html (overflow: hidden) ← ❌ BLOCKS Safari
└─ body (overflow: hidden) ← ❌ BLOCKS Safari
   └─ #root (overflow: hidden) ← ❌ BLOCKS Safari
      └─ .extraction-lab (overflow: hidden)
         └─ .lab-content (overflow-y: auto) ← ✅ FIRST SCROLLABLE
            └─ .rich-editor-shell (overflow: hidden)
               └─ .rich-editor-surface (overflow: visible on mobile)
                  └─ .rich-content (contentEditable)
```

**Safari should find**: `.lab-content`
**Safari actually finds**: Might stop at `html` and scroll the entire viewport!

---

## Current State Summary

### What's Working ✅

1. **HTML meta viewport**: `interactive-widget=resizes-visual` is correct
2. **Container height**: `100dvh` stays constant when keyboard opens
3. **Scroll container pattern**: Correct dual pattern (desktop vs mobile)
4. **No JavaScript viewport tracking**: Correct, let CSS handle it

### What's Broken ❌

1. **html/body overflow: hidden**: Blocks Safari from finding scroll containers
2. **ScrollIntoViewPlugin is disabled**: No caret tracking JavaScript at all
3. **Multiple CSS definitions**: Conflicting styles override each other
4. **No active scroll management**: Browser alone might not be enough

---

## Expected vs Actual Behavior

### Expected (Working)
1. User types long text
2. Caret goes below visible area
3. Safari finds `.lab-content` scroll container
4. Safari scrolls `.lab-content` to bring caret into view
5. Caret stays visible

### Actual (Likely Happening)
1. User types long text
2. Caret goes below visible area
3. Safari walks up DOM, hits `overflow: hidden` on html/body/#root
4. Safari gives up or scrolls wrong container
5. Viewport jumps or caret becomes invisible

---

## Recommendations

### Option 1: Trust Safari (Remove overflow: hidden)

**Change**:
```css
html, body, #root {
  height: 100%;
  min-height: 100dvh;
  overflow: visible;  /* ← Let Safari find scroll containers */
  overscroll-behavior: none;
}
```

**Pro**: Simple, follows browser defaults
**Con**: Might allow unintended scrolling behaviors

### Option 2: Enable ScrollIntoViewPlugin

**Change** in `RichTextEditor.tsx`:
```tsx
// Line 180 - UNCOMMENT
<ScrollIntoViewPlugin />
```

**Pro**: Explicit control over caret positioning
**Con**: More complex, fights browser a bit

### Option 3: Hybrid (Recommended)

1. Change html/body to `overflow: visible`
2. Enable ScrollIntoViewPlugin as backup
3. Monitor with `window.ARES_DEBUG_SCROLL = true`

**Rationale**:
- Let Safari do its job (remove overflow: hidden)
- Plugin provides smooth, controlled scrolling
- Debug logging helps identify any remaining issues

---

## Testing Plan

### Step 1: Enable Debug Mode
```javascript
window.ARES_DEBUG_SCROLL = true
```

### Step 2: Test Scenario
1. Open lab on iPad Safari
2. Type 10-15 lines of text
3. Dismiss keyboard
4. Tap back into editor

### Step 3: Check Console
Should log:
- Correct scroll container (`.lab-content` on mobile)
- Caret position relative to visualViewport
- Scroll operations (direction, amount)
- Caret visibility status

### Step 4: Verify No Issues
- ✅ No viewport shifting
- ✅ Caret stays visible
- ✅ Smooth scroll
- ✅ Container doesn't shrink

---

## Technical Deep Dive: Why overflow: hidden Matters

### The Scroll Container Chain

Safari needs a clear "scroll container" to know what to scroll. With `overflow: hidden`:

```
html (overflow: hidden) ← Safari stops here, can't scroll
```

With `overflow: visible`:

```
html (overflow: visible) ← Safari keeps looking
└─ body (overflow: visible) ← Safari keeps looking
   └─ .extraction-lab (overflow: hidden) ← Safari keeps looking
      └─ .lab-content (overflow-y: auto) ← Safari finds this! ✅
```

**The fix**: Change html/body to `overflow: visible` so Safari can reach `.lab-content`.

---

## Files That Need Changes

### 1. index.css (Lines 162-173)
**Current**:
```css
html, body, #root {
  overflow: hidden;
}
```

**Change to**:
```css
html, body, #root {
  overflow: visible;
}
```

### 2. RichTextEditor.tsx (Line 180)
**Current**:
```tsx
{/* <ScrollIntoViewPlugin /> */}
```

**Change to**:
```tsx
<ScrollIntoViewPlugin />
```

### 3. Clean Up index.css
**Problem**: Multiple definitions of html/body
**Solution**: Consolidate into one clear definition

---

## Final Architecture

### Desktop (>768px)
```
.extraction-lab (100dvh, overflow: hidden)
  └─ .lab-content (flex: 1, overflow: hidden)
     └─ .rich-editor-surface (overflow-y: auto) ← SCROLLS
        └─ .rich-content
```

### Mobile (≤768px)
```
.extraction-lab (100dvh, overflow: hidden)
  └─ .lab-content (overflow-y: auto) ← SCROLLS
     └─ .rich-editor-surface (overflow: visible)
        └─ .rich-content
```

### With Safari Finding Algorithm
```
html (overflow: visible) ← Looks through
└─ body (overflow: visible) ← Looks through
   └─ #root (overflow: visible) ← Looks through
      └─ .extraction-lab (overflow: hidden) ← Looks through
         └─ .lab-content (overflow-y: auto) ← FOUND! ✅
```

---

## Conclusion

**Root Cause**: `overflow: hidden` on html/body/#root blocks Safari's scroll container finding algorithm.

**Solution**:
1. Change html/body/#root to `overflow: visible`
2. Enable ScrollIntoViewPlugin for explicit control
3. Test with debug logging enabled

**Expected Result**: Safari can find `.lab-content`, scroll it properly, keep caret visible.
