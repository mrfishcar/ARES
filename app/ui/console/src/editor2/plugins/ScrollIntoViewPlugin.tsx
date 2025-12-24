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

    // Debounce timer
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Scroll the cursor into view within the VISUAL viewport
     * IMPORTANT: On iOS with keyboard, visual viewport shrinks but layout viewport stays same
     * We need to check cursor position against visual viewport, not container bounds
     */
    const scrollCursorIntoView = () => {
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

      const PADDING = 80; // Keep cursor just above keyboard, not centered

      // Use instant scroll on mobile for snappier feel
      const isTouch = 'ontouchstart' in window;
      const scrollBehavior = isTouch ? 'auto' : 'smooth';

      // Check if cursor is below the visible area (behind keyboard)
      if (rangeRect.bottom > visibleBottom - PADDING) {
        // Cursor is below visible area - scroll down to bring it into view
        const scrollAmount = rangeRect.bottom - (visibleBottom - PADDING);
        scrollContainer.scrollBy({
          top: scrollAmount,
          behavior: scrollBehavior
        });
      } else if (rangeRect.top < visibleTop + PADDING) {
        // Cursor is above visible area - scroll up
        const scrollAmount = (visibleTop + PADDING) - rangeRect.top;
        scrollContainer.scrollBy({
          top: -scrollAmount,
          behavior: scrollBehavior
        });
      }
    };

    /**
     * Debounced scroll - prevents excessive calls during rapid typing
     * Longer delay to reduce jumpiness
     */
    const debouncedScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      const isTouch = 'ontouchstart' in window;
      const delay = isTouch ? 150 : 200; // Reduced frequency to prevent jumping
      scrollTimer = setTimeout(scrollCursorIntoView, delay);
    };

    // Listen for text changes (typing, enter, delete)
    const removeTextListener = editor.registerTextContentListener(() => {
      debouncedScroll();
    });

    return () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      removeTextListener();
    };
  }, [editor]);

  return null;
}
