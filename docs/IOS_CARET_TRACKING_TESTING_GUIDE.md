# iOS Caret Tracking - Testing Guide

**Version**: Sophisticated visualViewport Implementation
**Date**: 2024-12-26
**Test URL**: http://localhost:5173/ (ExactWorkingReplica)

---

## What Was Implemented

### 4-Phase Comprehensive Solution

**PHASE A: Complete Layer Coverage** ✅
- html, body, #root, .extraction-lab all = #1E40AF (blue)
- No gaps where Safari void color can show
- Complete bedrock-to-app layering

**PHASE B: Sophisticated Caret Tracking** ✅
- visualViewport API integration
- Debounced + requestAnimationFrame
- Re-entrancy protection
- Consistent 160px caret margin
- PAGE scrolling (not editor scroller)
- Instant behavior ('auto', no animation)

**PHASE C: Bottom Breathing Room** ✅
- 250px padding-bottom on editor panel
- Prevents threshold jumps
- Ensures consistent tracking throughout session

**PHASE D: Debug Instrumentation** ✅
- Toggle in browser console: `window.enableCaretDebug = true`
- Comprehensive visualViewport logging
- Scroll decision tracking

---

## Testing Checklist

### Basic Functionality

Open http://localhost:5173/ on iPad Safari:

- [ ] **Page loads with blue theme**
  - Everything should be blue with white text
  - No white/gray areas visible

- [ ] **Tap in editor to open keyboard**
  - Keyboard appears
  - Any exposed area behind keyboard = solid blue ✅
  - No white Safari void showing

- [ ] **Type multiple lines (important: 5+ lines)**
  - Caret should stay **consistently 160px from bottom**
  - Should NOT jump on 3rd line (old bug)
  - Should NOT jump on 5th line
  - Should feel smooth and predictable

### Advanced Testing

- [ ] **Type very long text (20+ lines)**
  - Caret tracking remains consistent
  - No sudden jumps or jitters
  - Smooth scrolling as you type

- [ ] **Scroll up, then continue typing**
  - Caret tracking still works
  - Page scrolls to keep caret visible
  - 160px margin maintained

- [ ] **Close keyboard and reopen**
  - Behavior remains consistent
  - No strange jumps or resets

- [ ] **Landscape orientation**
  - Caret tracking works in landscape
  - visualViewport adjusts correctly

### Debug Mode Testing

Enable debug logging in Safari console:

```javascript
window.enableCaretDebug = true
```

Then type in editor and watch console for logs:

**Expected logs:**
```
[CaretTrack] visualViewport: {
  height: 375,           // Visible height with keyboard
  offsetTop: 0,          // Offset from top
  visibleBottom: 375,    // Where keyboard starts
  pageScrollY: 120       // Current page scroll
}

[CaretTrack] Caret: {
  top: 180,
  bottom: 200,
  targetCaretBottom: 215,  // visibleBottom - 160
  needsScroll: false       // or true if scrolling
}

[CaretTrack] SCROLLING: {
  delta: 15,             // How much to scroll
  from: 120,             // Current scrollY
  to: 135                // New scrollY
}
```

**What to verify:**
- [ ] visualViewport.height changes when keyboard opens/closes
- [ ] targetCaretBottom = visibleBottom - 160 (consistent margin)
- [ ] Scroll deltas are small and incremental (not huge jumps)
- [ ] Re-entrancy guard prevents double-scroll

---

## Known Good Behavior

### ✅ What Should Work

1. **Consistent caret position**: 160px from visible bottom, ALWAYS
2. **Smooth typing experience**: No jumps, jitters, or surprises
3. **Blue exposed area**: Looks intentional, not broken
4. **No fighting**: Single scroll system, no conflicts

### ❌ What Would Indicate Problems

1. **Caret jumps on 3rd line**: Old bug - should be FIXED
2. **White/gray void behind keyboard**: Layer coverage issue
3. **Caret hidden behind keyboard**: Tracking not working
4. **Jerky scrolling**: Smooth scroll fighting instant scroll
5. **Console errors**: Something broke

---

## Performance Expectations

**Debounce**: 50ms delay before tracking
**rAF**: Scheduled on animation frame
**Scroll**: Instant (behavior: 'auto')

**This means:**
- Typing feels responsive (not laggy)
- Scrolling is smooth (no janky frames)
- Battery efficient (throttled updates)

---

## Troubleshooting

### Problem: Caret still jumps on 3rd line

**Check:**
```javascript
window.enableCaretDebug = true
// Type 3 lines and watch logs
```

**Look for:**
- Is `CARET_MARGIN` consistently 160?
- Are there multiple `SCROLLING` logs in same frame? (re-entrancy issue)
- Is `visualViewport` undefined? (fallback mode)

### Problem: White area behind keyboard

**Check browser console:**
```javascript
getComputedStyle(document.documentElement).backgroundColor
getComputedStyle(document.body).backgroundColor
getComputedStyle(document.getElementById('root')).backgroundColor
```

**All should return:** `rgb(30, 64, 175)` (blue)

### Problem: Caret hidden behind keyboard

**Check:**
```javascript
window.enableCaretDebug = true
// Watch targetCaretBottom vs caretCoords.bottom
```

**Should see:**
- `targetCaretBottom` = `visibleBottom - 160`
- `caretCoords.bottom` should be ABOVE `targetCaretBottom` after scroll

### Problem: Jerky or janky scrolling

**Check:**
```css
/* In CodeMirrorEditor theme */
.cm-scroller {
  scrollBehavior: 'auto'  /* Should be 'auto', NOT 'smooth' */
}
```

**Check logs:**
- Scroll deltas should be small (5-30px typically)
- No huge jumps (>100px indicates threshold issue)

---

## Next Steps After Testing

### If Everything Works ✅

1. **Apply to real ExtractionLab**:
   - Copy layer coverage (html/body/root backgrounds)
   - Keep iosCursorTrackingExtension (already in CodeMirrorEditor)
   - Add breathing room padding
   - Switch from blue to warm theme colors

2. **Clean up test pages**:
   - Keep ExactWorkingReplica for reference
   - Remove UltraMinimalTest and other experiments

3. **Document the solution**:
   - Add to ARES documentation
   - Reference for future iOS keyboard issues

### If Problems Persist ❌

1. **Enable debug mode** and share logs
2. **Screen record** the behavior on iPad
3. **Compare** against working commit be09094b
4. **Incremental testing**:
   - Disable caret tracking - does manual scroll work?
   - Check visualViewport values - are they sane?
   - Verify layer coverage - any gaps?

---

## Philosophy Recap

**What we're doing:**
- EMBRACING iOS page scroll (not fighting it)
- Using native APIs (visualViewport)
- Single scroll owner (our tracking extension)
- Instant scrolling (no animations)
- Making exposed area look intentional (blue theme)

**What we're NOT doing:**
- ❌ position: fixed hacks
- ❌ Viewport height manipulation
- ❌ Multiple competing scroll systems
- ❌ Fighting natural browser behavior
- ❌ CSS smooth scroll animations

**Result:** Smooth, predictable, native-feeling iOS typing experience.

---

**Testing Contact**: Report issues with debug logs + screen recording
