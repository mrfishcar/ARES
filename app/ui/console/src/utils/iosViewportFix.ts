/**
 * iOS Viewport Height Fix
 * 
 * Dynamically updates --app-viewport-height CSS variable to handle iOS Safari's
 * collapsing/expanding address bar and keyboard behavior.
 * 
 * This prevents layout jumps and ensures proper editor behavior on iPad.
 */

export function initializeIOSViewportFix() {
  // Only run in browser
  if (typeof window === 'undefined') return;

  const setViewportHeight = () => {
    // Try visualViewport first (most accurate for iOS with keyboard)
    if ('visualViewport' in window && window.visualViewport) {
      const vh = window.visualViewport.height;
      document.documentElement.style.setProperty('--app-viewport-height', `${vh}px`);
    } else {
      // Fallback to window.innerHeight
      const vh = window.innerHeight;
      document.documentElement.style.setProperty('--app-viewport-height', `${vh}px`);
    }
  };

  // Set initial value
  setViewportHeight();

  // Update on resize (includes keyboard open/close on iOS)
  window.addEventListener('resize', setViewportHeight);

  // Update on visualViewport changes (more reliable for iOS keyboard)
  if ('visualViewport' in window && window.visualViewport) {
    window.visualViewport.addEventListener('resize', setViewportHeight);
    window.visualViewport.addEventListener('scroll', setViewportHeight);
  }

  // Update on orientation change
  window.addEventListener('orientationchange', () => {
    // Delay to let the orientation change complete
    setTimeout(setViewportHeight, 100);
  });

  console.log('[iOS Viewport] Initialized viewport height fix');
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
