# Layout Fixes: Visual Diagrams

## Issue 1: Text Prompt Sticking to Bottom

### BEFORE (Broken)
```
┌──────────────────────────────────┐
│       iPhone Screen              │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Editor Content            │  │
│  │  Short paragraph...        │  │
│  │                            │  │
│  │  [Text prompt stuck here!] │  │ ← Problem: No scroll room
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │    iOS Keyboard            │  │
│  │  [Q][W][E][R][T][Y][U]...  │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘

Problem: 
- scroll-slack = 120px fixed
- Not enough space for short documents
- Text prompt rendered at bottom edge
```

### AFTER (Fixed)
```
┌──────────────────────────────────┐
│       iPhone Screen              │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Editor Content            │  │
│  │  Short paragraph...        │  │
│  │  [Text prompt]             │  │ ← Can scroll up!
│  │                            │  │
│  │  ↓ 180-400px scroll space  │  │
│  │                            │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │    iOS Keyboard            │  │
│  │  [Q][W][E][R][T][Y][U]...  │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘

Solution:
- scroll-slack = max(180px, keyboardHeight + 100px)
- Dynamic calculation based on keyboard height
- Keyboard detection: isKeyboardOpen = keyboardHeight > 10px
- Result: Text prompt always scrollable above keyboard
```

## Issue 2: Overscroll Above Viewport

### BEFORE (Broken)
```
macOS Safari - Trackpad Momentum Scroll

Step 1: Scroll to top
┌──────────────────────────────────┐
│  ┌────────────────────────────┐  │
│  │  Editor Content            │  │
│  │  Lorem ipsum...            │  │
│  │  ...                       │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘

Step 2: Continue scrolling up (overscroll)
┌──────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ ← White space! (Bounce effect)
│  ┌────────────────────────────┐  │
│  │  Editor Content            │  │
│  │  Lorem ipsum...            │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘

Problem:
- Duplicate CSS rules conflicting
- html (line 7-22): overscroll-behavior: none
- html (line 315): overscroll-behavior: ??? (undefined, cascade conflict)
- Browser defaults to 'auto' due to conflict
```

### AFTER (Fixed)
```
macOS Safari - Trackpad Momentum Scroll

Step 1: Scroll to top
┌──────────────────────────────────┐
│  ┌────────────────────────────┐  │
│  │  Editor Content            │  │
│  │  Lorem ipsum...            │  │
│  │  ...                       │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘

Step 2: Try to continue scrolling up
┌──────────────────────────────────┐
│  ┌────────────────────────────┐  │ ← Stops here! No bounce
│  │  Editor Content            │  │
│  │  Lorem ipsum...            │  │
│  │  ...                       │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘

Solution:
- Removed duplicate CSS rules (lines 315-330)
- Single source of truth: lines 7-42
- Consistent overscroll-behavior: none throughout
- Browser respects the rule without conflicts
```

## CSS Architecture

### Document Hierarchy
```
html
├─ overscroll-behavior: none  ← Prevents viewport bounce
├─ position: fixed
├─ overflow: hidden
│
└─ body
   ├─ overscroll-behavior: none  ← Double prevention
   ├─ position: fixed
   ├─ overflow: hidden
   │
   └─ #root
      ├─ overscroll-behavior: none  ← Triple prevention (defense in depth)
      ├─ overflow: hidden
      │
      └─ .app-shell
         │
         └─ .extraction-lab
            │
            └─ .editor-panel
               │
               └─ .rich-editor-surface
                  ├─ overscroll-behavior: contain  ← Scrollable zone
                  ├─ overflow-y: auto
                  │
                  ├─ .rich-content (padding: 80px 24px 24px)
                  └─ .editor-bottom-spacer (height: var(--scroll-slack))
```

### Overscroll Behavior Cascade
```
Viewport Level:
  html, body → overscroll-behavior: none
  Effect: No bounce at document boundaries

App Level:  
  #root, .app-shell → overscroll-behavior: none
  Effect: No bounce at app container boundaries

Editor Level:
  .rich-editor-surface → overscroll-behavior: contain
  Effect: Scroll contained within editor, no propagation
```

## Scroll Slack Calculation

### Algorithm Flow
```
1. Measure Viewport
   ┌─────────────────────────────┐
   │ fullHeight = window.innerHeight = 844px
   │ vvHeight = visualViewport.height = 464px
   │ keyboardHeight = 844 - 464 = 380px
   └─────────────────────────────┘

2. Detect Keyboard State
   ┌─────────────────────────────┐
   │ if (keyboardHeight > 10) {
   │   isKeyboardOpen = true
   │ } else {
   │   isKeyboardOpen = false
   │ }
   └─────────────────────────────┘

3. Calculate Scroll Slack
   ┌─────────────────────────────┐
   │ if (isKeyboardOpen) {
   │   scrollSlack = max(180, 380 + 100)
   │   scrollSlack = max(180, 480)
   │   scrollSlack = 480px  ← Final value
   │ } else {
   │   scrollSlack = 120px  ← Default
   │ }
   └─────────────────────────────┘

4. Apply to CSS
   ┌─────────────────────────────┐
   │ document.documentElement.style.setProperty(
   │   '--scroll-slack', '480px'
   │ )
   │
   │ .editor-bottom-spacer {
   │   height: var(--scroll-slack);  ← 480px applied
   │ }
   └─────────────────────────────┘
```

### Example Values

| Device | Orientation | Keyboard Height | Scroll Slack | Notes |
|--------|-------------|-----------------|--------------|-------|
| iPhone 13 | Portrait | 291px | max(180, 391) = **391px** | Good spacing |
| iPhone 13 | Landscape | 162px | max(180, 262) = **262px** | Adequate |
| iPad Pro | Portrait | 377px | max(180, 477) = **477px** | Excellent |
| iPad Pro | Landscape | 330px | max(180, 430) = **430px** | Great |
| Desktop | N/A | 0px | **120px** | Default minimum |

## Performance Comparison

### CSS Cascade Resolution

#### Before (with duplicates)
```
Browser reads index.css:
1. html { overscroll-behavior: none; }  ← Line 16
2. ... many rules ...
3. html { ??? }  ← Line 315 (duplicate, may override)

Result: Browser must re-evaluate cascade
Cost: Extra layout cycles, potential thrashing
```

#### After (consolidated)
```
Browser reads index.css:
1. html { overscroll-behavior: none; }  ← Line 17 (only declaration)
2. ... many rules ...
3. (no duplicate)

Result: Single pass, clean cascade
Cost: Minimal, one-time layout
```

## Browser Compatibility

### Overscroll Behavior Support
```
✅ Safari 16+ (iOS/macOS)
✅ Chrome 63+ (all platforms)
✅ Firefox 59+ (all platforms)
✅ Edge 18+ (all platforms)

Fallback: overflow: hidden still prevents scroll
```

### Dynamic Viewport Height
```
✅ iOS 15.4+ → 100dvh (native, zero JS)
✅ iOS <15.4 → --vvh (JS-updated, throttled)
✅ Android → 100dvh (native)
✅ Desktop → 100vh (static, no keyboard)

Graceful degradation: All versions work
```

## Testing Scenarios

### Scenario 1: Short Document + Keyboard
```
Document Height: 200px
Viewport Height: 844px (iPhone 13 portrait, no keyboard)
Keyboard Height: 291px

Expected Behavior:
1. Document takes ~200px
2. Viewport shrinks to 553px when keyboard opens
3. Scroll slack increases to 391px
4. Total scrollable area: 200px + 391px = 591px
5. User can scroll document up by 38px (591 - 553)
6. Text prompt visible and scrollable

✅ PASS: Text prompt not stuck to bottom
```

### Scenario 2: Long Document + Keyboard
```
Document Height: 2000px
Viewport Height: 844px (iPhone 13 portrait, no keyboard)
Keyboard Height: 291px

Expected Behavior:
1. Document takes ~2000px
2. Viewport shrinks to 553px when keyboard opens
3. Scroll slack increases to 391px
4. Total scrollable area: 2000px + 391px = 2391px
5. User can scroll entire document plus slack
6. Text prompt at bottom gets 391px breathing room

✅ PASS: Ample scroll room at bottom
```

### Scenario 3: Overscroll at Top (macOS)
```
User scrolls to top of document
User continues scrolling up (momentum/trackpad)

Expected Behavior:
1. .rich-editor-surface has overscroll-behavior: contain
2. html has overscroll-behavior: none
3. body has overscroll-behavior: none
4. Scroll stops at document top
5. No bounce effect
6. No white space revealed

✅ PASS: No overscroll above viewport
```

## Integration Points

### Files That Depend On These Variables

1. **--scroll-slack**
   - `app/ui/console/src/editor2/styles.css` (line 233)
   - `.editor-bottom-spacer { height: var(--scroll-slack); }`

2. **--vvh**
   - `app/ui/console/src/editor2/styles.css` (line 187)
   - `.rich-editor-surface { height: var(--vvh, 100vh); }`

3. **overscroll-behavior**
   - `app/ui/console/src/index.css` (lines 17, 36, 225, 234)
   - `app/ui/console/src/editor2/styles.css` (line 198)

### Event Listeners

```javascript
// App.tsx (lines 136-138)
viewport?.addEventListener('resize', updateViewportHeight);
viewport?.addEventListener('scroll', updateViewportHeight);
window.addEventListener('resize', updateViewportHeight);

// Triggers: 
// - Keyboard open/close
// - Device rotation
// - Browser chrome show/hide
// - Split-screen resize
```

## Future Considerations

1. **iPad with Magic Keyboard**: Test with hardware keyboard (no viewport change)
2. **iOS 18+**: Monitor for new viewport APIs or CSS properties
3. **Foldable Devices**: Test on Galaxy Fold, Surface Duo
4. **Accessibility**: Ensure large text sizes don't break layout
5. **RTL Languages**: Test with Arabic, Hebrew text direction

---

**Last Updated**: December 25, 2024
**Related**: LAYOUT_FIXES_SUMMARY.md
