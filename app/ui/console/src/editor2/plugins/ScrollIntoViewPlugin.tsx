/**
 * ScrollIntoViewPlugin
 * 
 * Ensures the cursor stays visible within the editor scroll container.
 * 
 * This plugin uses a simpler approach:
 * 1. Does NOT resize the editor container (causes jank)
 * 2. Uses native-feeling smooth scrolling within the editor
 * 3. Keeps cursor roughly one line above keyboard when typing reaches bottom
 * 4. Mimics Apple Notes behavior: smooth, natural scrolling
 * 
 * iOS Safari handles the keyboard viewport automatically with 100dvh.
 * This plugin just ensures the cursor scrolls into view within the editor.
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
    
    // Get computed line height from editor styles
    const getLineHeight = (): number => {
      const computed = window.getComputedStyle(editorElement);
      const lineHeight = parseFloat(computed.lineHeight);
      // Fallback if lineHeight is 'normal' or NaN
      return isNaN(lineHeight) ? 28 : lineHeight;
    };

    /**
     * Scroll the cursor into view within the editor container
     * Uses smooth scrolling for natural feel like Apple Notes
     */
    const scrollCursorIntoView = () => {
      const LINE_HEIGHT = getLineHeight();
      // Padding above keyboard to keep cursor visible (2 lines)
      const BOTTOM_PADDING = LINE_HEIGHT * 2;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      if (!editorElement.contains(range.commonAncestorContainer)) return;

      // Get cursor position
      const rangeRect = range.getBoundingClientRect();
      if (rangeRect.height === 0 && rangeRect.width === 0) return;
      
      // Get container bounds
      const containerRect = scrollContainer.getBoundingClientRect();
      
      // Calculate visible area within the scroll container
      // If keyboard is visible, visualViewport.height gives us the visible area
      const viewportBottom = window.visualViewport 
        ? window.visualViewport.height 
        : window.innerHeight;
      
      // The actual visible bottom of the container (whichever is smaller)
      const visibleBottom = Math.min(containerRect.bottom, viewportBottom) - BOTTOM_PADDING;
      const visibleTop = containerRect.top + 40; // Top padding

      // Scroll if cursor is below visible area
      if (rangeRect.bottom > visibleBottom) {
        const scrollAmount = rangeRect.bottom - visibleBottom + LINE_HEIGHT;
        scrollContainer.scrollBy({ 
          top: scrollAmount, 
          behavior: 'smooth' 
        });
      }
      // Scroll if cursor is above visible area  
      else if (rangeRect.top < visibleTop) {
        const scrollAmount = visibleTop - rangeRect.top + LINE_HEIGHT;
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
      scrollTimer = setTimeout(scrollCursorIntoView, 50);
    };

    // Listen for text changes (typing, enter, delete)
    const removeTextListener = editor.registerTextContentListener(() => {
      debouncedScroll();
    });

    // Also scroll on selection changes (cursor movement)
    // Using inline type to avoid importing full Lexical types
    const removeSelectionListener = editor.registerUpdateListener((payload) => {
      const { tags } = payload as { tags: Set<string> };
      // Only scroll on user interactions, not programmatic updates
      if (tags.has('history-merge') || tags.has('skip-scroll')) return;
      debouncedScroll();
    });

    return () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      removeTextListener();
      removeSelectionListener();
    };
  }, [editor]);

  return null;
}
