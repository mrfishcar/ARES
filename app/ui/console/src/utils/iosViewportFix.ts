/**
 * iOS Viewport Height Fix
 * 
 * SIMPLIFIED: Trust the browser. Use 100dvh in CSS.
 * Let iOS Safari handle keyboard viewport changes naturally.
 * The editor scroll container handles cursor visibility via native scrolling.
 */

export function initializeIOSViewportFix() {
  // No-op: Trust browser native behavior with 100dvh
  console.log('[iOS Viewport] Trusting browser - no intervention needed');
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
