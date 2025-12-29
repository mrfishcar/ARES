import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW, SELECTION_CHANGE_COMMAND } from 'lexical';

/**
 * Minimal caret nudge for iOS Safari.
 *
 * Measures the caret and gently scrolls the editor surface upward when the
 * caret gets close to the keyboard edge. Uses padding-based capacity (see
 * index.css) plus a small timed nudge to match native Notes/Docs behavior.
 */
export function ScrollIntoViewPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const isIOS = /iP(ad|hone|od)/.test(window.navigator.userAgent);
    const viewport = window.visualViewport;
    const scrollContainer = document.querySelector('.rich-editor-surface') as HTMLElement | null;

    if (!isIOS || !viewport || !scrollContainer) {
      return;
    }

    let throttleId: number | null = null;

    const scheduleCaretNudge = () => {
      if (throttleId) return;

      throttleId = window.setTimeout(() => {
        throttleId = null;

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) return;

        const viewportBottom = viewport.height + viewport.offsetTop;
        const dangerBuffer = 40; // Start nudging when caret is within 40px of keyboard
        const nudgeAmount = 60; // Scroll a small, fixed amount to keep caret safe

        if (rect.bottom > viewportBottom - dangerBuffer) {
          scrollContainer.scrollBy({ top: nudgeAmount, behavior: 'auto' });
        }
      }, 80);
    };

    const unregisterSelection = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        scheduleCaretNudge();
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    const unregisterUpdate = editor.registerUpdateListener(() => {
      scheduleCaretNudge();
    });

    const handleInput = () => scheduleCaretNudge();

    scrollContainer.addEventListener('input', handleInput);
    document.addEventListener('selectionchange', scheduleCaretNudge);
    viewport.addEventListener('resize', scheduleCaretNudge);

    return () => {
      unregisterSelection();
      unregisterUpdate();
      scrollContainer.removeEventListener('input', handleInput);
      document.removeEventListener('selectionchange', scheduleCaretNudge);
      viewport.removeEventListener('resize', scheduleCaretNudge);
      if (throttleId) {
        clearTimeout(throttleId);
      }
    };
  }, [editor]);

  return null;
}
