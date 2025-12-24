/**
 * ScrollIntoViewPlugin
 *
 * Scrolls cursor into view within the editor container.
 *
 * With `interactive-widget=resizes-visual` in the viewport meta tag,
 * iOS Safari will only resize the visual viewport (not layout viewport)
 * when the keyboard appears. This prevents page shifting but requires
 * us to handle scrolling the cursor into view manually.
 *
 * This plugin scrolls only the .rich-editor-surface container, never
 * the page/window (which is locked with position:fixed).
 */
import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

export function ScrollIntoViewPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const editorElement = editor.getRootElement();
    if (!editorElement) return;

    const scrollContainer = editorElement.closest('.rich-editor-surface') as HTMLElement | null;
    if (!scrollContainer) return;

    // Timers for debouncing
    let textScrollTimer: ReturnType<typeof setTimeout> | null = null;
    let selectionScrollTimer: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;

    /**
     * Scroll the cursor into view within the VISUAL viewport
     * Production pattern: Keep caret one line above keyboard
     * IMPORTANT: On iOS with keyboard, visual viewport shrinks but layout viewport stays same
     * We need to check cursor position against visual viewport, not container bounds
     */
    const scrollCursorIntoView = () => {
      // Cancel any pending animation frame
      if (rafId) cancelAnimationFrame(rafId);

      // Schedule scroll for next animation frame (production pattern)
      rafId = requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        if (!editorElement.contains(range.commonAncestorContainer)) return;

        // Get cursor position
        const rangeRect = range.getBoundingClientRect();
        if (rangeRect.height === 0 && rangeRect.width === 0) return;

        // Use visual viewport if available (iOS keyboard support), otherwise use window
        const visualViewport = window.visualViewport;
        const viewportHeight = visualViewport?.height ?? window.innerHeight;
        const viewportTop = visualViewport?.offsetTop ?? 0;

        // Calculate visible area boundaries (accounting for keyboard)
        const visibleTop = viewportTop;
        const visibleBottom = viewportTop + viewportHeight;

        // "One line above keyboard" = line height (28px) + small buffer (22px) = 50px
        const ONE_LINE_ABOVE_KEYBOARD = 50;

        // Check if cursor is below the visible area (behind keyboard)
        if (rangeRect.bottom > visibleBottom - ONE_LINE_ABOVE_KEYBOARD) {
          // Cursor is below visible area - scroll down to bring it into view
          const scrollAmount = rangeRect.bottom - (visibleBottom - ONE_LINE_ABOVE_KEYBOARD);
          scrollContainer.scrollBy({
            top: scrollAmount,
            behavior: 'instant'  // rAF provides smoothness, instant prevents jank
          });
        } else if (rangeRect.top < visibleTop + 40) {
          // Cursor is above visible area - scroll up (smaller buffer at top)
          const scrollAmount = (visibleTop + 40) - rangeRect.top;
          scrollContainer.scrollBy({
            top: -scrollAmount,
            behavior: 'instant'
          });
        }
      });
    };

    /**
     * Text changes (typing) - minimal debounce to batch rapid keystrokes
     * Production pattern: 20-30ms is imperceptible but batches 60fps input
     */
    const debouncedTextScroll = () => {
      if (textScrollTimer) clearTimeout(textScrollTimer);
      textScrollTimer = setTimeout(scrollCursorIntoView, 30);
    };

    /**
     * Selection changes (cursor movement) - light debounce to catch arrow keys, clicks
     * Batches multiple selection updates but feels instant
     */
    const debouncedSelectionScroll = () => {
      if (selectionScrollTimer) clearTimeout(selectionScrollTimer);
      selectionScrollTimer = setTimeout(scrollCursorIntoView, 50);
    };

    // Listen for text changes (typing)
    const removeTextListener = editor.registerTextContentListener(() => {
      debouncedTextScroll();
    });

    // Listen for selection changes (cursor movement without typing)
    // This catches: arrow keys, mouse clicks, touch selection
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (editorElement.contains(range.commonAncestorContainer)) {
          debouncedSelectionScroll();
        }
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);

    // Listen for viewport resize (keyboard appear/disappear) - immediate, no debounce
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', scrollCursorIntoView);

    return () => {
      if (textScrollTimer) clearTimeout(textScrollTimer);
      if (selectionScrollTimer) clearTimeout(selectionScrollTimer);
      if (rafId) cancelAnimationFrame(rafId);
      removeTextListener();
      document.removeEventListener('selectionchange', handleSelectionChange);
      visualViewport?.removeEventListener('resize', scrollCursorIntoView);
    };
  }, [editor]);

  return null;
}
