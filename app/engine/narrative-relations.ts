/**
 * Narrative Relation Extraction (Phase E3)
 *
 * Pattern-based extraction for relationships that dependency parsing misses:
 * - Past tense narratives: "married eight years earlier"
 * - Possessive patterns: "their daughter"
 * - Appositive patterns: "Jun Park, their oldest friend"
 */

import { v4 as uuid } from "uuid";
import type { Relation, EntityType } from "./schema";
import type { CorefLinks } from "./coref";
import { getDynamicPatterns, type RelationPattern as DynamicRelationPattern } from "./dynamic-pattern-loader";

/**
 * Relation pattern definition
 */
interface RelationPattern {
  regex: RegExp;
  predicate: string;
  symmetric?: boolean;
  extractSubj?: number;  // Capture group for subject (default: 1)
  extractObj?: number;   // Capture group for object (default: 2)
  typeGuard?: {
    subj?: EntityType[];
    obj?: EntityType[];
  };
}

/**
 * Narrative relation patterns
 * Ordered by specificity (more specific patterns first)
 */
const NARRATIVE_PATTERNS: RelationPattern[] = [
  // Multi-subject lives_in: "Aria and Elias lived in Meridian Ridge"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+and\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)+)\s+(?:lived|dwelt|dwelled|resides|resided)\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'lives_in',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },
  // Pronoun-based rivalry: "Each woman became an enemy of the other"
  {
    regex: /\b((?:Each|each|Both|both|The|the)\s+(?:woman|women|man|men|strategist|strategists|leader|leaders|guardian|guardians))\s+(?:became|remained|was|were)\s+(?:an\s+)?(?:enemy|enemies|rival|rivals|adversary|adversaries|opponent|opponents)\s+of\s+(?:the\s+)?(other|each\s+other|one\s+another)\b/g,
    predicate: 'enemy_of',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] },
    extractSubj: 1,
    extractObj: 2
  },
  // === MARRIAGE PATTERNS ===
  // "Aria married Elias", "Aria and Elias married"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:married|wed)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'married_to',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "Aria and Elias married", "The couple married"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:married|wed)\b/g,
    predicate: 'married_to',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "The couple married eight years earlier" - requires coreference for "couple"
  // Note: Use negative lookbehind to exclude possessive "couple's"
  {
    regex: /\b((?:the|a)\s+couple)(?!'s)\s+(?:had\s+)?married\b/gi,
    predicate: 'married_to',
    symmetric: true,
    extractSubj: 1,
    extractObj: 1,  // Same as subject - both are "the couple"
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
    // Note: Will resolve "the couple" to multiple entities via coreference
  },

  // === FRIENDSHIP PATTERNS ===
  // "Aria remained friends with Elias", "Jun also struck a friendship with Elias"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:also\s+)?(?:remained|stayed|became|was|were|struck)\s+(?:a\s+)?(?:best\s+)?(?:friendship|friends?)\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'friends_with',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "Aria and Elias remained friends"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:remained|stayed|became|were)\s+(?:best\s+)?friends?\b/g,
    predicate: 'friends_with',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // === ENEMY PATTERNS ===
  // "Aria became an enemy of Kara"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:became|remained|was|were)\s+(?:an\s+)?(?:enemy|enemies|rival|rivals)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'enemy_of',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "Aria and Kara became enemies"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:became|remained|were)\s+(?:enemies|rivals)\b/g,
    predicate: 'enemy_of',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // "the rivalry between Aria and Kara"
  {
    regex: /\bthe\s+rivalry\s+between\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'enemy_of',
    symmetric: true,
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // === FAMILY/PARENT PATTERNS ===
  // Pattern: "child of X and Y" - First parent relation
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[^.]{0,100}?\b(?:child|daughter|son)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'parent_of',
    extractSubj: 2,  // First parent
    extractObj: 1,   // Child
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // Pattern: "child of X and Y" - Second parent relation (same regex, different extraction)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[^.]{0,100}?\b(?:child|daughter|son)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'parent_of',
    extractSubj: 3,  // Second parent (group 3)
    extractObj: 1,   // Child
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // Pattern: "X is the son/daughter of Y" or "Mira, daughter of Aria" or "Cael, son of Elias"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+is\s+(?:the\s+)?(?:son|daughter|child)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'parent_of',
    extractSubj: 2,  // Parent is object of "of"
    extractObj: 1,   // Child is subject (the person after "is")
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // Pattern: "Mira, daughter of Aria" or "Cael, son of Elias"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*,?\s+(?:the\s+)?(?:daughter|son|child)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'parent_of',
    extractSubj: 2,  // Parent is object of "of"
    extractObj: 1,   // Child is subject
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },
  // Pattern: "The couple's daughter, Mira" or "Their son, Cael"
  // Note: This requires special handling - need to resolve "couple"/"their" first
  {
    regex: /\b(the\s+couple'?s?|their)\s+(?:daughter|son|child|children)\s*,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
    predicate: 'parent_of',
    extractSubj: 1,  // This will be "their" or "the couple's" - needs coreference
    extractObj: 2,   // This is the child name
    typeGuard: { subj: ['PERSON'], obj: ['PERSON'] }
  },

  // === EDUCATION PATTERNS ===
  // COORDINATION: "Harry and Ron studied at Hogwarts"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:(?:continued\s+(?:to\s+)?)|still\s+|kept\s+)?(?:studied|studying|studies|study|enrolled|attended|attends|attend)\s+(?:at|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'studies_at',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PLACE'] },
    extractSubj: null,  // Special handling - will extract both subjects
    extractObj: 3,
    coordination: true  // Mark this as a coordination pattern
  },
  // SINGLE SUBJECT: "Aria studied at Meridian Academy"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:(?:continued\s+(?:to\s+)?)|still\s+|kept\s+)?(?:studied|studying|studies|enrolled|attended|attends)\s+(?:at|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'studies_at',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PLACE'] }
  },
  // "Kara taught at Meridian Academy", "Kara teaches at ..."
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:(?:continued\s+(?:to\s+)?)|still\s+|kept\s+)?(?:taught|teaches|teach|lectured|lectures)\s+(?:at|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'teaches_at',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PLACE'] }
  },

  // === LOCATION PATTERNS ===
  // "Aria lived in Meridian Ridge", "The family dwelt in ..."
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:lived|dwelt|dwelled|resides|resided)\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'lives_in',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+and\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)*)\s+(?:lived|resided|dwelt|dwelled)[^.]{0,150}?\boverlooking\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'lives_in',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },

  // === TRAVEL PATTERNS ===
  // COORDINATION: "Frodo and Sam traveled to Mordor"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:traveled|travelled|journeyed|went)\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'traveled_to',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] },
    extractSubj: null,  // Special handling - will extract both subjects
    extractObj: 3,
    coordination: true
  },
  // SINGLE SUBJECT: "Aria traveled to Meridian Ridge"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:traveled|travelled|journeyed|went)\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'traveled_to',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE'] }
  },

  // === BATTLE/EVENT PATTERNS ===
  // "Aria fought in the Battle of X"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+fought\s+in\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'fought_in',
    typeGuard: { subj: ['PERSON'], obj: ['EVENT', 'PLACE'] }
  },

  // === GOVERNANCE/LEADERSHIP PATTERNS ===
  // "Aragorn ruled Gondor", "Theoden rules Rohan"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:ruled|rules|governs|governed|reigned|reigns)\s+(?:over\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'rules',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE', 'ORG'] }
  },
  // "Aragorn became king of Gondor", "became king there"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+became\s+(?:king|queen|ruler|leader)\s+(?:of\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'rules',
    typeGuard: { subj: ['PERSON'], obj: ['PLACE', 'ORG'] }
  },

  // === LOCATION PATTERNS - EXPANDED ===
  // "X is located in Y", "X is based in Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is\s+)?(?:located|situated|based|founded|established)\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'located_in',
    typeGuard: { subj: ['PLACE', 'ORG'], obj: ['PLACE'] }
  },
  // "X near Y", "X is near Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is\s+)?near\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'near',
    typeGuard: { subj: ['PLACE', 'PERSON'], obj: ['PLACE'] }
  },
  // "X borders Y", "X borders on Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+borders?\s+(?:on\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'borders',
    typeGuard: { subj: ['PLACE'], obj: ['PLACE'] }
  },
  // "X within Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+within\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'within',
    typeGuard: { subj: ['PLACE'], obj: ['PLACE'] }
  },

  // === PART_WHOLE PATTERNS ===
  // "X is part of Y", "X is a part of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is\s+)?(?:a\s+)?part\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'part_of',
    typeGuard: {}
  },
  // "X consists of Y", "X consist of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+consists?\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'consists_of',
    typeGuard: {}
  },
  // "X includes Y", "X include Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:includes?|contain|contains)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'includes',
    typeGuard: {}
  },
  // "X is made of Y", "X is composed of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is\s+)?(?:made|composed)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'made_of',
    typeGuard: {}
  },

  // === EMPLOYMENT PATTERNS ===
  // "X works for Y", "X work for Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:works?|worked)\s+(?:as\s+)?(?:for|with|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'works_for',
    typeGuard: { subj: ['PERSON'], obj: ['ORG', 'PERSON'] }
  },
  // "X employed by Y", "X was employed by Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:was\s+)?employed\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'employed_by',
    typeGuard: { subj: ['PERSON'], obj: ['ORG'] }
  },
  // "X is a member of Y", "X member of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is\s+)?(?:a\s+)?member\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'member_of',
    typeGuard: { subj: ['PERSON'], obj: ['ORG'] }
  },
  // "X is CEO/president/director of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|was)\s+(?:the\s+)?(?:CEO|president|director|founder|manager|leader)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'leads',
    typeGuard: { subj: ['PERSON'], obj: ['ORG'] }
  },
  // "X founded Y", "X founded the Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+founded\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'founded',
    typeGuard: { subj: ['PERSON'], obj: ['ORG'] }
  },

  // === CREATION PATTERNS ===
  // "X wrote Y", "X wrote the Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:wrote|authored|written|penned)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'wrote',
    typeGuard: { subj: ['PERSON'], obj: ['WORK', 'ORG'] }
  },
  // "X created Y", "X created the Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:created|made|produced|composed|designed|invented)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'created',
    typeGuard: { subj: ['PERSON'], obj: ['WORK', 'ITEM'] }
  },
  // "X directed Y", "X directed the Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:directed|filmed|shot)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'directed',
    typeGuard: { subj: ['PERSON'], obj: ['WORK', 'EVENT'] }
  },
  // "X is the author of Y", "X author of Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is\s+)?(?:the\s+)?author\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'authored',
    typeGuard: { subj: ['PERSON'], obj: ['WORK'] }
  },
  // "X painted Y"
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+painted\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    predicate: 'painted',
    typeGuard: { subj: ['PERSON'], obj: ['WORK', 'ITEM'] }
  }
];

/**
 * Entity lookup by surface form
 */
interface EntityLookup {
  id: string;
  canonical: string;
  type: EntityType;
  aliases: string[];
}

/**
 * Resolve collective references using coreference links
 * Examples: "the couple" → [Aria, Elias], "their" → [parent1, parent2]
 */
function resolveCollectiveReference(
  text: string,
  position: number,
  corefLinks: CorefLinks | undefined,
  entities: EntityLookup[]
): EntityLookup[] | null {
  if (!corefLinks) return null;

  // Find coref links that overlap with this position
  const matchingLinks = corefLinks.links.filter(link =>
    position >= link.mention.start && position < link.mention.end
  );

  if (matchingLinks.length === 0) return null;

  // Get all entities referenced by these links
  const entityIds = new Set(matchingLinks.map(link => link.entity_id));
  const resolvedEntities = entities.filter(
    e => entityIds.has(e.id) && e.type === 'PERSON'
  );

  if (!resolvedEntities.length) {
    return null;
  }

  const unique = new Map<string, EntityLookup>();
  for (const entity of resolvedEntities) {
    if (!unique.has(entity.id)) {
      unique.set(entity.id, entity);
    }
  }

  return Array.from(unique.values());
}

/**
 * Resolve possessive pronouns using coref links
 * Examples: "their" → [Aria, Elias], "his" → Gandalf
 */
function resolvePossessivePronoun(
  pronoun: string,
  position: number,
  corefLinks: CorefLinks | undefined,
  entities: EntityLookup[]
): EntityLookup[] | null {
  if (!corefLinks) return null;

  const pronounLower = pronoun.toLowerCase();

  // Find coref links for this pronoun position
  const matchingLinks = corefLinks.links.filter(link => {
    const mentionText = link.mention.text.toLowerCase();
    // Check if mention text contains the pronoun
    return mentionText === pronounLower &&
           position >= link.mention.start &&
           position < link.mention.end;
  });

  if (matchingLinks.length === 0) return null;

  // Get all entities referenced (retain only PERSON entities)
  const entityIds = new Set(matchingLinks.map(link => link.entity_id));
  const resolved = entities.filter(
    e => entityIds.has(e.id) && e.type === 'PERSON'
  );

  if (!resolved.length) {
    return null;
  }

  const unique = new Map<string, EntityLookup>();
  for (const entity of resolved) {
    if (!unique.has(entity.id)) {
      unique.set(entity.id, entity);
    }
  }

  return Array.from(unique.values());
}

function resolvePronounReference(
  pronoun: string,
  position: number,
  corefLinks: CorefLinks | undefined,
  entities: EntityLookup[],
  allowedTypes: EntityType[] = ['PERSON']
): EntityLookup[] | null {
  if (!corefLinks) return null;

  const pronounLower = pronoun.toLowerCase();
  const matchingLinks = corefLinks.links.filter(link => {
    if (link.mention.text.toLowerCase() !== pronounLower) {
      return false;
    }
    return position >= link.mention.start && position < link.mention.end;
  });

  if (!matchingLinks.length) return null;

  const unique = new Map<string, EntityLookup>();
  for (const link of matchingLinks) {
    const entity = entities.find(e => e.id === link.entity_id);
    if (!entity) continue;
    if (allowedTypes.length && !allowedTypes.includes(entity.type)) continue;
    if (!unique.has(entity.id)) {
      unique.set(entity.id, entity);
    }
  }

  return unique.size ? Array.from(unique.values()) : null;
}

/**
 * Match entity by surface form (case-insensitive, handles aliases)
 */
function matchEntity(surface: string, entities: EntityLookup[]): EntityLookup | null {
  const cleaned = surface
    .replace(/^[\s,.;:"'“”‘’()]+/, '')
    .replace(/[\s,.;:"'“”‘’()]+$/, '')
    .trim();

  if (!cleaned) return null;

  const surfaceLower = cleaned.toLowerCase();

  for (const entity of entities) {
    // Match canonical name
    if (entity.canonical.toLowerCase() === surfaceLower) {
      return entity;
    }

    // Match aliases
    if (entity.aliases.some(alias => alias.toLowerCase() === surfaceLower)) {
      return entity;
    }

    // Partial match (surface is contained in canonical or vice versa)
    const canonicalLower = entity.canonical.toLowerCase();
    if (canonicalLower.includes(surfaceLower) || surfaceLower.includes(canonicalLower)) {
      // Only match if word boundaries align
      const words = surfaceLower.split(/\s+/);
      const canonicalWords = canonicalLower.split(/\s+/);

      if (words.every(w => canonicalWords.includes(w)) ||
          canonicalWords.every(w => words.includes(w))) {
        return entity;
      }
    }
  }

  return null;
}

function matchCompoundEntities(surface: string, entities: EntityLookup[]): EntityLookup[] | null {
  if (!surface.includes(' and ')) {
    return null;
  }

  const parts = surface.split(/\band\b/gi).map(part =>
    part.replace(/^[\s,]+/, '').replace(/[\s,]+$/, '').trim()
  ).filter(Boolean);

  if (parts.length <= 1) return null;

  const matches: EntityLookup[] = [];

  for (const part of parts) {
    const entity = matchEntity(part, entities);
    if (entity && !matches.some(e => e.id === entity.id)) {
      matches.push(entity);
    }
  }

  return matches.length >= 2 ? matches : null;
}

const COLLECTIVE_CUE_REGEX = /\b(?:the|this|that|these|those|each|both)\s+(?:couple|pair|duo|trio|siblings|parents|partners|friend|friends|woman|women|man|men|strategist|strategists|leaders|guardians|rivals|allies|family|councilors|figures)\b/i;
const OTHER_PRONOUN_REGEX = /\b(?:the other|each other|one another)\b/i;

/**
 * Check type guard for relation
 */
function passesTypeGuard(
  pattern: RelationPattern,
  subjEntity: EntityLookup,
  objEntity: EntityLookup
): boolean {
  if (!pattern.typeGuard) return true;

  if (pattern.typeGuard.subj) {
    if (!pattern.typeGuard.subj.includes(subjEntity.type)) {
      return false;
    }
  }

  if (pattern.typeGuard.obj) {
    if (!pattern.typeGuard.obj.includes(objEntity.type)) {
      return false;
    }
  }

  return true;
}

/**
 * Extract narrative relations from text
 */
export function extractNarrativeRelations(
  text: string,
  entities: EntityLookup[],
  docId: string = 'current',
  corefLinks?: CorefLinks
): Relation[] {
  const relations: Relation[] = [];

  // Combine static patterns with dynamic patterns
  const dynamicPatterns = getDynamicPatterns();
  const allPatterns = [...NARRATIVE_PATTERNS, ...dynamicPatterns];

  console.log(`[NarrativeRelations] Using ${NARRATIVE_PATTERNS.length} static + ${dynamicPatterns.length} dynamic patterns = ${allPatterns.length} total`);

  for (const pattern of allPatterns) {
    // Reset regex state
    pattern.regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text)) !== null) {
      // Handle coordination patterns specially (e.g., "Harry and Ron studied at Hogwarts")
      if ((pattern as any).coordination && match[1] && match[2] && match[3]) {
        // For coordination: match[1]=first subject, match[2]=second subject, match[3]=object
        const firstSubj = match[1];
        const secondSubj = match[2];
        const obj = match[3];

        // Create relations for BOTH subjects
        for (const subjSurface of [firstSubj, secondSubj]) {
          const subjEntity = matchEntity(subjSurface, entities);
          const objEntity = matchEntity(obj, entities);

          if (subjEntity && objEntity && passesTypeGuard(pattern, subjEntity, objEntity)) {
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;

            relations.push({
              id: uuid(),
              subj: subjEntity.id,
              pred: pattern.predicate as any,
              obj: objEntity.id,
              evidence: [{
                doc_id: docId,
                span: { start: matchStart, end: matchEnd, text: match[0] },
                sentence_index: 0,
                source: 'RULE'
              }],
              confidence: 0.85,
              extractor: 'regex'
            });

            // For symmetric relations, create inverse
            if (pattern.symmetric) {
              relations.push({
                id: uuid(),
                subj: objEntity.id,
                pred: pattern.predicate as any,
                obj: subjEntity.id,
                evidence: [{
                  doc_id: docId,
                  span: { start: matchStart, end: matchEnd, text: match[0] },
                  sentence_index: 0,
                  source: 'RULE'
                }],
                confidence: 0.85,
                extractor: 'regex'
              });
            }
          }
        }
        continue; // Skip normal processing for coordination patterns
      }

      const subjGroup = pattern.extractSubj ?? 1;
      const objGroup = pattern.extractObj ?? 2;

      const subjSurface = match[subjGroup];
      const objSurface = match[objGroup];

      // Skip if either capture is undefined
      if (!subjSurface || !objSurface) continue;

      const subjOffsetInMatch = match[0].indexOf(subjSurface);
      const subjAbsoluteStart = subjOffsetInMatch >= 0 ? match.index + subjOffsetInMatch : match.index;
      const objOffsetInMatch = match[0].indexOf(objSurface);
      const objAbsoluteStart = objOffsetInMatch >= 0 ? match.index + objOffsetInMatch : match.index;

      // Try to resolve collective references (e.g., "the couple", "their")
      let subjEntities: EntityLookup[] | null = null;
      let objEntities: EntityLookup[] | null = null;

      // Check if subject is a collective reference
      if (/\b(?:the|a)\s+couple\b/i.test(subjSurface) || COLLECTIVE_CUE_REGEX.test(subjSurface)) {
        subjEntities = resolveCollectiveReference(text, subjAbsoluteStart, corefLinks, entities);
      } else {
        const subjEntity = matchEntity(subjSurface, entities);
        if (subjEntity) subjEntities = [subjEntity];
      }

      if (!subjEntities) {
        const compound = matchCompoundEntities(subjSurface, entities);
        if (compound) subjEntities = compound;
      }

      if (!subjEntities) {
        const allowedSubjTypes: EntityType[] = pattern.typeGuard?.subj
          ? [...pattern.typeGuard.subj]
          : ['PERSON'];
        const pronounEntities = resolvePronounReference(
          subjSurface,
          subjAbsoluteStart,
          corefLinks,
          entities,
          allowedSubjTypes
        );
        if (pronounEntities && pronounEntities.length) {
          subjEntities = pronounEntities;
        }
      }

      // Check if object is a collective reference
      if (
        /\b(?:the|a)\s+couple\b/i.test(objSurface) ||
        COLLECTIVE_CUE_REGEX.test(objSurface) ||
        OTHER_PRONOUN_REGEX.test(objSurface)
      ) {
        objEntities = resolveCollectiveReference(text, objAbsoluteStart, corefLinks, entities);
      } else {
        const objEntity = matchEntity(objSurface, entities);
        if (objEntity) objEntities = [objEntity];
      }

      if (!objEntities && OTHER_PRONOUN_REGEX.test(objSurface) && subjEntities && subjEntities.length > 1) {
        objEntities = [...subjEntities];
      }

      if (!objEntities) {
        const compound = matchCompoundEntities(objSurface, entities);
        if (compound) objEntities = compound;
      }

      if (!objEntities) {
        const allowedObjTypes: EntityType[] = pattern.typeGuard?.obj
          ? [...pattern.typeGuard.obj]
          : ['PERSON', 'ORG', 'PLACE'];
        const pronounEntities = resolvePronounReference(
          objSurface,
          objAbsoluteStart,
          corefLinks,
          entities,
          allowedObjTypes
        );
        if (pronounEntities && pronounEntities.length) {
          objEntities = pronounEntities;
        }
      }

      if (!subjEntities || !objEntities) continue;

      // Check if subject and object are the same collective reference
      // (e.g., "the couple married" where both subj and obj resolve to [Aria, Elias])
      const isSameCollective =
        subjEntities.length > 1 &&
        objEntities.length > 1 &&
        subjEntities.every(e => objEntities.some(o => o.id === e.id)) &&
        objEntities.every(e => subjEntities.some(s => s.id === e.id));

      if (isSameCollective) {
        // For same collective, create pairwise relations without duplicates
        // E.g., [Aria, Elias] -> create Aria->Elias and Elias->Aria (symmetric)
        for (let i = 0; i < subjEntities.length; i++) {
          for (let j = i + 1; j < subjEntities.length; j++) {
            const subjEntity = subjEntities[i];
            const objEntity = subjEntities[j];

            // Type guard
            if (!passesTypeGuard(pattern, subjEntity, objEntity)) continue;

            // Create relation
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;

            const relation: Relation = {
              id: uuid(),
              subj: subjEntity.id,
              pred: pattern.predicate as any,
              obj: objEntity.id,
              evidence: [{
                doc_id: docId,
                span: {
                  start: matchStart,
                  end: matchEnd,
                  text: match[0]
                },
                sentence_index: getSentenceIndex(text, matchStart),
                source: 'RULE' as const
              }],
              confidence: 0.85,
              extractor: 'regex'
            };

            relations.push(relation);

            // Add symmetric relation if specified
            if (pattern.symmetric) {
              relations.push({
                ...relation,
                id: uuid(),
                subj: objEntity.id,
                obj: subjEntity.id
              });
            }
          }
        }
      } else {
        // Normal case: different subject and object
        // Create relations for all entity pairs
        for (const subjEntity of subjEntities) {
          for (const objEntity of objEntities) {
            if (subjEntity.id === objEntity.id) continue; // Skip self-relations

            // Type guard
            if (!passesTypeGuard(pattern, subjEntity, objEntity)) continue;

            // Create relation
            const matchStart = match.index;
            const matchEnd = matchStart + match[0].length;

            const relation: Relation = {
              id: uuid(),
              subj: subjEntity.id,
              pred: pattern.predicate as any, // Type assertion for custom predicates
              obj: objEntity.id,
              evidence: [{
                doc_id: docId,
                span: {
                  start: matchStart,
                  end: matchEnd,
                  text: match[0]
                },
                sentence_index: getSentenceIndex(text, matchStart),
                source: 'RULE' as const
              }],
              confidence: 0.85,
              extractor: 'regex'
            };

            relations.push(relation);

            // Add symmetric relation if specified
            if (pattern.symmetric) {
              relations.push({
                ...relation,
                id: uuid(),
                subj: objEntity.id,
                obj: subjEntity.id
              });
            }
          }
        }
      }
    }
  }

  // ============================================================
  // OPTION C: IMPROVE PATTERN SPECIFICITY WITH CONTEXT AWARENESS
  // ============================================================
  // When married_to(A, B) exists, remove conflicting parent_of/child_of
  // relations because married_to has higher confidence in romantic contexts
  const marriedPairs = new Set<string>();
  for (const rel of relations) {
    if (rel.pred === 'married_to') {
      // Create normalized pair key (order-independent since married_to is symmetric)
      const key1 = `${rel.subj}:${rel.obj}`;
      const key2 = `${rel.obj}:${rel.subj}`;
      marriedPairs.add(key1);
      marriedPairs.add(key2);
    }
  }

  // Filter out parent_of/child_of relations that conflict with married_to
  const filteredRelations = relations.filter(rel => {
    if (rel.pred === 'parent_of' || rel.pred === 'child_of') {
      const pairKey = `${rel.subj}:${rel.obj}`;
      if (marriedPairs.has(pairKey)) {
        // This person pair is married - don't emit parent_of/child_of
        console.log(`[CONTEXT-FILTER] Removing ${rel.pred}(${rel.subj}, ${rel.obj}) because married_to exists for this pair`);
        return false;
      }
    }
    return true;
  });

  return filteredRelations;
}

/**
 * Helper: Get sentence index from character offset
 * Simple heuristic: count sentence terminators before position
 */
function getSentenceIndex(text: string, position: number): number {
  const before = text.substring(0, position);
  const matches = before.match(/[.!?]+/g);
  return matches ? matches.length : 0;
}

/**
 * Extract possessive family relations
 * Examples: "Aria's daughter", "their son", "the couple's child"
 */
export function extractPossessiveFamilyRelations(
  text: string,
  entities: EntityLookup[],
  docId: string = 'current',
  corefLinks?: CorefLinks
): Relation[] {
  const relations: Relation[] = [];
  const findRecentPersons = (position: number, limit: number = 2): EntityLookup[] => {
    const windowStart = Math.max(0, position - 800);
    const windowText = text.slice(windowStart, position);
    const groupPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
    const groupMatches = Array.from(windowText.matchAll(groupPattern));
    for (let i = groupMatches.length - 1; i >= 0; i--) {
      const [, first, second] = groupMatches[i];
      const firstEntity = matchEntity(first, entities);
      const secondEntity = matchEntity(second, entities);
      if (firstEntity?.type === 'PERSON' && secondEntity?.type === 'PERSON') {
        return [firstEntity, secondEntity];
      }
    }

    const matches = Array.from(windowText.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g));
    const seen = new Set<string>();
    const result: EntityLookup[] = [];

    for (let i = matches.length - 1; i >= 0 && result.length < limit; i--) {
      const candidate = matches[i][1];
      const entity = matchEntity(candidate, entities);
      if (!entity || entity.type !== 'PERSON') continue;
      if (seen.has(entity.id)) continue;
      result.unshift(entity);
      seen.add(entity.id);
    }

    return result;
  };

  let lastPluralPossessors: { entities: EntityLookup[]; position: number } | null = null;

  // Pattern 1: "X's daughter/son/child" → parent_of(X, [child entity])
  // Allow optional adjectives between possessive and family word (e.g., "Sarah's younger brother")
  const possessivePattern = /\b((?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)|(?:the|this|that)\s+(?:couple|pair|trio|siblings|parents))'s\s+(?:[a-z]+\s+)*(daughter|son|child|parent|father|mother|brother|sister|wife|husband|spouse)\b/gi;

  let match: RegExpExecArray | null;
  while ((match = possessivePattern.exec(text)) !== null) {
    const possessorSurface = match[1];
    const possessorLower = possessorSurface.toLowerCase();
    const roleWord = match[2].toLowerCase();

    const possessorMap = new Map<string, EntityLookup>();

    const directMatch = matchEntity(possessorSurface, entities);
    if (directMatch && directMatch.type === 'PERSON') {
      possessorMap.set(directMatch.id, directMatch);
    }

    const collectiveMatches = resolveCollectiveReference(
      text,
      match.index,
      corefLinks,
      entities
    );

    if (collectiveMatches) {
      for (const entity of collectiveMatches) {
        if (entity.type === 'PERSON') {
          possessorMap.set(entity.id, entity);
        }
      }
    }

    if (possessorMap.size === 0) {
      if (/(couple|pair|parents|partners|family|trio)/.test(possessorLower)) {
        const recentPersons = findRecentPersons(match.index);
        for (const entity of recentPersons) {
          possessorMap.set(entity.id, entity);
        }
      }
    }

    if (possessorMap.size === 0) continue;
    const possessorEntities = Array.from(possessorMap.values());

    const qualifiesForMemory = /(couple|parents|partners|pair|family)/.test(possessorLower);
    if (qualifiesForMemory && possessorEntities.length >= 2) {
      lastPluralPossessors = { entities: possessorEntities, position: match.index };
    }

    // Determine predicate based on role
    let predicate: string;

    if (['daughter', 'son', 'child'].includes(roleWord)) {
      predicate = 'parent_of';
    } else if (['parent', 'father', 'mother'].includes(roleWord)) {
      predicate = 'child_of';
    } else if (['brother', 'sister'].includes(roleWord)) {
      predicate = 'sibling_of';
    } else if (['wife', 'husband', 'spouse'].includes(roleWord)) {
      predicate = 'married_to';
    } else {
      continue;
    }

    // Look for entity mentioned shortly after (within 100 chars)
    const afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 100);
    const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/;
    const entityMatch = afterMatch.match(entityPattern);

    if (entityMatch) {
      const targetEntity = matchEntity(entityMatch[1], entities);
      if (!targetEntity || targetEntity.type !== 'PERSON') continue;

      for (const possessorEntity of possessorEntities) {
        if (targetEntity.id === possessorEntity.id) continue;

        const evidenceSpan = {
          start: match.index,
          end: match.index + match[0].length + entityMatch[0].length,
          text: match[0] + ' ' + entityMatch[0]
        };

        const relation: Relation = {
          id: uuid(),
          subj: possessorEntity.id,
          pred: predicate as any, // Type assertion for custom predicates
          obj: targetEntity.id,
          evidence: [{
            doc_id: docId,
            span: evidenceSpan,
            sentence_index: getSentenceIndex(text, match.index),
            source: 'RULE' as const
          }],
          confidence: 0.80,
          extractor: 'regex'
        };

        // Create the natural direction only (don't auto-create inverses)
        // Pattern "X's daughter Y" naturally means parent_of(X, Y)
        relations.push(relation);

        // For symmetric relations, create both directions
        if (predicate === 'sibling_of') {
          relations.push({
            ...relation,
            id: uuid(),
            subj: targetEntity.id,
            pred: 'sibling_of',
            obj: possessorEntity.id
          });
        }
      }
    }
  }

  // Pattern 2: "their daughter/son" or "his wife" → resolve pronoun, then create family relations
  // Allow optional adjectives like "late", "younger", "older", etc.
  // NOTE: This pattern is conservative to avoid false positives (e.g., "He loved her" → parent_of)
  const theirPattern = /\b(their|his|her)\s+(?:[a-z]+\s+)*(daughter|son|child|parent|father|mother|wife|husband|spouse|brother|sister)\b/gi;

  while ((match = theirPattern.exec(text)) !== null) {
    const pronoun = match[1].toLowerCase();
    const roleWord = match[2].toLowerCase();

    // CONTEXT AWARENESS: Skip this pattern if it's in a clearly romantic context
    // Check the surrounding context for marriage/love verbs that would indicate
    // the pronouns refer to spouses, not children
    const contextBefore = text.substring(Math.max(0, match.index - 200), match.index);
    const contextAfter = text.substring(match.index + match[0].length, Math.min(text.length, match.index + match[0].length + 100));
    const surroundingContext = contextBefore + match[0] + contextAfter;

    // If we see marriage/love language AND we're trying to extract parent_of/child_of from pronouns,
    // be much more conservative (skip it)
    if (['daughter', 'son', 'child'].includes(roleWord) &&
        pronoun === 'her' || pronoun === 'his') {
      const hasRomanticContext = /\b(married|spouse|wife|husband|beloved|loved|lover|romance|romantic|passion)\b/i.test(surroundingContext);
      const hasPronounPair = pronoun === 'her' && /\b(he|him|his)\b/i.test(contextBefore);

      if (hasRomanticContext || hasPronounPair) {
        // Skip this match - likely a romantic relationship, not parent-child
        continue;
      }
    }

    // Resolve pronoun using coreference links
    let possessorEntities = resolvePossessivePronoun(pronoun, match.index, corefLinks, entities) ?? [];
    possessorEntities = possessorEntities.filter(entity => entity.type === 'PERSON');

    const isPluralPronoun = pronoun === 'their';
    if (isPluralPronoun && possessorEntities.length && lastPluralPossessors) {
      const allowedIds = new Set(lastPluralPossessors.entities.map(e => e.id));
      const overlap = possessorEntities.filter(entity => allowedIds.has(entity.id));
      if (overlap.length >= 2) {
        possessorEntities = overlap;
      }
    }

    if ((!possessorEntities.length || (isPluralPronoun && possessorEntities.length < 2)) &&
        lastPluralPossessors &&
        (match.index - lastPluralPossessors.position) <= 500) {
      possessorEntities = lastPluralPossessors.entities;
    }

    // Aggressive fallback: if still no possessors, look for recent PERSON entities
    if (!possessorEntities.length || (isPluralPronoun && possessorEntities.length < 2)) {
      const recentPersons = findRecentPersons(match.index);
      if (isPluralPronoun) {
        // For "their", need at least 2 persons
        if (recentPersons.length >= 2) {
          possessorEntities = recentPersons.slice(0, 2);
        }
      } else {
        // For "his"/"her", take most recent person
        if (recentPersons.length > 0) {
          possessorEntities = [recentPersons[0]];
        }
      }
    }

    if (!possessorEntities.length) continue;

    if (possessorEntities.length >= 2) {
      lastPluralPossessors = { entities: possessorEntities, position: match.index };
    }

    // Determine predicate based on role
    let predicate: string;
    if (['daughter', 'son', 'child'].includes(roleWord)) {
      predicate = 'parent_of';
    } else if (['parent', 'father', 'mother'].includes(roleWord)) {
      predicate = 'child_of';
    } else if (['wife', 'husband', 'spouse'].includes(roleWord)) {
      predicate = 'married_to';
    } else if (['brother', 'sister'].includes(roleWord)) {
      predicate = 'sibling_of';
    } else {
      continue;
    }

    // Look for entity mentioned shortly after (within 100 chars)
    const afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 100);
    const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/;
    const entityMatch = afterMatch.match(entityPattern);

    if (!entityMatch) continue;
    const targetEntity = matchEntity(entityMatch[1], entities);
    if (!targetEntity || targetEntity.type !== 'PERSON') continue;

    for (const possessorEntity of possessorEntities) {
      if (targetEntity.id === possessorEntity.id) continue;

      // CONTEXT CHECK: For parent_of/child_of, check if surrounding text suggests a marriage
      // This prevents false positives from "He loved her" being interpreted as parent_of
      if ((predicate === 'parent_of' || predicate === 'child_of') && (roleWord === 'daughter' || roleWord === 'son' || roleWord === 'child')) {
        const contextStart = Math.max(0, match.index - 300);
        const contextEnd = Math.min(text.length, match.index + match[0].length + 200);
        const fullContext = text.substring(contextStart, contextEnd);

        // Check for marriage indicators
        const hasMarriageContext = /\b(married|marri|spouse|wife|husband|lover|beloved|romantic|romance|wedding)\b/i.test(fullContext);

        // If marriage context exists and both entities are mentioned in it, skip parent_of/child_of
        if (hasMarriageContext) {
          console.log(`[NARRATIVE] Skipping ${predicate}(${possessorEntity.id}, ${targetEntity.id}) - marriage context detected`);
          continue;
        }
      }

      const evidenceSpan = {
        start: match.index,
        end: match.index + match[0].length + entityMatch[0].length,
        text: match[0] + ' ' + entityMatch[0]
      };

      const relation: Relation = {
        id: uuid(),
        subj: possessorEntity.id,
        pred: predicate as any,
        obj: targetEntity.id,
        evidence: [{
          doc_id: docId,
          span: evidenceSpan,
          sentence_index: getSentenceIndex(text, match.index),
          source: 'RULE' as const
        }],
        confidence: 0.80,
        extractor: 'regex'
      };

      // Create the natural direction only (don't auto-create inverses)
      relations.push(relation);
    }
  }

  // Pattern 3: "X had a daughter/son, Y" → parent_of(X, Y)
  const hadChildPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+)?had\s+a\s+(daughter|son|child)\b/gi;

  while ((match = hadChildPattern.exec(text)) !== null) {
    const parent1Name = match[1];
    const parent2Name = match[2]; // Optional "X and Y had..."
    const roleWord = match[3].toLowerCase();

    const parent1 = matchEntity(parent1Name, entities);
    if (!parent1 || parent1.type !== 'PERSON') continue;

    const parents = [parent1];
    if (parent2Name) {
      const parent2 = matchEntity(parent2Name, entities);
      if (parent2 && parent2.type === 'PERSON') {
        parents.push(parent2);
      }
    }

    const predicate = 'parent_of';

    // Look for child name after the pattern (within 100 chars)
    const afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 100);
    const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/;
    const entityMatch = afterMatch.match(entityPattern);

    if (!entityMatch) continue;
    const childEntity = matchEntity(entityMatch[1], entities);
    if (!childEntity || childEntity.type !== 'PERSON') continue;

    for (const parentEntity of parents) {
      if (childEntity.id === parentEntity.id) continue;

      const evidenceSpan = {
        start: match.index,
        end: match.index + match[0].length + entityMatch[0].length,
        text: match[0] + ' ' + entityMatch[0]
      };

      const relation: Relation = {
        id: uuid(),
        subj: parentEntity.id,
        pred: predicate as any,
        obj: childEntity.id,
        evidence: [{
          doc_id: docId,
          span: evidenceSpan,
          sentence_index: getSentenceIndex(text, match.index),
          source: 'RULE' as const
        }],
        confidence: 0.85,
        extractor: 'regex'
      };

      relations.push(relation);
    }
  }

  return relations;
}

/**
 * Combine all narrative extraction methods
 */
export function extractAllNarrativeRelations(
  text: string,
  entities: EntityLookup[],
  docId: string = 'current',
  corefLinks?: CorefLinks
): Relation[] {
  const narrativeRelations = extractNarrativeRelations(text, entities, docId, corefLinks);
  const possessiveRelations = extractPossessiveFamilyRelations(text, entities, docId, corefLinks);

  return [...narrativeRelations, ...possessiveRelations];
}
