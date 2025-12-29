import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW, SELECTION_CHANGE_COMMAND } from 'lexical';

/**
 * Minimal caret nudge for iOS Safari (Lexical).
 *
 * Goal:
 * - Only when keyboard is open (visualViewport shrunk)
 * - Only when selection is inside editor
 * - Compute a bounded delta to keep caret above keyboard edge
 * - rAF-scheduled to avoid thrash/jitter
 */
export function ScrollIntoViewPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const vv = window.visualViewport;
    if (!vv) return;

    const isIPadOS =
      navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;

    const isIOSUA = /iP(ad|hone|od)/.test(navigator.userAgent);
    const isIOS = isIOSUA || isIPadOS;

    if (!isIOS) return;

    // NOTE: Make sure this is the ACTUAL scroll owner for the editor surface.
    // If your scroll owner is different, change this selector accordingly.
    const scrollContainer = document.querySelector(
      '.rich-editor-surface'
    ) as HTMLElement | null;

    if (!scrollContainer) return;

    // You can tune these:
    const DANGER_BUFFER_PX = 44;   // how close to keyboard edge before nudging
    const TARGET_BUFFER_PX = 72;   // where we want the caret to end up above the edge
    const MAX_STEP_PX = 140;       // prevents huge “teleport” jumps
    const KEYBOARD_SHRINK_PX = 120; // gate: only act if vv is this much smaller than layout viewport

    let rafId: number | null = null;
    let lastRun = 0;

    const isKeyboardLikelyOpen = () => {
      // layout viewport height is window.innerHeight in most cases
      // when keyboard opens, visualViewport.height shrinks.
      const shrink = window.innerHeight - vv.height;
      return shrink > KEYBOARD_SHRINK_PX;
    };

    const measureCaretRect = (): DOMRect | null => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;

      const range = sel.getRangeAt(0);
      // Ensure selection is inside our editor subtree
      // (selection anchor can be outside if user taps other UI)
      if (!scrollContainer.contains(range.startContainer)) return null;

      const caret = range.cloneRange();
      caret.collapse(true);

      const rects = caret.getClientRects();
      if (rects && rects.length > 0) return rects[0];

      const rect = caret.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) return null;

      return rect;
    };

    const schedule = () => {
      // Avoid flooding: coalesce into a single rAF.
      if (rafId != null) return;

      rafId = window.requestAnimationFrame(() => {
        rafId = null;

        // Soft throttle (prevents repeated scroll in same “burst”)
        const now = Date.now();
        if (now - lastRun < 60) return;
        lastRun = now;

        if (!isKeyboardLikelyOpen()) return;

        const caretRect = measureCaretRect();
        if (!caretRect) return;

        // visual viewport bottom in *layout* coordinates
        const viewportBottom = vv.height + vv.offsetTop;

        // If caret is too close to bottom edge, nudge scroll container down
        const dangerLine = viewportBottom - DANGER_BUFFER_PX;
        if (caretRect.bottom <= dangerLine) return;

        // Compute delta needed to place caret TARGET_BUFFER_PX above viewportBottom
        const desiredBottom = viewportBottom - TARGET_BUFFER_PX;
        const rawDelta = caretRect.bottom - desiredBottom;

        // Bound step so it doesn’t jump wildly
        const delta = Math.max(0, Math.min(MAX_STEP_PX, rawDelta));

        if (delta > 0) {
          // Use direct scrollTop change to avoid any smooth-scrolling fights
          scrollContainer.scrollTop += delta;
        }
      });
    };

    const unregisterSelection = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        schedule();
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    const unregisterUpdate = editor.registerUpdateListener(() => {
      schedule();
    });

    // visualViewport changes during keyboard open/close + panning
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);

    // Optional: if you see missed cases, keep this; otherwise it can be noisy.
    document.addEventListener('selectionchange', schedule);

    return () => {
      unregisterSelection();
      unregisterUpdate();
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      document.removeEventListener('selectionchange', schedule);
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [editor]);

  return null;
}