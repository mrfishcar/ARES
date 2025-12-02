/**
 * Post-processing filters for global graph entities
 * Apply linguistic rules to final merged entities
 */

import type { GlobalEntity } from '../global-graph';
import { PERSON_HEAD_BLOCKLIST } from './common-noun-filters';

/**
 * Filter problematic global entities after merging
 * This catches entities that slipped through per-chunk filtering
 */
export function filterGlobalEntities(entities: GlobalEntity[]): GlobalEntity[] {
  const filtered: GlobalEntity[] = [];

  for (const entity of entities) {
    let shouldKeep = true;
    const tokens = entity.canonical.split(/\s+/).filter(Boolean);
    const headToken = tokens[tokens.length - 1];

    // Rule: Single-token PERSON entities with blocklisted head
    if (entity.type === 'PERSON' && tokens.length === 1) {
      if (PERSON_HEAD_BLOCKLIST.has(headToken.toLowerCase())) {
        shouldKeep = false;
        if (process.env.DEBUG_ENTITY_DECISIONS === 'true') {
          console.log('[GLOBAL-FILTER] Removing blocklisted single-token PERSON:', entity.canonical);
        }
      }
    }

    // Rule: Name fragments (single tokens that look like place name parts)
    // These are tokens like "Mont", "Linola" that only appear as parts of longer names
    if (entity.type === 'PERSON' && tokens.length === 1) {
      const token = tokens[0];
      // Check if this token appears in other entity names as part of a longer name
      const appearsInLongerNames = entities.some(e =>
        e.canonical !== entity.canonical &&
        e.canonical.split(/\s+/).includes(token) &&
        e.type === 'ORG'  // Specifically check for ORG entities (schools, places)
      );

      if (appearsInLongerNames) {
        shouldKeep = false;
        if (process.env.DEBUG_ENTITY_DECISIONS === 'true') {
          console.log('[GLOBAL-FILTER] Removing name fragment (appears in longer ORG names):', entity.canonical);
        }
      }
    }

    if (shouldKeep) {
      filtered.push(entity);
    }
  }

  const removedCount = entities.length - filtered.length;
  if (removedCount > 0) {
    console.log(`[GLOBAL-FILTER] Removed ${removedCount} problematic global entities`);
  }

  return filtered;
}
