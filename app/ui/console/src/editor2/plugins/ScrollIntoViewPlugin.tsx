/**
 * ScrollIntoViewPlugin
 * 
 * Ensures cursor visibility on iOS by scrolling content within the editor container.
 * Uses scrollIntoView API with proper block positioning to keep cursor above keyboard.
 * 
 * Key behaviors:
 * 1. Scrolls cursor into view when typing
 * 2. Uses 'center' block to keep cursor away from keyboard
 * 3. Accounts for keyboard height via scroll-padding-bottom in CSS
 * 4. Smooth scrolling for natural feel
 */
import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

export function ScrollIntoViewPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const editorElement = editor.getRootElement();
    if (!editorElement) return;

    // Debounce timer
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Scroll the cursor into view within the editor container
     * Uses native scrollIntoView with 'center' to keep cursor visible above keyboard
     */
    const scrollCursorIntoView = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      if (!editorElement.contains(range.commonAncestorContainer)) return;

      // Create a temporary span at cursor position for scrollIntoView
      const tempSpan = document.createElement('span');
      tempSpan.style.position = 'absolute';
      tempSpan.style.visibility = 'hidden';
      
      try {
        range.insertNode(tempSpan);
        
        // Scroll the cursor into view with 'center' positioning
        // This keeps the cursor comfortably visible, away from keyboard
        tempSpan.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
        
        // Clean up
        tempSpan.remove();
      } catch (e) {
        // Silently handle any DOM errors
        if (tempSpan.parentNode) {
          tempSpan.remove();
        }
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
