# iOS Editor Debugging Quick Reference

## 🚀 Quick Start (1 minute)

### Enable Debugging
1. Open Safari on iOS or Desktop
2. Navigate to your ARES instance
3. Open Console (F12 on desktop, Web Inspector on iOS)
4. Run:
   ```javascript
   window.ARES_DEBUG_SCROLL = true
   ```
5. Reload the page
6. Start typing and watch the logs!

### What You'll See
```
[ScrollPlugin 18:42:15.234] 🔍 Debug Mode ENABLED
[ScrollPlugin 18:42:15.235] ✅ Initialized successfully
[ScrollPlugin 18:42:16.123] 📝 Text change detected
[ScrollPlugin 18:42:16.140] 🎯 Caret position check → caretStatus: "✅ Visible"
```

## 🔍 Key Log Messages

| Icon | Meaning | What It Tells You |
|------|---------|-------------------|
| ✅ | Success | Everything is working correctly |
| ❌ | Error | Something is wrong (e.g., "Behind keyboard") |
| ⚠️ | Warning | Potential issue detected |
| 📝 | Typing | Text change event detected |
| 🎯 | Caret | Caret position being checked |
| 🔽 | Scroll Down | Scrolling to reveal caret from behind keyboard |
| 🔼 | Scroll Up | Scrolling to reveal caret from behind toolbar |
| ⌨️ | Keyboard | Keyboard appeared or disappeared |
| 📊 | State | Current viewport/scroll state snapshot |

## 🐛 Common Issues and Quick Diagnosis

### Issue: Cursor Hidden Behind Keyboard
**Look for:**
```javascript
caretStatus: "❌ Behind keyboard"
```
**Next:** Check if scroll operation triggered:
```javascript
🔽 Scrolling DOWN to reveal caret from behind keyboard
```
**If missing:** Scroll logic not triggering (check threshold values)
**If present but failed:** Check `scrollSuccess: false`

### Issue: Toolbar Overlapping Content
**Look for:**
```javascript
potentialIssues: {
  toolbarScrollLeakage: true,
  contentBehindToolbar: true
}
```
**Next:** Check toolbar positioning:
```javascript
toolbar: {
  toolbarBottom: 60,
  contentTop: 50,  // ← Should be >= toolbarBottom
  overlapping: true
}
```

### Issue: Scroll Not Working
**Look for:**
```javascript
scrollSuccess: false
actualScroll: 0  // ← Scroll didn't happen
```
**Causes:**
- `overflow-y: hidden` on scroll container
- `scrollHeight === clientHeight` (no room to scroll)
- iOS momentum scrolling disabled

## 📱 iOS Remote Debugging

### Mac + iPhone/iPad Setup
1. **iPhone:** Settings → Safari → Advanced → Web Inspector (ON)
2. **Connect** iPhone to Mac via USB
3. **Mac Safari:** Develop menu → [Your Device] → [ARES Tab]
4. **Console appears** on Mac showing iOS logs
5. **Run** `window.ARES_DEBUG_SCROLL = true` in Mac console
6. **Reload** ARES on iPhone
7. **Type** on iPhone, **watch logs** on Mac

### Log Filtering
In browser console, filter by:
- `[ScrollPlugin]` - All scroll plugin logs
- `🎯` - Only caret position checks
- `❌` - Only errors
- `toolbarScrollLeakage` - Only toolbar issues

## 📊 Understanding the Logs

### Example: Good Working State
```javascript
[ScrollPlugin 18:42:16.140] 🎯 Caret position check {
  caretStatus: "✅ Visible",
  keyboard: { open: true, blocking: false },
  toolbar: { blocking: false }
}
```
**Interpretation:** Caret is visible, keyboard is open but not blocking, toolbar not blocking.

### Example: Problem State
```javascript
[ScrollPlugin 18:42:16.140] 🎯 Caret position check {
  caretStatus: "❌ Behind keyboard",
  keyboard: { open: true, blocking: true },
  caretRect: { bottom: 450 },
  visibleRegion: { threshold: 400 }
}
```
**Interpretation:** Caret at y=450 but visible threshold is at y=400, so it's hidden behind keyboard.

### Example: Scroll Operation
```javascript
[ScrollPlugin 18:42:16.142] 🔽 Scrolling DOWN to reveal caret {
  scrollAmount: 50,
  beforeScrollTop: 100
}
[ScrollPlugin 18:42:16.160] 🔽 Scroll DOWN completed {
  scrollSuccess: true,
  actualScroll: 50
}
```
**Interpretation:** Scrolled down 50px successfully to reveal caret.

## 🛠️ Debug Flag Reference

```javascript
// Enable all scroll debugging
window.ARES_DEBUG_SCROLL = true

// Disable (default)
window.ARES_DEBUG_SCROLL = false

// Check current state
console.log(window.ARES_DEBUG_SCROLL)

// Related flags (separate systems)
window.__ARES_DEBUG_FOCUS__ = true  // Focus/tap debugging
```

## 📖 Full Documentation

For detailed explanations, see:
- **Full Guide:** `/docs/iOS-EDITOR-DEBUGGING.md`
- **Source Code:** `/app/ui/console/src/editor2/plugins/ScrollIntoViewPlugin.tsx`
- **Demo Page:** `/app/ui/console/debug-demo.html`

## 🔥 Performance Impact

**Disabled (default):** Zero overhead - all debug code is skipped
**Enabled:** Minimal impact - logs are batched and debounced
- Debounce: 16ms (1 frame) between rapid events
- Threshold: Only log when state changes >5px
- No visual rendering changes, console-only

## 💡 Tips

1. **Clear console regularly** - logs can accumulate quickly during typing
2. **Use console filters** - search for specific icons or keywords
3. **Take screenshots** - helpful for sharing with developers
4. **Note timing** - timestamps help identify timing issues
5. **Test multiple scenarios:**
   - Type at top of document
   - Type at bottom of document
   - Type with keyboard open/closed
   - Scroll manually then type

## 🤝 Reporting Issues

When reporting iOS editor issues, include:
1. ✅ Full console log with `ARES_DEBUG_SCROLL = true`
2. ✅ iOS version and device model
3. ✅ Safari version
4. ✅ Steps to reproduce
5. ✅ Screenshots of the issue
6. ✅ Specific log entries showing the problem

**Example Report:**
```
Issue: Cursor disappears when typing at bottom of page

Environment:
- iPhone 13 Pro, iOS 17.2
- Safari 17.2
- ARES console UI

Logs showing issue:
[ScrollPlugin 18:42:16.140] caretStatus: "❌ Behind keyboard"
[ScrollPlugin 18:42:16.142] 🔽 Scrolling DOWN
[ScrollPlugin 18:42:16.160] scrollSuccess: false

The scroll operation fails consistently when keyboard is open.
```

---

**Need Help?** See full documentation in `/docs/iOS-EDITOR-DEBUGGING.md`
