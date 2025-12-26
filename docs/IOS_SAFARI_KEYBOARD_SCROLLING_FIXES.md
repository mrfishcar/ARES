# iOS Safari Keyboard Scrolling - What Works & What Doesn't

**Problem**: iPad/iOS Safari keyboard behavior in rich text editor
**Date**: December 2024
**Status**: SOLVED (reverted to simple approach)

---

## The Problem

When typing in the Lexical rich text editor on iPad Safari:

1. **Viewport shifts** when keyboard reopens after dismissing
2. **Caret becomes invisible** when typing long text (goes below keyboard)
3. **Entire page scrolls** instead of just the editor content
4. **User can manually slide the UI up/down** even when keyboard is open

**Goal**: Lock the page viewport completely, only allow editor scroll container to scroll, keep caret visible above keyboard.

---

## What We Tried (Chronologically)

### ❌ Attempt 1: Editor-as-Document Pattern

**Approach**:
```css
html, body {
  overflow: hidden; /* Changed from visible */
}

.editor-scroll-container {
  flex: 1;
  overflow-y: auto; /* Single scroll owner */
}
```

**Result**: FAILED
- User: "still able to manually slide the entire UI up and down"
- Viewport was still scrolling

**Commits**: 5b8e9e1, 1b8d29b, d911258

---

### ❌ Attempt 2: KeyboardLockPlugin with kb-open Class

**Approach**:
```typescript
// Add kb-open class when editor focused
editor.registerCommand(FOCUS_COMMAND, () => {
  document.documentElement.classList.add('kb-open');
});
```

```css
html.kb-open {
  position: fixed;
  overflow: hidden;
}
```

**Result**: FAILED
- Same behavior - viewport still scrolling
- Class approach didn't help

**Commits**: 1522602, f360d8d

---

### ❌ Attempt 3: Inline position: fixed + Scroll Snap-back

**Approach**:
```typescript
<style>{`
  html, body {
    position: fixed;
    inset: 0;
  }
`}</style>

// Nuclear option: force scroll to 0,0
visualViewport.addEventListener('scroll', () => {
  window.scrollTo(0, 0);
});
```

**Result**: FAILED (but showed progress)
- User: "viewport is still being allowed to scroll, but it's being snapped back into place"
- User: "the carrot is not being tracked"
- Scroll was happening THEN snapping back (not ideal)

**Commits**: 0964beb

---

### ❌ Attempt 4: Move position: fixed to Global CSS

**Approach**:
```css
/* In index.css instead of inline styles */
html, body {
  position: fixed;
  inset: 0;
  overflow: hidden;
}
```

**Reasoning**: Maybe inline styles don't have enough specificity on iOS

**Result**: FAILED
- User: "scroll lock counter is still going up"
- Didn't help at all

**Commits**: f2397a2

---

### ❌ Attempt 5: Nuclear Options - touchmove preventDefault

**Approach**:
```typescript
// Block ALL touchmove events outside scroll container
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest('.scroll-container')) {
    e.preventDefault();
  }
}, { passive: false });
```

**Result**: FAILED
- User: "scroll lock counter still going up"
- Even blocking touch events didn't prevent scroll

**Commits**: 680e96f

---

### ❌ Attempt 6: ChatGPT "Scroll Jail" Pattern

**Approach**: Applied ALL of ChatGPT's recommendations:
```css
html, body {
  position: fixed;
  inset: 0;
  touch-action: none; /* Prevent gesture scrolling */
  overscroll-behavior: none;
}

.scroll-container {
  touch-action: pan-y; /* Allow scroll here only */
}
```

```typescript
// Edge nudging
scrollContainer.addEventListener('touchstart', () => {
  if (scrollContainer.scrollTop === 0) {
    scrollContainer.scrollTop = 1; // Prevent upward chaining
  }
});

// Lock both window.scroll AND visualViewport.scroll
window.addEventListener('scroll', () => window.scrollTo(0, 0));
visualViewport.addEventListener('scroll', () => window.scrollTo(0, 0));
```

**Result**: FAILED
- All the aggressive techniques made it WORSE
- Too much fighting with iOS instead of working with it

**Commits**: a1beb1f

---

## 🎉 Breakthrough: Found Working Commit

**User found**: Deployment at commit `be09094b` where it WORKS!

**Compared working vs broken code and found the issue:**

### ✅ What Actually Works (commit be09094b)

**Approach**:
```css
/* SIMPLE - No position: fixed! */
html, body {
  height: 100vh;
  height: 100dvh;  /* iOS fallback */
  margin: 0;
  padding: 0;
  overflow: hidden;
  overscroll-behavior: none;
}

#root {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}
```

**NO**:
- ❌ NO `position: fixed`
- ❌ NO `touch-action: none`
- ❌ NO aggressive `touchmove` preventDefault
- ❌ NO edge nudging
- ❌ NO scroll snap-back listeners

**YES**:
- ✅ Just `overflow: hidden`
- ✅ Just `height: 100vh/100dvh`
- ✅ Just `overscroll-behavior: none`
- ✅ Let iOS handle scroll naturally

**Result**: WORKS! 🎉
- Viewport doesn't scroll
- Simple and clean
- Works WITH iOS instead of fighting it

**Commits**: 8dc933dd (revert to working approach)

---

## Key Learnings

### 1. `position: fixed` Breaks iOS Scrolling

**Why**: Creates a new stacking/positioning context that confuses iOS's scroll management. The browser then tries to scroll the visual viewport behind the fixed element.

**Lesson**: Don't use `position: fixed` on html/body for scroll locking on iOS.

---

### 2. iOS Safari Wants to Scroll - Don't Fight It

All these aggressive techniques made it WORSE:
- `touchmove` preventDefault
- `touch-action: none`
- Scroll snap-back with `window.scrollTo(0, 0)`
- Edge nudging

**Why they failed**: iOS has complex scroll management (layout viewport vs visual viewport, keyboard handling, rubber-banding). When you fight it with event blocking, you create conflicts.

**Lesson**: Work WITH iOS's scroll behavior, not against it.

---

### 3. Simple Solutions Are Better

**Complex approach (didn't work)**:
- 50+ lines of scroll locking code
- Multiple event listeners
- Aggressive preventDefault
- Edge case handling
- Fighting the browser

**Simple approach (works)**:
```css
html, body {
  height: 100vh;
  overflow: hidden;
}
```

**Lesson**: Try the simple approach first. If that doesn't work, understand WHY before adding complexity.

---

### 4. Inline Styles vs Global CSS Doesn't Matter

We tried moving `position: fixed` from inline `<style>` tags to global `index.css` - didn't help.

**Lesson**: The problem was `position: fixed` itself, not where it was defined.

---

### 5. ChatGPT Advice Can Be Wrong

ChatGPT suggested the "scroll jail" pattern with `touch-action: none`, edge nudging, etc. All of it made things worse.

**Lesson**: AI suggestions need to be tested. Sometimes simpler is better.

---

### 6. Find Working Examples to Compare

**Breakthrough moment**: User found deployment at commit `be09094b` where it worked, allowing direct comparison.

**Lesson**: When stuck, find a working version and diff the code. Don't keep trying variations blindly.

---

## Caret Tracking (Separate Issue)

The caret tracking is still needed because iOS Safari doesn't automatically scroll `contentEditable` or `textarea` elements to keep the caret visible when they're inside a scroll container.

### ✅ What Works for Caret Tracking

**Approach**:
```typescript
// Check caret position every frame
const trackCaret = () => {
  const caretY = calculateCaretPosition();
  const containerHeight = scrollContainer.clientHeight;
  const scrollTop = scrollContainer.scrollTop;

  // Define danger zones
  const topDangerZone = scrollTop + (containerHeight * 0.25);
  const bottomDangerZone = scrollTop + (containerHeight * 0.65);

  // Scroll if caret enters danger zone
  if (caretY > bottomDangerZone || caretY < topDangerZone) {
    scrollContainer.scrollTop = caretY - (containerHeight * 0.4);
  }
};

// Track continuously
requestAnimationFrame(trackCaret);

// Also track on events
textarea.addEventListener('input', trackCaret);
visualViewport.addEventListener('resize', trackCaret); // Keyboard show/hide
```

**Key points**:
- Define "danger zones" (top 25%, bottom 35% of visible area)
- Target position: 40% down the screen (safe from keyboard)
- Continuous tracking via `requestAnimationFrame`
- Also trigger on input and viewport resize

**Status**: This approach works well for manual caret tracking.

---

## Final Solution Summary

### For Viewport Lock

```css
/* index.css */
html, body {
  height: 100vh;
  height: 100dvh;
  margin: 0;
  padding: 0;
  overflow: hidden;
  overscroll-behavior: none;
}

#root {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}
```

**That's it!** No JavaScript, no event listeners, no position: fixed.

---

### For Caret Tracking (in Lexical editor)

```typescript
// ScrollIntoViewPlugin.tsx
useEffect(() => {
  const trackCaret = () => {
    const selection = $getSelection();
    const scrollContainer = editorElement.closest('.editor-scroll-container');

    // Get caret position
    const range = window.getSelection()?.getRangeAt(0);
    const rect = range?.getBoundingClientRect();

    // Scroll if in danger zone
    if (isInDangerZone(rect, scrollContainer)) {
      scrollContainer.scrollTop = calculateTargetScroll(rect);
    }
  };

  // Track on selection change
  return editor.registerUpdateListener(() => {
    trackCaret();
  });
}, [editor]);
```

---

## Testing Checklist

When testing iOS scroll fixes:

- [ ] **SCROLL LOCKS counter stays at 0** (viewport not scrolling)
- [ ] **Cannot manually slide page up/down** with finger
- [ ] **Caret stays visible** when typing (CARET TRACKS counter increases)
- [ ] **Caret tracks both up and down** (type, then use arrow keys to go up)
- [ ] **Works when keyboard opens/closes/reopens**
- [ ] **No rubber-banding** or scroll chaining at edges
- [ ] **Diagnostics show winY=0** (window.scrollY never changes)

---

## Reference Commits

- `be09094b` - **WORKING** version (simple approach)
- `8dc933dd` - **REVERT** to working approach (current)
- `a1beb1f` - Broken: ChatGPT scroll jail (too aggressive)
- `680e96f` - Broken: touchmove preventDefault
- `f2397a2` - Broken: position: fixed in global CSS
- `0964beb` - Broken: inline position: fixed + scroll snap-back
- `5b8e9e1` - Broken: Editor-as-Document pattern (first attempt)

---

## Related Files

- `/app/ui/console/src/index.css` - Global CSS (viewport lock)
- `/app/ui/console/src/pages/UltraMinimalTest.tsx` - Test page with diagnostics
- `/app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx` - Caret tracking (Lexical)
- `/app/ui/console/src/pages/ExtractionLab.tsx` - Main editor page

---

## Notes

- This issue is specific to **iOS Safari** (particularly iPad)
- Desktop browsers don't have this problem
- The issue involves **layout viewport vs visual viewport** differences in iOS
- iOS keyboard changes the visual viewport height but not the layout viewport
- Simple CSS solutions work better than complex JavaScript workarounds

**Last Updated**: December 26, 2024
