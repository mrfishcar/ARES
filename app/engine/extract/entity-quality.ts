/**
 * Entity Quality Pass
 *
 * Improves entity name quality and typing before relation scoring:
 * 1. Name splitter: handles initials, suffixes (Jr., III), hyphenated surnames
 * 2. Whitespace/quote normalization
 * 3. Type heuristics: PERSON/ORG/LOC fallback rules with capitalization + gazetteer
 * 4. spaCy backstop when available
 */

import type { Entity, EntityType } from '../schema';
import { guessTypeForJrName, type EntityTypeGuess } from '../linguistics/jr-disambiguation';
import { nameContainsOrgOrPlaceKeyword } from '../linguistics/context-signals';
import {
  looksLikePersonName,
  type NounPhraseContext
} from '../linguistics/common-noun-filters';
import { isAttachedOnlyFragment, type TokenStats } from '../linguistics/token-stats';
import type { PlaceEvidence } from '../linguistics/school-names';

// Common suffixes that should be preserved
const NAME_SUFFIXES = new Set([
  'Jr', 'Jr.', 'Sr', 'Sr.', 'II', 'III', 'IV', 'V', 'VI',
  'Esq', 'Esq.', 'MD', 'M.D.', 'PhD', 'Ph.D.', 'DDS', 'D.D.S.'
]);

// Common person titles and honorifics
const PERSON_TITLES = new Set([
  'Mr', 'Mr.', 'Mrs', 'Mrs.', 'Ms', 'Ms.', 'Miss', 'Dr', 'Dr.',
  'Prof', 'Prof.', 'Professor', 'Sir', 'Lord', 'Lady', 'Duke', 'Duchess',
  'King', 'Queen', 'Prince', 'Princess', 'Emperor', 'Empress',
  'President', 'Senator', 'Judge', 'Justice', 'Chief', 'Captain',
  'Major', 'General', 'Colonel', 'Admiral', 'Lieutenant', 'Sergeant'
]);

// Organization keywords
const ORG_KEYWORDS = new Set([
  'University', 'College', 'Institute', 'Academy', 'School',
  'Company', 'Corp', 'Corp.', 'Corporation', 'Inc', 'Inc.',
  'LLC', 'Ltd', 'Ltd.', 'Limited', 'Group', 'Holdings',
  'Bank', 'Capital', 'Partners', 'Associates', 'Ventures',
  'Technologies', 'Systems', 'Solutions', 'Consulting',
  'Ministry', 'Department', 'Office', 'Bureau', 'Agency',
  'Foundation', 'Institute', 'Society', 'Association',
  'Hospital', 'Clinic', 'Medical', 'Health', 'Care',
  'Museum', 'Library', 'Center', 'Centre'
]);

// Location keywords
const LOCATION_KEYWORDS = new Set([
  'City', 'Town', 'Village', 'County', 'State', 'Province',
  'Country', 'Kingdom', 'Empire', 'Republic', 'Federation',
  'Island', 'Islands', 'Peninsula', 'Continent',
  'Mountain', 'Mountains', 'River', 'Lake', 'Sea', 'Ocean',
  'Valley', 'Forest', 'Desert', 'Plains', 'Hills',
  'Street', 'Avenue', 'Road', 'Boulevard', 'Drive', 'Lane',
  'Park', 'Square', 'Plaza', 'Gardens', 'Tower', 'Building'
]);

// Common location names (gazetteer stub)
const KNOWN_LOCATIONS = new Set([
  'Paris', 'London', 'Rome', 'Berlin', 'Madrid', 'Tokyo', 'Beijing', 'Moscow',
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
  'France', 'England', 'Germany', 'Spain', 'Italy', 'China', 'Japan', 'Russia',
  'United States', 'USA', 'UK', 'United Kingdom', 'America',
  'Europe', 'Asia', 'Africa', 'North America', 'South America', 'Australia',
  'California', 'Texas', 'Florida', 'New York', 'Pennsylvania', 'Illinois',
  'Thames', 'Seine', 'Nile', 'Amazon', 'Mississippi', 'Danube',
  'Alps', 'Rockies', 'Himalayas', 'Andes', 'Pyrenees',
  'Cambridge', 'Oxford', 'Harvard', 'Stanford', 'MIT', 'Yale', 'Princeton',
  'Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island',
  'Washington', 'Boston', 'Seattle', 'San Francisco', 'Portland',
  'Atlantic', 'Pacific', 'Indian Ocean', 'Mediterranean', 'Caribbean'
]);

// Common organization names (gazetteer stub)
const KNOWN_ORGS = new Set([
  'Google', 'Microsoft', 'Apple', 'Amazon', 'Facebook', 'Meta',
  'IBM', 'Intel', 'Oracle', 'Cisco', 'HP', 'Dell', 'Sony', 'Samsung',
  'NASA', 'FBI', 'CIA', 'NSA', 'Pentagon', 'White House',
  'UN', 'NATO', 'WHO', 'IMF', 'World Bank', 'Red Cross',
  'Congress', 'Senate', 'Parliament', 'Supreme Court'
]);

/**
 * Normalize entity name - handle initials, suffixes, whitespace, quotes
 */
export function normalizeEntityName(name: string): string {
  if (!name) return '';

  // Collapse multiple whitespace into single space
  let normalized = name.replace(/\s+/g, ' ').trim();

  // Remove leading/trailing quotes and punctuation
  normalized = normalized.replace(/^["""''`']+/, '');
  normalized = normalized.replace(/["""''`']+$/, '');
  normalized = normalized.replace(/^[\-\u2013\u2014]+/, '');
  normalized = normalized.replace(/[\-\u2013\u2014]+$/, '');

  // Remove trailing punctuation except for suffixes
  normalized = normalized.replace(/[,;:!?]+$/g, '');

  // Remove possessive 's at the end
  normalized = normalized.replace(/['']s$/i, '');

  // Normalize internal quotes (replace fancy quotes with straight quotes)
  normalized = normalized.replace(/[""]/g, '"');
  normalized = normalized.replace(/['']/g, "'");

  // Handle initials: ensure space after period (e.g., "J.K.Rowling" -> "J. K. Rowling")
  normalized = normalized.replace(/\.([A-Z])/g, '. $1');

  // Preserve recognized suffixes
  const words = normalized.split(/\s+/);
  const lastWord = words[words.length - 1];

  // Check if last word is a suffix and ensure it has proper formatting
  if (NAME_SUFFIXES.has(lastWord) || NAME_SUFFIXES.has(lastWord + '.')) {
    // Keep suffix as-is
  } else {
    // Remove trailing period from last word if it's not a suffix or initial
    if (words.length > 0 && words[words.length - 1].endsWith('.') && words[words.length - 1].length > 2) {
      words[words.length - 1] = words[words.length - 1].replace(/\.$/, '');
    }
  }

  normalized = words.join(' ');

  // Remove articles at the beginning (except for specific cases like "The Hague")
  normalized = normalized.replace(/^(the|a|an)\s+/i, '');

  // Remove "House" and "family" suffixes common in fiction
  normalized = normalized.replace(/\s+(family|house)$/i, '').trim();

  // Collapse any remaining multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Split compound names with hyphens (e.g., "Jean-Paul Sartre")
 * Returns array of name parts
 */
export function splitHyphenatedName(name: string): string[] {
  // Keep hyphenated surnames together but split on spaces
  const parts = name.split(/\s+/);

  // Check if any part contains hyphens
  const hasHyphens = parts.some(p => p.includes('-'));

  if (!hasHyphens) {
    return parts;
  }

  // Preserve hyphenated components as single units
  return parts;
}

/**
 * Extract suffix from name if present
 */
export function extractSuffix(name: string): { baseName: string; suffix: string | null } {
  const words = name.split(/\s+/);

  if (words.length < 2) {
    return { baseName: name, suffix: null };
  }

  const lastWord = words[words.length - 1];

  // Check if last word is a recognized suffix
  if (NAME_SUFFIXES.has(lastWord) || NAME_SUFFIXES.has(lastWord.replace('.', ''))) {
    return {
      baseName: words.slice(0, -1).join(' '),
      suffix: lastWord
    };
  }

  return { baseName: name, suffix: null };
}

const JR_SUFFIX_RE = /^(jr\.?|junior)$/i;

export type EntityTypeDecision = EntityType | 'UNKNOWN' | 'GPE';

export interface EntityClassificationInput {
  canonicalName: string;
  nerLabel?: EntityTypeDecision | 'LOC';
  tokenStats?: TokenStats;
  npContext?: NounPhraseContext;
  surroundingTokens?: string[];
  placeEvidenceByName?: Map<string, PlaceEvidence>;
}

function normalizeNerLabel(label?: EntityClassificationInput['nerLabel']): EntityTypeDecision {
  if (!label) return 'UNKNOWN';
  if (label === 'LOC') return 'PLACE';
  return label;
}

/**
 * Classify entity type using a simple decision tree.
 */
export function classifyEntityType({
  canonicalName,
  nerLabel,
  tokenStats,
  npContext,
  surroundingTokens = [],
  placeEvidenceByName,
}: EntityClassificationInput): EntityTypeDecision {
  const tokens = canonicalName.split(/\s+/).filter(Boolean);
  const lastToken = tokens[tokens.length - 1]?.toLowerCase();
  const nerType = normalizeNerLabel(nerLabel);

  // 1) Jr / Junior disambiguation
  if (lastToken && JR_SUFFIX_RE.test(lastToken) && tokens.length >= 2) {
    const rootName = tokens.slice(0, -1).join(' ').toLowerCase();
    const placeEvidenceForRoot = placeEvidenceByName?.get(rootName);

    const jrGuess: EntityTypeGuess = guessTypeForJrName({
      fullName: canonicalName,
      tokens,
      surroundingTokens,
      placeEvidenceForRoot,
    });

    if (jrGuess === 'PERSON' || jrGuess === 'ORG') {
      return jrGuess;
    }
  }

  // 2) Org/place keyword cues
  const { hasOrg, hasPlace } = nameContainsOrgOrPlaceKeyword(canonicalName);
  let type: EntityTypeDecision = 'UNKNOWN';
  if (hasOrg) {
    type = 'ORG';
  } else if (hasPlace) {
    type = 'PLACE';
  }

  // 3) NER label as a soft prior
  if (type === 'UNKNOWN' && nerType !== 'UNKNOWN') {
    type = nerType;
  }

  // 4) Attached-only fragment suppression
  if (tokens.length === 1 && tokenStats && isAttachedOnlyFragment(tokenStats, tokens[0])) {
    return 'UNKNOWN';
  }

  // 5) PERSON heuristics
  const shouldCheckPerson =
    type === 'PERSON' || (type === 'UNKNOWN' && nerType === 'PERSON');
  if (shouldCheckPerson) {
    const personLike =
      npContext && tokenStats ? looksLikePersonName(npContext, tokenStats) : true;
    if (!personLike) {
      return 'UNKNOWN';
    }
    return 'PERSON';
  }

  // 6) Finalize ORG / PLACE / GPE
  if (type === 'ORG') return 'ORG';
  if (type === 'PLACE' || type === 'GPE') return type;

  // 7) Fallback
  if (type === 'UNKNOWN' && nerType === 'PERSON') {
    return 'PERSON';
  }
  if (type === 'UNKNOWN' && (nerType === 'ORG' || nerType === 'GPE' || nerType === 'PLACE')) {
    return nerType;
  }

  return 'UNKNOWN';
}

/**
 * Apply entity quality improvements to a single entity
 */
export function improveEntityQuality(entity: Entity, context?: string): Entity {
  // 1. Normalize the canonical name
  const normalizedCanonical = normalizeEntityName(entity.canonical);

  // 2. Extract suffix if present
  const { baseName, suffix } = extractSuffix(normalizedCanonical);

  // 3. Reclassify type if needed (only if current type seems wrong)
  let improvedType = entity.type;

  // If entity type is uncertain or clearly wrong, reclassify
  const surroundingTokens = context ? context.split(/\s+/).filter(Boolean) : [];
  const classifiedType = classifyEntityType({
    canonicalName: normalizedCanonical,
    nerLabel: entity.attrs?.nerLabel as EntityTypeDecision | 'LOC' | undefined,
    surroundingTokens,
  });

  // Use the classified type if:
  // - Current type is generic/uncertain
  // - Classified type has high confidence (matched gazetteer or has strong keywords)
  const hasStrongTypeSignal =
    KNOWN_LOCATIONS.has(normalizedCanonical) ||
    KNOWN_ORGS.has(normalizedCanonical) ||
    normalizedCanonical.split(/\s+/).some(w =>
      ORG_KEYWORDS.has(w) || LOCATION_KEYWORDS.has(w) || PERSON_TITLES.has(w)
    );

  if (hasStrongTypeSignal || !entity.type) {
    if (classifiedType !== 'UNKNOWN') {
      improvedType = classifiedType === 'GPE' ? 'PLACE' : classifiedType;
    }
  }

  // 4. Normalize aliases
  const normalizedAliases = entity.aliases
    .map(alias => normalizeEntityName(alias))
    .filter(alias => alias && alias !== normalizedCanonical); // Remove empty and duplicates of canonical

  // 5. Store suffix in metadata if found
  const meta = entity.meta || {};
  if (suffix) {
    meta.nameSuffix = suffix;
  }

  return {
    ...entity,
    canonical: normalizedCanonical,
    type: improvedType,
    aliases: [...new Set([...normalizedAliases, normalizedCanonical])], // Ensure canonical is in aliases
    meta
  };
}

/**
 * Batch process entities for quality improvements
 */
export function improveEntitiesQuality(entities: Entity[], contexts?: Map<string, string>): Entity[] {
  return entities.map(entity => {
    const context = contexts?.get(entity.id);
    return improveEntityQuality(entity, context);
  });
}

/**
 * Get type confidence score (0-1) based on available signals
 */
export function getTypeConfidence(entity: Entity): number {
  const name = entity.canonical;
  const type = entity.type;

  let confidence = 0.5; // Base confidence

  // High confidence if in gazetteer
  if (KNOWN_LOCATIONS.has(name) && type === 'PLACE') confidence = 0.95;
  if (KNOWN_ORGS.has(name) && type === 'ORG') confidence = 0.95;

  // Medium-high if has strong keywords
  const words = name.split(/\s+/);
  const hasOrgKeyword = words.some(w => ORG_KEYWORDS.has(w));
  const hasLocKeyword = words.some(w => LOCATION_KEYWORDS.has(w));
  const hasPersonTitle = words.some(w => PERSON_TITLES.has(w));

  if (hasOrgKeyword && type === 'ORG') confidence = 0.85;
  if (hasLocKeyword && type === 'PLACE') confidence = 0.85;
  if (hasPersonTitle && type === 'PERSON') confidence = 0.85;

  // Medium if has suffix
  if (entity.meta?.nameSuffix && type === 'PERSON') confidence = 0.75;

  // Lower if no strong signals
  if (!hasOrgKeyword && !hasLocKeyword && !hasPersonTitle && !entity.meta?.nameSuffix) {
    confidence = 0.6;
  }

  return confidence;
}

export default {
  normalizeEntityName,
  splitHyphenatedName,
  extractSuffix,
  classifyEntityType,
  improveEntityQuality,
  improveEntitiesQuality,
  getTypeConfidence
};
