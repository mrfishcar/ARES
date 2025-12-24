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
     * Scroll the cursor into view within the editor container
     * IMPORTANT: Use instant scroll on iOS/touch devices for responsive feel
     */
    const scrollCursorIntoView = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      if (!editorElement.contains(range.commonAncestorContainer)) return;

      // Get cursor position
      const rangeRect = range.getBoundingClientRect();
      if (rangeRect.height === 0 && rangeRect.width === 0) return;

      // Get container bounds
      const containerRect = scrollContainer.getBoundingClientRect();

      // Check if cursor is below visible area
      const PADDING = 100; // Increased padding for better visibility on mobile

      // Use instant scroll on mobile for snappier feel
      const isTouch = 'ontouchstart' in window;
      const scrollBehavior = isTouch ? 'auto' : 'smooth';

      if (rangeRect.bottom > containerRect.bottom - PADDING) {
        // Cursor is near/below bottom - scroll down
        const scrollAmount = rangeRect.bottom - (containerRect.bottom - PADDING);
        scrollContainer.scrollBy({
          top: scrollAmount,
          behavior: scrollBehavior
        });
      } else if (rangeRect.top < containerRect.top + PADDING) {
        // Cursor is near/above top - scroll up
        const scrollAmount = (containerRect.top + PADDING) - rangeRect.top;
        scrollContainer.scrollBy({
          top: -scrollAmount,
          behavior: scrollBehavior
        });
      }
    };

    /**
     * Debounced scroll - prevents excessive calls during rapid typing
     * Shorter delay on touch devices for more responsive feel
     */
    const debouncedScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      const isTouch = 'ontouchstart' in window;
      const delay = isTouch ? 50 : 100; // Faster on mobile
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
