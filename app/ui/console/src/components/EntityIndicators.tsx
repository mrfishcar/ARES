/**
 * Entity Indicators - Right-side glowing orbs showing entity positions
 * Displays small indicators on the right margin of the editor, grouped by line
 */

import React, { useMemo } from 'react';
import type { EntitySpan, EntityType } from '../types/entities';
import { getEntityTypeColor } from '../types/entities';

interface EntityIndicatorsProps {
  entities: EntitySpan[];
  text: string;
  editorHeight: number;
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

export function EntityIndicators({ entities, text, editorHeight }: EntityIndicatorsProps) {
  const lineCount = text.split('\n').length;
  const lineHeight = editorHeight / Math.max(lineCount, 1);

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
    return Array.from(groupedByLine.entries()).map(([line, lineEntities]) => {
      const colors = lineEntities.map(e => getEntityTypeColor(e.type));
      const averageColor = lineEntities.length > 1 ? averageColors(colors) : colors[0];

      return {
        line,
        color: averageColor
      };
    });
  }, [entities, text]);

  return (
    <div className="entity-indicators">
      {indicatorsByLine.map((indicator) => (
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
            boxShadow: `0 0 8px ${indicator.color}99, 0 0 16px ${indicator.color}66`
          }}
          title={`Entity on line ${indicator.line + 1}`}
        />
      ))}
    </div>
  );
}
