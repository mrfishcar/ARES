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
 * Entity extraction with pattern-based NLP detection
 * Detects both explicit tags [[Type: Name]] and natural language entities
 */
export async function highlightEntities(
  text: string,
  config: HighlightConfig = {}
): Promise<EntitySpan[]> {
  console.log('[EntityHighlighter] Analyzing text:', text);

  const minConfidence = config.minConfidence ?? 0.55;
  const enableNaturalDetection = config.enableNaturalDetection ?? true;

  const spans: EntitySpan[] = [];

  // Step 1: Detect tagged entities [[TYPE: Name]]
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

  // Step 2: Detect natural language entities using patterns
  if (enableNaturalDetection) {
    const naturalSpans = detectNaturalEntities(text, minConfidence);
    spans.push(...naturalSpans);
  }

  // Step 3: Remove overlapping spans (keep highest confidence)
  const deduplicated = removeOverlaps(spans);

  console.log('[EntityHighlighter] Detection complete. Found', deduplicated.length, 'entities:', deduplicated);

  return deduplicated;
}

/**
 * Word pattern for matching capitalized names
 */
const WORD = '(?:[A-ZÀ-ÖØ-ÞА-ЯЁ][a-zà-öø-ÿа-яё]*(?:\'[a-zà-öø-ÿа-яё]+)?)';

/**
 * Common words to filter out
 */
const PRONOUNS = new Set([
  'he', 'she', 'it', 'they', 'we', 'i', 'you',
  'him', 'her', 'them', 'us', 'me',
  'his', 'hers', 'its', 'their', 'our', 'my', 'your',
  'himself', 'herself', 'itself', 'themselves', 'ourselves', 'myself', 'yourself',
  'this', 'that', 'these', 'those',
]);

const TIME_WORDS = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]);

/**
 * Detect natural language entities using pattern matching
 */
function detectNaturalEntities(text: string, minConfidence: number): EntitySpan[] {
  const spans: EntitySpan[] = [];
  const seenSpans = new Set<string>();

  // Pattern 1: Two-word capitalized names (Harry Potter, Dominique Gilford)
  const twoWordPattern = new RegExp(`\\b(${WORD}\\s+${WORD})(?!\\s+(?:Street|Drive|Road|Avenue))\\b`, 'g');
  let match;

  while ((match = twoWordPattern.exec(text)) !== null) {
    const captured = match[1];
    const start = match.index;
    const end = start + captured.length;
    const key = `${start}-${end}`;

    if (seenSpans.has(key)) continue;

    const lower = captured.toLowerCase();
    if (PRONOUNS.has(lower) || TIME_WORDS.has(lower)) continue;

    // Skip if at sentence start and looks like a title (starts with "The")
    if (start < 10 && text.substring(0, start).trim().startsWith('The')) continue;

    spans.push({
      start,
      end,
      text: captured,
      type: 'PERSON',
      confidence: 0.8,
      source: 'natural'
    });
    seenSpans.add(key);
  }

  // Pattern 2: Names with honorifics (Mr. Smith, King Arthur)
  const honorificPattern = new RegExp(`(?:Mr\\.|Mrs\\.|Ms\\.|Dr\\.|Prof\\.|Lord|Lady|King|Queen|Prince|Princess)\\s+(${WORD}(?:\\s+${WORD})?)`, 'g');
  while ((match = honorificPattern.exec(text)) !== null) {
    const captured = match[1];
    const start = match.index;
    const end = start + match[0].length;
    const key = `${start}-${end}`;

    if (seenSpans.has(key)) continue;

    spans.push({
      start,
      end,
      text: match[0],
      displayText: captured,
      type: 'PERSON',
      confidence: 0.9,
      source: 'natural'
    });
    seenSpans.add(key);
  }

  // Pattern 3: Dialogue patterns ("...", said NAME)
  const dialoguePattern = new RegExp(`"[^"]+",?\\s+(${WORD}(?:\\s+${WORD}){0,2})\\s+(?:said|asked|replied|answered|whispered|shouted|thought|felt)`, 'gi');
  while ((match = dialoguePattern.exec(text)) !== null) {
    const captured = match[1];
    const matchStart = match.index + match[0].indexOf(captured);
    const start = matchStart;
    const end = start + captured.length;
    const key = `${start}-${end}`;

    if (seenSpans.has(key)) continue;

    const lower = captured.toLowerCase();
    if (PRONOUNS.has(lower)) continue;

    spans.push({
      start,
      end,
      text: captured,
      type: 'PERSON',
      confidence: 0.85,
      source: 'natural'
    });
    seenSpans.add(key);
  }

  return spans.filter(s => s.confidence >= minConfidence);
}

/**
 * Remove overlapping spans (keep highest confidence)
 */
function removeOverlaps(spans: EntitySpan[]): EntitySpan[] {
  if (spans.length === 0) return [];

  // Sort by start position, then by confidence (descending)
  const sorted = [...spans].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.confidence - a.confidence;
  });

  const result: EntitySpan[] = [];

  for (const span of sorted) {
    // Check if this span overlaps with any existing result
    let hasOverlap = false;
    let replacementIndex = -1;

    for (let i = 0; i < result.length; i++) {
      const existing = result[i];
      if (span.start < existing.end && span.end > existing.start) {
        hasOverlap = true;
        if (span.confidence > existing.confidence) {
          replacementIndex = i;
        }
        break;
      }
    }

    if (!hasOverlap) {
      result.push(span);
    } else if (replacementIndex >= 0) {
      result[replacementIndex] = span;
    }
  }

  return result.sort((a, b) => a.start - b.start);
}

/**
 * Clear highlight cache (no-op in frontend-only version)
 */
export function clearHighlightCache(): void {
  // No cache in frontend-only version
}
