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

### After Fix:
- ✅ Typing: Works immediately, stays visible
- ✅ Cursor position: Stable, no jumping
- ✅ Paste: Always available
- ✅ Scrolling: Smooth, no hiccups
- ✅ Cursor: Visible and stable
- ✅ No white space when keyboard appears

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

**Last Updated**: 2025-12-11
**Tested On**: iPad with Safari, iOS keyboard
**Status**: ✅ All issues resolved
**Maintainer**: ARES Team
