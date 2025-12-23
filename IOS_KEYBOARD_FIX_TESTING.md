# iOS Keyboard Fix - Quick Testing Checklist

## Device Requirements
- [ ] iPad or iPhone with iOS Safari
- [ ] Latest ARES Console deployed
- [ ] Network connection to access console

## Pre-Test Verification
- [ ] Open Extraction Lab page (`/`)
- [ ] Open Safari Developer Tools (if available)
- [ ] Check console for any errors
- [ ] Verify viewport meta tag: `interactive-widget=overlays-content`

## Test Cases

### ✅ Test 1: Basic Typing
- [ ] Tap in editor to show keyboard
- [ ] Type 10-15 lines of text
- [ ] **PASS**: Cursor stays visible ~1 line above keyboard
- [ ] **PASS**: No white space behind keyboard
- [ ] **PASS**: Toolbar stays fixed at top
- [ ] **PASS**: Editor content scrolls smoothly

### ✅ Test 2: Long Document
- [ ] Paste 50+ lines of text
- [ ] Scroll to middle of document
- [ ] Tap to place cursor
- [ ] Type new text
- [ ] **PASS**: Content scrolls within editor
- [ ] **PASS**: No viewport jumping
- [ ] **PASS**: Cursor remains visible

### ✅ Test 3: Keyboard Show/Hide
- [ ] Type with keyboard open
- [ ] Tap "Done" to hide keyboard
- [ ] Tap in editor again
- [ ] **PASS**: Smooth transitions
- [ ] **PASS**: No UI jumps
- [ ] **PASS**: Content position maintained

### ✅ Test 4: Arrow Key Navigation
- [ ] Type several lines
- [ ] Use arrow keys to move up/down
- [ ] **PASS**: Editor scrolls to keep cursor visible
- [ ] **PASS**: Smooth scrolling
- [ ] **PASS**: No white space appears

### ✅ Test 5: Multi-line Editing
- [ ] Type text across 5+ lines
- [ ] Select multiple lines
- [ ] Delete/edit selection
- [ ] **PASS**: Cursor stays visible
- [ ] **PASS**: Smooth scrolling if needed
- [ ] **PASS**: No layout shifts

## Console Debug Checks

Open Safari Web Inspector and check for these logs:

```
[ScrollIntoView] Viewport resize { ... }
[ScrollIntoView] Scrolling UP/DOWN { ... }
```

- [ ] Logs appear when typing
- [ ] `visualHeight` changes when keyboard shows/hides
- [ ] `scrollAmount` calculated correctly
- [ ] No JavaScript errors

## Known Issues to Watch For

- ❌ **Cursor hidden behind keyboard** → Increase BOTTOM_PADDING in code
- ❌ **White space below content** → Check max-height CSS
- ❌ **Viewport still shifts** → Verify viewport meta tag
- ❌ **Janky scrolling** → Check for conflicting scroll handlers

## Success Criteria Summary

| Criterion | Status |
|-----------|--------|
| Cursor always visible | ⏸️ Testing |
| Smooth scrolling | ⏸️ Testing |
| No white space | ⏸️ Testing |
| No viewport shift | ⏸️ Testing |
| Apple Notes-like UX | ⏸️ Testing |

## Report Results

After testing, report:
1. Device model and iOS version
2. Which tests passed/failed
3. Console logs (if any errors)
4. Screenshots or screen recording
5. Any unusual behavior

## Quick Rollback (If Needed)

If major issues found:
```bash
git revert 712a41b
# Redeploy
```

---

**Test Date**: ___________  
**Tester**: ___________  
**iOS Version**: ___________  
**Device**: ___________  
**Result**: ⏸️ PENDING / ✅ PASS / ❌ FAIL
