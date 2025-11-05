/**
 * Progress Bar - Sprint R9
 * Displays user level, XP, and unlocked categories
 */

import { useState } from 'react';
import { useProgress } from '../hooks/useProgress';

interface ProgressBarProps {
  project: string;
}

/**
 * Calculate XP required for next level
 * Based on: level = floor(sqrt(entities/5 + relations/10))
 * Inverted: XP needed = (level + 1)^2 * 5 (assuming all entities)
 */
function getXPForLevel(level: number): number {
  return Math.pow(level + 1, 2) * 50; // Scaled for better progression feel
}

export function ProgressBar({ project }: ProgressBarProps) {
  const { progress, loading } = useProgress(project);
  const [expanded, setExpanded] = useState(false);

  if (loading || !progress) return null;

  const currentXP = progress.experiencePoints;
  const currentLevel = progress.level;
  const nextLevelXP = getXPForLevel(currentLevel);
  const previousLevelXP = getXPForLevel(currentLevel - 1);
  const xpInCurrentLevel = currentXP - previousLevelXP;
  const xpNeededForLevel = nextLevelXP - previousLevelXP;
  const progressPercent = Math.min(100, (xpInCurrentLevel / xpNeededForLevel) * 100);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: expanded ? '20px' : '10px',
        right: '20px',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: expanded ? '16px' : '12px',
        minWidth: expanded ? '300px' : '200px',
        transition: 'all 0.3s ease',
        zIndex: 1000,
        cursor: 'pointer',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Compact View */}
      {!expanded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: '700',
              fontSize: '14px',
            }}
          >
            {currentLevel}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
              Level {currentLevel}
            </div>
            <div style={{ background: '#e5e7eb', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
              <div
                style={{
                  background: 'linear-gradient(90deg, #10b981 0%, #3b82f6 100%)',
                  height: '100%',
                  width: `${progressPercent}%`,
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Expanded View */}
      {expanded && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: '700',
                fontSize: '18px',
              }}
            >
              {currentLevel}
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>Level {currentLevel}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {xpInCurrentLevel.toLocaleString()} / {xpNeededForLevel.toLocaleString()} XP
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ background: '#e5e7eb', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  background: 'linear-gradient(90deg, #10b981 0%, #3b82f6 100%)',
                  height: '100%',
                  width: `${progressPercent}%`,
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Your World</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
              <div>
                <span style={{ color: '#6b7280' }}>Entities:</span>{' '}
                <span style={{ fontWeight: '600' }}>{progress.totalEntities}</span>
              </div>
              <div>
                <span style={{ color: '#6b7280' }}>Relations:</span>{' '}
                <span style={{ fontWeight: '600' }}>{progress.totalRelations}</span>
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
              Unlocked Categories ({progress.unlockedCategories.length}/10)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {progress.unlockedCategories.map((category) => (
                <div
                  key={category}
                  style={{
                    padding: '4px 8px',
                    background: '#10b981',
                    color: 'white',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '500',
                  }}
                >
                  {category}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
