# iPad Format Toolbar Testing Guide

## Overview
The rich text editor now features an iOS Notes-style transforming format toolbar that slides down when the "T" button is toggled in the main toolbar.

## How to Test

### Enable Rich Editor Mode
1. Open the Extraction Lab (`/lab`)
2. Click the **Settings** gear icon in the top toolbar
3. Toggle **"Use Rich Editor"** to ON
4. The editor will switch to Lexical rich text mode

### Access Format Toolbar
1. Click the **"T" button** in the top toolbar (Type icon)
2. The toolbar should smoothly slide down, revealing 3 formatting sections
3. Click "T" again to hide the toolbar

### Formatting Sections

#### 1. Text Style
- **Title**: Converts text to H1 (largest heading)
- **Heading**: Converts to H2 (medium heading)
- **Subheading**: Converts to H3 (smaller heading)
- **Body**: Converts back to normal paragraph text

#### 2. Format
- **B** (Bold): Makes text bold
- **I** (Italic): Makes text italic
- **U** (Underline): Underlines text
- **S** (Strikethrough): Strikes through text

#### 3. Lists
- **•** (Bullet): Creates bulleted list
- **1.** (Numbered): Creates numbered list
- **☐** (Checklist): Creates checklist with checkboxes

## Expected Behavior

### Animation
- Toolbar slides down smoothly (350ms)
- Uses iOS-style easing curve (cubic-bezier)
- Fades in with opacity transition
- No jerky movements or flashing

### Touch Targets (iPad)
- All buttons are minimum 44px × 44px (iOS recommendation)
- Buttons respond to tap with visual feedback
- Active state shows scale down (0.96) for tactile feel

### Visual Design
- Section labels in uppercase (UPPERCASE)
- Subtle gray color for labels
- Rounded buttons (8px border-radius)
- Hover state: slightly lighter background
- Active state: lighter background + scale down
- Dark mode: different color scheme

### Keyboard Behavior
- Toolbar should NOT interfere with iPad keyboard
- No viewport bounce when keyboard opens
- Focus stays in editor when clicking format buttons

## Testing on iPad Safari

### Steps to Test Focus Issues:
1. Tap inside the rich text editor
2. Caret should appear immediately
3. Start typing - characters should appear without delay
4. Select some text
5. Click T button to open format toolbar
6. Click a format button (e.g., Bold)
7. Focus should remain in editor, selected text should be formatted
8. Continue typing - should work smoothly

### Debug Mode (Optional):
To see detailed focus logs in browser console:
```javascript
window.__ARES_DEBUG_FOCUS__ = true;
```
Then reload the page and interact with the editor. Console will show:
- Focus events
- Tap targets
- Visual viewport changes
- Element at tap point

## Known Issues Fixed

✅ **Fixed: Toolbar transform breaking backdrop-filter**
- Old toolbar used `transform: translateX(-50%)` which created stacking context issues
- New toolbar uses simple max-height transition instead

✅ **Fixed: -webkit-overflow-scrolling causing focus issues**
- Removed from editor surface
- Uses native scrolling now

✅ **Fixed: 100vh not accounting for iOS toolbar**
- Uses CSS variable updated via visualViewport API
- Prevents layout jumps when keyboard opens

✅ **Fixed: Format toolbar covering screen**
- Toolbar is now properly contained within editor shell
- Respects app layout boundaries

## What to Look For

### ✅ Good Signs:
- Toolbar slides smoothly without jerking
- Buttons respond instantly to taps
- Text formatting applies immediately
- No viewport bouncing when opening toolbar
- Keyboard doesn't cause layout jumps
- Can type immediately after tapping editor

### ❌ Problem Signs:
- Toolbar appears instantly (no animation)
- Buttons don't respond to taps
- Tapping editor doesn't show cursor
- Keyboard causes screen to bounce
- Format buttons don't apply formatting
- Layout breaks when toolbar is open

## Files Changed

### Core Components:
- `app/ui/console/src/editor2/RichTextEditor.tsx` - Main editor with transforming toolbar
- `app/ui/console/src/editor2/styles.css` - iOS Notes-style CSS
- `app/ui/console/src/editor2/RichEditorPane.tsx` - Editor pane wrapper
- `app/ui/console/src/pages/ExtractionLab.tsx` - Main lab page

### Utilities:
- `app/ui/console/src/utils/iosViewportFix.ts` - Dynamic viewport height for iOS
- `app/ui/console/src/editor2/plugins/FocusDebugPlugin.tsx` - Focus debugging (DEV only)

### CSS Fixes:
- `app/ui/console/src/index.css` - Removed -webkit-overflow-scrolling, updated viewport height

## Reverting Changes

If issues occur, you can revert to the old editor:
1. Open Settings (gear icon)
2. Toggle **"Use Rich Editor"** to OFF
3. The CodeMirror legacy editor will be used instead

## Build Verification

✅ Build passes: `npm run build` in `app/ui/console/`
✅ No TypeScript errors
✅ Bundle size: 1.08 MB (gzipped: 350 KB)

## Next Steps

After verifying the toolbar works correctly on iPad:
1. Test with longer documents (100+ paragraphs)
2. Test rapid formatting changes
3. Test copy/paste with formatting
4. Test undo/redo of formatting
5. Verify entity highlighting still works with rich text

## Contact

For issues or questions, refer to:
- PR: `copilot/fix-ipad-typing-focus-bugs`
- Commits: Check git log for detailed change history
