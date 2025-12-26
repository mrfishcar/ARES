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
 * - Add 'kb-open' class to <html> and <body> IMMEDIATELY on mount
 * - CSS sets position: fixed on html.kb-open to prevent page scroll
 * - Track visualViewport.height and set --vvh CSS variable for accurate height
 * - Lock stays active as long as editor is mounted (full-screen editor pattern)
 *
 * This ensures ONLY the editor's scroll container (.rich-editor-surface or .lab-content)
 * can scroll, preventing the "manual slide entire UI" issue.
 */
import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { FOCUS_COMMAND, BLUR_COMMAND, COMMAND_PRIORITY_LOW } from 'lexical';

// ALWAYS log keyboard lock operations for debugging
function debugLog(...args: any[]) {
  const timestamp = new Date().toISOString().substr(11, 12);
  console.log(`[KeyboardLock ${timestamp}]`, ...args);
}

export function KeyboardLockPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
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
     * Lock the page scroll
     * This prevents the "slide entire UI" issue on iPad
     */
    function lockPageScroll() {
      htmlElement.classList.add('kb-open');
      bodyElement.classList.add('kb-open');
      if (rootElement) rootElement.classList.add('kb-open');

      // Update viewport height immediately
      updateViewportHeight();

      // Verify CSS is applied
      const htmlStyle = window.getComputedStyle(htmlElement);
      const bodyStyle = window.getComputedStyle(bodyElement);

      debugLog('🔒 Page scroll LOCKED', {
        htmlHasClass: htmlElement.classList.contains('kb-open'),
        bodyHasClass: bodyElement.classList.contains('kb-open'),
        rootHasClass: rootElement?.classList.contains('kb-open'),
        htmlPosition: htmlStyle.position,
        bodyPosition: bodyStyle.position,
        htmlOverflow: htmlStyle.overflow,
        bodyOverflow: bodyStyle.overflow,
      });
    }

    /**
     * Unlock page scroll
     */
    function unlockPageScroll() {
      htmlElement.classList.remove('kb-open');
      bodyElement.classList.remove('kb-open');
      if (rootElement) rootElement.classList.remove('kb-open');

      debugLog('🔓 Page scroll UNLOCKED', {
        htmlHasClass: htmlElement.classList.contains('kb-open'),
        bodyHasClass: bodyElement.classList.contains('kb-open'),
        rootHasClass: rootElement?.classList.contains('kb-open'),
      });
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

      // Always update height when viewport resizes
      updateViewportHeight();
    }

    // LOCK IMMEDIATELY ON MOUNT (full-screen editor pattern)
    // Since this is a dedicated editor view, page should NEVER scroll
    lockPageScroll();

    // Also register Lexical focus/blur commands for additional tracking
    const unregisterFocusCommand = editor.registerCommand(
      FOCUS_COMMAND,
      () => {
        debugLog('👁️ Editor focused (Lexical FOCUS_COMMAND)');
        lockPageScroll();
        return false; // Don't prevent other handlers
      },
      COMMAND_PRIORITY_LOW
    );

    const unregisterBlurCommand = editor.registerCommand(
      BLUR_COMMAND,
      () => {
        debugLog('💤 Editor blurred (Lexical BLUR_COMMAND)');
        // Don't unlock on blur - keep page locked while in editor view
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    // Listen for viewport resize
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', handleViewportResize);

    // Also listen for window resize
    window.addEventListener('resize', handleViewportResize);

    debugLog('✅ KeyboardLockPlugin initialized - PAGE LOCKED IMMEDIATELY', {
      visualViewportAvailable: !!visualViewport,
      htmlClasses: htmlElement.className,
      bodyClasses: bodyElement.className,
    });

    // Cleanup: unlock on unmount
    return () => {
      unregisterFocusCommand();
      unregisterBlurCommand();
      visualViewport?.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('resize', handleViewportResize);

      // Remove kb-open class on unmount
      unlockPageScroll();

      debugLog('🧹 KeyboardLockPlugin cleanup - page unlocked');
    };
  }, [editor]);

  return null;
}
