/**
 * ScrollIntoViewPlugin
 * 
 * Ensures the cursor/caret stays visible within the editor's scrollable container
 * when typing. This prevents iOS Safari from scrolling the entire viewport.
 * 
 * The plugin listens for text changes and scrolls the editor surface container
 * to keep the cursor visible, rather than relying on browser's native behavior
 * which can shift the viewport on iOS.
 */
import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

export function ScrollIntoViewPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Get the scrollable container (rich-editor-surface)
    const editorElement = editor.getRootElement();
    if (!editorElement) return;

    const scrollContainer = editorElement.closest('.rich-editor-surface');
    if (!scrollContainer) return;

    // Function to scroll cursor into view within the container
    const scrollCursorIntoView = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      if (!editorElement.contains(range.commonAncestorContainer)) return;

      // Get cursor position relative to the scroll container
      const rangeRect = range.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();

      // Check if cursor is below visible area
      const cursorBottom = rangeRect.bottom;
      const containerBottom = containerRect.bottom;
      const padding = 50; // Extra padding to keep cursor visible

      if (cursorBottom > containerBottom - padding) {
        // Scroll down to show cursor
        const scrollAmount = cursorBottom - containerBottom + padding;
        scrollContainer.scrollTop += scrollAmount;
      }

      // Check if cursor is above visible area
      const cursorTop = rangeRect.top;
      const containerTop = containerRect.top;

      if (cursorTop < containerTop + padding) {
        // Scroll up to show cursor
        const scrollAmount = containerTop - cursorTop + padding;
        scrollContainer.scrollTop -= scrollAmount;
      }
    };

    // Listen for text content changes (typing)
    const removeListener = editor.registerTextContentListener(() => {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        scrollCursorIntoView();
      });
    });

    // Also listen for selection changes (cursor movement)
    const handleSelectionChange = () => {
      // Small delay to let the selection settle
      setTimeout(scrollCursorIntoView, 10);
    };
    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      removeListener();
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [editor]);

  return null;
}
