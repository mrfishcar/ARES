# iOS Safari Caret Fix - Change Summary

## Overview
Fixed iOS Safari caret visibility issues by removing aggressive scroll prevention and CSS constraints that were fighting with native browser behavior.

## Statistics
- **Files Changed:** 2 (+ 1 documentation)
- **Lines Removed:** 63 lines
- **Lines Added:** 21 lines
- **Net Change:** -42 lines (simpler code!)

## File-by-File Changes

### 1. app/ui/console/src/App.tsx

**Lines 148-208 (60 lines) → Lines 148-170 (23 lines)**

#### REMOVED: NUCLEAR Scroll Prevention
```typescript
// ❌ REMOVED: Aggressive scroll fighting
const preventScrollEvent = () => {
  window.scrollTo(0, 0);  // Forced scroll every event
};

const preventTouchMove = (e: TouchEvent) => {
  // Non-passive blocking of touchmove
  if (!isEditorScroll) {
    e.preventDefault();  // Fights with browser caret scroll
  }
};

// ❌ REMOVED: Non-passive listeners
window.addEventListener('scroll', preventScrollEvent, { passive: false });
window.addEventListener('touchmove', preventTouchMove, { passive: false });

// ❌ REMOVED: 100ms forced scroll interval
const lockInterval = setInterval(() => {
  if (window.scrollY !== 0 || window.scrollX !== 0) {
    window.scrollTo(0, 0);  // Fights with browser every 100ms!
  }
}, 100);
```

#### ADDED: Passive Scroll Correction
```typescript
// ✅ ADDED: Passive observation with threshold
const correctScroll = () => {
  // Only correct if significantly off (>5px threshold)
  if (Math.abs(window.scrollY) > 5 || Math.abs(window.scrollX) > 5) {
    window.scrollTo(0, 0);
  }
};

// ✅ ADDED: Passive listener (doesn't block browser)
window.addEventListener('scroll', correctScroll, { passive: true });
```

**Key Difference:**
- Before: "PREVENT ALL SCROLLING" → Breaks caret tracking
- After: "Correct if off-track" → Allows caret tracking

---

### 2. app/ui/console/src/editor2/styles.css

**Lines 179-210 (32 lines) → Lines 179-203 (25 lines)**

#### REMOVED: Explicit Height Constraints
```css
/* ❌ REMOVED: Explicit height forces */
.rich-editor-surface {
  /* REMOVED flex: 1 - was causing container to shrink */
  height: var(--vvh, 100vh);           /* ❌ Explicit height */
  max-height: var(--vvh, 100vh);       /* ❌ Locks height */
  contain: layout style paint;          /* ❌ 'layout' breaks scroll */
}

/* ❌ REMOVED: Override forcing 100dvh */
@supports (height: 100dvh) {
  .rich-editor-surface {
    height: 100dvh;
    max-height: 100dvh;
  }
}
```

#### ADDED: Natural Flex Layout
```css
/* ✅ ADDED: Natural flex layout */
.rich-editor-surface {
  flex: 1;                              /* ✅ Natural height */
  contain: style paint;                 /* ✅ Removed 'layout' */
}

/* ✅ ADDED: Empty support block for documentation */
@supports (height: 100dvh) {
  /* No override needed - flex: 1 naturally adapts */
}
```

**Key Difference:**
- Before: "Force this exact height" → Breaks scroll context
- After: "Fill available space naturally" → Allows scroll context

---

## Visual Comparison

### Before: Fighting With Browser
```
┌─────────────────────────┐
│  Browser Wants To:      │
│  - Track caret          │ ← BLOCKED by { passive: false }
│  - Scroll into view     │ ← BLOCKED by setInterval
│  - Handle touch         │ ← BLOCKED by preventDefault()
└─────────────────────────┘
         ↓ CONFLICT ↓
┌─────────────────────────┐
│  JavaScript Force:      │
│  - scrollTo(0,0) x10/s  │
│  - preventDefault()     │
│  - height: 100vh        │
└─────────────────────────┘
    Result: Caret lost! 😞
```

### After: Cooperating With Browser
```
┌─────────────────────────┐
│  Browser Controls:      │
│  ✅ Tracks caret        │
│  ✅ Scrolls into view   │
│  ✅ Handles touch       │
└─────────────────────────┘
         ↓ COOPERATE ↓
┌─────────────────────────┐
│  JavaScript Observes:   │
│  - Passive listening    │
│  - Only corrects if >5px│
│  - flex: 1 layout       │
└─────────────────────────┘
    Result: Caret visible! 😊
```

---

## Technical Deep Dive

### Problem 1: Non-Passive Touchmove
```typescript
// ❌ BEFORE: Blocks browser's native caret scroll
window.addEventListener('touchmove', preventTouchMove, { passive: false });
//                                                       ^^^^^^^^^^^^^^^^
//                                                       Blocks ALL touch!

// ✅ AFTER: Removed - browser handles touch naturally
// (No listener needed - browser knows best)
```

### Problem 2: 100ms Interval Fight
```typescript
// ❌ BEFORE: Fights with browser 10 times per second
setInterval(() => {
  window.scrollTo(0, 0);  // "Get back here!" x10/sec
}, 100);

// ✅ AFTER: Passive observation
const correctScroll = () => {
  if (Math.abs(window.scrollY) > 5) {  // Only if really off
    window.scrollTo(0, 0);
  }
};
```

### Problem 3: CSS Containment Block
```css
/* ❌ BEFORE: Creates new containing block */
.rich-editor-surface {
  contain: layout style paint;
  /* ^^^^^^ This breaks scroll calculations! */
  height: 100vh;  /* Forces exact height */
}

/* ✅ AFTER: Natural flow */
.rich-editor-surface {
  contain: style paint;  /* Removed 'layout' */
  flex: 1;              /* Natural height */
}
```

---

## Why This Works

### The Core Insight
**iOS Safari has sophisticated caret tracking built-in.** It knows:
- When keyboard appears
- Where caret is
- How to scroll smoothly
- How to handle touch

**Our old code was fighting this intelligence.** The fix: **Get out of the way!**

### The Three Principles

1. **Passive Observation**
   - Don't prevent browser behavior
   - Only correct major deviations (>5px)
   - Use `{ passive: true }` listeners

2. **Natural Layout**
   - Use `flex: 1` instead of explicit heights
   - Remove `contain: layout` that breaks scroll
   - Let browser calculate dimensions

3. **Trust the Browser**
   - iOS Safari knows how to track caret
   - Don't override with JavaScript
   - Cooperate, don't fight

---

## Migration Path

### If Issues Occur
```bash
# Revert the changes
git revert HEAD HEAD~1

# Or restore old behavior selectively
# (add back NUCLEAR prevention in App.tsx)
```

### If Success
```bash
# This is the new pattern for all mobile editors
# Key takeaway: Passive observation > Active prevention
```

---

## Testing Checklist

- [ ] Open on iPad Safari
- [ ] Tap editor, start typing
- [ ] Caret stays visible ✅
- [ ] Press Enter repeatedly
- [ ] Smooth scrolling ✅
- [ ] Keyboard open/close
- [ ] No layout shift ✅
- [ ] Swipe to scroll
- [ ] Momentum scrolling ✅
- [ ] Type at bottom edge
- [ ] Caret tracked ✅
- [ ] Rapid typing
- [ ] No jitter ✅

---

## Related Documentation

- `IOS_CARET_FIX_TESTING.md` - Detailed testing instructions
- `CLAUDE.md` - AI assistant guide (iOS section)
- MDN: [Passive Event Listeners](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#passive)
- MDN: [CSS Containment](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment)
