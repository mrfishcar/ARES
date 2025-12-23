/**
 * iOS Viewport Height Fix
 * 
 * Dynamically updates --app-viewport-height CSS variable to handle iOS Safari's
 * collapsing/expanding address bar behavior.
 * 
 * IMPORTANT: We do NOT update viewport height when the keyboard opens/closes
 * because that causes jarring layout shifts. Instead, we only update on:
 * - Initial load
 * - Orientation changes
 * - Window resize when keyboard is NOT open
 * 
 * This prevents layout jumps and ensures proper editor behavior on iPad.
 */

// Track the initial viewport height (before keyboard)
let initialViewportHeight: number | null = null;

export function initializeIOSViewportFix() {
  // Only run in browser
  if (typeof window === 'undefined') return;

  const getFullViewportHeight = () => {
    // Use window.innerHeight as the "full" height (without keyboard)
    return window.innerHeight;
  };

  const isKeyboardLikelyOpen = () => {
    if ('visualViewport' in window && window.visualViewport) {
      // If visualViewport is significantly smaller than window, keyboard is likely open
      const ratio = window.visualViewport.height / window.innerHeight;
      return ratio < 0.85; // Keyboard typically takes >15% of screen
    }
    return false;
  };

  const setViewportHeight = (forceUpdate = false) => {
    // Don't update viewport height when keyboard is open (causes layout shift)
    // Only update when keyboard is closed or on forced updates (init, orientation)
    if (!forceUpdate && isKeyboardLikelyOpen()) {
      return;
    }

    const vh = getFullViewportHeight();
    
    // Store initial height for reference
    if (initialViewportHeight === null) {
      initialViewportHeight = vh;
    }

    document.documentElement.style.setProperty('--app-viewport-height', `${vh}px`);
  };

  // Set initial value
  setViewportHeight(true);

  // Update on window resize only when keyboard is closed
  window.addEventListener('resize', () => setViewportHeight(false));

  // Update on orientation change (force update after delay)
  window.addEventListener('orientationchange', () => {
    // Delay to let the orientation change complete
    setTimeout(() => setViewportHeight(true), 150);
  });

  // Listen to visualViewport scroll to handle address bar show/hide
  // but NOT resize (which happens when keyboard opens)
  if ('visualViewport' in window && window.visualViewport) {
    // Only update on scroll (address bar changes), not resize (keyboard)
    window.visualViewport.addEventListener('scroll', () => {
      // Only update if keyboard is not open
      if (!isKeyboardLikelyOpen()) {
        setViewportHeight(false);
      }
    });
  }

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
