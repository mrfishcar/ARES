/**
 * FloatingActionButton - Reusable floating button for summoning overlays
 *
 * Used for:
 * - Entity overlay trigger
 * - Future: Jump-to-top, other tools
 */

import { useState, useEffect } from 'react';

interface FloatingActionButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  visible?: boolean;
  position?: 'bottom-right' | 'bottom-left';
  autoHideOnScroll?: boolean;
}

export function FloatingActionButton({
  icon,
  label,
  onClick,
  visible = true,
  position = 'bottom-right',
  autoHideOnScroll = false,
}: FloatingActionButtonProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [opacity, setOpacity] = useState(0.5);

  // Track scroll state for future auto-hide feature
  useEffect(() => {
    if (!autoHideOnScroll) return;

    const handleScroll = () => {
      const scrolled = window.scrollY > 100;
      setIsScrolled(scrolled);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [autoHideOnScroll]);

  // Show full opacity on hover or when scrolled
  const handleMouseEnter = () => setOpacity(1);
  const handleMouseLeave = () => setOpacity(0.5);

  if (!visible) return null;

  const positionStyles = position === 'bottom-right'
    ? { bottom: 24, right: 24 }
    : { bottom: 24, left: 24 };

  return (
    <div
      className="floating-button-container"
      style={{
        position: 'fixed',
        ...positionStyles,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      <button
        className="floating-button liquid-glass"
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        aria-label={label}
        title={label}
        style={{
          opacity: isScrolled || opacity === 1 ? 1 : opacity,
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          pointerEvents: 'auto',
        }}
      >
        {icon}
      </button>
    </div>
  );
}
