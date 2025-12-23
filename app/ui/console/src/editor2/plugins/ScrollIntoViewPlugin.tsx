/**
 * ScrollIntoViewPlugin
 * 
 * Ensures cursor visibility on iOS by scrolling content within the editor container.
 * 
 * Works with `interactive-widget=overlays-content` which keeps the keyboard as an overlay
 * rather than resizing the viewport. This prevents the entire UI from shifting.
 * 
 * Key behaviors:
 * 1. Scrolls content UP when cursor approaches keyboard area (bottom of viewport)
 * 2. Scrolls content DOWN when cursor is near top and needs to be visible
 * 3. Keeps cursor ~1 line above keyboard (like Apple Notes)
 * 4. Uses visual viewport API to detect keyboard position
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
     * This ensures the cursor stays visible when the iOS keyboard appears
     */
    const scrollCursorIntoView = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      if (!editorElement.contains(range.commonAncestorContainer)) return;

      // Get cursor position relative to viewport
      const rangeRect = range.getBoundingClientRect();
      if (rangeRect.height === 0 && rangeRect.width === 0) return;
      
      // iOS Fix: Use visual viewport to detect keyboard
      // When keyboard is open, visualViewport.height < window.innerHeight
      const visualViewport = window.visualViewport;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
      
      // Calculate visible area accounting for keyboard
      // The keyboard covers the bottom portion of the layout viewport
      const visibleBottom = viewportOffsetTop + viewportHeight;
      
      // Padding to keep cursor comfortably visible above keyboard
      // Larger padding for iOS to ensure cursor stays ~1 line above keyboard
      const BOTTOM_PADDING = 100; // ~1.5 lines above keyboard
      const TOP_PADDING = 60;     // Comfortable margin at top
      
      // Get container bounds
      const containerRect = scrollContainer.getBoundingClientRect();
      
      // Check if cursor is below visible area (near/behind keyboard)
      // rangeRect.bottom is in viewport coordinates
      if (rangeRect.bottom > visibleBottom - BOTTOM_PADDING) {
        // Cursor is near/below bottom - scroll DOWN to bring cursor up
        const scrollAmount = rangeRect.bottom - (visibleBottom - BOTTOM_PADDING);
        
        console.log('[ScrollIntoView] Scrolling DOWN', {
          cursorBottom: rangeRect.bottom,
          visibleBottom,
          scrollAmount,
          containerScrollTop: scrollContainer.scrollTop
        });
        
        scrollContainer.scrollBy({ 
          top: scrollAmount, 
          behavior: 'smooth' 
        });
      } 
      // Check if cursor is above visible area
      else if (rangeRect.top < containerRect.top + TOP_PADDING) {
        // Cursor is near/above top - scroll UP to bring cursor down
        const scrollAmount = (containerRect.top + TOP_PADDING) - rangeRect.top;
        
        console.log('[ScrollIntoView] Scrolling UP', {
          cursorTop: rangeRect.top,
          containerTop: containerRect.top,
          scrollAmount,
          containerScrollTop: scrollContainer.scrollTop
        });
        
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
      scrollTimer = setTimeout(scrollCursorIntoView, 50); // Reduced delay for more responsive scrolling
    };

    // Listen for text changes (typing, enter, delete)
    const removeTextListener = editor.registerTextContentListener(() => {
      debouncedScroll();
    });

    // Also listen for selection changes (arrow keys, click)
    const handleSelectionChange = () => {
      debouncedScroll();
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    // iOS specific: listen for visual viewport resize (keyboard show/hide)
    const handleViewportResize = () => {
      // When keyboard shows/hides, re-check cursor position
      console.log('[ScrollIntoView] Viewport resize', {
        visualHeight: window.visualViewport?.height,
        innerHeight: window.innerHeight,
        offsetTop: window.visualViewport?.offsetTop
      });
      debouncedScroll();
    };

    window.visualViewport?.addEventListener('resize', handleViewportResize);
    window.visualViewport?.addEventListener('scroll', handleViewportResize);

    return () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      removeTextListener();
      document.removeEventListener('selectionchange', handleSelectionChange);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      window.visualViewport?.removeEventListener('scroll', handleViewportResize);
    };
  }, [editor]);

  return null;
}
