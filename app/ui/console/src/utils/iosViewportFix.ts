/**
 * iOS Viewport Height Fix
 * 
 * Legacy iOS viewport helper.
 *
 * Keyboard handling now relies on the editor scroll container padding,
 * so this helper simply logs initialization for backwards compatibility.
 */

export function initializeIOSViewportFix() {
  // Only run in browser
  if (typeof window === 'undefined') return;

  console.log('[iOS Viewport] Initialized - keyboard padding handled by editor container');
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
