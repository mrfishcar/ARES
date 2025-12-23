/**
 * ScrollIntoViewPlugin
 * 
 * Ensures cursor visibility on iOS by scrolling content within the editor container.
 * 
 * Works with `interactive-widget=resizes-visual` which shrinks the visual viewport
 * when keyboard appears. The editor max-height is constrained via CSS to the
 * visual viewport height, ensuring proper scroll containment.
 * 
 * Key behaviors:
 * 1. Scrolls content when cursor approaches viewport edges
 * 2. Keeps cursor ~1 line above keyboard (via padding)
 * 3. Uses visual viewport API to detect keyboard state
 * 4. Smooth scrolling for natural feel
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
     */
    const scrollCursorIntoView = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      if (!editorElement.contains(range.commonAncestorContainer)) return;

      // Get cursor position relative to viewport
      const rangeRect = range.getBoundingClientRect();
      if (rangeRect.height === 0 && rangeRect.width === 0) return;
      
      // Get container bounds
      const containerRect = scrollContainer.getBoundingClientRect();
      
      // Padding to keep cursor comfortably visible
      // Bottom padding is larger to keep cursor above keyboard area
      const BOTTOM_PADDING = 100; // ~1.5 lines above keyboard
      const TOP_PADDING = 60;     // Comfortable margin at top
      
      // Check if cursor is below visible area
      if (rangeRect.bottom > containerRect.bottom - BOTTOM_PADDING) {
        const scrollAmount = rangeRect.bottom - (containerRect.bottom - BOTTOM_PADDING);
        scrollContainer.scrollBy({ 
          top: scrollAmount, 
          behavior: 'smooth' 
        });
      } 
      // Check if cursor is above visible area
      else if (rangeRect.top < containerRect.top + TOP_PADDING) {
        const scrollAmount = (containerRect.top + TOP_PADDING) - rangeRect.top;
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

    // Listen for selection changes (arrow keys, click)
    const handleSelectionChange = () => {
      debouncedScroll();
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      removeTextListener();
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [editor]);

  return null;
}
