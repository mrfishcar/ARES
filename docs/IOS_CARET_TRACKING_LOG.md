# iOS Safari Caret Tracking - Development Log

**Project**: iOS Notes App Clone
**Issue**: Keeping caret visible when iOS soft keyboard is open
**Environment**: iOS Safari, contenteditable div, Visual Viewport API

---

## Setup Context

- **Editor**: contenteditable div with title (h1) and body sections
- **Keyboard Detection**: Using `window.visualViewport` resize events
- **Dynamic Padding**: When keyboard opens, add `paddingBottom: keyboardHeight` to content area
- **Goal**: Keep caret visible while typing, especially on new lines and backspacing

---

## What Works (Confirmed)

1. **Dynamic padding** - Adding padding when keyboard opens creates scroll space
2. **Visual Viewport API** - Reliably detects keyboard open/close on iOS Safari
3. **No scroll tracking = no drift** - When all scroll tracking removed, caret doesn't drift

---

## Approaches Tried

### 1. Marker-Based DOM Insertion ❌
**Method**: Insert temporary span at caret position, measure its position, remove it
```javascript
const marker = document.createElement('span');
marker.textContent = '\u200B'; // zero-width space
range.insertNode(marker);
const rect = marker.getBoundingClientRect();
marker.remove();
```
**Result**: Causes caret drift/jumping on every keystroke
**Why**: DOM insertion/removal affects browser's internal caret position tracking on iOS Safari

**Variations tried**:
- Zero-width marker (`width:0`) - still drifts
- `position:absolute;visibility:hidden` marker - still drifts
- Debouncing 50ms, 100ms, 150ms, 200ms - reduces but doesn't eliminate
- Throttling - reduces but doesn't eliminate
- Only on Enter key - still causes drift when triggered

### 2. Range.getBoundingClientRect() ❌
**Method**: Get caret position directly from Range API
```javascript
const range = selection.getRangeAt(0);
const rect = range.getBoundingClientRect();
```
**Result**: Returns all zeros for collapsed ranges on iOS Safari
**Why**: iOS Safari doesn't support getBoundingClientRect on collapsed ranges

### 3. scrollIntoViewIfNeeded() ❌
**Method**: Native scroll method
```javascript
element.scrollIntoViewIfNeeded();
```
**Result**: Scrolls element into view, not caret position within element
**Why**: Works at element level, not caret level

### 4. Multiple Event Listeners ❌
**Method**: Trigger scroll on selectionchange, keyup, click, touchend, input
**Result**: Conflicts and erratic behavior
**Why**: Too many triggers, events stepping on each other

### 5. scroll-behavior: smooth CSS ❌
**Method**: Add smooth scrolling to content area
**Result**: Can contribute to drift during native scrolling
**Removed**: Now using default scroll behavior

### 6. scrollIntoView on focusNode ❌
**Method**: Call scrollIntoView on the element containing the caret
```javascript
const node = selection.focusNode;
const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
```
**Trigger**: Only on Enter key
**Result**: Too coarse - scrolls entire element, not caret position within it
**Why**: scrollIntoView operates on element boundaries, not caret position

### 7. Manual scroll calculation ✅ WORKS
**Method**: Calculate if element is outside visible area, scroll container directly
```javascript
const elRect = el.getBoundingClientRect();
const visibleBottom = window.visualViewport.height + window.visualViewport.offsetTop;
if (elRect.bottom > visibleBottom - buffer) {
  container.scrollTo({
    top: container.scrollTop + scrollAmount,
    behavior: 'smooth'
  });
}
```
**Trigger**: Enter and Backspace keys
**Result**: Works! Keeps caret visible without causing drift
**Why it works**: Only reads positions (getBoundingClientRect), never writes to DOM near caret
**Enhancement**: Added `behavior: 'smooth'` for smooth line transitions

---

## Key Learnings

1. **DOM insertion causes caret drift on iOS Safari** - Any modification to the DOM near the caret position affects iOS Safari's internal caret tracking

2. **Range API limited on iOS Safari** - getBoundingClientRect returns zeros for collapsed ranges

3. **Less is more** - Simpler approaches with fewer triggers work better

4. **Dynamic padding is essential** - Creates the scroll space needed for the caret to be scrolled into view

---

## Still Need to Solve

1. **Backspace tracking** - When deleting lines and moving up the document
2. **General typing** - If scrollIntoView doesn't work, need another approach

---

## Commits History

| Commit | Description | Result |
|--------|-------------|--------|
| 0b62907e | Working version with marker-based tracking | Works but has drift |
| 90a3699b | Remove all scroll tracking to test | No drift, no tracking |
| afded29f | scrollIntoView on focusNode, Enter only | Testing |

---

## Next Options If Current Approach Fails

1. **Intersection Observer** - Watch for caret element leaving viewport
2. **CSS scroll-snap** - Use scroll snap points
3. **Manual scroll calculation** - Calculate based on line height without DOM insertion
4. **Accept native behavior** - Rely entirely on iOS Safari's native caret following

---

*Last Updated: Session continuing caret tracking work*
