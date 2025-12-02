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
import { guessTypeForJrName } from '../linguistics/jr-disambiguation';

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

/**
 * Classify entity type using heuristics
 * Priority: Jr disambiguation > gazetteer > title/keywords > capitalization patterns > default
 */
export function classifyEntityType(name: string, context?: string): EntityType {
  const normalized = normalizeEntityName(name);
  const words = normalized.split(/\s+/);
  const firstWord = words[0] || '';
  const lastWord = words[words.length - 1] || '';

  // 0. Jr/Junior disambiguation (JR-1, JR-2)
  // Handle ambiguous "X Y Jr" patterns before other heuristics
  const looksLikeJr = /^(jr\.?|junior)$/i.test(lastWord);
  if (looksLikeJr && words.length >= 2) {
    const rootTokens = words.slice(0, -1);
    const rootName = rootTokens.join(' ');

    // Extract surrounding context for school/place indicators
    const surroundingTokens = context ? context.split(/\s+/).filter(Boolean) : [];

    // Simple place evidence: check if context has location prepositions
    const hasLocationPrep = context ? /\b(in|from|at|to|near)\s+/i.test(context) : false;

    const jrGuess = guessTypeForJrName({
      fullName: name,
      tokens: words,
      surroundingTokens,
      placeEvidenceForRoot: hasLocationPrep ? {
        usedWithLocationPreposition: true,
        standAlonePlaceCount: hasLocationPrep ? 1 : 0
      } : undefined,
      rootIsKnownPlace: KNOWN_LOCATIONS.has(rootName.toLowerCase()),
    });

    if (jrGuess === 'PERSON') {
      return 'PERSON';
    } else if (jrGuess === 'ORG') {
      return 'ORG';
    }
    // If UNKNOWN, fall through to other heuristics
  }

  // 1. Check gazetteer (known entities)
  if (KNOWN_LOCATIONS.has(normalized)) {
    return 'PLACE';
  }

  if (KNOWN_ORGS.has(normalized)) {
    return 'ORG';
  }

  // 2. Check for title/honorific indicators
  if (PERSON_TITLES.has(firstWord)) {
    return 'PERSON';
  }

  // 3. Check for organization keywords
  if (words.some(w => ORG_KEYWORDS.has(w))) {
    return 'ORG';
  }

  // 4. Check for location keywords
  if (words.some(w => LOCATION_KEYWORDS.has(w))) {
    return 'PLACE';
  }

  // 5. Check for name suffixes (strong person indicator)
  if (NAME_SUFFIXES.has(lastWord) || NAME_SUFFIXES.has(lastWord.replace('.', ''))) {
    return 'PERSON';
  }

  // 6. Capitalization patterns
  const allWordsCapitalized = words.every(w => /^[A-Z]/.test(w));

  if (allWordsCapitalized) {
    // All caps could be PERSON or PLACE
    // Use length as heuristic: single word more likely PLACE, multi-word more likely PERSON
    if (words.length === 1) {
      // Single capitalized word - could be city/country or last name
      // Check if it ends with common location suffixes
      if (/(?:ville|town|city|land|burg|shire|ford|port|field)$/i.test(normalized)) {
        return 'PLACE';
      }
      // Default to PERSON for single capitalized words (more common)
      return 'PERSON';
    } else if (words.length === 2) {
      // Two words - likely person name (first + last)
      return 'PERSON';
    } else if (words.length >= 3) {
      // Three+ words - could be person (with middle name) or place (like "New York City")
      // Check for "of" which suggests place or org
      if (words.includes('of')) {
        return 'PLACE';
      }
      return 'PERSON';
    }
  }

  // 7. Context-based hints (if context provided)
  if (context) {
    const lowerContext = context.toLowerCase();

    // Person indicators
    if (/\b(he|she|his|her|him|who|born|died|married|father|mother|son|daughter|brother|sister)\b/.test(lowerContext)) {
      return 'PERSON';
    }

    // Location indicators
    if (/\b(in|at|from|to|near|located|situated|city|town|country|capital)\b/.test(lowerContext)) {
      return 'PLACE';
    }

    // Organization indicators
    if (/\b(company|corporation|founded|headquarters|employees|works for|employed by)\b/.test(lowerContext)) {
      return 'ORG';
    }
  }

  // 8. Default fallback: if starts with capital, assume PERSON
  if (/^[A-Z]/.test(normalized)) {
    return 'PERSON';
  }

  // Last resort: return PERSON as most conservative default
  return 'PERSON';
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
  const classifiedType = classifyEntityType(normalizedCanonical, context);

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
    improvedType = classifiedType;
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
