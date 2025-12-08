/**
 * useScrollVisibility - Hook for showing/hiding UI based on scroll position
 *
 * Useful for:
 * - Jump-to-top buttons
 * - Floating action buttons that auto-hide
 * - Sticky headers
 */

import { useState, useEffect, useCallback } from 'react';

interface UseScrollVisibilityOptions {
  threshold?: number;
  element?: HTMLElement | null;
}

export function useScrollVisibility({
  threshold = 100,
  element,
}: UseScrollVisibilityOptions = {}) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  const handleScroll = useCallback(() => {
    const target = element || window;
    const currentScrollY = element
      ? element.scrollTop
      : window.scrollY;

    setScrollY(currentScrollY);
    setIsScrolled(currentScrollY > threshold);
  }, [element, threshold]);

  useEffect(() => {
    const target = element || window;

    handleScroll(); // Initialize

    target.addEventListener('scroll', handleScroll as EventListener);
    return () => {
      target.removeEventListener('scroll', handleScroll as EventListener);
    };
  }, [element, handleScroll]);

  return {
    isScrolled,
    scrollY,
    isVisible: isScrolled, // Alias for semantic clarity
  };
}
