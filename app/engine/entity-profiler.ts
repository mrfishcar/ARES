/**
 * Entity Profiler - Adaptive Learning System
 *
 * Builds profiles of entities that improve over time with more data.
 * The more an entity is described, the easier it is to identify in future text.
 *
 * Profile accumulates:
 * - Descriptors: adjectives and nouns ("powerful wizard", "grey")
 * - Titles: full names and honorifics ("Gandalf the Grey", "Professor McGonagall")
 * - Roles: occupations and functions ("wizard", "teacher", "king")
 * - Attributes: key-value characteristics (color: grey, age: old)
 * - Context sentences: sentences that describe this entity
 * - Mention frequency: how often entity appears
 */

import type { Entity, EntityType } from './schema';
import type { Sentence } from './segment';

/**
 * Entity Profile - accumulates knowledge about an entity
 */
export interface EntityProfile {
  entity_id: string;
  entity_type: EntityType;
  canonical: string;

  // Accumulated descriptors
  descriptors: Set<string>;       // ["wizard", "grey", "old", "powerful"]
  titles: Set<string>;            // ["Gandalf the Grey", "Mithrandir", "The Grey Pilgrim"]
  roles: Set<string>;             // ["wizard", "member of Istari", "guide"]

  // Structured attributes
  attributes: Map<string, Set<string>>;  // color→[grey], age→[old], power→[great]

  // Context and usage
  contexts: string[];             // Full sentences describing this entity
  mention_count: number;          // Total mentions across all documents
  first_seen: string;             // Document ID where first encountered
  last_seen: string;              // Document ID where last seen

  // Confidence scoring
  confidence_score: number;       // 0-1, increases with more data
}

/**
 * Common descriptor words that indicate characteristics
 */
const DESCRIPTOR_WORDS = new Set([
  // Physical
  'tall', 'short', 'old', 'young', 'ancient', 'powerful', 'weak', 'strong',
  'grey', 'white', 'black', 'red', 'blue', 'green', 'golden', 'silver',
  'dark', 'light', 'bright', 'dim',

  // Character
  'wise', 'foolish', 'brave', 'cowardly', 'kind', 'cruel', 'noble', 'evil',
  'good', 'bad', 'great', 'terrible', 'magnificent', 'humble',

  // Status
  'royal', 'noble', 'common', 'legendary', 'famous', 'unknown', 'mighty',
  'powerful', 'weak', 'skilled', 'talented',
]);

/**
 * Role indicators (occupations, functions)
 */
const ROLE_INDICATORS = new Set([
  'wizard', 'mage', 'sorcerer', 'witch', 'warlock',
  'king', 'queen', 'prince', 'princess', 'lord', 'lady', 'duke', 'earl',
  'professor', 'teacher', 'student', 'scholar', 'researcher',
  'scientist', 'inventor', 'engineer',
  'captain', 'commander', 'general', 'soldier', 'warrior',
  'doctor', 'physician', 'healer', 'nurse',
  'merchant', 'trader', 'shopkeeper',
  'guide', 'mentor', 'advisor', 'counselor',
  'leader', 'ruler', 'governor', 'mayor',
  'priest', 'bishop', 'cardinal', 'pope',
  'member', 'founder', 'president', 'chairman',
]);

/**
 * Attribute keywords (for key-value extraction)
 */
const ATTRIBUTE_KEYWORDS = new Map<string, string[]>([
  ['color', ['grey', 'white', 'black', 'red', 'blue', 'green', 'golden', 'silver', 'brown']],
  ['age', ['old', 'young', 'ancient', 'elderly', 'youthful', 'aged']],
  ['power', ['powerful', 'mighty', 'strong', 'weak', 'great']],
  ['size', ['tall', 'short', 'large', 'small', 'giant', 'tiny']],
  ['status', ['royal', 'noble', 'common', 'legendary', 'famous']],
]);

/**
 * Create a new empty profile for an entity
 */
export function createProfile(entity: Entity, documentId: string): EntityProfile {
  return {
    entity_id: entity.id,
    entity_type: entity.type,
    canonical: entity.canonical,
    descriptors: new Set(),
    titles: new Set([entity.canonical]), // Start with canonical name
    roles: new Set(),
    attributes: new Map(),
    contexts: [],
    mention_count: 0,
    first_seen: documentId,
    last_seen: documentId,
    confidence_score: 0.5, // Start with medium confidence
  };
}

/**
 * Extract descriptors from appositive constructions
 * Example: "Gandalf, a powerful wizard" → ["powerful", "wizard"]
 */
function extractAppositiveDescriptors(sentence: string, entityName: string): string[] {
  const descriptors: string[] = [];

  // Pattern: "EntityName, a/an DESCRIPTOR ROLE"
  const appositivePattern = new RegExp(
    `${escapeRegex(entityName)},?\\s+(?:a|an|the)\\s+([^,\\.]+?)(?:,|\\.|who|which|that)`,
    'i'
  );

  const match = sentence.match(appositivePattern);
  if (match) {
    const phrase = match[1].toLowerCase().trim();
    const words = phrase.split(/\s+/);

    // Extract descriptor words
    for (const word of words) {
      if (DESCRIPTOR_WORDS.has(word)) {
        descriptors.push(word);
      }
      if (ROLE_INDICATORS.has(word)) {
        descriptors.push(word);
      }
    }
  }

  return descriptors;
}

/**
 * Extract roles from context
 * Example: "Gandalf the wizard" → ["wizard"]
 */
function extractRolesFromContext(sentence: string, entityName: string): string[] {
  const roles: string[] = [];
  const lowerSentence = sentence.toLowerCase();

  // Check for role indicators in sentence
  for (const role of ROLE_INDICATORS) {
    if (lowerSentence.includes(role)) {
      // Verify it's near the entity name
      const nameIndex = lowerSentence.indexOf(entityName.toLowerCase());
      const roleIndex = lowerSentence.indexOf(role);

      if (nameIndex !== -1 && Math.abs(nameIndex - roleIndex) < 50) {
        roles.push(role);
      }
    }
  }

  return roles;
}

/**
 * Extract attributes from context
 * Example: "the grey wizard" → {color: ["grey"]}
 */
function extractAttributesFromContext(sentence: string): Map<string, Set<string>> {
  const attributes = new Map<string, Set<string>>();
  const lowerSentence = sentence.toLowerCase();

  for (const [attrKey, attrValues] of ATTRIBUTE_KEYWORDS) {
    for (const value of attrValues) {
      if (lowerSentence.includes(value)) {
        if (!attributes.has(attrKey)) {
          attributes.set(attrKey, new Set());
        }
        attributes.get(attrKey)!.add(value);
      }
    }
  }

  return attributes;
}

/**
 * Extract title variations from entity mentions
 * Example: "Gandalf the Grey" → ["Gandalf the Grey", "Gandalf"]
 */
function extractTitles(entityName: string, sentence: string): string[] {
  const titles: string[] = [entityName];

  // Pattern: "EntityName the DESCRIPTOR"
  const titlePattern = new RegExp(
    `(${escapeRegex(entityName)}\\s+the\\s+[A-Z][a-z]+)`,
    'g'
  );

  let match;
  while ((match = titlePattern.exec(sentence)) !== null) {
    titles.push(match[1]);
  }

  return titles;
}

/**
 * Update an entity profile with information from a new mention
 */
export function updateProfile(
  profile: EntityProfile,
  entity: Entity,
  sentence: Sentence,
  documentId: string
): EntityProfile {
  const sentenceText = sentence.text;

  // Extract and add descriptors
  const appositiveDescriptors = extractAppositiveDescriptors(sentenceText, entity.canonical);
  appositiveDescriptors.forEach(d => profile.descriptors.add(d));

  // Extract and add roles
  const roles = extractRolesFromContext(sentenceText, entity.canonical);
  roles.forEach(r => profile.roles.add(r));

  // Extract and add attributes
  const attributes = extractAttributesFromContext(sentenceText);
  for (const [key, values] of attributes) {
    if (!profile.attributes.has(key)) {
      profile.attributes.set(key, new Set());
    }
    values.forEach(v => profile.attributes.get(key)!.add(v));
  }

  // Extract and add titles
  const titles = extractTitles(entity.canonical, sentenceText);
  titles.forEach(t => profile.titles.add(t));

  // Add aliases from entity
  entity.aliases.forEach(alias => profile.titles.add(alias));

  // Add context sentence (limit to 20 most recent)
  profile.contexts.push(sentenceText);
  if (profile.contexts.length > 20) {
    profile.contexts.shift();
  }

  // Update mention count and tracking
  profile.mention_count++;
  profile.last_seen = documentId;

  // Update confidence score (increases with more mentions, caps at 0.95)
  profile.confidence_score = Math.min(0.95, 0.5 + (profile.mention_count * 0.05));

  return profile;
}

/**
 * Build profiles for all entities in a document
 */
export function buildProfiles(
  entities: Entity[],
  entitySpans: Array<{ entity_id: string; start: number; end: number }>,
  sentences: Sentence[],
  documentId: string,
  existingProfiles: Map<string, EntityProfile> = new Map()
): Map<string, EntityProfile> {
  const profiles = new Map(existingProfiles);

  // For each entity span, find the sentence and update profile
  for (const span of entitySpans) {
    const entity = entities.find(e => e.id === span.entity_id);
    if (!entity) continue;

    // Find sentence containing this span
    const sentence = sentences.find(s => span.start >= s.start && span.start < s.end);
    if (!sentence) continue;

    // Get or create profile
    let profile = profiles.get(entity.id);
    if (!profile) {
      profile = createProfile(entity, documentId);
      profiles.set(entity.id, profile);
    }

    // Update profile with this mention
    updateProfile(profile, entity, sentence, documentId);
  }

  return profiles;
}

/**
 * Find entities matching a descriptor query
 * Returns entities ranked by relevance
 */
export function findByDescriptor(
  descriptor: string,
  profiles: Map<string, EntityProfile>,
  entityType?: EntityType
): Array<{ entity_id: string; confidence: number }> {
  const matches: Array<{ entity_id: string; confidence: number }> = [];
  const lowerDescriptor = descriptor.toLowerCase();

  for (const [entityId, profile] of profiles) {
    // Filter by entity type if specified
    if (entityType && profile.entity_type !== entityType) continue;

    let score = 0;

    // Check descriptors (high weight)
    if (profile.descriptors.has(lowerDescriptor)) {
      score += 2.0;
    }

    // Check roles (high weight)
    if (profile.roles.has(lowerDescriptor)) {
      score += 2.0;
    }

    // Check titles (medium weight)
    for (const title of profile.titles) {
      if (title.toLowerCase().includes(lowerDescriptor)) {
        score += 1.5;
        break;
      }
    }

    // Check attributes (medium weight)
    for (const [_, values] of profile.attributes) {
      if (values.has(lowerDescriptor)) {
        score += 1.0;
        break;
      }
    }

    // Boost by mention frequency (more mentions = more confident)
    score *= (1 + Math.log10(profile.mention_count + 1) * 0.2);

    // Apply profile confidence
    score *= profile.confidence_score;

    if (score > 0) {
      matches.push({ entity_id: entityId, confidence: score });
    }
  }

  // Sort by confidence (highest first)
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches;
}

/**
 * Merge two profiles (for alias resolution)
 */
export function mergeProfiles(
  primary: EntityProfile,
  secondary: EntityProfile
): EntityProfile {
  // Merge descriptors
  secondary.descriptors.forEach(d => primary.descriptors.add(d));

  // Merge titles
  secondary.titles.forEach(t => primary.titles.add(t));

  // Merge roles
  secondary.roles.forEach(r => primary.roles.add(r));

  // Merge attributes
  for (const [key, values] of secondary.attributes) {
    if (!primary.attributes.has(key)) {
      primary.attributes.set(key, new Set());
    }
    values.forEach(v => primary.attributes.get(key)!.add(v));
  }

  // Merge contexts (keep most recent 20)
  primary.contexts = [...primary.contexts, ...secondary.contexts].slice(-20);

  // Update counts
  primary.mention_count += secondary.mention_count;

  // Update confidence (average weighted by mention counts)
  const totalMentions = primary.mention_count;
  primary.confidence_score = Math.min(0.95, 0.5 + (totalMentions * 0.05));

  return primary;
}

/**
 * Serialize profiles to JSON (for storage)
 */
export function serializeProfiles(profiles: Map<string, EntityProfile> | any): any {
  const serialized: any = {};

  // Validate input type - handle non-Map types gracefully
  if (!profiles) {
    return {};
  }

  // If it's already a plain object (deserialized JSON), return as-is
  if (typeof profiles === 'object' && !(profiles instanceof Map)) {
    // It's already serialized or is a plain object
    if (Object.keys(profiles).length === 0) {
      return {};
    }
    // Check if it looks like already-serialized profiles
    const firstKey = Object.keys(profiles)[0];
    if (firstKey && profiles[firstKey] && typeof profiles[firstKey] === 'object') {
      return profiles; // Already serialized
    }
    return {}; // Unknown format, return empty
  }

  // It's a Map - serialize it
  for (const [entityId, profile] of profiles) {
    serialized[entityId] = {
      entity_id: profile.entity_id,
      entity_type: profile.entity_type,
      canonical: profile.canonical,
      descriptors: Array.from(profile.descriptors),
      titles: Array.from(profile.titles),
      roles: Array.from(profile.roles),
      attributes: Object.fromEntries(
        (Array.from(profile.attributes.entries()) as [string, Set<string>][]).map(([k, v]) => [k, Array.from(v)])
      ),
      contexts: profile.contexts,
      mention_count: profile.mention_count,
      first_seen: profile.first_seen,
      last_seen: profile.last_seen,
      confidence_score: profile.confidence_score,
    };
  }

  return serialized;
}

/**
 * Deserialize profiles from JSON (for loading)
 */
export function deserializeProfiles(data: any): Map<string, EntityProfile> {
  const profiles = new Map<string, EntityProfile>();

  for (const [entityId, profileData] of Object.entries(data)) {
    const profile: EntityProfile = {
      entity_id: (profileData as any).entity_id,
      entity_type: (profileData as any).entity_type,
      canonical: (profileData as any).canonical,
      descriptors: new Set((profileData as any).descriptors || []),
      titles: new Set((profileData as any).titles || []),
      roles: new Set((profileData as any).roles || []),
      attributes: new Map(
        Object.entries((profileData as any).attributes || {}).map(([k, v]) => [k, new Set(v as string[])])
      ),
      contexts: (profileData as any).contexts || [],
      mention_count: (profileData as any).mention_count || 0,
      first_seen: (profileData as any).first_seen || '',
      last_seen: (profileData as any).last_seen || '',
      confidence_score: (profileData as any).confidence_score || 0.5,
    };

    profiles.set(entityId, profile);
  }

  return profiles;
}

/**
 * Helper: Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
