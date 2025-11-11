/**
 * Entity types and interfaces for frontend
 * Copied from app/editor/entityHighlighter.ts to avoid importing backend code
 */

export type EntityType = 'PERSON' | 'PLACE' | 'ORG' | 'EVENT' | 'CONCEPT' | 'OBJECT';

export interface EntitySpan {
  start: number;
  end: number;
  text: string;
  displayText?: string;
  canonicalName?: string;
  type: EntityType;
  confidence: number;
  source: 'tag' | 'natural';
}

/**
 * Get color for entity type (for highlighting)
 */
export function getEntityTypeColor(type: EntityType): string {
  const colors: Record<EntityType, string> = {
    PERSON: '#3b82f6',    // blue
    PLACE: '#10b981',     // green
    ORG: '#f59e0b',       // amber
    EVENT: '#ef4444',     // red
    CONCEPT: '#8b5cf6',   // purple
    OBJECT: '#ec4899',    // pink
  };
  return colors[type] || '#6b7280';
}

/**
 * Simple tag-based entity extraction for frontend
 * Format: [[EntityType: Name]]
 */
export function highlightEntities(text: string): EntitySpan[] {
  const spans: EntitySpan[] = [];
  const tagRegex = /\[\[(\w+):\s*([^\]]+)\]\]/g;

  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    const [fullMatch, typeStr, name] = match;
    const type = typeStr.toUpperCase() as EntityType;

    // Validate entity type
    if (!['PERSON', 'PLACE', 'ORG', 'EVENT', 'CONCEPT', 'OBJECT'].includes(type)) {
      continue;
    }

    spans.push({
      start: match.index,
      end: match.index + fullMatch.length,
      text: fullMatch,
      displayText: name.trim(),
      type,
      confidence: 1.0,
      source: 'tag'
    });
  }

  return spans;
}
