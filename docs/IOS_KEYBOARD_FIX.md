# iOS Keyboard & Cursor Fix - PERMANENT DOCUMENTATION

**Date**: 2025-12-11
**Issue**: iOS/iPad keyboard causing invisible typing, cursor jumping, paste deactivation, white space scrolling
**Status**: ✅ RESOLVED

---

## 🚨 CRITICAL: DO NOT CHANGE THESE SETTINGS

The following code in `app/ui/console/src/components/CodeMirrorEditor.tsx` **MUST NOT** be modified:

### ❌ NEVER DO THIS:
```typescript
// ❌ WRONG - Causes keyboard focus issues on iOS
view.dom.setAttribute('contenteditable', 'true');
```

### ✅ ALWAYS DO THIS:
```typescript
// ✅ CORRECT - Let CodeMirror manage contenteditable internally
// Only set spellcheck/autocorrect on contentDOM
const contentEditableElement = view.contentDOM;
if (contentEditableElement) {
  contentEditableElement.setAttribute('spellcheck', 'true');
  contentEditableElement.setAttribute('autocorrect', 'on');
  contentEditableElement.setAttribute('autocapitalize', 'sentences');
}
```

---

## The Problem

### User-Reported Symptoms:
1. **First tap**: Keyboard appears, typing works
2. **Second tap**: Paste option deactivates in iOS keyboard
3. **Typing becomes invisible**: Text appears in wrong location or not at all
4. **Cursor jumps**: Cursor moves randomly while typing
5. **White space**: Can drag viewport up when keyboard is visible, revealing white space
6. **Stuttering scroll**: Scrolling was janky and had hiccups
7. **Invisible cursor**: After initial fix, cursor disappeared entirely

---

## Root Causes

### 1. CodeMirror contenteditable Mode Bug
**Source**: [CodeMirror Issue #6242](https://github.com/codemirror/codemirror5/issues/6242)

CodeMirror has **TWO input modes**:
- `textarea` mode (desktop default) - ✅ Works well
- `contenteditable` mode (mobile default) - ⚠️ Has iOS bugs

**The bug**: Manually setting `contenteditable='true'` on `view.dom` forces the problematic contenteditable mode, causing:
- Input element loses focus while typing
- Cursor jumps to different positions
- Paste functionality deactivates
- Typing becomes invisible

### 2. iOS Viewport Height Issue
**Problem**: Using `100vh` (viewport height) on iOS doesn't account for the keyboard.

When keyboard appears:
- Visual viewport shrinks (what you see)
- Layout viewport stays full height (what CSS uses)
- Elements sized with `100vh` extend beyond visible area
- Result: White space appears below content

### 3. Missing Cursor Styling
**Problem**: CodeMirror's `.cm-cursor` class had no styling defined.

Without explicit cursor styling:
- Browser doesn't render visible cursor
- User can type but can't see where
- iOS Safari particularly affected

---

## The Solution

### Fix 1: Remove Manual contenteditable Override
**File**: `app/ui/console/src/components/CodeMirrorEditor.tsx` (lines 356-370)

```typescript
const view = new EditorView({
  state,
  parent: wrapperRef.current,
});

// ✅ iPadOS autocorrect & spellcheck
// NOTE: Don't manually set contenteditable - CodeMirror handles this
// Setting it manually causes iOS keyboard focus issues (cursor jumping, invisible typing)
view.dom.setAttribute('spellcheck', 'true');
view.dom.setAttribute('autocorrect', 'on');
view.dom.setAttribute('autocapitalize', 'sentences');

// Force focus on the editor's contenteditable element on iOS
// This ensures keyboard appears and stays connected to the editor
const contentEditableElement = view.contentDOM;
if (contentEditableElement) {
  contentEditableElement.setAttribute('spellcheck', 'true');
  contentEditableElement.setAttribute('autocorrect', 'on');
  contentEditableElement.setAttribute('autocapitalize', 'sentences');
}
```

**Why it works**:
- `view.dom` is the wrapper element - should NOT be contenteditable
- `view.contentDOM` is the actual editable content - CodeMirror manages its contenteditable state
- Applying attributes to contentDOM instead of dom lets CodeMirror handle input mode correctly

### Fix 2: Use Dynamic Viewport Height
**File**: `app/ui/console/src/index.css` (lines 135-144)

```css
html,
body,
#root {
  height: 100%;
  /* Use ONLY dynamic viewport height to fix iOS keyboard white space */
  min-height: 100dvh;
  /* Prevent scrolling to fix white bar and white space issues */
  overflow: hidden;
  overscroll-behavior: none;
  -webkit-overflow-scrolling: touch;
}
```

**Why it works**:
- `100dvh` (dynamic viewport height) adjusts when keyboard appears
- Removed conflicting `100vh` (static viewport height)
- `overflow: hidden` prevents scrolling beyond viewport
- Result: No white space, no stuttering scroll

### Fix 3: Add Cursor Visibility Styling
**File**: `app/ui/console/src/components/CodeMirrorEditor.tsx` (lines 76-82, 101-105)

```typescript
'.cm-content': {
  paddingTop: 'var(--editor-header-offset, 80px)',
  paddingRight: 'var(--editor-margin-desktop, 96px)',
  paddingBottom: '40px',
  paddingLeft: 'var(--editor-margin-desktop, 96px)',
  boxSizing: 'border-box',
  caretColor: 'var(--text-primary)', // ✅ Ensure cursor is visible on iOS
},

// ✅ iOS cursor visibility fix
'.cm-cursor, .cm-dropCursor': {
  borderLeftColor: 'var(--text-primary)',
  borderLeftWidth: '2px',
},
```

**Why it works**:
- `caretColor` sets the native browser cursor color
- `.cm-cursor` styling ensures CodeMirror's custom cursor is visible
- `.cm-dropCursor` handles drag-and-drop cursor visibility

---

## Test Results

### Before Fix:
- ❌ Typing after second tap: Invisible
- ❌ Cursor position: Jumps randomly
- ❌ Paste: Deactivates in iOS keyboard
- ❌ Scrolling: Stutters and shows white space
- ❌ Cursor: Invisible
- ❌ iOS status bar: White (wrong for dark theme)

### After Fix:
- ✅ Typing: Works immediately, stays visible
- ✅ Cursor position: Stable, no jumping
- ✅ Paste: Always available
- ✅ Scrolling: Smooth, no hiccups
- ✅ Cursor: Visible and stable
- ✅ No white space when keyboard appears
- ✅ iOS status bar: Black with white icons (matches dark theme)

---

## Related Issues & References

### CodeMirror iOS Issues:
1. [Input focus loss while typing](https://github.com/codemirror/codemirror5/issues/6242) - **Exact match for our bug**
2. [iOS cursor control bugs](https://github.com/codemirror/codemirror5/issues/1195)
3. [iOS support limitations](https://github.com/codemirror/codemirror5/issues/60)
4. [Cursor displayed outside editor on iOS](https://github.com/codemirror/dev/issues/459)
5. [iOS spacebar cursor disappears](https://github.com/codemirror/codemirror5/issues/6702)

### iOS Safari Cursor Limitations:
- [Can't see cursor at all discussion](https://discuss.codemirror.net/t/cant-see-cursor-at-all/5267)
- [Cursor visibility issues](https://discuss.codemirror.net/t/codemirror-cursor-is-not-partially-visible/648)

---

## What NOT to Do

### ❌ Don't Set contenteditable on view.dom
```typescript
// ❌ NEVER DO THIS - Breaks iOS keyboard
view.dom.setAttribute('contenteditable', 'true');
```

### ❌ Don't Use 100vh for Full Height on iOS
```css
/* ❌ NEVER DO THIS - Causes white space on iOS */
min-height: 100vh;
```

### ❌ Don't Allow Body/Root Overflow
```css
/* ❌ NEVER DO THIS - Causes scrolling issues on iOS */
html, body, #root {
  overflow: auto;
}
```

### ❌ Don't Forget Cursor Styling
```typescript
// ❌ NEVER REMOVE THIS - Makes cursor invisible
'.cm-cursor, .cm-dropCursor': {
  borderLeftColor: 'var(--text-primary)',
  borderLeftWidth: '2px',
},
```

---

## Debugging Checklist

If iOS keyboard issues return, check:

1. **Is contenteditable manually set on view.dom?**
   ```bash
   grep -n "view.dom.setAttribute('contenteditable'" app/ui/console/src/components/CodeMirrorEditor.tsx
   ```
   Should return: **No matches** ✅

2. **Is 100vh used instead of 100dvh?**
   ```bash
   grep "min-height: 100vh" app/ui/console/src/index.css
   ```
   Should return: **No matches** ✅

3. **Is cursor styling present?**
   ```bash
   grep -A2 "cm-cursor" app/ui/console/src/components/CodeMirrorEditor.tsx
   ```
   Should return: Styling with borderLeftColor ✅

4. **Is overflow set to hidden?**
   ```bash
   grep -A5 "html," app/ui/console/src/index.css | grep overflow
   ```
   Should return: `overflow: hidden` ✅

---

## Future Considerations

### If You Need to Add Mobile Features:
1. **Always test on actual iPad/iOS device** (simulators don't catch these bugs)
2. **Check CodeMirror 6 docs** for mobile-specific extensions
3. **Never override CodeMirror's DOM management** (contenteditable, focus, etc.)
4. **Use CSS variables** for theme-dependent styling (cursor color, etc.)

### If Upgrading CodeMirror:
1. **Check release notes** for iOS keyboard fixes
2. **Test on iPad** before deploying
3. **Verify contentDOM behavior** hasn't changed

---

## iOS Status Bar Color Fix

### The Problem
The iOS status bar (WiFi, time, battery icons) was showing **white** instead of **black** to match the dark theme.

**Root cause**: Using deprecated `black-translucent` meta tag value from pre-iOS 14.5.

### The Solution
**File**: `app/ui/console/index.html` (line 10)

```html
<!-- iOS 14.5+ status bar: light-content = dark bar with white text/icons -->
<meta name="apple-mobile-web-app-status-bar-style" content="light-content" />
```

### iOS 14.5+ Status Bar Values:
- `light-content` = Dark bar with white icons ✅ (for dark-themed apps)
- `dark-content` = White bar with dark icons (for light-themed apps)
- `default` = System default
- ~~`black-translucent`~~ = Deprecated, buggy on iOS 14.5+
- ~~`black`~~ = Deprecated, shows white instead of black (known bug)

**Why it works**:
- `light-content` gives dark/black status bar background
- White text and icons for high contrast
- Works properly on iOS 14.5+ (modern value)

**What was accidentally fixing it before**:
- `overflow: hidden` prevented white background from bleeding through the translucent status bar
- But proper fix is to use the correct meta tag value

### References:
- [iOS 14.5 PWA Changes](https://firt.dev/ios-14.5/)
- [Changing iOS Status Bar](https://medium.com/appscope/changing-the-ios-status-bar-of-your-progressive-web-app-9fc8fbe8e6ab)
- [Complete guide to customizing mobile status bar](https://intercom.help/progressier/en/articles/10574799-complete-guide-to-customizing-the-mobile-status-bar-in-a-website-or-pwa)

---

## Commit History

### Relevant Commits (claude/fix-save-keyboard-focus-01GFaMhAYfSzRo9uUittyMPy):
1. `c725fe2` - Remove interfering pointer handler to fix cursor placement
2. `21228eb` - Prevent cursor jumping and fix iOS keyboard white space
3. `5405c2c` - Add /documents endpoints without /api prefix for frontend compatibility
4. `7247b99` - Add cmd+s save shortcut and fix keyboard focus issues
5. `fe3a8c3` - Add cursor visibility styling for iOS

---

## Contact

If iOS keyboard issues return:
1. **READ THIS DOCUMENT FIRST**
2. Check the debugging checklist above
3. Review commit history for what changed
4. Test on actual iPad (not simulator)
5. Check CodeMirror GitHub issues for new iOS bugs

---

## Layer Coverage Fix (Dec 2025) - ExtractionLab

### The Problem
White corners/edges visible behind iOS keyboard, even though ExtractionLab uses Lexical editor (not CodeMirror).

**Root causes**:
1. index.html had NO background color (browser default = white)
2. ThemeContext DEFAULT_THEME had `background: '#ffffff'`
3. darkMode.ts only set data attributes, didn't enforce backgrounds
4. Missing `!important` priority on inline styles

### The Solution: Complete Layer Coverage

**Philosophy**: Every layer from html → body → #root needs proper backgrounds with `!important`.

#### 1. index.html - First Paint Protection
**File**: `app/ui/console/index.html`
```html
<html lang="en" style="background: #FFF9F0 !important;" data-theme="light">
  <body style="background: #FFF9F0 !important; color: #4A403A !important; margin: 0 !important;">
```

#### 2. darkMode.ts - Runtime Enforcement
**File**: `app/ui/console/src/utils/darkMode.ts`
```typescript
export function applyTheme(mode: ThemeMode): void {
  // Light theme
  htmlElement.style.setProperty('background', '#FFF9F0', 'important');
  bodyElement.style.setProperty('background', '#FFF9F0', 'important');
  // Dark theme
  htmlElement.style.setProperty('background', '#0a0e27', 'important');
  bodyElement.style.setProperty('background', '#0a0e27', 'important');
}
```

#### 3. NIGHT_SKY_PALETTE - Aligned Colors
**File**: `app/ui/console/src/utils/darkMode.ts`
```typescript
export const NIGHT_SKY_PALETTE = {
  light: { background: '#FFF9F0' },  // Warm, not white!
  dark: { background: '#0a0e27' },   // Night sky
};
```

#### 4. ScrollIntoViewPlugin - Disabled Custom Tracking
**File**: `app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx`

**Previous**: Complex visualViewport tracking with double-rAF, debouncing, 80px margins

**Current**: Let Safari handle it natively
```typescript
export function ScrollIntoViewPlugin() {
  return null;  // Safari's native scrollIntoView works perfectly now
}
```

**Why**: Fixing layer coverage was the real solution. No JavaScript needed.

### Test Results
- ✅ Light theme: Warm background (#FFF9F0) behind keyboard, no white edges
- ✅ Dark theme: Night sky background (#0a0e27) behind keyboard, no white edges
- ✅ Theme switching: Smooth transition, no white flash
- ✅ Caret tracking: Safari's native behavior works perfectly

### Files Modified (Dec 2025)
1. `app/ui/console/index.html` - First paint backgrounds
2. `app/ui/console/src/utils/darkMode.ts` - Runtime enforcement
3. `app/ui/console/src/context/ThemeContext.tsx` - Aligned default theme
4. `app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx` - Disabled custom tracking

### Reference
- Test page: `app/ui/console/src/pages/ExactWorkingReplica.tsx` (blue theme proof)
- Testing guide: `docs/IOS_CARET_TRACKING_TESTING_GUIDE.md`

---

**Last Updated**: 2025-12-26
**Tested On**: iPad with Safari, iOS keyboard
**Status**: ✅ All issues resolved (CodeMirror + Lexical)
**Maintainer**: ARES Team
