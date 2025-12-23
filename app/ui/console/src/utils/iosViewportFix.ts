/**
 * iOS Viewport Height Fix
 * 
 * IMPORTANT: We use 100dvh in CSS instead of dynamically updating viewport height.
 * Dynamically updating --app-viewport-height causes layout shifts when typing.
 * 
 * This module only handles:
 * - Preventing auto-scroll-to-focus behavior that causes UI shifts
 * - Orientation change handling (if needed)
 */

export function initializeIOSViewportFix() {
  // Only run in browser
  if (typeof window === 'undefined') return;

  // Prevent iOS from auto-scrolling to focused elements (causes UI shift)
  // This is the main fix for the "UI shifting up when focusing text" issue
  document.addEventListener('focusin', (e) => {
    const target = e.target as HTMLElement;
    
    // Only prevent on contentEditable elements or textareas in the editor
    if (target.contentEditable === 'true' || 
        target.classList.contains('rich-content') ||
        target.closest('.rich-editor-surface') ||
        target.closest('.cm-editor')) {
      // Prevent the default scroll-into-view behavior
      // The editor will handle its own scrolling
      e.preventDefault();
    }
  }, { capture: true });

  console.log('[iOS Viewport] Initialized - using 100dvh, disabled auto-scroll-to-focus');
}

/**
 * Get current safe viewport height (accounts for iOS keyboard)
 */
export function getSafeViewportHeight(): number {
  if (typeof window === 'undefined') return 0;

  if ('visualViewport' in window && window.visualViewport) {
    return window.visualViewport.height;
  }

  return window.innerHeight;
}

/**
 * Check if keyboard is likely open on iOS
 */
export function isIOSKeyboardOpen(): boolean {
  if (typeof window === 'undefined') return false;

  if ('visualViewport' in window && window.visualViewport) {
    // If visualViewport is significantly smaller than window, keyboard is likely open
    const ratio = window.visualViewport.height / window.innerHeight;
    return ratio < 0.75; // Keyboard typically takes >25% of screen
  }

  return false;
}
