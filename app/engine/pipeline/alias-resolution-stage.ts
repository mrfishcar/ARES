/**
 * Stage 11: Alias Resolution Stage
 *
 * Responsibility: Resolve aliases and assign HERT IDs (Phase 1-3)
 *
 * Operations:
 * - Assign stable EIDs (entity IDs) to entities
 * - Register aliases (AIDs) for surface forms
 * - Perform sense disambiguation (SPs) for ambiguous names
 * - Populate entity.aliases from coreference links and alias registry
 *
 * HERT Components:
 * - EID: Stable entity ID (doesn't change when name changes)
 * - AID: Alias ID (maps surface form to entity)
 * - SP: Sense path (disambiguates multiple entities with same name)
 *
 * Example:
 * - "Harry Potter" → EID 42, AID 100, SP [1]
 * - "Harry" → EID 42, AID 101, SP [1] (same entity)
 * - "Harry Potter" (different character) → EID 43, AID 102, SP [2]
 */

import { isContextDependent } from '../pronoun-utils';
import { chooseBestCanonical } from '../global-graph';
import type {
  AliasResolutionInput,
  AliasResolutionOutput
} from './types';

const STAGE_NAME = 'AliasResolutionStage';

/**
 * Resolve aliases and assign HERT IDs
 */
export async function runAliasResolutionStage(
  input: AliasResolutionInput
): Promise<AliasResolutionOutput> {
  const startTime = Date.now();
  console.log(`[${STAGE_NAME}] Starting with ${input.entities.length} entities`);

  try {
    // Validate input
    if (!input.entities || !Array.isArray(input.entities)) {
      throw new Error('Invalid input: entities must be an array');
    }

    if (!input.profiles || !(input.profiles instanceof Map)) {
      throw new Error('Invalid input: profiles must be a Map');
    }

    if (!input.corefLinks || !Array.isArray(input.corefLinks)) {
      throw new Error('Invalid input: corefLinks must be an array');
    }

    // Dynamically import HERT registries
    const { eidRegistry } = await import('../eid-registry');
    const { aliasResolver } = await import('../alias-resolver');
    const { aliasRegistry } = await import('../alias-registry');
    const { senseRegistry, discriminateSenses } = await import('../sense-disambiguator');

    // Process each entity
    for (const entity of input.entities) {
      // Get entity profile if available
      const profile = input.profiles.get(entity.canonical);

      // Try to resolve surface form to existing entity (Phase 3)
      const resolution = aliasResolver.resolve(
        entity.canonical,
        entity.type,
        profile,
        input.profiles
      );

      if (resolution) {
        // Map to existing entity
        entity.eid = resolution.eid;
        entity.aid = resolution.aid;

        console.log(
          `[${STAGE_NAME}] Resolved "${entity.canonical}" → EID ${resolution.eid} (method: ${resolution.method}, confidence: ${resolution.confidence.toFixed(2)})`
        );

        // Phase 4: Check if sense disambiguation is needed
        // If existing entity has different sense, assign new SP
        const existingSenses = senseRegistry.getSenses(entity.canonical);

        if (existingSenses.length > 0) {
          // Try to match with existing sense
          const matchingSense = senseRegistry.findMatchingSense(
            entity.canonical,
            entity.type,
            profile
          );

          if (matchingSense) {
            // Same sense as existing entity
            entity.sp = matchingSense.sp;
          } else {
            // Different sense - check if we should disambiguate
            const existingSense = existingSenses[0]; // Compare with first sense
            const existingProfile = existingSense.profile;

            if (existingProfile && profile) {
              const discrimination = discriminateSenses(
                entity.canonical,
                existingSense.type,
                existingProfile,
                entity.type,
                profile
              );

              if (discrimination.shouldDisambiguate && discrimination.confidence > 0.7) {
                // Create new EID with different SP
                const newEID = eidRegistry.getOrCreate(entity.canonical);
                const newSP = senseRegistry.getNextSP(entity.canonical, entity.type);

                entity.eid = newEID;
                entity.sp = newSP;
                entity.aid = aliasResolver.registerAlias(entity.canonical, newEID, 1.0, entity.type);

                // Register this sense
                senseRegistry.register(entity.canonical, newEID, entity.type, newSP, profile);

                console.log(
                  `[${STAGE_NAME}] Disambiguated "${entity.canonical}" → EID ${newEID}, SP ${JSON.stringify(newSP)} (${discrimination.reason})`
                );
              }
            }
          }
        }
      } else {
        // Create new entity
        entity.eid = eidRegistry.getOrCreate(entity.canonical);
        entity.aid = aliasResolver.registerAlias(entity.canonical, entity.eid, 1.0, entity.type);

        // Phase 4: Assign sense path if needed
        const existingSenses = senseRegistry.getSenses(entity.canonical);

        if (existingSenses.length === 0) {
          // First sense of this name - assign SP [1]
          entity.sp = [1];
          senseRegistry.register(entity.canonical, entity.eid, entity.type, [1], profile);
        } else {
          // Check if we need to disambiguate from existing senses
          const matchingSense = senseRegistry.findMatchingSense(
            entity.canonical,
            entity.type,
            profile
          );

          if (matchingSense) {
            // Same sense - reuse SP and EID
            entity.eid = matchingSense.eid;
            entity.sp = matchingSense.sp;
          } else {
            // Different sense - assign new SP
            const newSP = senseRegistry.getNextSP(entity.canonical, entity.type);
            entity.sp = newSP;
            senseRegistry.register(entity.canonical, entity.eid, entity.type, newSP, profile);

            console.log(
              `[${STAGE_NAME}] New sense for "${entity.canonical}" → EID ${entity.eid}, SP ${JSON.stringify(newSP)}`
            );
          }
        }
      }
    }

    // Populate entity.aliases from coreference links and alias registry
    console.log(`[${STAGE_NAME}] Populating entity aliases from coref links and alias registry`);

    for (const entity of input.entities) {
      const aliasSet = new Set<string>();

      // Add existing aliases (shouldn't be empty, but just in case)
      for (const alias of entity.aliases) {
        aliasSet.add(alias);
      }

      // 1. Add aliases from coreference links (descriptive mentions ONLY - filter pronouns and coordinations)
      // - Pronouns (he, she, it, etc.) are context-dependent and should NOT be permanent aliases
      // - Coordinations ("X and Y") should not be aliases for individual entities
      for (const link of input.corefLinks) {
        if (link.entity_id === entity.id) {
          const mentionText = link.mention.text.trim();

          // CRITICAL: Filter out pronouns, coordinations, and other context-dependent terms
          if (
            mentionText &&
            mentionText !== entity.canonical &&
            !isContextDependent(mentionText) &&
            link.method !== 'coordination'
          ) {
            aliasSet.add(mentionText);
          }
        }
      }

      // 2. Add aliases from alias registry (all registered surface forms for this EID)
      if (entity.eid) {
        const registeredAliases = aliasRegistry.getAliasesForEntity(entity.eid);

        for (const mapping of registeredAliases) {
          const surfaceForm = mapping.surfaceForm.trim();

          // Add if different from canonical, not empty, and NOT a pronoun
          if (
            surfaceForm &&
            surfaceForm !== entity.canonical &&
            !isContextDependent(surfaceForm)
          ) {
            aliasSet.add(surfaceForm);
          }
        }
      }

      // Update entity.aliases with unique values
      entity.aliases = Array.from(aliasSet);

      // Choose best canonical name from all variants
      if (aliasSet.size > 0) {
        entity.canonical = chooseBestCanonical([
          entity.canonical,
          ...aliasSet
        ]);
      }

      if (entity.aliases.length > 0) {
        console.log(
          `[${STAGE_NAME}] Entity "${entity.canonical}" has ${entity.aliases.length} aliases: [${entity.aliases.slice(0, 3).join(', ')}${entity.aliases.length > 3 ? '...' : ''}]`
        );
      }
    }

    const duration = Date.now() - startTime;
    const entitiesWithEID = input.entities.filter(e => e.eid).length;
    const entitiesWithAliases = input.entities.filter(e => e.aliases.length > 0).length;

    console.log(
      `[${STAGE_NAME}] Complete in ${duration}ms: ${entitiesWithEID}/${input.entities.length} entities with EID, ${entitiesWithAliases} with aliases`
    );

    return {
      entities: input.entities
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${STAGE_NAME}] Failed after ${duration}ms:`, error);
    const err = new Error(`[${STAGE_NAME}] ${(error as Error).message}`);
          (err as any).cause = error;
    throw err;
  }
}
