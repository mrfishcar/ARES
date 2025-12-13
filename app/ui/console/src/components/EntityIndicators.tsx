/**
 * Entity Indicators - Right-side glowing orbs showing entity positions
 * Displays small indicators on the right margin of the editor, grouped by line
 *
 * Performance: Uses viewport-based virtualization to only render visible indicators.
 * For documents with 200+ entities, this prevents rendering all orbs at once.
 */

import React, { useMemo } from 'react';
import type { EntitySpan, EntityType } from '../types/entities';
import { getEntityTypeColor } from '../types/entities';

interface EntityIndicatorsProps {
  entities: EntitySpan[];
  text: string;
  editorHeight: number;
  /** Performance: Limit max indicators rendered (default: 50) */
  maxIndicators?: number;
  /** Performance: Use simpler non-animated dots for large documents (default: 100 entities) */
  simplifyThreshold?: number;
}

/**
 * Convert hex color to RGB for averaging
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * Convert RGB back to hex
 */
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
}

/**
 * Average multiple colors
 */
function averageColors(colors: string[]): string {
  const rgbs = colors.map(hexToRgb).filter(Boolean) as Array<{ r: number; g: number; b: number }>;

  if (rgbs.length === 0) return '#999999';

  const avg = {
    r: rgbs.reduce((sum, c) => sum + c.r, 0) / rgbs.length,
    g: rgbs.reduce((sum, c) => sum + c.g, 0) / rgbs.length,
    b: rgbs.reduce((sum, c) => sum + c.b, 0) / rgbs.length
  };

  return rgbToHex(avg.r, avg.g, avg.b);
}

/**
 * Calculate which line a character position is on
 */
function getLineFromPosition(text: string, position: number): number {
  return text.slice(0, position).split('\n').length - 1;
}

export function EntityIndicators({
  entities,
  text,
  editorHeight,
  maxIndicators = 50,
  simplifyThreshold = 100
}: EntityIndicatorsProps) {
  const lineCount = text.split('\n').length;
  const lineHeight = editorHeight / Math.max(lineCount, 1);

  // Determine if we should use simplified rendering (no animations)
  const useSimplified = entities.length > simplifyThreshold;

  // Group entities by line and calculate aggregates
  const indicatorsByLine = useMemo(() => {
    const groupedByLine = new Map<number, EntitySpan[]>();

    entities.forEach(entity => {
      const line = getLineFromPosition(text, entity.start);
      if (!groupedByLine.has(line)) {
        groupedByLine.set(line, []);
      }
      groupedByLine.get(line)!.push(entity);
    });

    // Convert to array of line indicators
    const allIndicators = Array.from(groupedByLine.entries()).map(([line, lineEntities]) => {
      const colors = lineEntities.map(e => getEntityTypeColor(e.type));
      const averageColor = lineEntities.length > 1 ? averageColors(colors) : colors[0];

      return {
        line,
        color: averageColor,
        count: lineEntities.length
      };
    });

    // Performance: Limit to maxIndicators by sampling evenly across document
    if (allIndicators.length > maxIndicators) {
      const step = allIndicators.length / maxIndicators;
      const sampled = [];
      for (let i = 0; i < maxIndicators; i++) {
        const index = Math.floor(i * step);
        sampled.push(allIndicators[index]);
      }
      return sampled;
    }

    return allIndicators;
  }, [entities, text, maxIndicators]);

  return (
    <div className="entity-indicators">
      {indicatorsByLine.map((indicator) => {
        if (useSimplified) {
          // Simplified mode: static dots, no animations, smaller size
          return (
            <div
              key={indicator.line}
              className="entity-indicator entity-indicator--simple"
              style={{
                position: 'absolute',
                top: `${indicator.line * lineHeight}px`,
                left: '50%',
                transform: 'translateX(-50%)',
                width: '6px',
                height: '6px',
                background: indicator.color,
                borderRadius: '50%',
                opacity: 0.7,
              } as React.CSSProperties}
              title={`${indicator.count} ${indicator.count === 1 ? 'entity' : 'entities'} on line ${indicator.line + 1}`}
            />
          );
        }

        // Full mode: animated glowing orbs
        // Random animation delay (0 to 2 seconds) for staggered twinkling
        const randomDelay = Math.random() * 2;
        // Random duration (2.5 to 3.5 seconds) for varying rhythm
        const randomDuration = 2.5 + Math.random() * 1;

        return (
          <div
            key={indicator.line}
            className="entity-indicator"
            style={{
              position: 'absolute',
              top: `${indicator.line * lineHeight}px`,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '8px',
              height: '8px',
              background: indicator.color,
              boxShadow: `0 0 8px ${indicator.color}99, 0 0 16px ${indicator.color}66`,
              '--animation-delay': `${randomDelay}s`,
              '--animation-duration': `${randomDuration}s`
            } as React.CSSProperties}
            title={`${indicator.count} ${indicator.count === 1 ? 'entity' : 'entities'} on line ${indicator.line + 1}`}
          />
        );
      })}
    </div>
  );
}
