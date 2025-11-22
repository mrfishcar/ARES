/**
 * Pass 1: Document-Wide Entity Census
 *
 * Problem: Current sentence-by-sentence processing loses document context.
 * "Harry" mentioned 50 times but only detected once with full name.
 *
 * Solution: Process entire document, build entity registry with:
 * - Canonical names (longest/most complete form)
 * - Aliases (all variations)
 * - All mention positions
 * - Type classification
 *
 * Cost: FREE (spaCy only)
 * Speed: ~1 second for 2,000 words
 */

import type { Entity, EntityType } from '../schema';
import { parseWithService } from './entities';
import { v4 as uuid } from 'uuid';
import {
  extractEntityContext,
  areContextsConflicting,
  generateDisambiguatedName,
  summarizeContext,
  type EntityContext
} from './entity-disambiguation';

export interface EntityMention {
  text: string;
  type: EntityType;
  start: number;
  end: number;
  sentence_idx: number;
}

export interface CanonicalEntity {
  id: string;
  canonical_name: string;
  aliases: string[];
  type: EntityType;
  mention_count: number;
  mentions: EntityMention[];
  first_mention_position: number;
  context?: EntityContext;  // NEW: Disambiguation context
}

/**
 * Normalize entity name for grouping
 * "Harry Potter" → "harry potter"
 * "HARRY" → "harry"
 */
function normalizeName(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Map spaCy entity type to ARES entity type
 */
function mapSpacyToEntityType(spacyType: string): EntityType {
  const mapping: Record<string, EntityType> = {
    'PERSON': 'PERSON',
    'PER': 'PERSON',
    'NORP': 'PERSON',  // Nationalities or religious/political groups
    'ORG': 'ORG',
    'GPE': 'PLACE',    // Geopolitical entity (countries, cities, states)
    'LOC': 'PLACE',
    'FAC': 'PLACE',    // Facilities (buildings, airports, highways)
    'DATE': 'DATE',
    'TIME': 'TIME',
    'EVENT': 'EVENT',
    'WORK_OF_ART': 'OBJECT',
    'PRODUCT': 'OBJECT',
    'LANGUAGE': 'MISC',
    'LAW': 'MISC',
    'QUANTITY': 'MISC',
    'CARDINAL': 'MISC',
    'ORDINAL': 'MISC',
    'MONEY': 'MISC',
    'PERCENT': 'MISC'
  };

  return mapping[spacyType] || 'MISC';
}

/**
 * Find most common element in array
 */
function mode<T>(arr: T[]): T {
  const counts = new Map<T, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  let maxCount = 0;
  let modeValue = arr[0];
  for (const [value, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      modeValue = value;
    }
  }

  return modeValue;
}

/**
 * Group array by key function
 */
function groupBy<T, K>(arr: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of arr) {
    const key = keyFn(item);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }
  return groups;
}

/**
 * Phase 1a: Collect ALL entity mentions from document
 */
async function collectAllMentions(fullText: string): Promise<EntityMention[]> {
  const mentions: EntityMention[] = [];

  // Parse entire document with spaCy
  const parsed = await parseWithService(fullText);

  for (const sentence of parsed.sentences) {
    // Extract multi-token entities (consecutive tokens with same label)
    let currentEntity: {
      tokens: string[];
      type: string;
      starts: number[];
      ends: number[];
    } | null = null;

    for (const token of sentence.tokens) {
      if (token.ent && token.ent !== '') {
        // Token is part of an entity
        if (currentEntity && token.ent === currentEntity.type) {
          // Continue existing entity
          currentEntity.tokens.push(token.text);
          currentEntity.starts.push(token.start || 0);
          currentEntity.ends.push(token.end || 0);
        } else {
          // Save previous entity if exists
          if (currentEntity) {
            mentions.push({
              text: currentEntity.tokens.join(' '),
              type: mapSpacyToEntityType(currentEntity.type),
              start: Math.min(...currentEntity.starts),
              end: Math.max(...currentEntity.ends),
              sentence_idx: sentence.sentence_index || 0
            });
          }

          // Start new entity
          currentEntity = {
            tokens: [token.text],
            type: token.ent,
            starts: [token.start || 0],
            ends: [token.end || 0]
          };
        }
      } else {
        // Token is not an entity, save previous if exists
        if (currentEntity) {
          mentions.push({
            text: currentEntity.tokens.join(' '),
            type: mapSpacyToEntityType(currentEntity.type),
            start: Math.min(...currentEntity.starts),
            end: Math.max(...currentEntity.ends),
            sentence_idx: sentence.sentence_index || 0
          });
          currentEntity = null;
        }
      }
    }

    // Save last entity in sentence if exists
    if (currentEntity) {
      mentions.push({
        text: currentEntity.tokens.join(' '),
        type: mapSpacyToEntityType(currentEntity.type),
        start: Math.min(...currentEntity.starts),
        end: Math.max(...currentEntity.ends),
        sentence_idx: sentence.sentence_index || 0
      });
    }
  }

  return mentions;
}

/**
 * Phase 1b: Build entity registry from mentions (WITH DISAMBIGUATION)
 */
function buildEntityRegistry(
  mentions: EntityMention[],
  sentences: any[],  // ParsedSentence[]
  fullText: string
): Map<string, CanonicalEntity> {
  const registry = new Map<string, CanonicalEntity>();

  // Group mentions by normalized name
  const groups = groupBy(mentions, m => normalizeName(m.text));

  for (const [normalizedName, groupMentions] of groups) {
    // Skip single-character entities (often errors)
    if (normalizedName.length < 2) {
      continue;
    }

    // Choose canonical form (longest version)
    const canonical = groupMentions
      .map(m => m.text)
      .sort((a, b) => b.length - a.length)[0];

    // Extract all unique aliases
    const aliases = [...new Set(groupMentions.map(m => m.text))];

    // Infer type (most common across mentions)
    const type = mode(groupMentions.map(m => m.type));

    // Extract context for this entity
    const context = extractEntityContext(canonical, aliases, sentences, fullText);

    console.log(`[CENSUS] ${canonical}: ${summarizeContext(context)}`);

    // Check if we need to split this entity based on context
    // (e.g., "John Smith" father vs "John Smith" son)
    const needsSplit = shouldSplitEntity(groupMentions, sentences, fullText, context);

    if (needsSplit && groupMentions.length > 1) {
      // Split into multiple entities based on context
      console.log(`[CENSUS] ⚠ Splitting "${canonical}" into multiple entities based on context`);

      const splitEntities = splitEntityByContext(canonical, aliases, type, groupMentions, sentences, fullText);

      for (const splitEntity of splitEntities) {
        const key = normalizeName(splitEntity.canonical_name);
        registry.set(key, splitEntity);
      }
    } else {
      // No split needed, create single entity
      const firstPosition = Math.min(...groupMentions.map(m => m.start));

      const entity: CanonicalEntity = {
        id: uuid(),
        canonical_name: canonical,
        aliases: aliases,
        type: type,
        mention_count: groupMentions.length,
        mentions: groupMentions,
        first_mention_position: firstPosition,
        context: context
      };

      registry.set(normalizedName, entity);
    }
  }

  return registry;
}

/**
 * Determine if entity should be split based on conflicting contexts
 */
function shouldSplitEntity(
  mentions: EntityMention[],
  sentences: any[],
  fullText: string,
  overallContext: EntityContext
): boolean {
  // If very few mentions, probably don't need to split
  if (mentions.length < 3) {
    return false;
  }

  // Check for relationship conflicts (e.g., both "father" and "son")
  const relationships = overallContext.relationships.map(r => r.relation_type);
  const hasParentChildConflict =
    (relationships.includes('father') || relationships.includes('mother')) &&
    (relationships.includes('son') || relationships.includes('daughter'));

  if (hasParentChildConflict) {
    console.log(`[CENSUS] Detected parent-child relationship conflict`);
    return true;
  }

  // Check for occupation conflicts
  if (overallContext.occupations.length > 1) {
    // Multiple different occupations might indicate different people
    console.log(`[CENSUS] Detected multiple occupations: ${overallContext.occupations.join(', ')}`);
    return true;
  }

  // Check for temporal conflicts (died vs alive, retired vs young)
  const hasDied = overallContext.age_markers.some(m => /died|deceased/.test(m));
  const hasRetired = overallContext.age_markers.some(m => /retired/.test(m));
  const hasYoung = overallContext.age_markers.some(m => /young/.test(m));

  if ((hasDied || hasRetired) && hasYoung) {
    console.log(`[CENSUS] Detected temporal conflict (retired/died vs young)`);
    return true;
  }

  return false;
}

/**
 * Split entity into multiple based on context differences
 */
function splitEntityByContext(
  baseName: string,
  baseAliases: string[],
  type: EntityType,
  mentions: EntityMention[],
  sentences: any[],
  fullText: string
): CanonicalEntity[] {
  // Group mentions by their local context
  const contextGroups: Map<number, EntityMention[]> = new Map();

  for (const mention of mentions) {
    // Extract context just around this mention
    const localSentences = sentences.filter(s =>
      s.tokens.some((t: any) =>
        t.start >= mention.start - 200 &&
        t.start <= mention.end + 200
      )
    );

    const localContext = extractEntityContext(baseName, baseAliases, localSentences, fullText);

    // Find which group this belongs to
    let assigned = false;
    for (const [groupId, groupMentions] of contextGroups) {
      if (groupMentions.length === 0) continue;

      // Get context of first mention in group
      const groupFirstMention = groupMentions[0];
      const groupLocalSentences = sentences.filter(s =>
        s.tokens.some((t: any) =>
          t.start >= groupFirstMention.start - 200 &&
          t.start <= groupFirstMention.end + 200
        )
      );
      const groupContext = extractEntityContext(baseName, baseAliases, groupLocalSentences, fullText);

      // If contexts don't conflict, add to this group
      if (!areContextsConflicting(localContext, groupContext)) {
        groupMentions.push(mention);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      // Create new group
      contextGroups.set(contextGroups.size, [mention]);
    }
  }

  // Create entities from groups
  const entities: CanonicalEntity[] = [];

  for (const [groupId, groupMentions] of contextGroups) {
    if (groupMentions.length === 0) continue;

    // Extract context for this group
    const groupSentences = sentences.filter(s =>
      groupMentions.some(m =>
        s.tokens.some((t: any) =>
          t.start >= m.start - 50 &&
          t.start <= m.end + 50
        )
      )
    );

    const groupContext = extractEntityContext(baseName, baseAliases, groupSentences, fullText);

    // Generate disambiguated name
    const disambiguatedName = generateDisambiguatedName(baseName, groupContext);

    console.log(`[CENSUS]   Created: ${disambiguatedName}`);
    console.log(`[CENSUS]     Context: ${summarizeContext(groupContext)}`);

    const entity: CanonicalEntity = {
      id: uuid(),
      canonical_name: disambiguatedName,
      aliases: baseAliases,
      type: type,
      mention_count: groupMentions.length,
      mentions: groupMentions,
      first_mention_position: Math.min(...groupMentions.map(m => m.start)),
      context: groupContext
    };

    entities.push(entity);
  }

  return entities;
}

/**
 * Convert canonical entities to ARES Entity format
 */
function canonicalToEntities(registry: Map<string, CanonicalEntity>): Entity[] {
  const entities: Entity[] = [];

  for (const canonical of registry.values()) {
    entities.push({
      id: canonical.id,
      canonical: canonical.canonical_name,
      type: canonical.type,
      aliases: canonical.aliases,
      created_at: new Date().toISOString(),
      attrs: {
        mention_count: canonical.mention_count,
        first_position: canonical.first_mention_position
      }
    });
  }

  return entities;
}

/**
 * PASS 1: Execute full entity census (WITH DISAMBIGUATION)
 */
export async function runEntityCensus(
  fullText: string
): Promise<{
  entities: Entity[];
  registry: Map<string, CanonicalEntity>;
  mentions: EntityMention[];
  parsed: any;  // ParseResponse
}> {
  // Parse document first (needed for disambiguation)
  const parsed = await parseWithService(fullText);
  console.log(`[CENSUS] Parsed ${parsed.sentences.length} sentences for context extraction`);

  // Phase 1a: Collect all mentions
  const mentions = await collectAllMentions(fullText);

  console.log(`[CENSUS] Collected ${mentions.length} raw mentions`);

  // Phase 1b: Build registry WITH DISAMBIGUATION
  const registry = buildEntityRegistry(mentions, parsed.sentences, fullText);

  console.log(`[CENSUS] Built registry with ${registry.size} canonical entities`);

  // Convert to ARES entities
  const entities = canonicalToEntities(registry);

  // Log top entities
  const sorted = [...registry.values()].sort((a, b) => b.mention_count - a.mention_count);
  console.log(`[CENSUS] Top 5 entities:`);
  sorted.slice(0, 5).forEach((e, i) => {
    console.log(`  ${i+1}. ${e.canonical_name} (${e.type}) - ${e.mention_count} mentions`);
    if (e.context) {
      console.log(`      ${summarizeContext(e.context)}`);
    }
  });

  return {
    entities,
    registry,
    mentions,
    parsed
  };
}
