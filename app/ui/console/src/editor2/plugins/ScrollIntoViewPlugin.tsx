/**
 * ScrollIntoViewPlugin
 * 
 * Minimal plugin that assists with cursor visibility.
 * 
 * With `interactive-widget=resizes-content` in the viewport meta tag,
 * iOS Safari will resize BOTH the visual and layout viewports when the
 * keyboard appears. This means the browser handles auto-scrolling to
 * keep focused inputs visible - we just need to assist for edge cases.
 * 
 * This is the recommended approach for editors because:
 * 1. Browser handles most scroll-to-focus behavior natively
 * 2. No fighting against native iOS behavior
 * 3. Minimal JavaScript intervention = less jank
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
     * This is a backup for cases where browser auto-scroll doesn't work
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
      
      // Simple check: is cursor below visible area?
      // Add some padding (60px) to keep cursor comfortably visible
      const PADDING = 60;
      
      if (rangeRect.bottom > containerRect.bottom - PADDING) {
        // Cursor is near/below bottom - scroll down
        const scrollAmount = rangeRect.bottom - (containerRect.bottom - PADDING);
        scrollContainer.scrollBy({ 
          top: scrollAmount, 
          behavior: 'smooth' 
        });
      } else if (rangeRect.top < containerRect.top + PADDING) {
        // Cursor is near/above top - scroll up
        const scrollAmount = (containerRect.top + PADDING) - rangeRect.top;
        scrollContainer.scrollBy({ 
          top: -scrollAmount, 
          behavior: 'smooth' 
        });
      }
    };

    /**
     * Debounced scroll - prevents excessive calls during rapid typing
     */
    const debouncedScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(scrollCursorIntoView, 100);
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
