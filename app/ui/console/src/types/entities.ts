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
 * Entity extraction using backend API
 * Calls the sophisticated backend entityHighlighter engine
 */
export async function highlightEntities(
  text: string,
  config: HighlightConfig = {}
): Promise<EntitySpan[]> {
  console.log('[EntityHighlighter] Analyzing text:', text);

  try {
    // Call /extract-entities endpoint (same as Extraction Lab)
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    const response = await fetch(`${apiUrl}/extract-entities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Extraction failed');
    }

    // Transform ARES engine output to EntitySpan format
    const spans: EntitySpan[] = data.entities.flatMap((entity: any) => {
      return entity.spans.map((span: any) => ({
        start: span.start,
        end: span.end,
        text: entity.text,
        displayText: entity.text,
        canonicalName: entity.canonical || entity.text,
        type: entity.type as EntityType,
        confidence: entity.confidence || 1,
        source: 'natural' as const,
      }));
    });

    console.log('[EntityHighlighter] Detection complete. Found', spans.length, 'entities:', spans);

    return spans;
  } catch (error) {
    console.error('[EntityHighlighter] API call failed:', error);

    // Fallback to local tag-only detection if API fails
    return detectTagsOnly(text);
  }
}

/**
 * Fallback: detect only explicit tags (no backend required)
 */
function detectTagsOnly(text: string): EntitySpan[] {
  const spans: EntitySpan[] = [];
  const tagRegex = /\[\[(\w+):\s*([^\]]+)\]\]/g;

  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    const [fullMatch, typeStr, name] = match;
    const type = typeStr.toUpperCase() as EntityType;

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
