/**
 * iOS Viewport Height Fix
 * 
 * IMPORTANT: We use 100dvh in CSS for root containers.
 * The editor scroll container handles its own scrolling naturally.
 * 
 * This is a minimal setup - let iOS handle most keyboard behavior natively.
 * The ScrollIntoViewPlugin handles cursor visibility within the editor.
 */

export function initializeIOSViewportFix() {
  // Only run in browser
  if (typeof window === 'undefined') return;

  // Note: We intentionally do NOT prevent focusin events or lock window scroll.
  // iOS Safari naturally handles the keyboard viewport with 100dvh.
  // The ScrollIntoViewPlugin handles smooth scrolling within the editor.
  
  console.log('[iOS Viewport] Initialized - using 100dvh, native scroll behavior');
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
