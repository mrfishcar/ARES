# iOS Editor Debugging Guide

## Overview

This guide explains how to use the enhanced debugging features for troubleshooting iOS editor issues, specifically:
1. **Toolbar Scroll Leakage** - Content scrolling above the fixed toolbar
2. **Cursor Behind Keyboard** - Caret disappearing behind the iOS keyboard

## Quick Start

### Enable Debug Mode

In Safari on iOS (or Safari Desktop with iOS simulation), open the browser console and run:

```javascript
window.ARES_DEBUG_SCROLL = true
```

Then reload the page or start typing in the editor. You'll see detailed logs in the console.

### Disable Debug Mode

```javascript
window.ARES_DEBUG_SCROLL = false
```

## What Gets Logged

### 1. Plugin Initialization

When the editor loads, you'll see:

```
[ScrollPlugin HH:MM:SS.mmm] ✅ Initialized successfully {
  editorElement: { className, rect },
  scrollContainer: { 
    scrollHeight, clientHeight, scrollTop, maxScroll, rect 
  },
  viewport: { 
    visualHeight, innerHeight, offsetTop, scale 
  },
  toolbar: { 
    exists, rect, zIndex, position 
  }
}
```

**What to check:**
- `toolbar.rect.bottom` vs `scrollContainer.rect.top` - should not overlap initially
- `scrollContainer.scrollHeight` vs `scrollContainer.clientHeight` - indicates scrollability
- `viewport.visualHeight` vs `viewport.innerHeight` - shows keyboard state

### 2. Text Changes (Typing)

When you type, you'll see:

```
[ScrollPlugin HH:MM:SS.mmm] 📝 Text change detected {
  viewportHeight: 667,
  keyboardOpen: true,
  scrollTop: 245,
  timestamp: 12345.678
}
```

**What to check:**
- `keyboardOpen: true` - confirms keyboard is detected
- `scrollTop` increasing - shows scroll is happening
- `timestamp` - helps track timing of events

### 3. Viewport Changes (Keyboard Open/Close)

When the keyboard appears or disappears:

```
[ScrollPlugin HH:MM:SS.mmm] ⌨️ Viewport resized (keyboard state change) {
  viewportHeight: 400,
  innerHeight: 667,
  keyboardHeight: 267,
  keyboardOpen: true,
  offsetTop: 0,
  scale: 1
}
```

**What to check:**
- `keyboardHeight` - should be ~200-350px when keyboard is open
- `keyboardOpen` - should toggle correctly
- `scale` - should be 1 (no pinch zoom)

### 4. Caret Position Tracking

When the caret moves or needs scrolling:

```
[ScrollPlugin HH:MM:SS.mmm] 🎯 Caret position check {
  caretRect: { top: 320, bottom: 348, left: 24, height: 28, width: 2 },
  visibleRegion: { top: 60, bottom: 400, threshold: 320, height: 340 },
  toolbar: { bottom: 60, height: 44, blocking: false },
  keyboard: { height: 267, open: true, blocking: false },
  scrollContainer: { scrollTop: 200, scrollHeight: 1500, clientHeight: 600, maxScroll: 900 },
  caretStatus: "✅ Visible"
}
```

**What to check:**
- `caretStatus` - should be "✅ Visible" when working correctly
- `toolbar.blocking: true` - indicates caret is behind toolbar (BAD)
- `keyboard.blocking: true` - indicates caret is behind keyboard (BAD)
- `caretRect.bottom` vs `visibleRegion.threshold` - should have clearance

### 5. Scroll Operations

When the editor scrolls to reveal the caret:

**Scrolling Down (revealing from behind keyboard):**
```
[ScrollPlugin HH:MM:SS.mmm] 🔽 Scrolling DOWN to reveal caret from behind keyboard {
  scrollAmount: 48,
  beforeScrollTop: 200,
  targetScrollTop: 248,
  maxScrollTop: 900,
  willHitMax: false,
  caretBottom: 368,
  viewportThreshold: 320,
  overflow: 48
}

[ScrollPlugin HH:MM:SS.mmm] 🔽 Scroll DOWN completed {
  beforeScrollTop: 200,
  afterScrollTop: 248,
  requestedScroll: 48,
  actualScroll: 48,
  scrollSuccess: true
}
```

**Scrolling Up (revealing from behind toolbar):**
```
[ScrollPlugin HH:MM:SS.mmm] 🔼 Scrolling UP to reveal caret from behind toolbar {
  scrollAmount: 20,
  beforeScrollTop: 200,
  targetScrollTop: 180,
  caretTop: 40,
  visibleTop: 60,
  toolbarBuffer: 40,
  overflow: 20
}

[ScrollPlugin HH:MM:SS.mmm] 🔼 Scroll UP completed {
  beforeScrollTop: 200,
  afterScrollTop: 180,
  requestedScroll: 20,
  actualScroll: 20,
  scrollSuccess: true
}
```

**What to check:**
- `scrollSuccess: true` - scroll completed as requested
- `actualScroll` should match `requestedScroll` (within 5px tolerance)
- `willHitMax: true` - means we can't scroll further down

### 6. Diagnostic Snapshots

Periodic state snapshots:

```
[ScrollPlugin HH:MM:SS.mmm] 📊 Text changed {
  viewport: {
    height: 400,
    offsetTop: 0,
    scale: 1,
    layoutHeight: 667,
    keyboardHeight: 267,
    keyboardOpen: true
  },
  scrollContainer: {
    scrollTop: 248,
    scrollHeight: 1500,
    clientHeight: 600,
    scrollRange: 900,
    hasScrollRoom: true,
    scrollPercent: 28,
    rect: { top: 60, bottom: 660, height: 600 }
  },
  toolbar: {
    toolbarBottom: 60,
    contentTop: 60,
    overlapping: false,
    overlapAmount: 0
  },
  potentialIssues: {
    toolbarScrollLeakage: false,
    contentBehindToolbar: false
  }
}
```

**What to check:**
- `potentialIssues.toolbarScrollLeakage: true` - PROBLEM: toolbar overlapping content
- `potentialIssues.contentBehindToolbar: true` - PROBLEM: content scrolled behind toolbar
- `toolbar.overlapping: true` - toolbar rect overlaps scroll container rect

## Common Issues and How to Diagnose

### Issue 1: Toolbar Scroll Leakage

**Symptoms:**
- Content scrolls above the toolbar
- Toolbar appears to float over scrolled content

**What to look for in logs:**
```javascript
toolbar: {
  toolbarBottom: 60,
  contentTop: 50,  // ← PROBLEM: content above toolbar
  overlapping: true,
  overlapAmount: 10
}
potentialIssues: {
  toolbarScrollLeakage: true,  // ← PROBLEM DETECTED
  contentBehindToolbar: true
}
```

**Next steps:**
1. Check `scrollContainer.rect.top` - should be ≥ toolbar.bottom
2. Check CSS: `.lab-toolbar-stack` should have `z-index: 50` and `position: fixed`
3. Check CSS: `.rich-editor-surface` should have `padding-top` to create space for toolbar
4. Verify `scrollContainer.scrollTop` - should never allow content to scroll above toolbar area

### Issue 2: Cursor Behind Keyboard

**Symptoms:**
- Can't see cursor while typing
- Editor doesn't scroll when typing near bottom

**What to look for in logs:**
```javascript
caretStatus: "❌ Behind keyboard"
keyboard: {
  height: 267,
  open: true,
  blocking: true  // ← PROBLEM: keyboard blocking caret
}
```

**Next steps:**
1. Check if scroll operation was triggered:
   - Look for `🔽 Scrolling DOWN` log after caret check
   - If missing, scroll logic may not be triggering
2. Check if scroll succeeded:
   - Look for `scrollSuccess: true` in completion log
   - If `false`, scroll may be blocked by CSS or layout
3. Check visible region calculation:
   - `visibleRegion.threshold` should account for keyboard height
   - `caretRect.bottom` should be below `threshold` to trigger scroll
4. Check scroll container has room:
   - `scrollContainer.maxScroll` > `scrollContainer.scrollTop`
   - If at max, content needs more height (check `.editor-bottom-spacer`)

### Issue 3: Scroll Not Working

**Symptoms:**
- Logs show scroll requested but caret still hidden
- `scrollSuccess: false` in logs

**What to look for:**
```javascript
🔽 Scroll DOWN completed {
  scrollSuccess: false,  // ← PROBLEM
  requestedScroll: 48,
  actualScroll: 0  // ← Scroll didn't happen
}
```

**Next steps:**
1. Check CSS on `.rich-editor-surface`:
   - Must have `overflow-y: auto` or `scroll`
   - Must NOT have `overflow-y: hidden`
2. Check scroll container dimensions:
   - `scrollHeight` > `clientHeight` (must be scrollable)
   - If not, add `.editor-bottom-spacer` height
3. Check for scroll-blocking styles:
   - No `position: fixed` on scroll container
   - No `overscroll-behavior: none` preventing scroll
4. Check iOS quirks:
   - Add `-webkit-overflow-scrolling: touch` for momentum scrolling
   - Ensure `touch-action: pan-y` allows vertical scrolling

## Remote Debugging on iOS

### Safari Desktop to iOS Device

1. **Enable Web Inspector on iOS:**
   - Settings → Safari → Advanced → Web Inspector (ON)

2. **Connect device to Mac via USB**

3. **Open Safari on Mac:**
   - Develop menu → [Your Device] → [Your Tab]
   - Console will show all `ARES_DEBUG_SCROLL` logs

4. **Enable debug mode in iOS Safari:**
   - In the connected console, run:
   ```javascript
   window.ARES_DEBUG_SCROLL = true
   ```
   - Reload the page

5. **Interact with the editor on iOS and watch logs on Mac**

### iOS Simulator (Xcode Required)

1. **Open iOS Simulator:**
   ```bash
   open -a Simulator
   ```

2. **Open Safari in Simulator**

3. **Navigate to your ARES instance**

4. **Connect Safari Desktop:**
   - Develop menu → Simulator → [Your Tab]

5. **Enable debug mode and test**

## Log Interpretation Guide

### Good Logs (Everything Working)

```
✅ Initialized successfully
📝 Text change detected
🎯 Caret position check → caretStatus: "✅ Visible"
✅ Caret in visible area, no scroll needed
```

### Bad Logs (Issues Detected)

```
⚠️ Empty range rect - caret may be invisible
🎯 Caret position check → caretStatus: "❌ Behind keyboard"
🔽 Scrolling DOWN → scrollSuccess: false
❌ No scroll container found
potentialIssues: { toolbarScrollLeakage: true }
```

## Performance Considerations

- Logs are timestamped with `performance.now()` for precise timing
- Debouncing prevents log spam (16ms delay between events)
- Logs only fire when state changes significantly (>5px threshold)
- Debug mode has minimal performance impact when disabled

## Disabling in Production

The debug system is controlled by a runtime flag:

```javascript
// Default: disabled
window.ARES_DEBUG_SCROLL = false

// Enable only when needed
window.ARES_DEBUG_SCROLL = true
```

No code changes needed - simply don't set the flag in production.

## Related Files

- `/app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx` - Main scroll plugin with debugging
- `/app/ui/console/src/editor2/plugins/FocusDebugPlugin.tsx` - Focus/tap debugging (separate flag: `__ARES_DEBUG_FOCUS__`)
- `/app/ui/console/src/editor2/styles.css` - Editor and toolbar styles
- `/app/ui/console/src/index.css` - Toolbar positioning styles

## Troubleshooting the Debugger Itself

**Logs not appearing?**
1. Check console is open (F12 or Cmd+Opt+I)
2. Check flag is set: `console.log(window.ARES_DEBUG_SCROLL)`
3. Check logs aren't filtered (ensure "All Levels" selected)
4. Try reloading page after setting flag

**Too many logs?**
1. Logs are debounced, but rapid typing may still produce many logs
2. Use browser console filtering: `[ScrollPlugin]`
3. Focus on specific events: `🎯 Caret` or `🔽 Scrolling`

**Logs missing timestamps?**
1. Check browser supports `performance.now()` (all modern browsers do)
2. Timestamps format: `HH:MM:SS.mmm` (12-hour, milliseconds)

## Contributing

When reporting iOS editor issues, please include:
1. Full console log with `ARES_DEBUG_SCROLL = true`
2. iOS version and device model
3. Safari version
4. Steps to reproduce
5. Screenshots/screen recordings if possible

## Version History

- **Dec 2025** - Enhanced debugging with toolbar overlap detection and comprehensive caret tracking
- **Initial** - Basic scroll diagnostics with viewport logging
