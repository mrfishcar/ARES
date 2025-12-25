/**
 * ScrollIntoViewPlugin
 *
 * Production-grade iOS keyboard handling inspired by Google Docs/Notion/CodeMirror
 *
 * Architecture:
 * - Visual-viewport-aware container height (Notion pattern)
 * - Static padding + scroll slack spacer (Google Docs pattern)
 * - rAF-batched scroll requests (CodeMirror pattern)
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
      console.error('[ScrollPlugin] No editor root element found');
      return;
    }

    const scrollContainer = editorElement.closest('.rich-editor-surface') as HTMLElement | null;
    if (!scrollContainer) {
      console.error('[ScrollPlugin] No scroll container found. Editor element:', editorElement);
      return;
    }

    console.log('[ScrollPlugin] Initialized successfully', {
      editorElement: editorElement.className,
      scrollContainer: scrollContainer.className,
      scrollHeight: scrollContainer.scrollHeight,
      clientHeight: scrollContainer.clientHeight,
    });

    // Animation frame ID for scroll timing
    let rafId: number | null = null;

    // Track last logged state to avoid spam
    let lastLoggedState = {
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 0,
      viewportHeight: 0,
    };

    /**
     * PHASE 1: Diagnostic logging
     * Log viewport and scroll container state to identify issues
     */
    const logDiagnostics = (event: string) => {
      const visualViewport = window.visualViewport;
      const vvHeight = visualViewport?.height ?? window.innerHeight;
      const vvOffsetTop = visualViewport?.offsetTop ?? 0;
      const vvScale = visualViewport?.scale ?? 1;

      const scrollTop = scrollContainer.scrollTop;
      const scrollHeight = scrollContainer.scrollHeight;
      const clientHeight = scrollContainer.clientHeight;

      // Only log if something changed significantly
      const changed =
        Math.abs(scrollTop - lastLoggedState.scrollTop) > 5 ||
        Math.abs(scrollHeight - lastLoggedState.scrollHeight) > 5 ||
        Math.abs(clientHeight - lastLoggedState.clientHeight) > 5 ||
        Math.abs(vvHeight - lastLoggedState.viewportHeight) > 5;

      if (changed) {
        debugLog(event, {
          viewport: {
            height: vvHeight,
            offsetTop: vvOffsetTop,
            scale: vvScale,
            layoutHeight: window.innerHeight,
            keyboardHeight: window.innerHeight - vvHeight,
          },
          scrollContainer: {
            scrollTop,
            scrollHeight,
            clientHeight,
            scrollRange: scrollHeight - clientHeight,
            hasScrollRoom: scrollHeight > clientHeight,
          },
        });

        lastLoggedState = {
          scrollTop,
          scrollHeight,
          clientHeight,
          viewportHeight: vvHeight,
        };
      }
    };

    /**
     * Scroll the cursor into view within the VISUAL viewport
     * Production pattern: Keep caret one line above keyboard
     */
    const scrollCursorIntoView = () => {
      // Cancel any pending animation frame
      if (rafId) cancelAnimationFrame(rafId);

      // CRITICAL FIX: Double-rAF to ensure layout is complete
      // Problem: When pressing Enter, DOM updates but layout hasn't finished
      // Solution: First rAF processes DOM, second rAF waits for layout/paint
      // This fixes the "second line enter" issue
      rafId = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) {
            console.log('[ScrollPlugin] No selection');
            return;
          }

          const range = selection.getRangeAt(0);
          if (!editorElement.contains(range.commonAncestorContainer)) {
            console.log('[ScrollPlugin] Selection outside editor');
            return;
          }

          // Get cursor position
          const rangeRect = range.getBoundingClientRect();
          if (rangeRect.height === 0 && rangeRect.width === 0) {
            console.log('[ScrollPlugin] Empty range rect');
            return;
          }

          // Use visual viewport if available (iOS keyboard support)
          const visualViewport = window.visualViewport;
          const viewportHeight = visualViewport?.height ?? window.innerHeight;
          const viewportTop = visualViewport?.offsetTop ?? 0;

          // Calculate visible area boundaries (accounting for keyboard)
          const visibleTop = viewportTop;
          const visibleBottom = viewportTop + viewportHeight;

          // INCREASED THRESHOLD: QuickType bar (40px) + two lines (56px) + buffer (24px) = 120px
          // This ensures caret is truly visible with comfortable margin
          const ONE_LINE_ABOVE_KEYBOARD = 120;

          console.log('[ScrollPlugin] Caret check', {
            caretRect: {
              top: Math.round(rangeRect.top),
              bottom: Math.round(rangeRect.bottom),
              height: Math.round(rangeRect.height),
            },
            visibleRegion: {
              top: Math.round(visibleTop),
              bottom: Math.round(visibleBottom),
              threshold: Math.round(visibleBottom - ONE_LINE_ABOVE_KEYBOARD),
            },
            scrollContainer: {
              scrollTop: scrollContainer.scrollTop,
              scrollHeight: scrollContainer.scrollHeight,
              clientHeight: scrollContainer.clientHeight,
            },
          });

          // Check if cursor is below the visible area (behind keyboard)
          if (rangeRect.bottom > visibleBottom - ONE_LINE_ABOVE_KEYBOARD) {
            // Cursor is below visible area - scroll down to bring it into view
            const scrollAmount = rangeRect.bottom - (visibleBottom - ONE_LINE_ABOVE_KEYBOARD);
            console.log('[ScrollPlugin] 🔽 Scrolling down', {
              scrollAmount: Math.round(scrollAmount),
              before: scrollContainer.scrollTop
            });
            scrollContainer.scrollBy({
              top: scrollAmount,
              behavior: 'instant'  // rAF provides smoothness, instant prevents jank
            });
            console.log('[ScrollPlugin] After scroll:', {
              scrollTop: scrollContainer.scrollTop
            });

            // Log result
            setTimeout(() => logDiagnostics('After scroll down'), 0);
          } else if (rangeRect.top < visibleTop + 40) {
            // Cursor is above visible area - scroll up (smaller buffer at top)
            const scrollAmount = (visibleTop + 40) - rangeRect.top;
            console.log('[ScrollPlugin] 🔼 Scrolling up', {
              scrollAmount: Math.round(scrollAmount),
              before: scrollContainer.scrollTop
            });
            scrollContainer.scrollBy({
              top: -scrollAmount,
              behavior: 'instant'
            });
            console.log('[ScrollPlugin] After scroll:', {
              scrollTop: scrollContainer.scrollTop
            });

            // Log result
            setTimeout(() => logDiagnostics('After scroll up'), 0);
          } else {
            console.log('[ScrollPlugin] ✅ Caret in visible area, no scroll needed');
          }
        });
      });
    };

    /**
     * Text changes (typing) - IMMEDIATE scroll with no debounce
     * Double-rAF handles timing, so no need for setTimeout delay
     */
    const handleTextChange = () => {
      console.log('[ScrollPlugin] 📝 Text change detected');
      logDiagnostics('Text changed');
      // No debounce - double-rAF provides timing, instant response needed
      scrollCursorIntoView();
    };

    /**
     * Selection changes (cursor movement) - IMMEDIATE scroll with no debounce
     */
    const handleSelectionScroll = () => {
      console.log('[ScrollPlugin] 👆 Selection change detected');
      // No debounce - double-rAF provides timing
      scrollCursorIntoView();
    };

    // Listen for text changes (typing)
    const removeTextListener = editor.registerTextContentListener(handleTextChange);

    // Listen for selection changes (cursor movement without typing)
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (editorElement.contains(range.commonAncestorContainer)) {
          handleSelectionScroll();
        }
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);

    // Listen for viewport resize (keyboard appear/disappear)
    const visualViewport = window.visualViewport;
    const handleViewportResize = () => {
      logDiagnostics('Viewport resized');
      scrollCursorIntoView();
    };
    visualViewport?.addEventListener('resize', handleViewportResize);

    // Listen for scroll events (diagnostic only)
    const handleScroll = () => {
      logDiagnostics('Scroll event');
    };
    if (DEBUG_SCROLL) {
      visualViewport?.addEventListener('scroll', handleScroll);
      scrollContainer.addEventListener('scroll', handleScroll);
    }

    // Initial diagnostic
    logDiagnostics('Plugin mounted');

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      removeTextListener();
      document.removeEventListener('selectionchange', handleSelectionChange);
      visualViewport?.removeEventListener('resize', handleViewportResize);
      if (DEBUG_SCROLL) {
        visualViewport?.removeEventListener('scroll', handleScroll);
        scrollContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, [editor]);

  return null;
}
