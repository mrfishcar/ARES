/**
 * KeyboardLockPlugin
 *
 * Prevents iPad Safari from scrolling the entire page when keyboard is open.
 *
 * Problem:
 * - On iPad, layout viewport (1024px) != visual viewport (~400px when keyboard open)
 * - With html/body scrollable, Safari lets you "slide the entire UI" when keyboard is visible
 * - This breaks caret tracking and causes the wrong scroll container to be used
 *
 * Solution:
 * - Add 'kb-open' class to <html> and <body> when editor is focused
 * - CSS sets position: fixed on html.kb-open to prevent page scroll
 * - Track visualViewport.height and set --vvh CSS variable for accurate height
 * - Remove class when editor loses focus
 *
 * This ensures ONLY the editor's scroll container (.rich-editor-surface or .lab-content)
 * can scroll, preventing the "manual slide entire UI" issue.
 */
import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

const DEBUG_KB_LOCK = typeof window !== 'undefined' && (window as any).ARES_DEBUG_SCROLL;

function debugLog(...args: any[]) {
  if (DEBUG_KB_LOCK) {
    const timestamp = new Date().toISOString().substr(11, 12);
    console.log(`[KeyboardLock ${timestamp}]`, ...args);
  }
}

export function KeyboardLockPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const editorElement = editor.getRootElement();
    if (!editorElement) {
      return;
    }

    const htmlElement = document.documentElement;
    const bodyElement = document.body;
    const rootElement = document.getElementById('root');

    /**
     * Update visualViewport height CSS variable
     * This gives us the ACTUAL visible height (accounting for keyboard)
     */
    function updateViewportHeight() {
      const vv = window.visualViewport;
      const height = vv ? vv.height : window.innerHeight;
      htmlElement.style.setProperty('--vvh', `${height}px`);

      debugLog('📏 Viewport height updated', {
        visualViewportHeight: vv?.height,
        innerHeight: window.innerHeight,
        vvh: height,
        keyboardHeight: window.innerHeight - (vv?.height || window.innerHeight),
      });
    }

    /**
     * Lock the page scroll when editor receives focus
     */
    function lockPageScroll() {
      htmlElement.classList.add('kb-open');
      bodyElement.classList.add('kb-open');
      if (rootElement) rootElement.classList.add('kb-open');

      // Update viewport height immediately
      updateViewportHeight();

      debugLog('🔒 Page scroll LOCKED (kb-open class added)', {
        htmlHasClass: htmlElement.classList.contains('kb-open'),
        bodyHasClass: bodyElement.classList.contains('kb-open'),
        rootHasClass: rootElement?.classList.contains('kb-open'),
      });
    }

    /**
     * Unlock page scroll when editor loses focus
     */
    function unlockPageScroll() {
      htmlElement.classList.remove('kb-open');
      bodyElement.classList.remove('kb-open');
      if (rootElement) rootElement.classList.remove('kb-open');

      debugLog('🔓 Page scroll UNLOCKED (kb-open class removed)', {
        htmlHasClass: htmlElement.classList.contains('kb-open'),
        bodyHasClass: bodyElement.classList.contains('kb-open'),
        rootHasClass: rootElement?.classList.contains('kb-open'),
      });
    }

    /**
     * Handle focus event
     */
    function handleFocus() {
      debugLog('👁️ Editor focused');
      lockPageScroll();
    }

    /**
     * Handle blur event
     */
    function handleBlur() {
      debugLog('💤 Editor blurred');
      unlockPageScroll();
    }

    /**
     * Handle visualViewport resize (keyboard appear/disappear)
     */
    function handleViewportResize() {
      const vv = window.visualViewport;
      if (!vv) return;

      const keyboardHeight = window.innerHeight - vv.height;
      const keyboardOpen = keyboardHeight > 50;

      debugLog('⌨️ Viewport resized', {
        visualHeight: vv.height,
        innerHeight: window.innerHeight,
        keyboardHeight,
        keyboardOpen,
        hasKbOpenClass: htmlElement.classList.contains('kb-open'),
      });

      // Update height if kb-open class is active
      if (htmlElement.classList.contains('kb-open')) {
        updateViewportHeight();
      }
    }

    // Add event listeners
    editorElement.addEventListener('focus', handleFocus, true);
    editorElement.addEventListener('blur', handleBlur, true);

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', handleViewportResize);

    debugLog('✅ KeyboardLockPlugin initialized', {
      editorElement: editorElement.className,
      visualViewportAvailable: !!visualViewport,
    });

    // Cleanup
    return () => {
      editorElement.removeEventListener('focus', handleFocus, true);
      editorElement.removeEventListener('blur', handleBlur, true);
      visualViewport?.removeEventListener('resize', handleViewportResize);

      // Remove kb-open class on unmount
      unlockPageScroll();

      debugLog('🧹 KeyboardLockPlugin cleanup');
    };
  }, [editor]);

  return null;
}
