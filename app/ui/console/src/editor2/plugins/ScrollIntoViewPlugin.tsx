/**
 * ScrollIntoViewPlugin - iOS Notes Pattern
 *
 * SIMPLIFIED: Trust Safari's native scroll-into-view behavior.
 * - Use browser's built-in scrollIntoView API
 * - NO manual scroll math
 * - NO viewport tracking
 * - Let browser handle keyboard positioning automatically
 *
 * This works because:
 * 1. html/body have overflow: visible (not hidden)
 * 2. Clear scroll container hierarchy (.lab-content on mobile, .rich-editor-surface on desktop)
 * 3. Container height stays fixed when keyboard appears
 * 4. Safari automatically scrolls focused elements into view
 *
 * Enable diagnostics: window.ARES_DEBUG_SCROLL = true
 */
import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

const DEBUG_SCROLL = typeof window !== 'undefined' && (window as any).ARES_DEBUG_SCROLL;

function debugLog(...args: any[]) {
  if (DEBUG_SCROLL) {
    console.log('[ScrollPlugin]', ...args);
  }
}

export function ScrollIntoViewPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const editorElement = editor.getRootElement();
    if (!editorElement) {
      debugLog('No editor root element');
      return;
    }

    debugLog('Plugin initialized - trusting Safari native scroll behavior');

    /**
     * Scroll caret into view using browser's native API
     * Safari handles keyboard positioning automatically
     */
    const scrollCaretIntoView = () => {
      // Use double requestAnimationFrame to ensure DOM layout is complete
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) {
            return;
          }

          const range = selection.getRangeAt(0);
          if (!editorElement.contains(range.commonAncestorContainer)) {
            return;
          }

          // Get the caret rect
          const rangeRect = range.getBoundingClientRect();
          if (rangeRect.height === 0 && rangeRect.width === 0) {
            return;
          }

          debugLog('Scrolling caret into view', {
            top: Math.round(rangeRect.top),
            bottom: Math.round(rangeRect.bottom),
          });

          // Use browser's native scrollIntoView with smooth behavior
          // Safari will automatically account for keyboard and scroll to the right position
          const caretElement = range.startContainer.parentElement;
          if (caretElement) {
            caretElement.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
              inline: 'nearest',
            });
          }
        });
      });
    };

    /**
     * Listen for text changes (typing)
     */
    const handleTextChange = () => {
      debugLog('Text changed');
      scrollCaretIntoView();
    };

    /**
     * Listen for selection changes (cursor movement)
     */
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (editorElement.contains(range.commonAncestorContainer)) {
          debugLog('Selection changed');
          scrollCaretIntoView();
        }
      }
    };

    // Register listeners
    const removeTextListener = editor.registerTextContentListener(handleTextChange);
    document.addEventListener('selectionchange', handleSelectionChange);

    // Cleanup
    return () => {
      removeTextListener();
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [editor]);

  return null;
}
