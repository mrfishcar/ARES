import { getParserClient } from "../parser";

/**
 * Entity Highlighter - Sprint W2
 * Real-time entity detection with pattern matching and natural language processing
 */

export type EntityType = 'PERSON' | 'PLACE' | 'ORG' | 'EVENT' | 'CONCEPT' | 'OBJECT';

export interface EntitySpan {
  start: number;
  end: number;
  text: string;
  displayText?: string; // Clean display text (for tags, just the entity name)
  canonicalName?: string; // Optional canonical reference (S6 recall boosts)
  type: EntityType;
  confidence: number;
  source: 'tag' | 'natural'; // tag = [[Entity: Name]], natural = detected pattern
}

export interface HighlightConfig {
  maxHighlights?: number;
  minConfidence?: number;
  enableNaturalDetection?: boolean;
  project?: string; // S3: Project name for alias pass
  enableAliasPass?: boolean; // S3: Enable Pass 0 (alias lookup)
  enableLLM?: boolean; // Dual approach: use small LLM for enhanced detection
  llmMode?: 'hybrid' | 'llm-only' | 'algorithm-only'; // Detection strategy
}

const DEFAULT_CONFIG = {
  maxHighlights: 1000,
  minConfidence: 0.55, // S6: Lowered for narrative/scripture recall
  enableNaturalDetection: true,
  project: undefined as string | undefined, // S3: No default project
  enableAliasPass: true, // S3: Alias pass enabled by default
  enableLLM: false, // Dual approach: disabled by default (opt-in)
  llmMode: 'hybrid' as 'hybrid' | 'llm-only' | 'algorithm-only', // Best of both worlds
};

// S2 constants staged for future implementation (commented out to avoid unused variable warnings)
// Uncomment when implementing full S2 features
/*
const MOTION_VERBS = new Set(['go', 'goes', 'going', 'went', 'gone', ...]);
const COMM_TRANSFER_VERBS = new Set(['speak', 'spoke', 'speaking', ...]);
const PERSON_TRANSFER_NOUNS = new Set(['letter', 'message', 'gift', ...]);
const PLACE_PATH_NOUNS = new Set(['road', 'path', 'bridge', ...]);
const TRIM_PREPOSITIONS = new Set(['on', 'in', 'at', ...]);
const TRIM_ARTICLES = new Set(['the', 'a', 'an']);
const TITLE_INDICATORS = new Set(['Fellowship', 'Council', 'Ring', ...]);
*/

/**
 * Unicode-aware uppercase/lowercase character classes
 * Supports common European and fantasy name characters (Lothlórien, Éowyn, etc.)
 */
// Define character classes for Unicode-aware name matching
// Uppercase (Latin + Cyrillic): [A-ZÀ-ÖØ-ÞА-ЯЁ]
// Lowercase (Latin + Cyrillic): [a-zà-öø-ÿа-яё]
const WORD = '(?:[A-ZÀ-ÖØ-ÞА-ЯЁ][a-zà-öø-ÿа-яё]*(?:\'[a-zà-öø-ÿа-яё]+)?)';

/**
 * Pronouns to exclude from entity detection
 */
const PRONOUNS = new Set([
  'he', 'she', 'it', 'they', 'we', 'i', 'you',
  'him', 'her', 'them', 'us', 'me',
  'his', 'hers', 'its', 'their', 'our', 'my', 'your',
  'himself', 'herself', 'itself', 'themselves', 'ourselves', 'myself', 'yourself',
  'this', 'that', 'these', 'those',
]);

/**
 * Common descriptors/ethnicities that shouldn't be standalone entities
 */
const DESCRIPTORS = new Set([
  'hittite', 'canaanite', 'philistine', 'egyptian', 'assyrian',
  'babylonian', 'persian', 'greek', 'roman', 'israelite',
  'jewish', 'christian', 'muslim', 'buddhist', 'hindu',
]);

/**
 * Entity patterns for natural language detection
 */
const ENTITY_PATTERNS = {
  // Person patterns: capitalized names, single-word names in appositive contexts, honorifics, and verb-preceded names
  PERSON: [
    new RegExp(`\\b(${WORD}(?:\\s+${WORD}){0,2})\\b`, 'g'), // multi-word names: "John Smith", "Mary Jane Watson", and single names: "Aragorn"
    // Single-word name followed by comma or appositive/possessive context: "Aragorn, son of Arathorn"
    new RegExp(`\\b(${WORD})(?=\\s*(?:,|son\\s+of|daughter\\s+of|,\\s+the|,\\s+son|the\\s+king|the\\s+queen|the\\s+warrior))`, 'gi'),
    // Verbs preceding a name: "married Arwen", "traveled Gandalf" (common narrative cases)
    new RegExp(`(?:married|wed|met|visited|traveled|went|joined|saw|met\\s+with|called|named|known\\s+as)\\s+(${WORD}(?:\\s+${WORD})?)`, 'gi'),
    // Honorifics: "Dr. Watson"
    new RegExp(`(?:Mr\\.|Mrs\\.|Ms\\.|Dr\\.|Prof\\.|Lord|Lady|King|Queen|Prince|Princess)\\s+(${WORD}(?:\\s+${WORD})?)`, 'g'),
  ],

  // Place patterns: Location indicators
  PLACE: [
    new RegExp(`\\b(?:in|at|from|to|near)\\s+(${WORD}(?:\\s+${WORD})?)\\b`, 'g'), // "in London", "at Lothlórien"
    new RegExp(`\\b(${WORD})\\s+(?:City|Town|Village|Kingdom|Mountain|River|Forest)\\b`, 'g'), // "Gondor Kingdom"
  ],

  // Organization patterns
  ORG: [
    new RegExp(`\\b(${WORD}(?:\\s+${WORD})?)\\s+(?:Inc\\.|Corp\\.|Ltd\\.|LLC|Company|Organization)\\b`, 'g'),
    new RegExp(`\\bThe\\s+(${WORD}(?:\\s+${WORD})?)\\b`, 'g'), // "The Fellowship"
  ],

  // Event patterns: Battle of X, War of Y
  EVENT: [
    new RegExp(`\\b(?:Battle|War|Quest|Siege|Council)\\s+of\\s+(${WORD}(?:\\s+${WORD})?)\\b`, 'g'),
  ],

  // Date patterns (treated as events)
  DATE: [
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/g,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
  ],
};

/**
 * Explicit tag pattern: [[Entity: Name]] or [[NewEntity: Name|type=TYPE]]
 */
const TAG_PATTERN = /\[\[(?:Entity|NewEntity):\s*([^\]|]+)(?:\|type=([A-Z]+))?\]\]/g;

/**
 * Instagram-style hashtag patterns (#Name:TYPE or #[Multi Word Name]:TYPE)
 * Examples:
 * - #Barty:PERSON
 * - #[King David]:PERSON
 * - #Middle_Earth:PLACE
 * Unicode-aware: supports #Lothlórien, #Éowyn, etc.
 */
const HASHTAG_PATTERNS = [
  // Complete tag formats (match these first)
  /#\[([^\]]+)\]:([A-Z]+)/g,                                      // #[Multi Word]:TYPE
  new RegExp(`#(${WORD}(?:_${WORD})*):([A-Z]+)`, 'g'),          // #Word:TYPE or #Word_Word:TYPE
  
  // Partial tags (in progress)
  /#\[([^\]]+)\](?!:)/g,                                         // #[Multi Word] without type yet
  new RegExp(`#(${WORD}(?:_${WORD})*)(?!:)(?=[\\s.,!?;\\n])`, 'g'), // #Word without type yet
  
  // Natural language detection
  new RegExp(`\\b(${WORD}(?:\\s+${WORD}){1,2})\\b(?!:)`, 'g'),  // "King David" -> #[King David]:PERSON
  
  // Title detection patterns
  new RegExp(`\\b((?:King|Queen|Prophet|Lord|Lady|Prince|Princess|Professor|Doctor|Sir)\\s+${WORD}(?:\\s+${WORD})?)\\b(?!:)`, 'g')
];

/**
 * Previous parse result for incremental parsing
 */
let previousText = '';
let parseCache = new Map<string, EntitySpan[]>();

/**
 * Infer entity type from context
 */
function inferTypeFromContext(name: string, text: string, position: number): EntityType {
  // Get context window (30 chars before and after)
  const before = text.slice(Math.max(0, position - 30), position);
  const after = text.slice(position + name.length, position + name.length + 30);
  
  // Check for title patterns indicating PERSON
  if (/\b(King|Queen|Prophet|Lord|Lady|Prince|Princess|Professor|Doctor|Sir)\s+$/i.test(before)) {
    return 'PERSON';
  }
  
  // Check for verbs indicating PERSON
  if (/\b(said|spoke|went|called|married)\s+$/i.test(before)) {
    return 'PERSON';
  }
  
  // Check for place indicators
  if (/\b(in|at|to|from|near)\s+$/i.test(before) || 
      /\b(Kingdom|Mountain|River|Forest|City)\b/i.test(after)) {
    return 'PLACE';
  }
  
  // Check for organization indicators
  if (/\b(The)\s+$/i.test(before) &&
      /\b(Fellowship|Council|Order|Company)\b/i.test(name)) {
    return 'ORG';
  }
  
  // Default to PERSON for capitalized names (most common in narrative)
  return 'PERSON';
}

/**
 * Detect entity tags (explicit [[Entity: Name]] syntax)
 */
function detectTags(text: string): EntitySpan[] {
  const spans: EntitySpan[] = [];
  const regex = new RegExp(TAG_PATTERN.source, 'g');

  let match;
  while ((match = regex.exec(text)) !== null) {
    const [fullMatch, entityName, typeHint] = match;
    const type: EntityType = (typeHint as EntityType) || 'CONCEPT';

    spans.push({
      start: match.index,
      end: match.index + fullMatch.length,
      text: fullMatch,
      displayText: entityName.trim(), // Clean name for display
      type,
      confidence: 1.0, // Tags are explicit, so confidence is 100%
      source: 'tag',
    });
  }

  return spans;
}

/**
 * Detect hashtag entities (#Entity, #Entity_Name, #[Entity Name], #Entity:TYPE)
 */
function detectHashtags(text: string): EntitySpan[] {
  const spans: EntitySpan[] = [];

  for (const pattern of HASHTAG_PATTERNS) {
    const regex = new RegExp(pattern.source, 'g');
    let match;

    while ((match = regex.exec(text)) !== null) {
      const fullMatch = match[0];

      // Extract entity name and type based on pattern
      let entityName: string;
      let typeHint: string | undefined;

      if (fullMatch.startsWith('#[')) {
        // Bracket format: #[Name]:TYPE or just #[Name]
        const bracketMatch = fullMatch.match(/#\[([^\]]+)\](?::([A-Z]+))?/);
        if (bracketMatch) {
          entityName = bracketMatch[1];
          typeHint = bracketMatch[2];
        } else {
          continue;
        }
      } else if (fullMatch.startsWith('#')) {
        // Word format: #Name:TYPE or just #Name
        const wordMatch = fullMatch.match(/#([A-Z][A-Za-z0-9_]+)(?::([A-Z]+))?/);
        if (wordMatch) {
          entityName = wordMatch[1];
          typeHint = wordMatch[2];
        } else {
          continue;
        }
      } else {
        // Natural language pattern matched
        entityName = match[1].trim();
        typeHint = inferTypeFromContext(entityName, text, match.index);
      }

      // Skip if this looks like a markdown heading
      if (match.index > 0 && text[match.index - 1] === '\n' && entityName.startsWith(' ')) {
        continue;
      }

      // Clean up the entity name
      let cleanName = entityName.trim();
      // Convert underscores to spaces for display
      const displayName = cleanName.replace(/_/g, ' ');

      // Determine type
      let type: EntityType;
      if (typeHint) {
        type = typeHint as EntityType;
      } else {
        // Smart detection based on name patterns
        type = 'CONCEPT'; // Default
        if (/^(?:Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+/.test(displayName) || displayName.split(/\s+/).length >= 2) {
          type = 'PERSON';
        }
      }

      spans.push({
        start: match.index,
        end: match.index + fullMatch.length,
        text: fullMatch,
        displayText: displayName, // Clean name with spaces
        type,
        confidence: 1.0, // Hashtags are explicit
        source: 'tag',
      });
    }
  }

  return spans;
}

/**
 * Detect natural language entities using pattern matching
 */
function detectNaturalEntities(text: string, minConfidence: number): EntitySpan[] {
  const spans: EntitySpan[] = [];
  const seenSpans = new Set<string>(); // Deduplicate overlapping spans

  // Try each entity type pattern
  for (const [type, patterns] of Object.entries(ENTITY_PATTERNS)) {
    for (const pattern of patterns) {
  const regex = new RegExp(pattern.source, 'g');
      let match;

      while ((match = regex.exec(text)) !== null) {
          // Extract captured group (entity name) if present
          const captured = match[1] || match[0];
          const fullMatch = match[0];

          // Determine the start/end for the captured group within the full match
          const groupOffset = fullMatch.indexOf(captured);
          if (groupOffset < 0) {
            // Captured group not found in match, skip this match
            continue;
          }
          const start = match.index + groupOffset;
          const end = start + captured.length;

        // Skip if already detected
        const key = `${start}-${end}`;
        if (seenSpans.has(key)) {
          continue;
        }

        // Filter out pronouns (he, she, it, they, etc.)
        const lowerCaptured = captured.toLowerCase().trim();
        if (PRONOUNS.has(lowerCaptured)) {
          continue;
        }

        // Filter out standalone descriptors (Hittite, Egyptian, etc.)
        if (DESCRIPTORS.has(lowerCaptured)) {
          continue;
        }

        // Filter out single-letter captures
        if (captured.length === 1) {
          continue;
        }

        // Calculate confidence based on pattern and context
          let confidence = calculateConfidence(captured, type as EntityType, text, start);

        if (confidence >= minConfidence) {
          spans.push({
            start,
            end,
              text: captured,
            type: type === 'DATE' ? 'EVENT' : (type as EntityType),
            confidence,
            source: 'natural',
          });
          seenSpans.add(key);
        }
      }
    }
  }

  return spans;
}

/**
 * S6: Alias packs - domain-specific synonym sets for improved entity recall
 * Maps common aliases to canonical entity names
 */
const ALIAS_PACKS: Record<string, { canonical: string; type: EntityType }> = {
  // Scripture/religious aliases
  'lord': { canonical: 'God', type: 'PERSON' },
  'messiah': { canonical: 'Jesus', type: 'PERSON' },
  'christ': { canonical: 'Jesus', type: 'PERSON' },
  'savior': { canonical: 'Jesus', type: 'PERSON' },
  'son of god': { canonical: 'Jesus', type: 'PERSON' },
  'son of man': { canonical: 'Jesus', type: 'PERSON' },
  'king of kings': { canonical: 'Jesus', type: 'PERSON' },
  'lamb of god': { canonical: 'Jesus', type: 'PERSON' },

  // Fantasy/narrative aliases
  'grey pilgrim': { canonical: 'Gandalf', type: 'PERSON' },
  'mithrandir': { canonical: 'Gandalf', type: 'PERSON' },
  'white wizard': { canonical: 'Gandalf', type: 'PERSON' },
  'strider': { canonical: 'Aragorn', type: 'PERSON' },
  'elessar': { canonical: 'Aragorn', type: 'PERSON' },
};

/**
 * S6: Event seed patterns - detect common narrative events
 */
const EVENT_SEEDS = new Set([
  'decree', 'census', 'birth', 'death', 'resurrection', 'ascension',
  'baptism', 'transfiguration', 'crucifixion', 'annunciation',
  'visitation', 'presentation', 'passover', 'pentecost',
  'wedding', 'feast', 'celebration', 'announcement',
]);

/**
 * S6: Group/collective nouns - detect group entities
 */
const GROUP_NOUNS = new Set([
  'shepherds', 'magi', 'wise men', 'disciples', 'apostles',
  'pharisees', 'sadducees', 'scribes', 'elders', 'priests',
  'angels', 'heavenly host', 'multitude', 'crowd', 'people',
  'fellowship', 'company', 'council', 'assembly', 'congregation',
]);

/**
 * S7: Agency detection - verbs that indicate volition/intentional action
 */
const AGENCY_VERBS = new Set([
  'said', 'spoke', 'warned', 'appeared', 'told', 'delivered',
  'commanded', 'announced', 'declared', 'proclaimed', 'replied',
  'asked', 'answered', 'instructed', 'guided', 'led',
]);

/**
 * S7: Detect if an entity is exercising agency (volition)
 */
function hasAgencyCues(text: string, fullText: string, position: number): boolean {
  const before = fullText.slice(Math.max(0, position - 50), position);
  const after = fullText.slice(position + text.length, position + text.length + 50);
  const context = (before + after).toLowerCase();

  // Check for agency verbs
  for (const verb of AGENCY_VERBS) {
    if (context.includes(verb)) {
      return true;
    }
  }

  // Check for definite determiners + dialogue patterns
  if (text.toLowerCase().startsWith('the ') && context.includes('"')) {
    return true; // "the angel" + nearby dialogue
  }

  return false;
}

/**
 * Calculate confidence score for a detected entity
 */
function calculateConfidence(
  text: string,
  type: EntityType,
  fullText: string,
  position: number
): number {
  let confidence = 0.7; // Base confidence

  // Boost for capitalization consistency
  const words = text.split(/\s+/);
  const capitalizedWords = words.filter(w => /^[A-Z]/.test(w));
  if (capitalizedWords.length === words.length) {
    confidence += 0.1;
  }

  // Boost for length (longer names are more likely to be entities)
  if (words.length >= 2) {
    confidence += 0.1;
  }

  // S7: Agency boost - if entity shows volition, significantly more likely to be important
  if (hasAgencyCues(text, fullText, position)) {
    confidence += 0.15; // Strong signal
  }

  // Boost for context keywords
  const before = fullText.slice(Math.max(0, position - 30), position);
  const after = fullText.slice(position + text.length, position + text.length + 30);
  const context = before + after;

  const contextKeywords: Record<EntityType, string[]> = {
    PERSON: ['said', 'told', 'met', 'knows', 'friend', 'character'],
    PLACE: ['traveled', 'went', 'visited', 'located', 'in', 'at'],
    ORG: ['joined', 'founded', 'member', 'group', 'organization'],
    EVENT: ['during', 'happened', 'occurred', 'battle', 'war'],
    CONCEPT: ['idea', 'theory', 'concept', 'belief'],
    OBJECT: ['artifact', 'item', 'thing', 'object'],
  };

  const keywords = contextKeywords[type] || [];
  for (const keyword of keywords) {
    if (context.toLowerCase().includes(keyword)) {
      confidence += 0.05;
      break;
    }
  }

  // Cap at 0.95 for natural detection (never 100%)
  return Math.min(0.95, confidence);
}

/**
 * LLM-based entity detection using spaCy NER
 * This provides the "small LLM" component of the dual approach
 * Uses the existing parser service (port 8000) for statistical NER
 */
async function detectLLMEntities(text: string, minConfidence: number): Promise<EntitySpan[]> {
  const spans: EntitySpan[] = [];

  try {
    const client = await getParserClient();
    const data = await client.parse({ text });

    // Defensive: ensure data has expected shape
    const sentences = Array.isArray(data?.sentences) ? data.sentences : [];

    // Extract NER spans from spaCy
    for (const sentence of sentences) {
      const tokens = Array.isArray(sentence?.tokens) ? sentence.tokens : [];
      for (const token of tokens) {
        // spaCy provides entity tags in the 'ent' field
        if (token && token.ent) {
          // Map spaCy entity types to our EntityType
          const type = mapSpacyEntityType(token.ent);
          if (!type) continue;

          // Check if we already have this span (group consecutive tokens with same entity)
          const existingSpan = spans.find(
            (s) => s.end === token.start && s.type === type
          );

          if (existingSpan) {
            // Extend existing span
            existingSpan.end = token.end;
            existingSpan.text = text.slice(existingSpan.start, existingSpan.end);
          } else {
            // Create new span
            spans.push({
              start: token.start,
              end: token.end,
              text: text.slice(token.start, token.end),
              type,
              confidence: 0.85, // spaCy NER has good confidence
              source: 'natural',
            });
          }
        }
      }
    }

    return spans.filter((s) => s.confidence >= minConfidence);
  } catch (error) {
    console.warn('LLM entity detection error:', error);
    return [];
  }
}

/**
 * Map spaCy entity types to our EntityType enum
 */
function mapSpacyEntityType(spacyType: string): EntityType | null {
  switch (spacyType) {
    case 'PERSON':
      return 'PERSON';
    case 'ORG':
      return 'ORG';
    case 'GPE': // Geopolitical entity
    case 'LOC': // Location
      return 'PLACE';
    case 'EVENT':
      return 'EVENT';
    case 'WORK_OF_ART':
      return 'CONCEPT';
    case 'PRODUCT':
      return 'OBJECT';
    default:
      return null;
  }
}

/**
 * S6: Detect alias pack entities
 * Matches common aliases to canonical entity names (e.g., "the Lord" → God)
 */
function detectAliasPacks(text: string, minConfidence: number): EntitySpan[] {
  const spans: EntitySpan[] = [];

  for (const [alias, { canonical, type }] of Object.entries(ALIAS_PACKS)) {
    // Create case-insensitive pattern with word boundaries
    // Handle multi-word aliases like "son of god"
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b(the\\s+)?${escapedAlias}\\b`, 'gi');
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const fullMatch = match[0];
      const start = match.index;
      const end = start + fullMatch.length;
      const coreMatch = fullMatch.replace(/^the\s+/i, '').trim();

      // Require capitalized form to avoid false positives like "lord of the rings"
      if (!/^[A-ZÀ-ÖØ-Þ]/.test(coreMatch)) {
        continue;
      }

      spans.push({
        start,
        end,
        text: fullMatch,
        type,
        canonicalName: canonical,
        confidence: 0.9, // High confidence for alias packs
        source: 'natural',
      });
    }
  }

  return spans.filter((s) => s.confidence >= minConfidence);
}

/**
 * S6: Detect appositive patterns
 * Matches patterns like "Jesus, the Messiah" or "Gandalf, the Grey"
 */
function detectAppositives(text: string, minConfidence: number): EntitySpan[] {
  const spans: EntitySpan[] = [];

  // Pattern: [Name], the [Descriptor]
  // Example: "Jesus, the Messiah", "Gandalf, the Grey"
  const appositivePattern = new RegExp(
    `\\b(${WORD}(?:\\s+${WORD})?)\\s*,\\s*the\\s+(${WORD}(?:\\s+${WORD})?)\\b`,
    'g'
  );

  let match;
  while ((match = appositivePattern.exec(text)) !== null) {
    const fullMatch = match[0];
    const entityName = match[1]; // Main name
    const descriptor = match[2]; // Appositive descriptor
    const start = match.index;
    const end = start + fullMatch.length;

    // Determine type based on descriptor
    let type: EntityType = 'PERSON';
    const descLower = descriptor.toLowerCase();

    // Common person descriptors
    if (/\b(king|queen|prince|princess|lord|lady|wizard|mage|prophet|apostle|disciple|messiah|christ)\b/i.test(descLower)) {
      type = 'PERSON';
    }
    // Place descriptors
    else if (/\b(city|town|kingdom|land|realm|forest|mountain|river)\b/i.test(descLower)) {
      type = 'PLACE';
    }

    spans.push({
      start,
      end,
      text: fullMatch,
      type,
      canonicalName: entityName.trim(),
      confidence: 0.85, // High confidence for appositives
      source: 'natural',
    });
  }

  return spans.filter((s) => s.confidence >= minConfidence);
}

/**
 * S6: Detect group/collective entities
 * Matches patterns like "the shepherds", "the heavenly host"
 */
function detectGroups(text: string, minConfidence: number): EntitySpan[] {
  const spans: EntitySpan[] = [];

  for (const group of GROUP_NOUNS) {
    // Pattern: "the [group]" or just "[group]" at start of sentence
    const escapedGroup = group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b(the\\s+)?${escapedGroup}\\b`, 'gi');
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const fullMatch = match[0];
      const start = match.index;
      const end = start + fullMatch.length;

      // Skip if not preceded by "the" and not at sentence start
      const hasThe = fullMatch.toLowerCase().startsWith('the ');
      const atSentenceStart = start === 0 || /[.!?]\s+$/.test(text.slice(Math.max(0, start - 3), start));

      if (!hasThe && !atSentenceStart) {
        continue;
      }

      // Determine entity type (most groups are organizations or collective persons)
      let type: EntityType = 'ORG';
      const groupLower = group.toLowerCase();

      // Religious/spiritual groups
      if (/\b(angels|heavenly host|disciples|apostles)\b/.test(groupLower)) {
        type = 'ORG'; // Treat as organization for consistency
      }
      // Generic crowds
      else if (/\b(multitude|crowd|people)\b/.test(groupLower)) {
        type = 'ORG';
      }

      spans.push({
        start,
        end,
        text: fullMatch,
        type,
        canonicalName: hasThe ? fullMatch.replace(/^the\s+/i, '').trim() : fullMatch.trim(),
        confidence: 0.8, // Good confidence for groups
        source: 'natural',
      });
    }
  }

  return spans.filter((s) => s.confidence >= minConfidence);
}

/**
 * S6: Detect event seed patterns
 * Matches patterns like "the decree", "the census", "the birth"
 */
function detectEventSeeds(text: string, minConfidence: number): EntitySpan[] {
  const spans: EntitySpan[] = [];

  for (const event of EVENT_SEEDS) {
    // Pattern: "the [event]" - event seeds typically require definite article
    const escapedEvent = event.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\bthe\\s+${escapedEvent}\\b`, 'gi');
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const fullMatch = match[0];
      const start = match.index;
      const end = start + fullMatch.length;

      spans.push({
        start,
        end,
        text: fullMatch,
        type: 'EVENT',
        canonicalName: event,
        confidence: 0.85, // High confidence for event seeds
        source: 'natural',
      });
    }
  }

  return spans.filter((s) => s.confidence >= minConfidence);
}

/**
 * Remove overlapping spans (keep highest confidence)
 * Fixed: Now checks overlap against ALL previous spans, not just the last one
 */
function removeOverlaps(spans: EntitySpan[]): EntitySpan[] {
  if (spans.length === 0) return [];

  // Sort by start position, then by confidence (descending) for stable ordering
  const sorted = [...spans].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.confidence - a.confidence; // Higher confidence first
  });
  const result: EntitySpan[] = [];

  for (const span of sorted) {
    // Check if this span overlaps with ANY existing result
    let hasOverlap = false;
    let replacementIndex = -1;

    for (let i = 0; i < result.length; i++) {
      const existing = result[i];
      // Check for overlap: spans overlap if one starts before the other ends
      if (span.start < existing.end && span.end > existing.start) {
        hasOverlap = true;
        // If new span has higher confidence, mark for replacement
        if (span.confidence > existing.confidence) {
          replacementIndex = i;
        }
        break; // Found an overlap, stop checking
      }
    }

    if (!hasOverlap) {
      // No overlap, add the span
      result.push(span);
    } else if (replacementIndex >= 0) {
      // Replace lower confidence span with higher confidence one
      result[replacementIndex] = span;
    }
    // else: span has lower confidence than overlapping span, skip it
  }

  return result.sort((a, b) => a.start - b.start); // Re-sort by position
}

/**
 * Format an entity as a wiki-style tag
 */
function formatEntityTag(text: string, type: EntityType): string {
  return `[[${type}: ${text}]]`;
}

/**
 * Convert a selection to an entity tag
 */
export function tagSelection(text: string, type: EntityType): string {
  // Clean up any existing tag formats
  text = text.replace(/^#\[(.+)\]:([A-Z]+)$/, '$1'); // Remove #[text]:TYPE format
  text = text.replace(/^\[\[.+:\s*(.+)\]\]$/, '$1'); // Remove existing [[Type: text]] format
  
  // Format as proper wiki tag
  return formatEntityTag(text.trim(), type);
}

/**
 * Incremental diff parser for performance
 * Only re-parses changed regions of text
 * Supports dual approach: algorithms + small LLM (spaCy)
 */
async function incrementalParse(
  text: string,
  config: typeof DEFAULT_CONFIG
): Promise<EntitySpan[]> {
  // Check cache first
  const cacheKey = text.slice(0, 1000); // Use first 1k chars as cache key
  if (parseCache.has(cacheKey)) {
    const cached = parseCache.get(cacheKey)!;
    // Verify cache is still valid
    if (text === previousText) {
      return cached;
    }
  }

  // Diff detection for future optimization
  // For now, we parse the full text each time for correctness
  // TODO: Implement incremental diff-based parsing

  // S3: Pass 0 - Alias lookup (if enabled and project provided)
  // NOTE: Disabled in browser builds - requires Node.js module system
  let aliasSpans: EntitySpan[] = [];
  // if (config.enableAliasPass && config.project && typeof require !== 'undefined') {
  //   try {
  //     // Import alias brain only if needed (conditional to avoid circular dependency)
  //     const { aliasPass } = require('./aliasBrain');
  //     const aliasMatches = aliasPass(text, config.project);
  //
  //     // Convert AliasMatch to EntitySpan format
  //     aliasSpans = aliasMatches.map((match: any) => ({
  //       start: match.start,
  //       end: match.end,
  //       text: match.text,
  //       displayText: match.entityName, // Show entity name, not alias
  //       type: match.type,
  //       confidence: match.confidence,
  //       source: 'tag' as const, // Alias matches are treated like explicit tags
  //     }));
  //   } catch (error) {
  //     // Silently fail if alias brain is not available
  //     console.warn('Alias pass failed:', error);
  //   }
  // }

  // Always detect explicit tags and hashtags (highest priority)
  const tagSpans = detectTags(text);
  const hashtagSpans = detectHashtags(text);

  // Dual approach: choose detection strategy based on mode
  let algorithmSpans: EntitySpan[] = [];
  let llmSpans: EntitySpan[] = [];

  if (config.enableLLM) {
    if (config.llmMode === 'hybrid' || config.llmMode === 'algorithm-only') {
      // Use pattern-based algorithm detection
      if (config.enableNaturalDetection) {
        algorithmSpans = detectNaturalEntities(text, config.minConfidence);
      }
    }

    if (config.llmMode === 'hybrid' || config.llmMode === 'llm-only') {
      // Use spaCy NER for statistical detection
      llmSpans = await detectLLMEntities(text, config.minConfidence);
    }
  } else {
    // LLM disabled: use only algorithm-based detection
    if (config.enableNaturalDetection) {
      algorithmSpans = detectNaturalEntities(text, config.minConfidence);
    }
  }

  // S6: Recall boost patterns - always enabled for better entity coverage
  const aliasPackSpans = detectAliasPacks(text, config.minConfidence);
  const appositiveSpans = detectAppositives(text, config.minConfidence);
  const groupSpans = detectGroups(text, config.minConfidence);
  const eventSeedSpans = detectEventSeeds(text, config.minConfidence);

  // Combine spans based on mode
  // Priority: alias > explicit tags > hashtags > LLM > S6 patterns > algorithms
  // S6 patterns sit between LLM and algorithms for balanced recall/precision
  // In hybrid mode, both LLM and algorithms contribute (deduplicated by removeOverlaps)
  const allSpans = [
    ...aliasSpans,
    ...tagSpans,
    ...hashtagSpans,
    ...llmSpans,
    ...aliasPackSpans,
    ...appositiveSpans,
    ...groupSpans,
    ...eventSeedSpans,
    ...algorithmSpans,
  ];
  const deduplicated = removeOverlaps(allSpans);

  // Limit to max highlights
  const limited = deduplicated.slice(0, config.maxHighlights);

  // Update cache
  previousText = text;
  if (cacheKey) {
    parseCache.set(cacheKey, limited);
  }

  // Keep cache size under control
  if (parseCache.size > 100) {
    const firstKey = parseCache.keys().next().value;
    if (firstKey) {
      parseCache.delete(firstKey);
    }
  }

  return limited;
}

/**
 * Main highlighting function
 * Detects all entities in text and returns spans with type and confidence
 * Supports dual approach: algorithms + small LLM (spaCy NER)
 */
export async function highlightEntities(
  text: string,
  config: HighlightConfig = {}
): Promise<EntitySpan[]> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Use incremental parsing for performance
  return await incrementalParse(text, fullConfig);
}

/**
 * Clear parse cache (call when switching documents)
 */
export function clearHighlightCache(): void {
  previousText = '';
  parseCache.clear();
}

/**
 * Get entity type display name
 */
export function getEntityTypeLabel(type: EntityType): string {
  const labels: Record<EntityType, string> = {
    PERSON: 'Person',
    PLACE: 'Place',
    ORG: 'Organization',
    EVENT: 'Event',
    CONCEPT: 'Concept',
    OBJECT: 'Object',
  };
  return labels[type];
}

/**
 * Get color for entity type (CSS color value)
 */
export function getEntityTypeColor(type: EntityType): string {
  const colors: Record<EntityType, string> = {
    PERSON: '#3b82f6', // blue
    PLACE: '#10b981', // green
    ORG: '#8b5cf6', // purple
    EVENT: '#f59e0b', // amber
    CONCEPT: '#6366f1', // indigo
    OBJECT: '#ec4899', // pink
  };
  return colors[type];
}
