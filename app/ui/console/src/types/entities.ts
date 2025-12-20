/**
 * Entity types and interfaces for frontend
 * Copied from app/editor/entityHighlighter.ts to avoid importing backend code
 */

export type EntityType =
  // Core types (6)
  | 'PERSON'
  | 'PLACE'
  | 'ORG'
  | 'EVENT'
  | 'CONCEPT'
  | 'OBJECT'
  // Fiction types (10)
  | 'RACE'
  | 'CREATURE'
  | 'ARTIFACT'
  | 'TECHNOLOGY'
  | 'MAGIC'
  | 'LANGUAGE'
  | 'CURRENCY'
  | 'MATERIAL'
  | 'DRUG'
  | 'DEITY'
  // Ability types (5)
  | 'ABILITY'
  | 'SKILL'
  | 'POWER'
  | 'TECHNIQUE'
  | 'SPELL'
  // Schema types (6 additional)
  | 'DATE'
  | 'TIME'
  | 'WORK'
  | 'ITEM'
  | 'MISC'
  | 'SPECIES'
  | 'HOUSE'
  | 'TRIBE'
  | 'TITLE';

export interface EntitySpan {
  start: number;
  end: number;
  text: string;
  displayText?: string;
  canonicalName?: string;
  entityId?: string;
  mentionId?: string;
  mentionType?: string;
  type: EntityType;
  confidence: number;
  source: string;
  phase?: string;
  // Review sidebar fields
  notes?: string | null;
  rejected?: boolean;
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
 * Document-level entity metadata
 * Stores user actions that override auto-detection
 */
export interface DocumentEntityMetadata {
  rejectedMentions: string[];  // Words rejected in THIS document only
  typeOverrides: Record<string, EntityType>;  // User changed type
  aliasReferences: Record<string, string>;  // "Cory" → "CORY_GILFORD:PERSON"
}

/**
 * Rejection tracking across project
 */
export interface RejectionTracking {
  word: string;
  rejectionCount: number;
  rejectedInDocuments: string[];
  lastRejected: Date;
}

/**
 * Blacklist entry for entity creation
 */
export interface BlacklistEntry {
  word: string;
  reason: 'auto-rejected-threshold' | 'manual-blocked';
  rejectionCount: number;
  addedDate: Date;
  status: 'active' | 'removed';
}

/**
 * Project-level settings and blacklist
 */
export interface ProjectSettings {
  projectId: string;
  rejectionTracking: RejectionTracking[];
  entityBlacklist: BlacklistEntry[];
}

/**
 * Enhanced extraction request body
 */
export interface ExtractEntityRequest {
  text: string;
  projectId: string;
  manualTags?: EntitySpan[];
  typeOverrides?: Record<string, EntityType>;
  aliasReferences?: Record<string, string>;
  rejectedMentions?: string[];
}

/**
 * Type guard: Validate if a value is a valid EntityType
 */
export function isValidEntityType(value: unknown): value is EntityType {
  const validTypes = new Set<EntityType>([
    'PERSON', 'PLACE', 'ORG', 'EVENT', 'CONCEPT', 'OBJECT',
    'RACE', 'CREATURE', 'ARTIFACT', 'TECHNOLOGY', 'MAGIC', 'LANGUAGE',
    'CURRENCY', 'MATERIAL', 'DRUG', 'DEITY', 'ABILITY', 'SKILL',
    'POWER', 'TECHNIQUE', 'SPELL', 'DATE', 'TIME', 'WORK', 'ITEM',
    'MISC', 'SPECIES', 'HOUSE', 'TRIBE', 'TITLE'
  ]);
  return typeof value === 'string' && validTypes.has(value as EntityType);
}

/**
 * Get color for entity type (for highlighting)
 */
export function getEntityTypeColor(type: EntityType): string {
  const colors: Record<EntityType, string> = {
    // Core types (6) - keep existing colors
    PERSON: '#3b82f6', // blue
    PLACE: '#10b981', // green
    ORG: '#8b5cf6', // purple
    EVENT: '#f59e0b', // amber
    CONCEPT: '#6366f1', // indigo
    OBJECT: '#ec4899', // pink
    // Fiction types (10) - vibrant colors
    RACE: '#a78bfa', // violet
    CREATURE: '#f97316', // orange
    ARTIFACT: '#eab308', // yellow
    TECHNOLOGY: '#06b6d4', // cyan
    MAGIC: '#d946ef', // magenta
    LANGUAGE: '#14b8a6', // teal
    CURRENCY: '#84cc16', // lime
    MATERIAL: '#64748b', // slate
    DRUG: '#f43f5e', // rose
    DEITY: '#fbbf24', // gold
    // Ability types (5) - ability-focused colors
    ABILITY: '#a855f7', // purple-light (distinct from ORG)
    SKILL: '#0ea5e9', // blue-light (distinct from PERSON)
    POWER: '#f472b6', // pink-light (distinct from OBJECT)
    TECHNIQUE: '#facc15', // amber-light (distinct from EVENT)
    SPELL: '#4ade80', // green-light (distinct from PLACE)
    // Schema types (9) - remaining colors
    DATE: '#7c3aed', // violet-dark
    TIME: '#06b6d4', // cyan
    WORK: '#c084fc', // purple-light
    ITEM: '#fb923c', // orange-light
    MISC: '#6b7280', // gray
    SPECIES: '#059669', // emerald
    HOUSE: '#d97706', // amber-dark
    TRIBE: '#7c2d12', // orange-dark
    TITLE: '#4f46e5', // indigo-dark
  };
  return colors[type] || '#6b7280'; // fallback to gray
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

  // Don't call API for empty text
  if (!text || text.trim().length === 0) {
    return [];
  }

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

    const spans = mapExtractionResponseToSpans(data, text);

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
 * Uses validation function to accept all 27 entity types
 */
function detectTagsOnly(text: string): EntitySpan[] {
  const spans: EntitySpan[] = [];
  const tagRegex = /\[\[(\w+):\s*([^\]]+)\]\]/g;

  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    const [fullMatch, typeStr, name] = match;
    const type = typeStr.toUpperCase();

    // Use validation function to accept all valid types
    if (!isValidEntityType(type)) {
      console.warn(`[EntityHighlighter] Invalid type in fallback detection: ${type}, skipping tag`);
      continue;
    }

    spans.push({
      start: match.index,
      end: match.index + fullMatch.length,
      text: fullMatch,
      displayText: name.trim(),
      type: type as EntityType,
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

/**
 * Map extraction API response to EntitySpan records used by the editor/highlighter.
 * Supports the new { entities, spans, booknlp } envelope while remaining
 * backward compatible with the legacy { entities: [{ spans: [] }] } shape.
 */
export function mapExtractionResponseToSpans(
  data: any,
  fullText?: string
): EntitySpan[] {
  if (!data) return [];

  const entityLookup = new Map<string, any>();
  if (Array.isArray(data.entities)) {
    for (const entity of data.entities) {
      if (entity?.id) {
        entityLookup.set(entity.id, entity);
      }
    }
  }

  const pushSpan = (span: any, entity?: any, sourceOverride?: string): EntitySpan | null => {
    const type = (entity?.type || span?.type) as EntityType | undefined;
    if (!type || !isValidEntityType(type)) {
      return null;
    }

    const text =
      span?.text ??
      (fullText ? fullText.slice(span.start, span.end) : undefined) ??
      entity?.text ??
      entity?.canonical ??
      '';

    return {
      start: span.start,
      end: span.end,
      text,
      displayText: text,
      canonicalName: entity?.canonical || entity?.text,
      entityId: entity?.id || span.entityId || span.entity_id,
      mentionId: span.mentionId || span.mention_id,
      mentionType: span.mentionType || span.mention_type,
      type,
      confidence: entity?.confidence || span?.confidence || 1,
      source: sourceOverride || span.source || entity?.source || 'natural',
      phase: span.phase || entity?.phase || sourceOverride || span.source || entity?.source,
    };
  };

  const rawSpans: any[] = Array.isArray(data.spans) ? data.spans : [];
  const spans: EntitySpan[] = [];

  if (rawSpans.length > 0) {
    for (const span of rawSpans) {
      const entity = entityLookup.get(span.entityId || span.entity_id);
      const mapped = pushSpan(span, entity);
      if (mapped) spans.push(mapped);
    }
  } else if (Array.isArray(data.entities)) {
    // Legacy shape: spans nested under each entity
    for (const entity of data.entities) {
      if (!Array.isArray(entity.spans)) continue;
      for (const span of entity.spans) {
        const mapped = pushSpan(span, entity);
        if (mapped) spans.push(mapped);
      }
    }
  }

  return spans;
}
