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

export interface HighlightConfig {
  maxHighlights?: number;
  minConfidence?: number;
  enableNaturalDetection?: boolean;
  project?: string;
  enableAliasPass?: boolean;
  enableLLM?: boolean;
  llmMode?: 'hybrid' | 'llm-only' | 'algorithm-only';
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
 * Note: This is a simplified frontend-only version. For full NLP detection, use the backend parser.
 */
export async function highlightEntities(
  text: string,
  _config: HighlightConfig = {}
): Promise<EntitySpan[]> {
  // Frontend-only implementation: only detect tagged entities
  // Full NLP detection happens on backend
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

/**
 * Clear highlight cache (no-op in frontend-only version)
 */
export function clearHighlightCache(): void {
  // No cache in frontend-only version
}
