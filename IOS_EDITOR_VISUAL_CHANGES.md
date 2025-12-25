# iOS Editor Reset - Visual Change Guide

## 🎨 Side-by-Side Code Comparison

### 1. HTML/Body Styling

#### ❌ BEFORE (Broken)
```css
html {
  font-size: 100%;
  -webkit-text-size-adjust: 100%;
  background-color: var(--bg-primary);
  /* NUCLEAR OPTION: Lock html completely */
  position: fixed;              /* ← PROBLEM: Prevents scrolling */
  width: 100%;
  height: 100%;
  overflow: hidden;             /* ← PROBLEM: Blocks natural scroll */
  overscroll-behavior: none;
  margin: 0;
  padding: 0;
  touch-action: pan-x pan-y;    /* ← PROBLEM: Blocks gestures */
  -webkit-touch-callout: none;
}

body {
  background-color: var(--bg-primary);
  /* NUCLEAR OPTION: Lock body completely */
  position: fixed;              /* ← PROBLEM: Prevents scrolling */
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;             /* ← PROBLEM: Blocks natural scroll */
  overscroll-behavior: none;
  margin: 0;
  padding: 0;
  -webkit-overflow-scrolling: auto;
  touch-action: pan-x pan-y;    /* ← PROBLEM: Blocks gestures */
  -webkit-touch-callout: none;
}
```

#### ✅ AFTER (Fixed)
```css
/* Clean, minimal root styles - trust the browser */
html {
  font-size: 100%;
  -webkit-text-size-adjust: 100%;
  background-color: var(--bg-primary);
  margin: 0;
  padding: 0;
  min-height: 100dvh;           /* ← SOLUTION: Natural height */
  /* NO position: fixed - let natural scrolling work */
  /* NO overflow: hidden - browser handles this */
}

body {
  background-color: var(--bg-primary);
  margin: 0;
  padding: 0;
  min-height: 100dvh;           /* ← SOLUTION: Natural height */
  /* NO position: fixed - prevents natural keyboard handling */
  /* NO overflow: hidden - let editor handle scrolling */
}
```

**Lines:** 42 → 18 (57% reduction)

---

### 2. Root Container

#### ❌ BEFORE (Broken)
```css
#root {
  position: absolute;           /* ← PROBLEM: Fixed positioning */
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: var(--visual-viewport-height, 100%);
  min-height: 100%;
  overflow: hidden;             /* ← PROBLEM: No overflow allowed */
  display: flex;
  flex-direction: column;
  background-color: var(--bg-primary);
  padding-top: env(safe-area-inset-top, 0);
  padding-left: env(safe-area-inset-left, 0);
  padding-right: env(safe-area-inset-right, 0);
  padding-bottom: env(safe-area-inset-bottom, 0);
  contain: layout style paint;  /* ← PROBLEM: Rendering issues */
}
```

#### ✅ AFTER (Fixed)
```css
/* Root app container - flex layout, natural flow */
#root {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;           /* ← SOLUTION: Dynamic viewport */
  background-color: var(--bg-primary);
  padding-top: env(safe-area-inset-top, 0);
  padding-left: env(safe-area-inset-left, 0);
  padding-right: env(safe-area-inset-right, 0);
  padding-bottom: env(safe-area-inset-bottom, 0);
  /* NO contain - causes rendering issues with iOS keyboard */
  /* NO overflow: hidden - not needed at root level */
}
```

**Lines:** 18 → 11 (39% reduction)

---

### 3. App Shell

#### ❌ BEFORE (Broken)
```css
.app-shell {
  position: absolute;           /* ← PROBLEM: Fixed positioning */
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: var(--visual-viewport-height, 100%);
  min-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;             /* ← One of many overflow hidden */
  background-color: var(--bg-primary);
  color: var(--text-primary);
}
```

#### ✅ AFTER (Fixed)
```css
.app-shell {
  flex: 1;                      /* ← SOLUTION: Flex child */
  display: flex;
  flex-direction: column;
  min-height: 0;                /* ← Allow flex children to shrink */
  overflow: hidden;             /* ← ONLY place overflow is hidden */
  background-color: var(--bg-primary);
  color: var(--text-primary);
}
```

**Lines:** 14 → 8 (43% reduction)

---

### 4. Extraction Lab

#### ❌ BEFORE (Broken)
```css
.extraction-lab {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  min-height: 100%;
  background: var(--bg-primary);
  overflow: hidden;             /* ← Another overflow hidden layer */
  overscroll-behavior: none;
  position: relative;
  transform: translateZ(0);     /* ← GPU hack */
  -webkit-transform: translateZ(0);
}
```

#### ✅ AFTER (Fixed)
```css
.extraction-lab {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;                /* ← Allow flex children to shrink */
  background: var(--bg-primary);
  position: relative;
  /* NO overflow: hidden here - let children handle scrolling */
}
```

**Lines:** 12 → 7 (42% reduction)

---

### 5. Lab Content

#### ❌ BEFORE (Broken)
```css
.lab-content {
  display: flex;
  gap: 0;
  padding: 0;
  flex: 1;
  min-height: 0;
  height: var(--visual-viewport-height, 100%);
  overflow: hidden;             /* ← Yet another overflow hidden */
  overscroll-behavior: contain;
  align-items: stretch;
  background: transparent;
  transition: padding-left 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.editor-wrapper {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background-color: var(--bg-primary);
  overflow: hidden;             /* ← And another overflow hidden */
  overscroll-behavior: contain;
}
```

#### ✅ AFTER (Fixed)
```css
.lab-content {
  display: flex;
  gap: 0;
  padding: 0;
  flex: 1;
  min-height: 0;
  align-items: stretch;
  background: transparent;
  transition: padding-left 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  /* NO overflow: hidden - let children handle scrolling naturally */
}

.editor-wrapper {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  background-color: var(--bg-primary);
  /* NO overflow: hidden - editor panel handles scrolling */
}
```

**Lines:** 23 → 16 (30% reduction)

---

### 6. Editor Surface

#### ❌ BEFORE (Broken)
```css
.rich-editor-surface {
  position: relative;
  display: flex;
  flex-direction: column;
  height: var(--vvh, 100vh);    /* ← Complex JS-managed height */
  max-height: var(--vvh, 100vh);
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: auto;
  touch-action: pan-y;
  overscroll-behavior: contain;
  contain: layout style paint;  /* ← Rendering issues */
  will-change: scroll-position; /* ← Constant repaints */
}

@supports (height: 100dvh) {
  .rich-editor-surface {
    height: 100dvh;
    max-height: 100dvh;
  }
}
```

#### ✅ AFTER (Fixed)
```css
/* Editor surface - simple, natural scrolling */
.rich-editor-surface {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;                      /* ← Simple flex child */
  min-height: 0;                /* ← Allow flex shrinking */
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-y;
}
```

**Lines:** 21 → 12 (43% reduction)

---

### 7. JavaScript Scroll Prevention

#### ❌ BEFORE (Broken - 60 lines)
```typescript
// NUCLEAR: Prevent ALL page scrolling
useEffect(() => {
  if (typeof window === 'undefined') return;

  // Lock scroll position at 0,0
  const preventScroll = (e: Event) => {
    window.scrollTo(0, 0);
    e.preventDefault();
  };

  // Prevent scroll events
  const preventScrollEvent = () => {
    window.scrollTo(0, 0);
  };

  // Prevent touch scrolling on document
  const preventTouchMove = (e: TouchEvent) => {
    const target = e.target as HTMLElement;
    const isEditorScroll = target.closest('.editor-panel') || 
                          target.closest('.rich-editor-surface');

    if (!isEditorScroll) {
      e.preventDefault();
    }
  };

  // Lock scroll position
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  // Prevent all scroll attempts
  window.addEventListener('scroll', preventScrollEvent, { passive: false });
  window.addEventListener('touchmove', preventTouchMove, { passive: false });
  document.addEventListener('scroll', preventScrollEvent, { passive: false });
  document.addEventListener('touchmove', preventTouchMove, { passive: false });

  // Re-lock every 100ms as backup
  const lockInterval = setInterval(() => {
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }
  }, 100);

  return () => {
    window.removeEventListener('scroll', preventScrollEvent);
    window.removeEventListener('touchmove', preventTouchMove);
    document.removeEventListener('scroll', preventScrollEvent);
    document.removeEventListener('touchmove', preventTouchMove);
    clearInterval(lockInterval);
  };
}, []);
```

#### ✅ AFTER (Fixed - DELETED)
```typescript
// ✅ COMPLETELY REMOVED
// Trust browser native behavior
```

**Lines:** 60 → 0 (100% reduction)

---

### 8. Viewport Tracking

#### ❌ BEFORE (Broken - 50 lines)
```typescript
useEffect(() => {
  if (typeof window === 'undefined') return;

  const docEl = document.documentElement;
  const viewport = window.visualViewport;

  let rafId: number | null = null;
  let lastCommittedVVH = viewport?.height ?? window.innerHeight;
  let lastCommittedSlack = 120;

  const updateViewportHeight = () => {
    if (rafId) cancelAnimationFrame(rafId);

    rafId = requestAnimationFrame(() => {
      const vvHeight = viewport?.height ?? window.innerHeight;
      const fullHeight = window.innerHeight;
      const keyboardHeight = fullHeight - vvHeight;

      // Complex throttling logic...
      if (Math.abs(vvHeight - lastCommittedVVH) >= 8) {
        docEl.style.setProperty('--vvh', `${vvHeight}px`);
        lastCommittedVVH = vvHeight;
      }

      const scrollSlack = Math.max(120, keyboardHeight + 80);
      if (Math.abs(scrollSlack - lastCommittedSlack) >= 8) {
        docEl.style.setProperty('--scroll-slack', `${scrollSlack}px`);
        lastCommittedSlack = scrollSlack;
      }

      // More CSS variable updates...
    });
  };

  viewport?.addEventListener('resize', updateViewportHeight);
  viewport?.addEventListener('scroll', updateViewportHeight);
  window.addEventListener('resize', updateViewportHeight);

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    viewport?.removeEventListener('resize', updateViewportHeight);
    viewport?.removeEventListener('scroll', updateViewportHeight);
    window.removeEventListener('resize', updateViewportHeight);
  };
}, []);
```

#### ✅ AFTER (Fixed - 20 lines)
```typescript
// iOS viewport height tracking - simplified, trust browser with 100dvh
useEffect(() => {
  if (typeof window === 'undefined') return;

  const docEl = document.documentElement;
  const viewport = window.visualViewport;

  // Simple viewport tracking for debugging/monitoring
  const updateViewportHeight = () => {
    const vvHeight = viewport?.height ?? window.innerHeight;
    const keyboardHeight = window.innerHeight - vvHeight;

    // Store values for debugging (optional)
    docEl.style.setProperty('--vvh', `${vvHeight}px`);
    docEl.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
  };

  viewport?.addEventListener('resize', updateViewportHeight);
  window.addEventListener('resize', updateViewportHeight);

  return () => {
    viewport?.removeEventListener('resize', updateViewportHeight);
    window.removeEventListener('resize', updateViewportHeight);
  };
}, []);
```

**Lines:** 50 → 20 (60% reduction)

---

## 📊 Total Impact

| Component | Before | After | Reduction |
|-----------|--------|-------|-----------|
| HTML/Body | 42 lines | 18 lines | 57% |
| #root | 18 lines | 11 lines | 39% |
| .app-shell | 14 lines | 8 lines | 43% |
| .extraction-lab | 12 lines | 7 lines | 42% |
| .lab-content + wrapper | 23 lines | 16 lines | 30% |
| .rich-editor-surface | 21 lines | 12 lines | 43% |
| Scroll prevention JS | 60 lines | 0 lines | 100% |
| Viewport tracking JS | 50 lines | 20 lines | 60% |
| **TOTAL** | **240 lines** | **92 lines** | **62%** |

## 🎯 Key Principles Applied

1. **Trust the Browser**
   - Removed: `position: fixed` everywhere
   - Added: `min-height: 100dvh` (native dynamic viewport)

2. **Single Overflow Point**
   - Removed: 6+ layers of `overflow: hidden`
   - Kept: 1 layer at `.app-shell` only

3. **Natural Scrolling**
   - Removed: JavaScript scroll prevention
   - Added: Trust browser's native scroll

4. **Flex Layout**
   - Removed: Absolute positioning everywhere
   - Added: Clean flex container hierarchy

5. **No JavaScript Intervention**
   - Removed: `window.scrollTo(0, 0)` every 100ms
   - Removed: Touch event prevention
   - Added: Nothing (trust browser)

6. **Simplified CSS**
   - Removed: `contain`, `will-change`, complex heights
   - Added: Simple `flex: 1`, `overflow-y: auto`

---

**Result:** The caret stays visible, no white flash, smooth scrolling! ✨
