/**
 * Category Unlock - Sprint R9
 * Celebration animation for unlocking new entity categories
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface CategoryUnlockProps {
  category: string;
  onComplete: () => void;
}

export function CategoryUnlock({ category, onComplete }: CategoryUnlockProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);

    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 300); // Wait for fade out
    }, 3000);

    return () => clearTimeout(timer);
  }, [category, onComplete]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        pointerEvents: 'none',
        animation: visible ? 'fadeIn 0.3s ease' : 'fadeOut 0.3s ease',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '32px 48px',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          textAlign: 'center',
          animation: 'scaleIn 0.5s ease',
        }}
      >
        <div
          style={{
            fontSize: '48px',
            marginBottom: '16px',
            animation: 'bounce 0.6s ease',
          }}
        >
          ✨
        </div>
        <div
          style={{
            fontSize: '24px',
            fontWeight: '700',
            color: 'white',
            marginBottom: '8px',
          }}
        >
          Category Unlocked!
        </div>
        <div
          style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#fbbf24',
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}
        >
          {category}
        </div>
      </div>

      {/* Particle effects */}
      {[...Array(12)].map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: '8px',
            height: '8px',
            background: '#fbbf24',
            borderRadius: '50%',
            top: '50%',
            left: '50%',
            animation: `particle${(i % 4) + 1} 1s ease-out`,
            animationDelay: `${i * 0.05}s`,
          }}
        />
      ))}

      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
          }

          @keyframes scaleIn {
            from { transform: scale(0.8); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }

          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-20px); }
          }

          @keyframes particle1 {
            from { transform: translate(0, 0); opacity: 1; }
            to { transform: translate(100px, -100px); opacity: 0; }
          }

          @keyframes particle2 {
            from { transform: translate(0, 0); opacity: 1; }
            to { transform: translate(-100px, -100px); opacity: 0; }
          }

          @keyframes particle3 {
            from { transform: translate(0, 0); opacity: 1; }
            to { transform: translate(100px, 100px); opacity: 0; }
          }

          @keyframes particle4 {
            from { transform: translate(0, 0); opacity: 1; }
            to { transform: translate(-100px, 100px); opacity: 0; }
          }
        `}
      </style>
    </div>
  );
}

/**
 * Hook to manage category unlock notifications
 */
export function useCategoryUnlocks() {
  const [unlocks, setUnlocks] = useState<string[]>([]);
  const previousCategoriesRef = useRef<Set<string>>(new Set());

  const checkForUnlocks = useCallback((currentCategories: string[]) => {
    const previous = previousCategoriesRef.current;
    const currentSet = new Set(currentCategories);
    const newUnlocks: string[] = [];

    for (const category of currentCategories) {
      if (!previous.has(category)) {
        newUnlocks.push(category);
      }
    }

    if (newUnlocks.length > 0) {
      setUnlocks(prev => [...prev, ...newUnlocks]);
    }

    previousCategoriesRef.current = currentSet;
  }, []);

  const dismissUnlock = useCallback(() => {
    setUnlocks(prev => prev.slice(1));
  }, []);

  return {
    currentUnlock: unlocks[0],
    checkForUnlocks,
    dismissUnlock,
  };
}
