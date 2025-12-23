/**
 * ScrollIntoViewPlugin
 * 
 * Ensures the cursor stays visible within the editor scroll container.
 * 
 * With `interactive-widget=overlays-content` in the viewport meta tag,
 * iOS Safari no longer resizes the layout viewport when keyboard appears.
 * Instead, the keyboard overlays the content, and we use visualViewport
 * to know the actual visible area.
 * 
 * This plugin:
 * 1. Does NOT resize the editor container (causes jank)
 * 2. Uses native-feeling smooth scrolling within the editor
 * 3. Keeps cursor roughly 2 lines above keyboard when typing reaches bottom
 * 4. Listens to visualViewport resize to handle keyboard open/close
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
      
      // With interactive-widget=overlays-content, visualViewport.height 
      // gives us the actual visible height above the keyboard
      const visualViewport = window.visualViewport;
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const viewportBottom = viewportTop + viewportHeight;
      
      // The actual visible bottom of the container (whichever is smaller)
      const visibleBottom = Math.min(containerRect.bottom, viewportBottom) - BOTTOM_PADDING;
      const visibleTop = Math.max(containerRect.top, viewportTop) + 40; // Top padding

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
    const removeSelectionListener = editor.registerUpdateListener((payload) => {
      const { tags } = payload as { tags: Set<string> };
      // Only scroll on user interactions, not programmatic updates
      if (tags.has('history-merge') || tags.has('skip-scroll')) return;
      debouncedScroll();
    });

    // Listen for viewport resize (keyboard open/close)
    // This ensures cursor stays visible when keyboard appears
    const handleViewportResize = () => {
      // Only scroll if editor is focused
      if (document.activeElement === editorElement || editorElement.contains(document.activeElement)) {
        // Small delay to let keyboard animation complete
        setTimeout(scrollCursorIntoView, 100);
      }
    };

    window.visualViewport?.addEventListener('resize', handleViewportResize);

    return () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      removeTextListener();
      removeSelectionListener();
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
    };
  }, [editor]);

  return null;
}
