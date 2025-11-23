/**
 * Inline Tag Parser
 *
 * Parses inline tags in the format: #Entity Name:TYPE
 * Converts them to manual override entities and removes tag syntax from rendered text.
 *
 * Example:
 * Input:  "Harry visited #Hogwarts:PLACE and met #Dumbledore:PERSON"
 * Output: {
 *   entities: [
 *     { text: "Hogwarts", type: "PLACE", source: "manual" },
 *     { text: "Dumbledore", type: "PERSON", source: "manual" }
 *   ],
 *   renderedText: "Harry visited Hogwarts and met Dumbledore"
 * }
 */

import type { EntitySpan, EntityType } from '../types/entities';

export interface ManualEntity extends Omit<EntitySpan, 'confidence' | 'start' | 'end' | 'source'> {
  text: string;
  type: EntityType;
  source: 'manual';
  displayText?: string;
}

export interface ParseResult {
  entities: ManualEntity[];
  renderedText: string;
  tagMap: Map<string, { entity: ManualEntity; originalTag: string }>;
}

/**
 * Regex pattern for inline tags: matches ALL tag formats
 *
 * Patterns:
 * - #[Multi Word]:TYPE - bracketed form (group 1,2)
 * - #Entity:TYPE - unbracketed form (group 3,4)
 * - Entity:ALIAS_OF_Canonical:TYPE - alias form (group 5,6,7)
 * - Entity:REJECT_ENTITY - rejection form (group 8)
 *
 * The pattern structure must match CodeMirrorEditor.tsx decorator regex exactly
 */
const INLINE_TAG_REGEX = /#\[([^\]]+)\]:(\w+)|#(\w+):(\w+)|(\w+):ALIAS_OF_([^:]+):(\w+)|(\w+)(?:[.,!?;-]*):REJECT_ENTITY/g;

/**
 * Parse inline tags from raw text
 *
 * Returns:
 * - entities: Array of manual override entities extracted from tags
 * - renderedText: Original text with tag syntax removed (for pretty mode rendering)
 * - tagMap: Map of normalized entity text → entity for quick lookup
 */
export function parseInlineTags(rawText: string): ParseResult {
  const entities: ManualEntity[] = [];
  const tagMap = new Map<string, { entity: ManualEntity; originalTag: string }>();
  let renderedText = rawText;

  // Find all inline tags
  let match;
  const matches: Array<{ fullTag: string; entityName: string; type: string; isBracketed: boolean; index: number }> = [];

  // Reset regex state
  INLINE_TAG_REGEX.lastIndex = 0;

  while ((match = INLINE_TAG_REGEX.exec(rawText)) !== null) {
    const fullTag = match[0];
    let entityName: string | null = null;
    let type: string | null = null;
    let isBracketed = false;

    // Pattern 1: #[Multi Word]:TYPE (groups 1,2)
    if (match[1]) {
      entityName = match[1].trim();
      type = match[2].toUpperCase();
      isBracketed = true;
    }
    // Pattern 2: #Entity:TYPE (groups 3,4)
    else if (match[3]) {
      entityName = match[3].trim();
      type = match[4].toUpperCase();
      isBracketed = false;
    }
    // Pattern 3: Entity:ALIAS_OF_Canonical:TYPE (groups 5,6,7)
    else if (match[5]) {
      entityName = match[5].trim();
      type = match[7].toUpperCase();
      isBracketed = false;
    }
    // Pattern 4: Entity:REJECT_ENTITY (group 8)
    else if (match[8]) {
      entityName = match[8].trim();
      type = 'REJECT_ENTITY';
      isBracketed = false;
    }

    if (entityName && type) {
      matches.push({
        fullTag,
        entityName,
        type,
        isBracketed,
        index: match.index
      });
    }
  }

  // Process matches in reverse order (to maintain correct offsets)
  for (let i = matches.length - 1; i >= 0; i--) {
    const { fullTag, entityName, type, isBracketed, index } = matches[i];

    // Skip if type is invalid (very basic validation)
    if (!/^[A-Z_]+$/.test(type)) {
      console.warn(`[InlineTagParser] Invalid entity type "${type}" in tag "${fullTag}"`);
      continue;
    }

    // CRITICAL: Handle bracketed vs unbracketed syntax
    // Bracketed: #[...]:TYPE - keep exactly as user typed (including underscores)
    // Unbracketed: #WORD:TYPE - underscores are convenience typing, normalize to spaces
    let finalEntityName: string;
    if (isBracketed) {
      // Bracketed form: keep exactly as typed
      // User explicitly bracketed it, so respect their choice including underscores
      finalEntityName = entityName;
    } else {
      // Unbracketed form: normalize underscores to spaces
      // Underscores are just a typing convenience (no shift key needed)
      // The entity system should understand them as spaces
      finalEntityName = entityName.replace(/_/g, ' ');
    }

    // Create manual entity
    const entity: ManualEntity = {
      text: finalEntityName,
      type: type as EntityType,
      source: 'manual',
      displayText: finalEntityName,
      canonicalName: finalEntityName
    };

    entities.push(entity);

    // Track in map for quick lookup
    const mapKey = `${type}::${finalEntityName.toLowerCase()}`;
    tagMap.set(mapKey, { entity, originalTag: fullTag });

    // Remove tag syntax from rendered text
    const endIndex = index + fullTag.length;
    renderedText = renderedText.substring(0, index) + finalEntityName + renderedText.substring(endIndex);
  }

  return {
    entities,
    renderedText,
    tagMap
  };
}

/**
 * Format entity as inline tag
 *
 * Example: { text: "Hogwarts", type: "PLACE" } → "#Hogwarts:PLACE"
 */
export function formatInlineTag(entity: ManualEntity | { text: string; type: string }): string {
  if (entity.text.includes(' ')) {
    return `#[${entity.text}]:${entity.type}`;
  }
  return `#${entity.text}:${entity.type}`;
}

/**
 * Check if text contains inline tags
 */
export function hasInlineTags(text: string): boolean {
  return INLINE_TAG_REGEX.test(text);
}

/**
 * Remove all inline tags from text
 */
export function stripInlineTags(text: string): string {
  return text.replace(INLINE_TAG_REGEX, '$1');
}

/**
 * Validate entity type is valid
 */
export function isValidInlineTagType(type: string): boolean {
  return /^[A-Z_]+$/.test(type);
}
