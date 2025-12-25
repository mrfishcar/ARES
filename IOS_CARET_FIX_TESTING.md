# iOS Safari Caret Visibility Fix - Testing Guide

## Problem Fixed
On iOS Safari/iPad, the editor caret was not reliably staying visible while typing or pressing Enter. The page would over-scroll, text/caret felt jittery, and native browser caret-following behavior was broken.

## Root Causes Fixed

### 1. NUCLEAR Scroll Prevention in App.tsx
**Before:**
- Aggressive 100ms interval forcing `window.scrollTo(0,0)`
- Non-passive touchmove prevention with `{ passive: false }` blocking native scroll
- Prevented ALL touchmove events, fighting with browser's caret tracking

**After:**
- Passive scroll listener with 5px threshold
- No touchmove blocking - browser handles it naturally
- Allows native iOS caret tracking behavior to work

### 2. CSS `contain: layout` Breaking Scroll Context
**Before:**
```css
.rich-editor-surface {
  contain: layout style paint;  /* Creates new containing block */
  height: var(--vvh, 100vh);
  max-height: var(--vvh, 100vh);
}
```

**After:**
```css
.rich-editor-surface {
  contain: style paint;  /* Removed 'layout' */
  flex: 1;              /* Natural height instead of explicit */
}
```

### 3. Explicit Height Constraints
**Before:**
- `height: var(--vvh, 100vh)` and `max-height` forced explicit heights
- `@supports (height: 100dvh)` override forced 100dvh

**After:**
- `flex: 1` allows natural filling of available space
- No explicit height/max-height constraints
- Empty `@supports` block (kept for documentation)

## Files Changed

1. **app/ui/console/src/App.tsx** (lines 148-170)
   - Replaced NUCLEAR scroll prevention with passive correction
   - Removed 100ms forced scrollTo interval
   - Removed non-passive touchmove blocking

2. **app/ui/console/src/editor2/styles.css** (lines 179-203)
   - Changed `contain: layout style paint` → `contain: style paint`
   - Changed explicit heights to `flex: 1`
   - Removed 100dvh override

## Testing Instructions

### Prerequisites
- iPad or iPhone with Safari
- Open Extraction Lab at `/` route

### Test Cases

#### 1. Basic Typing
1. Tap into editor
2. Type several words
3. **✅ Expected:** Caret stays visible, smoothly scrolls into view
4. **❌ Before:** Caret jumps, disappears, or page bounces

#### 2. Multiline Entry
1. Type a long paragraph (200+ characters)
2. Press Enter repeatedly to create multiple lines
3. **✅ Expected:** Smooth scrolling, caret always visible
4. **❌ Before:** Jittery scroll, caret lost

#### 3. Keyboard Open/Close
1. Tap editor (keyboard opens)
2. Tap outside editor (keyboard closes)
3. Repeat several times
4. **✅ Expected:** No whole-UI layout shift, smooth transitions
5. **❌ Before:** Whole page jumps when keyboard appears/disappears

#### 4. Momentum Scrolling
1. Type enough content to make editor scrollable
2. Swipe up/down in editor with finger
3. **✅ Expected:** Native iOS momentum scrolling (bounce effect)
4. **❌ Before:** Scrolling blocked or janky

#### 5. Caret at Bottom Edge
1. Fill editor with content until caret is at bottom
2. Press Enter to add new line
3. **✅ Expected:** Editor scrolls smoothly to keep caret visible
4. **❌ Before:** Caret disappears, page bounces, or no scroll

#### 6. Rapid Typing
1. Type quickly without pausing
2. Press Enter while typing
3. **✅ Expected:** No jitter, caret always visible
4. **❌ Before:** Jittery movement, caret interruption

## Expected Outcomes

### ✅ Success Criteria
- Keyboard opens: No whole-UI layout shift
- Typing/Enter: Caret stays visible reliably
- No bouncing/jitter during typing
- Native iOS momentum scrolling works in editor
- Smooth caret tracking when pressing Enter
- One scroll system "owns" the experience (browser physics)

### Technical Explanation

The fix works by:
1. **Removing scroll fighting:** The NUCLEAR prevention was actively fighting browser's native caret scroll
2. **Restoring natural flow:** `flex: 1` lets the browser calculate height naturally
3. **Removing containment block:** `contain: layout` was creating a new containing block that broke scroll calculations
4. **Passive observation:** We observe scroll but don't prevent it, allowing browser to do its job

The body `position: fixed` (in index.css) is kept to prevent keyboard-induced layout shift, but the editor container can now scroll naturally within that fixed viewport.

## Rollback Plan

If issues occur, revert with:
```bash
git revert HEAD
```

This will restore the NUCLEAR scroll prevention and explicit height constraints.

## Notes

- The TypeScript build errors visible during `npm run build` are pre-existing and unrelated to this fix
- This fix prioritizes native browser behavior over aggressive JavaScript control
- The key insight: Let the browser handle caret tracking - it knows best for iOS
