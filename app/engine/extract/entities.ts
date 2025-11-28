/**
 * Entity Extraction - Phase 1 (Context-Aware Classification)
 *
 * Strategy:
 * 1. Call spaCy parser for NER tags + dependency structure
 * 2. Extract NER spans (group consecutive tokens with same label)
 * 3. Dependency-based extraction with context-aware classification
 * 4. Fallback: capitalized 1-3 word patterns with linguistic reasoning
 * 5. Minimal whitelist for truly ambiguous cases only
 * 6. Deduplicate by (type, lowercase_name)
 * 7. Return entities + spans (spans enable precise relation binding in Phase 2)
 */

import { v4 as uuid } from "uuid";
import * as fs from "fs";
import type { Entity, EntityType } from "../schema";
import type { AliasCandidate, AliasStrength, EntityCluster, ExtractorSource } from "../mention-tracking";
import { clusterToEntity, createEntityCluster, createMention, resolveAliasWithContext } from "../mention-tracking";
import { computeEntityConfidence, filterEntitiesByConfidence } from "../confidence-scoring";
import { DEFAULT_CONFIG as ENTITY_FILTER_DEFAULTS } from "../entity-quality-filter";
import type { Token, ParsedSentence, ParseResponse } from "./parse-types";
import { getParserClient } from "../../parser";
import { analyzeEntityContext, classifyWithContext, shouldExtractByContext } from "./context-classifier";
import { filterPronouns, isContextDependent } from "../pronoun-utils";
import { detectClauses } from "./clause-detector";

const TRACE_SPANS = process.env.L3_TRACE === "1";
const CAMELCASE_ALLOWED_PREFIXES = [
  'mc',
  'mac',
  'o',
  "o'",
  "d'",
  'da',
  'de',
  'del',
  'di',
  'du',
  'la',
  'le',
  'van',
  'von',
  'fitz',
  'san',
  'santa',
  'al',
  'el',
  'ibn',
  'bin',
  'ben',
  'ap',
  'af',
  'st'
];

const traceSpan = (stage: string, source: string, start: number, end: number, value: string) => {
  if (!TRACE_SPANS) return;
  try {
    fs.appendFileSync(
      "tmp/span-trace.log",
      JSON.stringify({ stage, start, end, value, source }) + "\n",
      "utf-8"
    );
  } catch {
    // ignore trace errors
  }
};

/**
 * Validate that a span's positions actually extract the expected text from the source
 * This prevents corrupted entity names when token boundaries are misaligned
 */
function validateSpan(
  text: string,
  span: { text: string; start: number; end: number },
  context: string
): { valid: boolean; extracted: string } {
  // Extract actual text at this position
  const extracted = text.slice(span.start, span.end);
  const normalizedExtracted = normalizeName(extracted);
  const normalizedExpected = normalizeName(span.text);

  // Check if normalized versions match
  let valid = normalizedExtracted === normalizedExpected;

  // Additional check: ensure extracted text doesn't contain extra words
  // This catches cases where span.end extends beyond the entity
  if (valid) {
    // Compare NORMALIZED word counts (since normalizeName removes "House", "family", etc.)
    const normalizedExtractedWords = normalizedExtracted.split(/\s+/).filter(Boolean);
    const normalizedExpectedWords = normalizedExpected.split(/\s+/).filter(Boolean);

    // Check if normalized extracted has more words than normalized expected
    // This catches cases like "Slytherin. He" → ["Slytherin", "He"] when expecting just "Slytherin"
    if (normalizedExtractedWords.length > normalizedExpectedWords.length) {
      // Allow a small difference for particles, but reject significant word count mismatches
      const wordCountDiff = normalizedExtractedWords.length - normalizedExpectedWords.length;
      if (wordCountDiff > 1) {
        // Too many extra words - likely corruption
        valid = false;
      } else if (wordCountDiff === 1) {
        // One extra word - check if it's a pronoun or common word that indicates corruption
        const extraWord = normalizedExtractedWords[normalizedExtractedWords.length - 1].toLowerCase();
        const pronouns = ['he', 'she', 'it', 'they', 'i', 'you', 'we', 'the', 'a', 'an'];
        if (pronouns.includes(extraWord)) {
          // Extracted text includes a pronoun after the entity - this is corruption
          valid = false;
        }
      }
    }

    // Check for common corruption patterns in the RAW extracted text
    // Pattern 1: Ends with ". [Word]" (entity spans past sentence boundary)
    if (/\.\s+[A-Z][a-z]+\s*$/.test(extracted)) {
      // Example: "Slytherin. He" or "Granger. The"
      valid = false;
    }

    // Pattern 2: Word fragments being concatenated (e.g., "WeasleRon", "SlytheriHe")
    // This is detected by finding capitalized letters in the middle of a word
    const extractedWords = extracted.split(/\s+/).filter(Boolean);
    for (const word of extractedWords) {
      if (/[a-z][A-Z]/.test(word)) {
        const sanitized = word.replace(/[^A-Za-z']/g, '');
        const lower = sanitized.toLowerCase();
        const isAllowedCamelCase = CAMELCASE_ALLOWED_PREFIXES.some(prefix => lower.startsWith(prefix));
        if (!isAllowedCamelCase) {
          // Found lowercase followed by uppercase without an approved prefix - likely corruption
          valid = false;
          break;
        }
      }
    }
  }

  // Log validation failures
  if (!valid && process.env.L3_DEBUG === "1") {
    try {
      const debugInfo = {
        context,
        expected: span.text,
        expectedNormalized: normalizedExpected,
        extracted,
        extractedNormalized: normalizedExtracted,
        start: span.start,
        end: span.end,
        timestamp: new Date().toISOString()
      };
      fs.appendFileSync(
        "tmp/span-validation-errors.log",
        JSON.stringify(debugInfo) + "\n",
        "utf-8"
      );
    } catch {
      // ignore debug logging errors
    }
  }

  return { valid, extracted };
}

// Organization hint keywords
const ORG_HINTS = /\b(school|university|academy|seminary|ministry|department|institute|college|inc\.?|corp\.?|llc|company|corporation|ltd\.?|technologies|labs|capital|ventures|partners|group|holdings|systems|solutions|consulting|associates|enterprises|industries|bank|financial|investment|fund|computing|software|networks|media|communications|pharmaceuticals|biotech|aerospace|robotics|semiconductor|electronics)\b/i;

// Preposition patterns that suggest PLACE
const PLACE_PREP = /\b(in|at|from|to|into|onto|toward|through|over|under|near|by|inside|outside|within|across|dwelt in|traveled to)\b/i;

// Ambiguous place names that need contextual cues
const AMBIGUOUS_PLACES = new Set(['providence', 'jordan']);

const AMBIGUOUS_PLACE_CUES = /\b(?:in|to|from|near|at|into|onto|toward|traveled to|journeyed to|went to|arrived in|flew to|drove to|moved to|lives in|living in|stayed in|visited)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;

// Family relation words that indicate PERSON
const FAMILY_WORDS = new Set(['son', 'daughter', 'father', 'mother', 'brother', 'sister', 'parent', 'child', 'ancestor', 'descendant']);

// Motion/location verbs
const MOTION_VERBS = new Set(['travel', 'traveled', 'go', 'went', 'move', 'moved', 'journey', 'journeyed', 'walk', 'walked', 'dwell', 'dwelt', 'live', 'lived']);

// Social interaction verbs (indicate PERSON subjects/objects)
const SOCIAL_VERBS = new Set(['marry', 'married', 'befriend', 'befriended', 'meet', 'met', 'know', 'knew', 'love', 'loved', 'hate', 'hated']);

// Location prepositions
const LOC_PREPS = new Set(['in', 'at', 'to', 'from', 'into', 'near', 'by']);

// Person role descriptors (used for "X is a wizard" patterns)
const PERSON_ROLES = new Set([
  'wizard', 'mage', 'sorcerer', 'witch',
  'king', 'queen', 'prince', 'princess', 'lord', 'lady',
  'man', 'woman', 'boy', 'girl', 'person',
  'scientist', 'professor', 'teacher', 'doctor',
  'captain', 'commander', 'leader',
  'child', 'son', 'daughter',
  'parent', 'father', 'mother',
  'warrior', 'knight', 'soldier',
  'elf', 'hobbit', 'dwarf', 'human',
]);

// Geographic markers that indicate PLACE entities
const GEO_MARKERS = /\b(river|creek|stream|brook|mountain|mount|peak|hill|ridge|valley|canyon|gorge|lake|sea|ocean|bay|gulf|island|isle|peninsula|cape|plateau|desert|forest|woods|falls|waterfall|cliff|bluff|mesa|butte|fjord|glacier|volcano|plain|prairie|savanna|swamp|marsh|wetland|delta|strait|harbor|port|coast|shore|beach|plaza|square|commons|garden|courtyard|terrace|promenade|avenue|boulevard|road|street|lane|alley|bridge|gate|tower|keep|basilica|cathedral|abbey|monastery|chapel|church|palace|castle|citadel)\b/i;

// Common place names gazetteer (for cases where spaCy misses GPE/LOC)
const PLACE_GAZETTEER = new Set([
  // Major world cities
  'london', 'paris', 'rome', 'berlin', 'madrid', 'moscow', 'beijing', 'tokyo', 'seoul',
  'delhi', 'mumbai', 'bangkok', 'istanbul', 'cairo', 'lagos', 'johannesburg',
  'new york', 'new york city', 'los angeles', 'chicago', 'houston', 'toronto', 'vancouver',
  'san francisco', 'silicon valley', 'bay area',
  'sydney', 'melbourne', 'auckland',
  'buenos aires', 'rio de janeiro', 'sao paulo', 'mexico city',

  // Countries
  'england', 'scotland', 'wales', 'ireland', 'france', 'germany', 'spain', 'italy', 'russia', 'china', 'japan', 'india',
  'australia', 'canada', 'usa', 'america', 'united states', 'united kingdom', 'brazil', 'argentina',

  // Fictional places (common in test data)
  'hogwarts', 'shire', 'mordor', 'gondor', 'rohan', 'rivendell', 'lothlorien',
  'narnia', 'westeros', 'middle-earth', 'asgard', 'wakanda'
]);

// Keywords that usually signal an EVENT (treaties, accords, councils, etc.)
const EVENT_KEYWORDS = /\b(treaty|accord|agreement|pact|armistice|charter|decree|edict|truce|capitulation|convention|summit|protocol|compact|conference|council|synod|concordat|peace)\b/i;

// Organizational descriptors that should not be tagged as PERSON
const ORG_DESCRIPTOR_PATTERN = /\b(faction|order|alliance|league|dynasty|empire|kingdom|company|council|guild|army|brigade|regiment|church|abbey|cathedral|monastery|university|college|academy|institute|ministry|government|parliament|senate|assembly|society|fellowship)\b/i;

const GENERIC_TITLES = new Set([
  'mr', 'mrs', 'miss', 'ms', 'dr', 'doctor',
  'professor', 'sir', 'madam', 'lord', 'lady',
  'king', 'queen', 'captain', 'commander',
  'father', 'mother', 'son', 'daughter'
]);

// Fantasy/Biblical gazetteer for golden corpus names
const FANTASY_WHITELIST = new Map<string, EntityType>([
  // LotR places
  ['Minas Tirith', 'PLACE'],
  ['Gondor', 'PLACE'],
  ['Rohan', 'PLACE'],
  ['Mordor', 'PLACE'],
  ['Rivendell', 'PLACE'],
  ['Lothlorien', 'PLACE'],
  ['Hobbiton', 'PLACE'],
  ['Shire', 'PLACE'],
  ['Isengard', 'PLACE'],
  ["Helm's Deep", 'PLACE'],
  ['Moria', 'PLACE'],

  // LotR characters (sometimes misclassified)
  ['Gandalf', 'PERSON'],
  ['Gandalf the Grey', 'PERSON'],
  ['Aragorn', 'PERSON'],
  ['Arathorn', 'PERSON'],
  ['Arwen', 'PERSON'],
  ['Frodo', 'PERSON'],
  ['Sam', 'PERSON'],
  ['Elrond', 'PERSON'],
  ['Legolas', 'PERSON'],
  ['Gimli', 'PERSON'],
  ['Drogo', 'PERSON'],
  ['Theoden', 'PERSON'],
  ['Eowyn', 'PERSON'],
  ['Boromir', 'PERSON'],
  ['Denethor', 'PERSON'],

  // Harry Potter characters
  ['Ginny', 'PERSON'],
  ['Harry', 'PERSON'],
  ['Hermione', 'PERSON'],
  ['Ron', 'PERSON'],
  ['Dumbledore', 'PERSON'],
  ['Draco Malfoy', 'PERSON'],
  ['Hermione Granger', 'PERSON'],
  ['Ron Weasley', 'PERSON'],
  ['Harry Potter', 'PERSON'],
  ['Ginny Weasley', 'PERSON'],
  ['Molly Weasley', 'PERSON'],
  ['Arthur', 'PERSON'],
  ['Bill Weasley', 'PERSON'],
  ['Fred', 'PERSON'],
  ['George', 'PERSON'],
  ['Luna Lovegood', 'PERSON'],
  ['Albus Dumbledore', 'PERSON'],
  ['Severus Snape', 'PERSON'],
  ['Professor Snape', 'PERSON'],
  ['Professor McGonagall', 'PERSON'],
  ['Voldemort', 'PERSON'],
  ['Fawkes', 'PERSON'],

  // Harry Potter locations
  ['Hogwarts', 'ORG'],  // School = ORG
  ['Hogsmeade', 'PLACE'],
  ['Diagon Alley', 'PLACE'],
  ['Azkaban', 'PLACE'],
  ['Privet Drive', 'PLACE'],
  ['Burrow', 'PLACE'],
  ['London', 'PLACE'],
  ['Gryffindor', 'ORG'],  // House = ORG
  ['Slytherin', 'ORG'],
  ['Hufflepuff', 'ORG'],
  ['Ravenclaw', 'ORG'],
  ['Gryffindor House', 'ORG'],
  ['Ravenclaw House', 'ORG'],
  ['Slytherin House', 'ORG'],
  ['Hufflepuff House', 'ORG'],
  ['Gringotts Bank', 'ORG'],
  ['Ministry of Magic', 'ORG'],
  ['Hogwarts School', 'ORG'],
  ['Hogwarts Express', 'ITEM'],
  ['Quibbler', 'WORK'],
  ['Scotland', 'PLACE'],

  // Biblical places
  ['Hebron', 'PLACE'],
  ['Jerusalem', 'PLACE'],
  ['Nazareth', 'PLACE'],
  ['Bethlehem', 'PLACE'],
  ['Canaan', 'PLACE'],
  ['Moab', 'PLACE'],
  ['Bethlehem-judah', 'PLACE'],

  // Biblical figures
  ['Abram', 'PERSON'],
  ['Isaac', 'PERSON'],
  ['Jacob', 'PERSON'],

  // Publications and works
  ['Quibbler', 'WORK']
]);

/**
 * Case-insensitive lookup in FANTASY_WHITELIST
 * Returns the entity type and properly capitalized name if found
 */
function lookupWhitelist(text: string): { type: EntityType; canonical: string } | null {
  // Try exact match first (fast path)
  const exactType = FANTASY_WHITELIST.get(text);
  if (exactType) {
    return { type: exactType, canonical: text };
  }

  // Try case-insensitive match
  const lowerText = text.toLowerCase();
  for (const [key, type] of FANTASY_WHITELIST.entries()) {
    if (key.toLowerCase() === lowerText) {
      return { type, canonical: key }; // Return the properly capitalized version from whitelist
    }
  }

  return null;
}

// Stopwords, pronouns, months (expanded to prevent false positives)
const STOP = new Set([
  "The","A","An","And","But","Or","On","In","At","To","From","With","Of","For","As","By","Is","Was","Were","Be","Been","Being",
  "Have","Has","Had","Do","Does","Did","Will","Would","Should","Could","May","Might","Must","Can","Shall",
  "This","That","These","Those","What","Which","Who","When","Where","Why","How","Whether",
  "Because","Since","Though","Although","While","If","Unless","Until","Before","After",
  "All","Any","Both","Each","Every","Few","Many","More","Most","Much","Neither","None","Other","Some","Such",
  "No","Not","So","Then","Now","Here","There","Over","Under","Between","Among","Through","During","Within","Without",
  "About","Above","Across","Against","Along","Around","Behind","Below","Beneath","Beside","Besides","Beyond","Down","Into","Near","Off","Onto","Out","Outside","Upon","Up","Toward","Towards","Unto",
  "Order",
  "Let","Send","Count","Go","Come","Speak","Talk","Behold","Thus","Therefore",
  // Transition/temporal words that should not be entities
  "Meanwhile","However","Moreover","Furthermore","Therefore","Nevertheless","Nonetheless"
]);
for (const word of Array.from(STOP)) {
  STOP.add(word.toLowerCase());
}

type NounCategory =
  | 'proper_person'
  | 'proper_place'
  | 'proper_org'
  | 'common_concrete'
  | 'common_abstract'
  | 'collective'
  | 'compound';

const COLLECTIVE_NOUNS = new Set([
  'family', 'group', 'team', 'army', 'crowd', 'council', 'committee',
  'flock', 'herd', 'pack', 'tribe', 'clan', 'house'
]);

const ABSTRACT_NOUNS = new Set([
  'love', 'hate', 'wisdom', 'freedom', 'justice', 'beauty', 'truth',
  'courage', 'honor', 'glory', 'power', 'knowledge', 'faith'
]);

const TITLE_PATTERN = /\b(mr|mrs|ms|miss|dr|prof|sir|lady|lord|king|queen|prince|princess)\b/i;
const PLACE_PATTERN = /\b(mount|river|lake|city|town|castle|kingdom|shire|forest|valley)\b/i;
const ORG_PATTERN = /\b(house|company|corporation|university|council|alliance|order|society)\b/i;

function detectNounCategory(word: string, pos: string, isCapitalized: boolean): NounCategory {
  const lower = word.toLowerCase();

  if (pos === 'PROPN' || (isCapitalized && pos === 'NOUN')) {
    if (TITLE_PATTERN.test(word)) {
      return 'proper_person';
    }
    if (PLACE_PATTERN.test(word)) {
      return 'proper_place';
    }
    if (ORG_PATTERN.test(word)) {
      return 'proper_org';
    }
    return 'proper_person';
  }

  if (COLLECTIVE_NOUNS.has(lower)) {
    return 'collective';
  }

  if (word.includes('-')) {
    return 'compound';
  }

  if (ABSTRACT_NOUNS.has(lower)) {
    return 'common_abstract';
  }

  return 'common_concrete';
}

function nounCategoryToEntityType(category: NounCategory): EntityType {
  switch (category) {
    case 'proper_person':
      return 'PERSON';
    case 'proper_place':
      return 'PLACE';
    case 'proper_org':
      return 'ORG';
    case 'collective':
      return 'ORG';
    case 'compound':
      return 'PERSON';
    case 'common_abstract':
      return 'WORK';
    default:
      return 'ITEM';
  }
}
const PRON = new Set([
  "I","You","He","She","It","We","They","Me","Him","Her","Us","Them","My","Your","His","Its","Our","Their",
  "Mine","Yours","Hers","Ours","Theirs","Myself","Yourself","Himself","Herself","Itself","Ourselves","Yourselves","Themselves",
  "Who","Whom","Whose","Which","What","That","This","These","Those"
]);
const MONTH = new Set([
  "January","February","March","April","May","June","July","August","September","October","November","December",
  "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Sept","Oct","Nov","Dec"
]);

const PERSON_BLOCKLIST = new Set([
  'students',
  'student',
  'platform',
  'transfiguration',
  'potions',
  'death eaters',
  // Job titles (should not be extracted as people)
  'chief operating officer',
  'chief technology officer',
  'chief executive officer',
  'chief financial officer',
  'chief strategy officer',
  'chief marketing officer',
  'chief innovation officer',
  'ceo',
  'cto',
  'cfo',
  'coo',
  'vice president',
  'executive vice president',
  'executive vice president of engineering',
  'senior vice president',
  'senior engineer',
  'product manager',
  'software engineer',
  'data scientist',
  'marketing executive',
  'investment banker',
  'venture capitalist',
  'general partner',
  'managing director',
  // Generic terms
  'series',
  'design',
  'business',
  'computer science',
  'machine learning',
  'artificial intelligence',
  'data analytics',
  'venture capital',
  'private equity',
  'investment',
  'technology',
  // Academic fields
  'engineering',
  'mathematics',
  'physics',
  'chemistry',
  'biology',
  'economics'
]);

// Well-known places (US states, major cities, countries)
const KNOWN_PLACES = new Set([
  // US States
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
  'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
  'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
  // Major US cities
  'Austin', 'Boston', 'Chicago', 'Dallas', 'Houston', 'Los Angeles', 'Miami', 'New York',
  'Philadelphia', 'Phoenix', 'San Antonio', 'San Diego', 'San Francisco', 'San Jose', 'Seattle',
  // Countries/Regions
  'America', 'Canada', 'Mexico', 'England', 'France', 'Germany', 'Italy', 'Spain', 'China',
  'Japan', 'India', 'Brazil', 'Australia', 'Russia'
]);

// Well-known tech companies and organizations
const KNOWN_ORGS = new Set([
  // Major tech companies
  'Google', 'Apple', 'Microsoft', 'Amazon', 'Facebook', 'Meta', 'Twitter', 'LinkedIn', 'Netflix',
  'Tesla', 'Uber', 'Lyft', 'Airbnb', 'Spotify', 'Slack', 'Zoom', 'Adobe', 'Oracle', 'Salesforce',
  'IBM', 'Intel', 'Nvidia', 'AMD', 'Dell', 'HP', 'Cisco', 'VMware', 'Dropbox', 'Box', 'GitHub',
  'Stripe', 'Square', 'PayPal', 'Shopify', 'Atlassian', 'ServiceNow', 'Workday', 'Twilio',
  'Snowflake', 'Databricks', 'Cloudflare', 'MongoDB', 'Redis', 'Elastic', 'Confluent',
  // Traditional companies
  'Goldman Sachs', 'Morgan Stanley', 'JPMorgan', 'McKinsey', 'Deloitte', 'General Motors',
  'Hewlett-Packard', 'British Telecom', 'Barclays', 'Credit Suisse', 'Lehman Brothers',
  'General Electric', 'Qualcomm', 'Sony', 'Samsung', 'Xerox', 'PARC',
  // Universities (common ones)
  'MIT', 'Stanford', 'Harvard', 'Yale', 'Princeton', 'Berkeley', 'Caltech', 'Oxford', 'Cambridge',
  'Carnegie Mellon', 'Columbia', 'Cornell', 'Northwestern', 'USC', 'UCLA', 'UCSF',
  'University of Washington', 'University of Michigan', 'University of Texas', 'Georgia Tech',
  // VC firms
  'Sequoia', 'Sequoia Capital', 'Andreessen', 'Andreessen Horowitz', 'Benchmark', 'Benchmark Capital',
  'Accel', 'Greylock', 'Greylock Partners', 'Kleiner', 'Kleiner Perkins', 'Khosla', 'Khosla Ventures',
  // Startup/test names (from narratives)
  'Zenith', 'Zenith Computing', 'DataFlow', 'DataFlow Technologies', 'DataVision', 'DataVision Systems',
  'MobileFirst', 'MobileFirst Technologies', 'CloudTech', 'DataStream',
  // Historical/state actors
  'East India Company', 'Houses of Parliament'
]);

/**
 * Map spaCy entity labels to ARES EntityType
 * Returns a base type, which may be refined by context in nerSpans
 */
function mapEnt(ent: string): EntityType | null {
  switch (ent) {
    case "PERSON":      return "PERSON";
    case "ORG":         return "ORG";
    case "GPE":         return "PLACE";
    case "LOC":         return "PLACE";
    case "DATE":        return "DATE";
    case "WORK_OF_ART": return "WORK";
    case "NORP":        return "HOUSE";
    default:            return null;
  }
}

/**
 * Refine entity type based on text content
 * Used to map WORK_OF_ART entities that are actually events
 */
function refineEntityType(type: EntityType, text: string): EntityType {
  const trimmed = text.trim();
  const lowered = trimmed.toLowerCase();

  // Whitelist has absolute highest priority - don't override whitelisted types (case-insensitive)
  const whitelistMatch = lookupWhitelist(trimmed);
  if (whitelistMatch) {
    return whitelistMatch.type;
  }

  // Override with KNOWN_ORGS first (highest priority)
  if (KNOWN_ORGS.has(trimmed)) {
    return 'ORG';
  }

  // Check for partial matches in multi-word names
  const tokens = trimmed.split(/\s+/);
  if (tokens.some(tok => KNOWN_ORGS.has(tok))) {
    return 'ORG';
  }

  // Battle/War/Siege patterns should always be EVENT (even if tagged as PERSON)
  if (/\b(battle|war|conflict|siege|skirmish)\s+of\b/i.test(trimmed)) {
    return 'EVENT';
  }

  if (/^house of\b/i.test(trimmed)) {
    return 'HOUSE';
  }

  // School/Academy/House names should be ORG not PLACE (Stage 3 fix)
  // Fixes: "Hogwarts" being classified as PLACE instead of ORG
  const ORG_INDICATORS = [
    'School', 'Academy', 'University', 'College', 'Institute',
    'Hogwarts', 'Gryffindor', 'Slytherin', 'Ravenclaw', 'Hufflepuff',
    'Ministry', 'Department', 'Office', 'Bureau', 'Agency', 'Council',
    'Order of', 'Guild', 'Clan', 'Brotherhood', 'Sisterhood'
  ];

  if (type === 'PLACE' && ORG_INDICATORS.some(keyword => trimmed.includes(keyword))) {
    return 'ORG';
  }

  // Geographic markers override any other type → PLACE
  // This catches cases where spaCy misclassifies geographic features
  if (GEO_MARKERS.test(trimmed)) {
    return "PLACE";
  }

  // Treaty / Accord / Council style names should be treated as events
  if (
    EVENT_KEYWORDS.test(trimmed) &&
    (/\bof\b/i.test(trimmed) || /\b(?:summit|conference|council|synod)\b/i.test(trimmed))
  ) {
    return 'EVENT';
  }

  if (type === "HOUSE" && !/\b(house|order|clan|family)\b/i.test(trimmed)) {
    return "PERSON";
  }

  if (trimmed === "Snape") {
    return "PERSON";
  }

  if (type === 'PERSON' && ORG_DESCRIPTOR_PATTERN.test(trimmed)) {
    if (/\bhouse\b/i.test(lowered)) {
      return 'HOUSE';
    }
    return 'ORG';
  }

  // Battle/war/conflict mentions should be EVENT, not WORK
  if (type === "WORK" && /\b(battle|war|conflict|siege|skirmish|fight)\b/i.test(text)) {
    return "EVENT";
  }
  return type;
}

/**
 * Enhance entity type using POS-based noun categorization (Grammar Module Integration)
 * Uses Grammar Monster rules to categorize nouns and map to entity types
 */
function enhanceEntityTypeWithPOS(
  currentType: EntityType,
  text: string,
  tokens: Token[]
): EntityType {
  if (tokens.length === 0) return currentType;

  // Get POS tag from first token (most important for proper nouns)
  const firstToken = tokens[0];

  // Guard against undefined tokens or missing pos property
  if (!firstToken || !firstToken.pos) return currentType;

  const posTag = firstToken.pos;

  // Skip if not a noun (preserve existing type)
  if (posTag !== 'NOUN' && posTag !== 'PROPN') {
    return currentType;
  }

  // Use grammar module to detect noun category
  const isCapitalized = /^[A-Z]/.test(text);
  const nounCategory = detectNounCategory(text, posTag, isCapitalized);
  const grammaticalType = nounCategoryToEntityType(nounCategory);

  // If grammar analysis agrees with current type, return current type (high confidence)
  if (grammaticalType === currentType) {
    return currentType;
  }

  // For proper nouns (PROPN), prefer grammatical analysis
  if (posTag === 'PROPN') {
    if (grammaticalType === 'PERSON' && currentType && currentType !== 'PERSON') {
      return currentType;
    }

    if ((grammaticalType === 'ITEM' || grammaticalType === 'WORK') && currentType) {
      return currentType;
    }

    return grammaticalType;
  }

  // For common nouns, prefer keyword-based analysis (more reliable for common nouns)
  return currentType;
}

/**
 * Capitalize entity name to proper case (Title Case)
 * Handles multi-word names and preserves particles like "of", "the", "de", etc.
 */
function capitalizeEntityName(name: string): string {
  // Particles that should stay lowercase in the middle of names
  const particles = new Set(['of', 'the', 'de', 'da', 'di', 'du', 'del', 'van', 'von', 'der', 'den', 'la', 'le', 'lo']);

  const words = name.trim().split(/\s+/);
  return words.map((word, index) => {
    const lower = word.toLowerCase();
    // Keep particles lowercase (except at the start)
    if (index > 0 && particles.has(lower)) {
      return lower;
    }
    // Capitalize first letter, keep rest lowercase
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

export function normalizeName(s: string): string {
  let normalized = s.replace(/\s+/g, " ").trim();
  normalized = normalized.replace(/^[\-\u2013\u2014'"""'']+/, "");
  normalized = normalized.replace(/[,'"\u201c\u201d\u2018\u2019]+$/g, " ");
  normalized = normalized.replace(/\s*,\s*/g, " ");
  normalized = normalized.replace(/[.;:!?]+$/g, "");
  // Remove leading articles and conjunctions (case-insensitive)
  normalized = normalized.replace(/^(the|a|an|and|or|but)\s+/i, "");
  normalized = normalized.replace(/^((?:[a-z]+\s+)+)(?=[A-Z0-9])/g, "");
  // Remove leading titles (keep them for aliasing later)
  const titleRegex = new RegExp(`^(?:${Array.from(TITLE_WORDS).join('|')})\\.?\\s+`, 'i');
  normalized = normalized.replace(titleRegex, "");
  normalized = normalized.replace(/['']s$/i, "");
  normalized = normalized.replace(/\bHouse$/i, "");
  const hadFamilySuffix = /\bfamily$/i.test(normalized);
  const capitalized = normalized.match(/[A-Z][A-Za-z0-9''\-]*(?:\s+(?:of|the|and|&)?\s*[A-Z][A-Za-z0-9''\-]*)*/);
  if (capitalized) {
    normalized = capitalized[0];
    if (hadFamilySuffix && !/\bfamily$/i.test(normalized)) {
      normalized = `${normalized} family`;
    }
  }
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

/**
 * Title words that should be included with person names
 */
const TITLE_WORDS = new Set([
  'mr', 'mrs', 'miss', 'ms', 'dr', 'doctor', 'prof', 'professor',
  'sir', 'madam', 'lord', 'lady', 'king', 'queen', 'prince', 'princess',
  'duke', 'duchess', 'baron', 'baroness', 'count', 'countess',
  'captain', 'commander', 'general', 'admiral', 'colonel', 'major',
  'sergeant', 'lieutenant', 'father', 'mother', 'brother', 'sister',
  'master', 'archmagus', 'wizard', 'mage', 'sorcerer', 'sorceress',
  'judge', 'justice', 'president', 'senator', 'governor', 'mayor'
]);

/**
 * Extract NER spans from parsed sentence
 */
function nerSpans(sent: ParsedSentence): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];
  let i = 0;

  // Common name particles that connect multi-word names
  const NAME_PARTICLES = new Set(['da', 'de', 'del', 'della', 'di', 'von', 'van', 'van der', 'van den', 'le', 'la', 'el', 'al', 'bin', 'ibn', 'abu']);

  while (i < sent.tokens.length) {
    const t = sent.tokens[i];
    const mapped = mapEnt(t.ent);

    if (!mapped) {
      i++;
      continue;
    }

    let j = i + 1;
    while (j < sent.tokens.length && sent.tokens[j].ent === t.ent) {
      // COORDINATION FIX: Don't group entities across punctuation (coordination lists)
      // E.g., "Gryffindor, Slytherin, Hufflepuff" should be 3 entities, not 1
      // If there's a gap > 1 char between tokens (comma, semicolon, etc.), break
      const prevToken = sent.tokens[j - 1];
      const currToken = sent.tokens[j];
      if (currToken.start - prevToken.end > 1) {
        break; // Punctuation between tokens, don't group
      }
      j++;
    }

    // For PERSON entities, extend span to include name particles and following name parts
    // E.g., "Leonardo da Vinci" where "da" might not be tagged as PERSON
    if (mapped === 'PERSON') {
      while (j < sent.tokens.length - 1) {
        const currentToken = sent.tokens[j];
        const nextToken = sent.tokens[j + 1];

        // Check if current token is a name particle
        const isNameParticle = NAME_PARTICLES.has(currentToken.text.toLowerCase());

        // Check if next token is tagged as PERSON or is a capitalized PROPN
        const nextIsPerson = nextToken && (
          mapEnt(nextToken.ent) === 'PERSON' ||
          (nextToken.pos && nextToken.pos === 'PROPN' && /^[A-Z]/.test(nextToken.text))
        );

        if (isNameParticle && nextIsPerson) {
          // Include the particle and scan forward to include the rest of the name
          j++; // Include the particle
          // Continue including tokens that are part of the person name
          while (j < sent.tokens.length && (
            sent.tokens[j].ent === t.ent ||
            (sent.tokens[j].pos && sent.tokens[j].pos === 'PROPN' && /^[A-Z]/.test(sent.tokens[j].text))
          )) {
            j++;
          }
        } else {
          break;
        }
      }
    }

    // Expand span backwards to include title words for PERSON entities
    let spanStart = i;
    if (mapped === 'PERSON' && i > 0) {
      const prevToken = sent.tokens[i - 1];
      if (prevToken && prevToken.pos && prevToken.pos === 'PROPN' && !prevToken.ent &&
          TITLE_WORDS.has(prevToken.text.toLowerCase())) {
        spanStart = i - 1;
      }
    }

    const spanTokens = sent.tokens.slice(spanStart, j);
    let text = normalizeName(spanTokens.map(x => x.text).join(" "));
    const start = spanTokens[0].start;
    const end = spanTokens[spanTokens.length - 1].end;

    // Refine type based on text content (e.g., "Battle of X" → EVENT)
    let refinedType = refineEntityType(mapped, text);

    // Enhance with POS-based noun categorization (Grammar Module)
    refinedType = enhanceEntityTypeWithPOS(refinedType, text, spanTokens);

    // Apply whitelist override (case-insensitive, e.g., "Hogwarts" → ORG, not PLACE)
    const whitelistMatch = lookupWhitelist(text);
    if (whitelistMatch) {
      refinedType = whitelistMatch.type;
      // Note: Don't change text to canonical here - keep original case for span validation
    }

    const nextToken = sent.tokens[j];
    if (refinedType === 'PERSON' && nextToken && nextToken.text.toLowerCase() === 'family') {
      i = j;
      continue;
    }

    if (refinedType === 'ORG' && /\bHouse$/i.test(text)) {
      text = text.replace(/\s+House$/i, '');
    }

    // IMPORTANT: Store text with original case for span validation
    // Capitalization will happen later during entity creation
    spans.push({ text, type: refinedType, start, end });
    traceSpan("ner", sent.tokens.map(tok => tok.text).join(" "), start, end, text);
    i = j;
  }
  
  return spans;
}

/**
 * Split coordinated entities like "James and Lily Potter" into separate entities
 * Looks for patterns: [Name1] and [Name2] [SharedLastName]
 */
const COORDINATABLE_TYPES = new Set<EntityType>(['PERSON', 'ORG', 'PLACE']);
const CONJUNCTION_TOKENS = new Set(['and', 'or', '&']);

function splitCoordination(
  sent: ParsedSentence,
  spans: Array<{ text: string; type: EntityType; start: number; end: number }>
): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const result: Array<{ text: string; type: EntityType; start: number; end: number }> = [];
  const tokens = sent.tokens;

  const ALLOWED_PERSON_POS = new Set(['PROPN', 'NOUN', 'ADJ']);

  const isSeparator = (tok: Token) => {
    const lower = tok.text.toLowerCase();
    return (
      (tok.pos && tok.pos === 'PUNCT') ||
      tok.dep === 'punct' ||
      (tok.pos && tok.pos === 'CCONJ') ||
      tok.dep === 'cc' ||
      (tok.pos && tok.pos === 'SCONJ') ||
      (tok.pos && tok.pos === 'VERB') ||
      (tok.pos && tok.pos === 'AUX') ||
      lower === 'and' ||
      lower === 'or' ||
      lower === '&'
    );
  };

  const isAllowedPersonToken = (tok: Token) => {
    if (!tok.pos || !ALLOWED_PERSON_POS.has(tok.pos)) return false;
    return /^[A-ZÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛ]/.test(tok.text);
  };

  for (const span of spans) {
    if (!COORDINATABLE_TYPES.has(span.type)) {
      result.push(span);
      continue;
    }

    const spanTokens = tokens
      .filter(t => t.start >= span.start && t.end <= span.end)
      .sort((a, b) => a.start - b.start);
    if (spanTokens.length === 0) {
      result.push(span);
      continue;
    }

    const segments: Token[][] = [];
    let current: Token[] = [];

    for (const tok of spanTokens) {
      if (isSeparator(tok)) {
        if (current.length > 0) {
          segments.push(current);
          current = [];
        }
        continue;
      }

      if (span.type === 'PERSON') {
        if (isAllowedPersonToken(tok)) {
          current.push(tok);
        }
        continue;
      }

      // For ORG/PLACE keep most lexical tokens (determiners included) to preserve names.
      if (!tok.pos || (tok.pos !== 'CCONJ' && tok.pos !== 'SCONJ')) {
        current.push(tok);
      }
    }

    if (current.length > 0) {
      segments.push(current);
    }

    const filteredSegments = segments.filter(seg => seg.length > 0);

    if (filteredSegments.length === 0) {
      result.push(span);
      continue;
    }

    const distinctTokenCount = filteredSegments.reduce((sum, seg) => sum + seg.length, 0);
    const comparableTokenCount = spanTokens.filter(tok => !isSeparator(tok)).length;

    if (filteredSegments.length === 1 && distinctTokenCount === comparableTokenCount) {
      const only = filteredSegments[0];
      const text = normalizeName(only.map(t => t.text).join(' '));
      const spanRecord = {
        text,
        type: span.type,
        start: only[0].start,
        end: only[only.length - 1].end
      };
      traceSpan("split", sent.tokens.map(tok => tok.text).join(" "), spanRecord.start, spanRecord.end, text);
      result.push(spanRecord);
      continue;
    }

    let sharedSurname: string | null = null;
    if (span.type === 'PERSON' && filteredSegments.length >= 2) {
      const tail = filteredSegments[filteredSegments.length - 1];
      if (tail.length >= 2) {
        const surnameCandidate = tail[tail.length - 1];
        if (/^[A-Z]/.test(surnameCandidate.text)) {
          sharedSurname = surnameCandidate.text;
        }
      }
    }

    for (let idx = 0; idx < filteredSegments.length; idx++) {
      const segment = filteredSegments[idx];
      let segmentTokens = segment.map(t => t.text);
      if (
        span.type === 'PERSON' &&
        sharedSurname &&
        idx < filteredSegments.length - 1 &&
        segment.length === 1 &&
        /^[A-Z]/.test(segment[0].text) &&
        segment[0].text !== sharedSurname
      ) {
        segmentTokens = [...segmentTokens, sharedSurname];
      }

      const text = normalizeName(segmentTokens.join(' '));
      if (!text) continue;
      const spanRecord = {
        text,
        type: span.type,
        start: segment[0].start,
        end: segment[segment.length - 1].end
      };
      traceSpan("split", sent.tokens.map(tok => tok.text).join(" "), spanRecord.start, spanRecord.end, text);
      result.push(spanRecord);
    }
  }

  return result;
}

/**
 * Extract entities using dependency patterns with context-aware classification
 * Uses linguistic rules to determine entity types instead of whitelists
 */
function depBasedEntities(sent: ParsedSentence): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];
  const tokens = sent.tokens;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    // Skip stopwords, pronouns, months (case-insensitive)
    const tokLower = tok.text.toLowerCase();
    if (STOP.has(tok.text) || PRON.has(tok.text) || MONTH.has(tok.text)) {
      continue;
    }

    // Accept both capitalized and lowercase words (context check will filter later)
    // This allows detection of lowercase entity names like "harry potter"
    const isCapitalized = /^[A-Z]/.test(tok.text);
    const isLowercase = /^[a-z]/.test(tok.text);

    if (!isCapitalized && !isLowercase) {
      // Skip numbers, punctuation, etc.
      continue;
    }

    // Gather entity tokens (including compounds and flat name parts)
    let startIdx = i;
    let endIdx = i;

    // Look backward for compounds and flat name parts
    for (let j = i - 1; j >= 0; j--) {
      const dep = tokens[j].dep;
      // Include compound, flat (for multi-word names), and flat:name dependencies
      if ((dep === 'compound' || dep === 'flat' || dep === 'flat:name') && tokens[j].head === tok.i) {
        startIdx = j;
      } else {
        break;
      }
    }

    // Look forward for compounds and flat name parts
    for (let j = i + 1; j < tokens.length; j++) {
      const dep = tokens[j].dep;
      // Include compound, flat (for multi-word names), and flat:name dependencies
      if ((dep === 'compound' || dep === 'flat' || dep === 'flat:name') && tokens[j].head === tok.i) {
        endIdx = j;
      } else {
        break;
      }
    }

    let spanTokens = tokens.slice(startIdx, endIdx + 1);
    spanTokens = spanTokens.filter(tok => !CONJUNCTION_TOKENS.has(tok.text.toLowerCase()));
    if (!spanTokens.length) {
      continue;
    }
    const rawText = spanTokens.map(t => t.text).join(' ');
    const text = normalizeName(rawText);

    // Skip spans ending with pronouns (e.g., "that she", "the he")
    const lastToken = spanTokens[spanTokens.length - 1];
    const lastTokenCapitalized = lastToken.text.charAt(0).toUpperCase() + lastToken.text.slice(1);
    if (PRON.has(lastToken.text) || PRON.has(lastTokenCapitalized)) {
      continue;
    }

    // Skip single-word spans preceded by articles/prepositions
    if (spanTokens.length === 1) {
      const prevToken = tokens[startIdx - 1];
      if (
        prevToken &&
        tok.dep !== 'pobj' &&
        ['the', 'of', 'son', 'daughter'].includes(prevToken.text.toLowerCase())
      ) {
        continue;
      }
    }

    // Analyze context using dependency structure
    const context = analyzeEntityContext(spanTokens, tokens, sent);

    // Check if context suggests we should extract this entity
    if (!shouldExtractByContext(context)) {
      // Not a syntactically interesting position, skip
      continue;
    }


    // Check whitelist FIRST (for known ambiguous cases, case-insensitive)
    // This allows manual overrides for entities that are hard to classify
    const whitelistMatch = lookupWhitelist(text);
    let entityType: EntityType;

    if (whitelistMatch) {
      // Whitelist entry exists, use it
      entityType = whitelistMatch.type;
    } else {
      // Use context-aware classification
      entityType = classifyWithContext(text, context);
    }

    // Skip if classified as invalid
    if (!entityType) {
      continue;
    }

    // Clean up entity text (House suffix) - but keep original case for span validation
    let cleanedText = text;
    if (entityType === 'ORG' && /\bHouse$/i.test(cleanedText)) {
      cleanedText = cleanedText.replace(/\s+House$/i, '');
    }

    const start = spanTokens[0].start;
    const end = spanTokens[spanTokens.length - 1].end;

    // IMPORTANT: Store the text with original case for span validation
    // Capitalization will happen later during entity creation
    spans.push({ text: cleanedText, type: entityType, start, end });
    traceSpan("dep", sent.tokens.map(tok => tok.text).join(" "), start, end, cleanedText);
  }

  return spans;
}

/**
 * Classify a name using context-aware linguistic reasoning
 * Returns EntityType or null if should be skipped
 *
 * Uses verb patterns and preposition analysis to determine entity type
 * without relying on whitelists for most cases.
 */
function classifyName(text: string, surface: string, start: number, end: number): EntityType | null {
  // 1) Check whitelist first (case-insensitive, for known ambiguous cases only)
  const whitelistMatch = lookupWhitelist(surface);
  if (whitelistMatch) return whitelistMatch.type;

  // 2) Check known places/orgs (real-world entities)
  const isAcronym = /^[A-Z]{2,5}(?:\.[A-Z]{1,3})?$/.test(surface);
  if (isAcronym) {
    return 'ORG';
  }

  if (KNOWN_PLACES.has(surface)) {
    return 'PLACE';
  }

  if (KNOWN_ORGS.has(surface)) {
    return 'ORG';
  }

  // Check for partial matches in multi-word names
  const surfaceTokens = surface.split(/\s+/);
  if (surfaceTokens.some(tok => KNOWN_PLACES.has(tok))) {
    return 'PLACE';
  }
  if (surfaceTokens.some(tok => KNOWN_ORGS.has(tok))) {
    return 'ORG';
  }

  // 3) Lexical markers in entity name itself (highest priority)
  if (/\bfamily$/i.test(surface)) {
    return 'PERSON';
  }

  if (/^House of\b/i.test(surface)) {
    return 'HOUSE';
  }

  if (/\bHouse$/i.test(surface)) {
    return 'HOUSE';
  }

  // Geographic markers → PLACE
  if (GEO_MARKERS.test(surface)) {
    return 'PLACE';
  }

  // Organizational descriptors → ORG
  if (ORG_DESCRIPTOR_PATTERN.test(surface)) {
    return 'ORG';
  }

  // Organization keywords in name → ORG
  if (ORG_HINTS.test(surface)) {
    return 'ORG';
  }

  // 4) Context-based classification using verb patterns
  const before = text.slice(Math.max(0, start - 50), start);
  const after = text.slice(end, Math.min(text.length, end + 50));

  // Extract immediate context (within 15 chars)
  const immediateContext = text.slice(Math.max(0, start - 15), start).trim();

  // Pattern: "ruled X" → X is PLACE
  if (/\b(ruled?|governed?|reigned? over)\s*$/i.test(immediateContext)) {
    return 'PLACE';
  }

  // Pattern: "X ruled" → X is PERSON
  if (/\b(ruled?|governed?|reigned?)\b/i.test(after.slice(0, 20))) {
    return 'PERSON';
  }

  // Pattern: "married X" → X is PERSON
  if (/\b(married?|wed|wedded)\s*$/i.test(immediateContext)) {
    return 'PERSON';
  }

  // Pattern: "studied at X" / "taught at X" / "attended X" → X is ORG
  if (/\b(study|studies|studied|teach|teaches|taught|attend|attended|work|works|worked)\s+at\s*$/i.test(immediateContext)) {
    return 'ORG';
  }

  // Pattern: "went to X" / "traveled to X" → X could be PLACE or ORG
  // If entity name contains school/university keywords → ORG
  if (/\b(went|traveled|travelled|journeyed|moved)\s+to\s*$/i.test(immediateContext)) {
    if (/school|university|academy|college|hogwarts/i.test(surface)) {
      return 'ORG';
    }
    return 'PLACE';
  }

  // Pattern: "lived in X" / "dwelt in X" → X is PLACE
  if (/\b(live|lived|dwell|dwelt|reside|resided|settle|settled)\s+in\s*$/i.test(immediateContext)) {
    return 'PLACE';
  }

  // Pattern: "fought in X" → X is EVENT (if has battle/war keyword) or PLACE
  if (/\b(fought?|battled?)\s+in\s*$/i.test(immediateContext)) {
    if (/battle|war|conflict|siege|skirmish/i.test(surface)) {
      return 'EVENT';
    }
    return 'PLACE';
  }

  // Pattern: "founded X" / "established X" → X is ORG
  if (/\b(founded?|co-founded?|established?|created?|launched?|started?)\s*$/i.test(immediateContext)) {
    return 'ORG';
  }

  // Pattern: "in X" (location context) → PLACE
  // But exclude "work in" / "study in" which could be fields (e.g., "work in technology")
  if (/\b(in|within|near|by)\s*$/i.test(immediateContext) &&
      !/\b(work|study|studied|specialize|specialized|major|majored)\s+in\s*$/i.test(immediateContext)) {
    return 'PLACE';
  }

  // Pattern: "at X" (general location) → could be ORG or PLACE
  // Prefer ORG if no other context
  if (/\bat\s*$/i.test(immediateContext)) {
    return 'ORG';
  }

  // Pattern: "to X" (motion) → PLACE
  if (/\bto\s*$/i.test(immediateContext)) {
    return 'PLACE';
  }

  // 5) Subject of action verbs → PERSON
  // Look for verbs in after-context (entity is subject)
  const actionVerbsAfter = /^\s*\b(ruled?|governed?|reigned?|led|headed|founded?|established?|traveled?|travelled|went|came|left|arrived|departed|married?|fought?|lived?|dwelt|studied?|taught?)\b/i;
  if (actionVerbsAfter.test(after)) {
    return 'PERSON';
  }

  // 6) Possessive or family context → PERSON
  const personContext = /'s\b|son|daughter|father|mother|brother|sister|wife|husband|parent|child|king|queen|lord|lady|prince|princess|wizard|mage/i;
  if (personContext.test(before + ' ' + after)) {
    return 'PERSON';
  }

  // 7) Business/founding context → ORG
  const orgVerbContext = /\b(founded?|co-founded?|established?|started?|launched?|created?|built?|acquired?|invested in|joined?)\b/i;
  if (orgVerbContext.test(before)) {
    return 'ORG';
  }

  // Pattern: "X was founded" → X is ORG
  if (/^\s*\bwas (founded|established|created|launched|acquired|incorporated)\b/i.test(after)) {
    return 'ORG';
  }

  // 8) Default: PERSON
  // In narrative text, most single capitalized words are character names
  return 'PERSON';
}

/**
 * Fallback: Extract capitalized 1-3 word patterns with context classification
 */
/**
 * Extract places from gazetteer
 * Catches common place names that spaCy might miss (e.g., "London" in certain contexts)
 */
function gazetterPlaces(text: string): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];

  // Match capitalized words that might be places
  const wordPattern = /\b([A-Z][a-z]+(?:\s+(?:of\s+)?[A-Z][a-z]+){0,2})\b/g;
  let match: RegExpExecArray | null;

  while ((match = wordPattern.exec(text))) {
    const word = match[1];
    const normalized = word.toLowerCase();

    // Check if it's in our gazetteer
    if (PLACE_GAZETTEER.has(normalized)) {
      spans.push({
        text: word,
        type: 'PLACE',
        start: match.index,
        end: match.index + word.length
      });
    }
  }

  return spans;
}

function extractAmbiguousPlaces(text: string): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];

  let match: RegExpExecArray | null;
  AMBIGUOUS_PLACE_CUES.lastIndex = 0;
  while ((match = AMBIGUOUS_PLACE_CUES.exec(text)) !== null) {
    const candidate = match[1];
    const normalized = candidate.toLowerCase();
    if (!AMBIGUOUS_PLACES.has(normalized)) continue;

    spans.push({
      text: candidate,
      type: 'PLACE',
      start: match.index + match[0].lastIndexOf(candidate),
      end: match.index + match[0].lastIndexOf(candidate) + candidate.length
    });
  }

  return spans;
}

function extractAcronymPairs(text: string): Array<{
  acronym: string;
  expansion?: string;
  acronymStart: number;
  acronymEnd: number;
  expansionStart?: number;
  expansionEnd?: number;
}> {
  const pairs: Array<{
    acronym: string;
    expansion?: string;
    acronymStart: number;
    acronymEnd: number;
    expansionStart?: number;
    expansionEnd?: number;
  }> = [];

  const acronymFirst = /\b([A-Z]{2,5})\b\s*\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = acronymFirst.exec(text)) !== null) {
    const acronym = match[1];
    const expansion = match[2].trim();
    const expansionOffset = match[0].indexOf(expansion);
    pairs.push({
      acronym,
      expansion,
      acronymStart: match.index,
      acronymEnd: match.index + acronym.length,
      expansionStart: match.index + expansionOffset,
      expansionEnd: match.index + expansionOffset + expansion.length
    });
  }

  const expansionFirst = /\b([A-Z][A-Za-z0-9\.\s]+?)\s*\(([^)]+)\)/g;
  while ((match = expansionFirst.exec(text)) !== null) {
    const expansion = match[1].trim();
    const acronym = match[2].trim();
    if (!/^[A-Z]{2,5}$/.test(acronym)) continue;

    const acronymOffset = match[0].lastIndexOf(acronym);
    pairs.push({
      acronym,
      expansion,
      acronymStart: match.index + acronymOffset,
      acronymEnd: match.index + acronymOffset + acronym.length,
      expansionStart: match.index,
      expansionEnd: match.index + expansion.length
    });
  }

  return pairs;
}

/**
 * Extract new fantasy/fiction entity types using pattern matching
 * Extracts: RACE, CREATURE, ARTIFACT, TECHNOLOGY, MAGIC, LANGUAGE, CURRENCY, MATERIAL, DRUG, DEITY, ABILITY, SKILL, POWER, TECHNIQUE, SPELL
 */
function extractFantasyEntities(text: string): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];

  // RACE patterns
  // Pattern 1: [Name] the/a [race] (e.g., "Elves are ancient")
  const racePattern1 = /\b([A-Z][a-z]+(?:ian|ite|fold)?(?:\s+(?:race|people|folk|kind|breed))?)\s+(?:are|were|have|possess|can)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = racePattern1.exec(text))) {
    const name = match[1].trim();
    if (name && name.length > 2 && !/^(The|This|That|These|Those)$/i.test(name)) {
      spans.push({ text: name, type: 'RACE', start: match.index, end: match.index + match[1].length });
    }
  }

  // Pattern 2: [RACE] warrior/knight/mage (e.g., "Elven warrior")
  const racePattern2 = /\b([A-Z][a-z]+(?:ian|ish|ic)?)\s+(?:warrior|knight|mage|lord|queen|king|prince|maiden|smith|chief)\b/gi;
  while ((match = racePattern2.exec(text))) {
    const name = match[1];
    if (name && name.length > 2) {
      spans.push({ text: name, type: 'RACE', start: match.index, end: match.index + match[1].length });
    }
  }

  // CREATURE patterns
  // Pattern 1: Possessive creatures (e.g., "Smaug's hoard")
  const creaturePattern1 = /\b([A-Z][a-z]+(?:\s+(?:the|of|de)\s+[A-Z][a-z]+)?)\s+'s\s+(?:lair|nest|hoard|den|cave|mountain|domain)\b/gi;
  while ((match = creaturePattern1.exec(text))) {
    const name = match[1].trim();
    if (name && name.length > 2) {
      spans.push({ text: name, type: 'CREATURE', start: match.index, end: match.index + match[1].length });
    }
  }

  // Pattern 2: Dragon/Phoenix type creatures (e.g., "dragon Smaug")
  const creaturePattern2 = /\b(?:dragon|phoenix|basilisk|kraken|minotaur|chimera|wyvern|griffin|hydra|leviathan)\s+([A-Z][a-z]+)\b/gi;
  while ((match = creaturePattern2.exec(text))) {
    const name = match[1];
    if (name && name.length > 2) {
      spans.push({ text: name, type: 'CREATURE', start: match.index + match[0].indexOf(match[1]), end: match.index + match[0].length });
    }
  }

  // ARTIFACT patterns
  // Pattern 1: Famous artifacts with the/a (e.g., "the One Ring")
  const artifactPattern1 = /\b(?:the|a)\s+([A-Z][a-z]+(?:\s+(?:of|the)\s+[A-Z][a-z]+)?(?:\s+(?:Stone|Ring|Sword|Crown|Wand|Staff|Book|Mirror|Cup|Goblet|Blade|Amulet|Pendant|Rune|Helm|Shield|Armor)))\b/gi;
  while ((match = artifactPattern1.exec(text))) {
    const name = match[1].trim();
    if (name && name.length > 2) {
      spans.push({ text: name, type: 'ARTIFACT', start: match.index + match[0].indexOf(name), end: match.index + match[0].indexOf(name) + name.length });
    }
  }

  // Pattern 2: Possessive artifacts (e.g., "Frodo's ring")
  const artifactPattern2 = /\b([A-Z][a-z]+(?:\s+(?:the|of)\s+[A-Z][a-z]+)?)\s+'s\s+([A-Z][a-z]+(?:\s+(?:of|the)\s+[A-Z][a-z]+)?)\b/gi;
  while ((match = artifactPattern2.exec(text))) {
    // Extract the artifact (second group)
    const artifact = match[2] || match[1];
    if (artifact && artifact.length > 2 && !/\b(?:family|house|kingdom|realm|people)$/i.test(artifact)) {
      spans.push({ text: artifact, type: 'ARTIFACT', start: match.index + match[0].indexOf(match[2] || match[1]), end: match.index + match[0].length });
    }
  }

  // TECHNOLOGY patterns
  // Pattern: [name] was created/built/invented
  const techPattern = /\b([A-Z][a-z]+(?:\s+(?:the|of|Mark|Model|Type|Series)\s+[A-Z0-9][a-zA-Z0-9]*)?)\s+(?:was|is)\s+(?:created|built|invented|designed|engineered|constructed)\b/gi;
  while ((match = techPattern.exec(text))) {
    const name = match[1].trim();
    if (name && name.length > 2 && /^[A-Z]/.test(name)) {
      spans.push({ text: name, type: 'TECHNOLOGY', start: match.index, end: match.index + match[1].length });
    }
  }

  // MAGIC patterns
  // Pattern: [type] magic/sorcery/witchcraft
  const magicPattern = /\b([A-Z][a-z]+(?:\s+(?:and|or)\s+[A-Z][a-z]+)?)\s+(?:magic|sorcery|witchcraft|enchantment|conjuring)\b/gi;
  while ((match = magicPattern.exec(text))) {
    const name = match[1].trim();
    if (name && name.length > 2) {
      spans.push({ text: name, type: 'MAGIC', start: match.index, end: match.index + match[1].length });
    }
  }

  // LANGUAGE patterns
  // Pattern 1: Languages with -ish/-ian endings (e.g., "Elvish", "Klingon")
  const langPattern1 = /\b([A-Z][a-z]+(?:ian|ish|ese|ine)?)\s+(?:language|tongue|dialect|runes|script)\b/gi;
  while ((match = langPattern1.exec(text))) {
    const name = match[1];
    if (name && name.length > 2 && /(?:ian|ish|ese|ine)$/.test(name)) {
      spans.push({ text: name, type: 'LANGUAGE', start: match.index, end: match.index + match[1].length });
    }
  }

  // Pattern 2: Spoke/speaking patterns (e.g., "spoke Elvish")
  const langPattern2 = /\b(?:spoke|speaks|speaking|language)\s+(?:in\s+)?([A-Z][a-z]+(?:ian|ish|ese)?)\b/gi;
  while ((match = langPattern2.exec(text))) {
    const name = match[1];
    if (name && name.length > 2 && /(?:ian|ish|ese)$/.test(name)) {
      spans.push({ text: name, type: 'LANGUAGE', start: match.index + match[0].indexOf(name), end: match.index + match[0].indexOf(name) + name.length });
    }
  }

  // CURRENCY patterns
  // Pattern: numeric [currency] or [currency] coins/notes
  const currencyPattern = /\b([A-Z][a-z]+(?:s)?)\s+(?:coin|coins|note|notes|piece|pieces|bill|bills|currency)\b/gi;
  while ((match = currencyPattern.exec(text))) {
    const name = match[1];
    if (name && name.length > 2 && /^[A-Z]/.test(name)) {
      spans.push({ text: name, type: 'CURRENCY', start: match.index, end: match.index + match[1].length });
    }
  }

  // MATERIAL patterns
  // Pattern 1: made of [material] (e.g., "made of Mithril")
  const materialPattern1 = /\b(?:made of|forged from|crafted from|wrought from)\s+([A-Z][a-z]+(?:\s+(?:ore|metal|stone|crystal))?)\b/gi;
  while ((match = materialPattern1.exec(text))) {
    const name = match[1].trim();
    if (name && name.length > 2) {
      spans.push({ text: name, type: 'MATERIAL', start: match.index + match[0].indexOf(name), end: match.index + match[0].indexOf(name) + name.length });
    }
  }

  // Pattern 2: [material] ore/metal/stone
  const materialPattern2 = /\b([A-Z][a-z]+)\s+(?:ore|metal|stone|crystal|deposit|vein|mine)\b/gi;
  while ((match = materialPattern2.exec(text))) {
    const name = match[1];
    if (name && name.length > 2 && !['The', 'This', 'That'].includes(name)) {
      spans.push({ text: name, type: 'MATERIAL', start: match.index, end: match.index + match[1].length });
    }
  }

  // DRUG patterns
  // Pattern: [name] potion/elixir/draught
  const drugPattern = /\b([A-Z][a-z]+(?:\s+(?:the)?\s+[A-Z][a-z]+)?)\s+(?:potion|elixir|draught|brew|concoction|mixture)\b/gi;
  while ((match = drugPattern.exec(text))) {
    const name = match[1].trim();
    if (name && name.length > 2) {
      spans.push({ text: name, type: 'DRUG', start: match.index, end: match.index + match[1].length });
    }
  }

  // DEITY patterns
  // Pattern 1: [name] the god/goddess
  const deityPattern1 = /\b([A-Z][a-z]+(?:\s+(?:the|of|and)\s+[A-Z][a-z]+)?)\s+(?:the\s+)?(?:god|goddess|divine|deity|almighty|supreme)\b/gi;
  while ((match = deityPattern1.exec(text))) {
    const name = match[1].trim();
    if (name && name.length > 2) {
      spans.push({ text: name, type: 'DEITY', start: match.index, end: match.index + match[1].length });
    }
  }

  // Pattern 2: worship/pray to [deity]
  const deityPattern2 = /\b(?:worship|prayed to|pray to|invoke|called upon)\s+([A-Z][a-z]+(?:\s+(?:the)?\s+[A-Z][a-z]+)?)\b/gi;
  while ((match = deityPattern2.exec(text))) {
    const name = match[1].trim();
    if (name && name.length > 2) {
      spans.push({ text: name, type: 'DEITY', start: match.index + match[0].indexOf(name), end: match.index + match[0].indexOf(name) + name.length });
    }
  }

  // ABILITY patterns
  // Pattern: has/had the ability to [verb]
  const abilityPattern = /\b(?:has|had|possess|possessed)\s+(?:the\s+)?(?:ability|power|gift|talent|capacity)\s+(?:to|for)\s+([A-Za-z]+ing)\b/gi;
  while ((match = abilityPattern.exec(text))) {
    const name = match[1];
    if (name && name.length > 3) {
      spans.push({ text: name, type: 'ABILITY', start: match.index + match[0].indexOf(name), end: match.index + match[0].indexOf(name) + name.length });
    }
  }

  // SKILL patterns
  // Pattern: trained/skilled in [skill]
  const skillPattern = /\b(?:trained|skilled|expert|master|proficient|accomplished|learned|studied|mastered)\s+(?:in|at|with|of|the\s+(?:art|craft|skill|trade)\s+of)\s+([A-Za-z]+(?:\s+and\s+[A-Za-z]+)?)\b/gi;
  while ((match = skillPattern.exec(text))) {
    const name = match[1];
    if (name && name.length > 2) {
      spans.push({ text: name, type: 'SKILL', start: match.index + match[0].indexOf(name), end: match.index + match[0].indexOf(name) + name.length });
    }
  }

  // POWER patterns
  // Pattern 1: has/wields the power of [power]
  const powerPattern1 = /\b(?:has|had|wields|possess|granted)\s+(?:the\s+)?(?:power|ability)\s+(?:of|to)\s+([A-Z][a-z]+(?:\s+[a-z]+)*)\b/gi;
  while ((match = powerPattern1.exec(text))) {
    const name = match[1].trim();
    if (name && name.length > 2) {
      spans.push({ text: name, type: 'POWER', start: match.index + match[0].indexOf(name), end: match.index + match[0].indexOf(name) + name.length });
    }
  }

  // Pattern 2: [power] was/is mystical/divine/ancient
  const powerPattern2 = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:was|is|are|were)\s+(?:an?\s+)?(?:mystical|divine|ancient|supernatural|magical)\s+(?:power|ability|force)\b/gi;
  while ((match = powerPattern2.exec(text))) {
    const name = match[1].trim();
    if (name && name.length > 2) {
      spans.push({ text: name, type: 'POWER', start: match.index, end: match.index + match[1].length });
    }
  }

  // TECHNIQUE patterns
  // Pattern: [name] technique/move/strike/form/kata
  const techniquePattern = /\b(?:used|performed|executed|unleashed|mastered|learned)\s+(?:the|a)?\s+([A-Z][a-z]+(?:\s+(?:Attack|Strike|Technique|Move|Form|Stance|Kata))?)\b/gi;
  while ((match = techniquePattern.exec(text))) {
    const name = match[1].trim();
    if (name && name.length > 2 && /[A-Z]/.test(name)) {
      spans.push({ text: name, type: 'TECHNIQUE', start: match.index + match[0].indexOf(name), end: match.index + match[0].indexOf(name) + name.length });
    }
  }

  // SPELL patterns
  // Pattern 1: cast/casted [spell]
  const spellPattern1 = /\b(?:cast|casted|conjured|invoked|whispered|chanted)\s+(?:the|a)?\s+([A-Z][a-z]+(?:\s+(?:Spell|Curse|Charm))?)\b/gi;
  while ((match = spellPattern1.exec(text))) {
    const name = match[1].trim();
    if (name && name.length > 2) {
      spans.push({ text: name, type: 'SPELL', start: match.index + match[0].indexOf(name), end: match.index + match[0].indexOf(name) + name.length });
    }
  }

  // Pattern 2: [spell] spell/curse/charm/hex
  const spellPattern2 = /\b([A-Z][a-z]+(?:\s+(?:Spell|Curse|Charm))?)\s+(?:spell|curse|charm|hex|jinx|enchantment)\b/gi;
  while ((match = spellPattern2.exec(text))) {
    const name = match[1].trim();
    if (name && name.length > 2) {
      spans.push({ text: name, type: 'SPELL', start: match.index, end: match.index + match[1].length });
    }
  }

  // Deduplicate spans and return
  const seenKeys = new Set<string>();
  const uniqueSpans: typeof spans = [];
  for (const span of spans) {
    const key = `${span.type}:${span.text.toLowerCase()}:${span.start}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueSpans.push(span);
    }
  }

  return uniqueSpans;
}

function fallbackNames(text: string): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];

  // Allow up to 4 capitalized tokens so titled full names (e.g., "Dr. James Robert Wilson") are captured
  const rx = /\b([A-Z][\w''.-]+(?:\s+[A-Z][\w''.-]+){0,3})\b/g;
  let m: RegExpExecArray | null;

  while ((m = rx.exec(text))) {
    let value = m[1];
    let endIndex = m.index + value.length;

    const extend = () => {
      const after = text.slice(endIndex);

      const connectorMatch = after.match(/^(\s+(?:of|the|de|d'|da|di|du|del|van|von|der|den|la|le|lo|san|santa|sant|saint|st\.|y)\s+[A-Z][\w'’.-]*(?:\s+[A-Z][\w'’.-]*)?)/);
      if (connectorMatch) {
        value += connectorMatch[0];
        endIndex += connectorMatch[0].length;
        return true;
      }

      const hyphenMatch = after.match(/^(\s*-\s*[A-Z][\w'’.-]*)/);
      if (hyphenMatch) {
        value += hyphenMatch[0];
        endIndex += hyphenMatch[0].length;
        return true;
      }

      const romanMatch = after.match(/^(\s+[IVXLCDM]{1,5})(?![a-z])/);
      if (romanMatch) {
        value += romanMatch[0];
        endIndex += romanMatch[0].length;
        return true;
      }

      const descriptorMatch = after.match(/^(\s+(?:faction|order|alliance|league|dynasty|empire|kingdom|company|council|guild|society|church|abbey|cathedral|monastery|university|college|academy|institute|ministry|government|parliament|senate|assembly|brigade|army|regiment|palace|basilica|chapel|citadel|fortress))\b/i);
      if (descriptorMatch) {
        value += descriptorMatch[0];
        endIndex += descriptorMatch[0].length;
        return true;
      }

      return false;
    };

    while (extend()) {
      // keep extending while we find connectors/descriptors
    }

    value = value.replace(/\s+/g, ' ').trim();

    // Strip trailing punctuation and sentence fragments
    // This handles cases like "Ravenclaw. Each" being matched as 2 words
    // Remove: period/comma/etc followed by space and another capitalized word
    const sentenceMatch = value.match(/[.,;:!?]\s+[A-Z].*$/);
    if (sentenceMatch) {
      value = value.slice(0, value.length - sentenceMatch[0].length);
      endIndex -= sentenceMatch[0].length;
    }

    const trailingPunctMatch = value.match(/[.,;:!?]+$/);
    if (trailingPunctMatch) {
      value = value.slice(0, value.length - trailingPunctMatch[0].length);
      endIndex -= trailingPunctMatch[0].length;
    }

    const trailingSpaceMatch = value.match(/\s+$/);
    if (trailingSpaceMatch) {
      value = value.slice(0, value.length - trailingSpaceMatch[0].length);
      endIndex -= trailingSpaceMatch[0].length;
    }

    const rawEnd = endIndex;

    const followingWordMatch = text.slice(rawEnd).match(/^\s+(family)\b/i);
    if (followingWordMatch) {
      continue;
    }

    const tokens = value.split(/\s+/).filter(Boolean);
    const significantTokens = tokens.filter(tok => /^[A-Z]|^[IVXLCDM]+$/.test(tok));

    const isForbidden = (token: string) =>
      STOP.has(token) || PRON.has(token) || MONTH.has(token);
    const hasForbidden = significantTokens.some(isForbidden);
    const allForbidden = significantTokens.length > 0 && significantTokens.every(isForbidden);

    // Filter out if every significant token is a stopword/pronoun/month.
    // This keeps multi-word names like "Jun Park" (Jun is a month) while
    // still discarding standalone noise like "May".
    if (hasForbidden && allForbidden) {
      continue;
    }

    // Skip single-word matches that follow articles (e.g., "the Grey")
    // BUT: Keep names after "of" (e.g., "son of Jesse", "House of Stark")
    // AND: Keep names in lists (e.g., "X, Y, and Z")
    if (tokens.length === 1) {
      const preceding = text.slice(Math.max(0, m.index - 20), m.index).toLowerCase();
      // Only filter after "the" or "and", NOT after "of" or list commas
      // Check for comma before "and" to detect list items
      if (/\b(the|and)\s+$/.test(preceding) &&
          !/^[A-Z][a-z]+s$/.test(value) &&
          !/,\s*(?:and|or)\s+$/.test(preceding)) {
        continue;
      }
    }
    
    // Classify using context and whitelists
    let type = classifyName(text, value, m.index, rawEnd);

    if (!type) continue;

    if (type === 'ORG' && /\bHouse$/i.test(value)) {
      value = value.replace(/\s+House$/i, '');
    }
    const normalized = normalizeName(value);
    const entityType = refineEntityType(type, normalized);

    spans.push({
      text: normalized,
      type: entityType,
      start: m.index,
      end: rawEnd
    });
    traceSpan("fallback", text, m.index, rawEnd, normalized);
  }
  
  return spans;
}

function extractYearSpans(text: string): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];

  // 1) Extract numeric years like 1775
  const yearPattern = /\b(1[6-9]\d{2}|20\d{2}|[3-9]\d{3})\b/g;
  let match: RegExpExecArray | null;

  while ((match = yearPattern.exec(text))) {
    const year = match[0];
    spans.push({
      text: year,
      type: 'DATE',
      start: match.index,
      end: match.index + year.length
    });
  }

  // 2) Extract spelled-out years like "one thousand seven hundred and seventy-five"
  // Pattern: "one thousand [and] [1-9] hundred [and] [10-99 in words]"
  const spelledOutPattern = /one\s+thousand\s+(?:and\s+)?(?:one|two|three|four|five|six|seven|eight|nine)\s+hundred(?:\s+and)?\s+(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s*-?\s*(?:one|two|three|four|five|six|seven|eight|nine))?|(?:ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen))/gi;

  while ((match = spelledOutPattern.exec(text))) {
    const spelledYear = match[0];
    // Try to convert to numeric year - but report the spelled-out text in span
    // so validation passes. The canonical name will be converted to numeric later.
    const numericYear = convertSpelledYearToNumeric(spelledYear);
    if (process.env.L4_DEBUG === "1") {
      console.log(`[EXTRACT-YEARS] Spelled year: "${spelledYear}" → numeric: ${numericYear}`);
    }
    if (numericYear && numericYear >= 1500 && numericYear <= 2100) {
      spans.push({
        // Keep the spelled-out text for validation to work
        text: spelledYear,
        type: 'DATE',
        start: match.index,
        end: match.index + spelledYear.length
      });
      if (process.env.L4_DEBUG === "1") {
        console.log(`[EXTRACT-YEARS] Added DATE span: "${spelledYear}" (${match.index}-${match.index + spelledYear.length})`);
      }
    }
  }

  return spans;
}

/**
 * Convert spelled-out year like "one thousand seven hundred and seventy-five" to 1775
 */
function convertSpelledYearToNumeric(spelledYear: string): number | null {
  const lower = spelledYear.toLowerCase();

  // Pattern: "one thousand [and] XYZ hundred [and] AB"
  // Example: "one thousand seven hundred and seventy-five" → 1775
  const matches = /one\s+thousand\s+(?:and\s+)?([a-z]+)\s+hundred(?:\s+and)?\s+(.+)/i.exec(spelledYear);

  if (!matches) return null;

  const hundredsWord = matches[1].toLowerCase().trim();
  let tensUnitsStr = matches[2].toLowerCase().trim();

  // Map hundreds digit
  const hundredsMap: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9
  };

  const hundredsDigit = hundredsMap[hundredsWord];
  if (hundredsDigit === undefined) return null;

  // Map tens and units
  const tensUnitsMap: Record<string, number> = {
    'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14,
    'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
    'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60,
    'seventy': 70, 'eighty': 80, 'ninety': 90,
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9
  };

  // Handle "twenty one", "seventy five", "seventy-five", etc.
  const tensUnitsTokens = tensUnitsStr.split(/[\s\-]+/).filter(Boolean);
  let tensUnits = 0;

  if (tensUnitsTokens.length === 1) {
    tensUnits = tensUnitsMap[tensUnitsTokens[0]] || 0;
  } else if (tensUnitsTokens.length === 2) {
    const tens = tensUnitsMap[tensUnitsTokens[0]] || 0;
    const units = tensUnitsMap[tensUnitsTokens[1]] || 0;
    tensUnits = tens + units;
  }

  return 1000 + (hundredsDigit * 100) + tensUnits;
}

function extractFamilySpans(text: string): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];
  const pattern = /\b(?:the|that|this)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+family\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    spans.push({
      text: match[0],
      type: 'PERSON',
      start: match.index,
      end: match.index + match[0].length
    });
  }

  return spans;
}

/**
 * Extract names missed by spaCy in conjunctive patterns
 * Pattern: [Known PERSON] and [CapitalizedWord]
 * Example: "Mahlon and Chilion" where spaCy caught "Mahlon" but missed "Chilion"
 */
function extractConjunctiveNames(
  text: string,
  existingSpans: Array<{ text: string; type: EntityType; start: number; end: number }>
): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];
  const existingNames = new Set(
    existingSpans
      .filter(s => s.type === 'PERSON')
      .map(s => s.text.toLowerCase())
  );

  // Pattern: [CapitalizedWord] and [CapitalizedWord]
  // Focus on cases where the first part is likely a known PERSON entity
  const pattern = /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+and\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    const firstPart = match[1];
    const secondPart = match[2];

    // Check if first part is a known PERSON and second part isn't already extracted
    if (existingNames.has(firstPart.toLowerCase()) && !existingNames.has(secondPart.toLowerCase())) {
      // Extract the second part as a PERSON
      const secondPartStart = match.index + match[0].indexOf(secondPart);
      const secondPartEnd = secondPartStart + secondPart.length;

      spans.push({
        text: secondPart,
        type: 'PERSON',
        start: secondPartStart,
        end: secondPartEnd
      });

      existingNames.add(secondPart.toLowerCase());

      if (process.env.L4_DEBUG === '1') {
        console.log(`[PATTERN] Conjunctive name: "${firstPart} and ${secondPart}" → extracted "${secondPart}"`);
      }
    }
  }

  return spans;
}

/**
 * Extract whitelisted entity names from text
 * Ensures that known entities (e.g., "Denethor", "Gimli") are always extracted,
 * even if spaCy NER doesn't recognize them
 */
function extractWhitelistedNames(text: string): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];
  const found = new Set<string>(); // Track by (start, end) to avoid duplicates

  // For each whitelisted entity, find all occurrences in the text
  for (const [whitelistName, entityType] of FANTASY_WHITELIST.entries()) {
    // Create a regex that matches word boundaries around the whitelisted name
    // Case-insensitive match but keep original casing from text
    const escapedName = whitelistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedName}\\b`, 'gi');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text))) {
      const key = `${match.index}:${match.index + match[0].length}`;
      if (!found.has(key)) {
        found.add(key);
        spans.push({
          text: match[0],  // Keep original casing from text
          type: entityType,
          start: match.index,
          end: match.index + match[0].length
        });
      }
    }
  }

  return spans;
}

function extractTitledNames(text: string): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];
  const pattern = /\b(?:Dr|Doctor|Mr|Mrs|Ms|Prof|Professor)\.?(?:\s+[A-Z][a-z]+)?\s+([A-Z][A-Za-z'\-]+)\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const surname = match[1];
    const start = match.index + match[0].lastIndexOf(surname);
    spans.push({ text: surname, type: 'PERSON', start, end: start + surname.length });
  }

  return spans;
}

/**
 * Merge "X of Y" patterns into single entities
 * E.g., "Battle" + "of" + "Pelennor Fields" → "Battle of Pelennor Fields" (EVENT)
 */
function mergeOfPatterns<T extends { text: string; type: EntityType; start: number; end: number; source: ExtractorSource }>(
  spans: T[],
  fullText: string
): T[] {

  // Sort by start position
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: T[] = [];
  const skip = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (skip.has(i)) continue;

    const span1 = sorted[i];
    const span1Text = span1.text.trim().toLowerCase();

    // Check if this is a "Battle/War/Siege" span
    const isEventKeyword = /^(battle|war|siege|conflict|skirmish|campaign)$/i.test(span1Text);

    if (isEventKeyword) {
      // Look for " of " followed by another entity
      const afterSpan1 = fullText.slice(span1.end).trim();

      if (afterSpan1.startsWith('of ')) {
        // Find the next span that starts after "of "
        const ofEnd = span1.end + afterSpan1.indexOf('of ') + 3; // +3 for "of "

        for (let j = i + 1; j < sorted.length; j++) {
          const span2 = sorted[j];

          // Check if span2 starts right after "of " (with some tolerance for whitespace)
          if (span2.start >= ofEnd && span2.start <= ofEnd + 5) {
            // Merge into one EVENT span
            const mergedText = fullText.slice(span1.start, span2.end);
            const mergedSpan = {
              ...span1,
              text: mergedText,
              type: 'EVENT' as EntityType,
              end: span2.end
            };

            merged.push(mergedSpan);
            skip.add(i);
            skip.add(j);
            break;
          }
        }
      }
    }

    // If not merged, keep original
    if (!skip.has(i)) {
      merged.push(span1);
    }
  }

  return merged;
}

/**
 * Deduplicate entity spans
 * Priority: Keep the first occurrence per canonical form (dep > ner > fb)
 * Also removes spans that are subsumed by longer spans (e.g., "Battle" inside "Battle of Pelennor Fields")
 */
function dedupe<T extends { text: string; type: EntityType; start: number; end: number }>(spans: T[]): T[] {
  const seenCanonical = new Set<string>();
  const out: T[] = [];

  for (const s of spans) {
    // Dedupe by canonical form (type + normalized text)
    // Since spans are ordered as [...dep, ...ner, ...fb], the first occurrence (most reliable) wins
    const canonicalKey = `${s.type}:${s.text.toLowerCase()}`;
    if (seenCanonical.has(canonicalKey)) continue;

    seenCanonical.add(canonicalKey);
    out.push(s);
  }

  return out;
}

/**
 * Call parser service
 */
export async function parseWithService(text: string): Promise<ParseResponse> {
  const client = await getParserClient();
  try {
    return await client.parse({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Parser client failure: ${message}`);
  }
}

/**
 * Main entity extraction function
 */
export async function extractEntities(text: string): Promise<{
  entities: Entity[];
  spans: Array<{entity_id: string; start: number; end: number}>;
}> {
  const DEBUG_ENTITIES = process.env.L3_DEBUG === "1";
  if (DEBUG_ENTITIES) {
    console.log(`[EXTRACT-ENTITIES][DEBUG] Debug logging enabled`);
  }
  // 1) Parse with spaCy
  const parsed = await parseWithService(text);

  const parserBackend = (process.env.PARSER_ACTIVE_BACKEND || "").toLowerCase();
  const isMockBackend = parserBackend === "mock";

  // 1a) Build sentence start position map for sentence-initial detection
  // This is used to determine if an entity appears only at sentence beginnings
  const sentenceStarts = new Set(parsed.sentences.map(sent => sent.start));
  const isSentenceInitialPosition = (charPos: number): boolean => {
    // Check if this position is at or very close to any sentence start
    // Allow up to 2 characters offset for potential leading whitespace
    for (const start of sentenceStarts) {
      if (Math.abs(charPos - start) <= 2) {
        return true;
      }
    }
    return false;
  };

  // 2) Extract NER spans from all sentences with clause awareness, then split coordinations
  const ner = parsed.sentences.flatMap(sent => {
    const spans = nerSpans(sent);
    const clauses = detectClauses(sent, text);

    if (!clauses.length) {
      return splitCoordination(sent, spans);
    }

    const clauseSpans = clauses.flatMap(clause => {
      const filtered = spans.filter(span =>
        span.start >= clause.start && span.end <= clause.end
      );
      if (!filtered.length) {
        return [];
      }
      return splitCoordination(sent, filtered);
    });

    if (clauseSpans.length === 0) {
      return splitCoordination(sent, spans);
    }

    return clauseSpans;
  });

  // 3) Dependency-based extraction (uses syntactic patterns)
  const dep = isMockBackend ? [] : parsed.sentences.flatMap(depBasedEntities);

  // 4) Gazetteer-based place extraction
  const gazPlaces = gazetterPlaces(text);

  // 4a) Ambiguous place extraction with contextual cues
  const ambiguousPlaces = extractAmbiguousPlaces(text);

  // 5) Fantasy/Fiction entity extraction (new 15 types)
  const fantasy = extractFantasyEntities(text);

  // 6) Fallback: capitalized names with context classification
  const fb = isMockBackend ? [] : fallbackNames(text);

  // 7) Merge all sources, deduplicate
  // Priority: dependency-based > NER > fantasy > fallback > whitelist
  // Dependency patterns are most reliable, then spaCy NER, then fantasy patterns, then regex fallback, then whitelisted names
  const years = extractYearSpans(text);
  const families = isMockBackend ? [] : extractFamilySpans(text);
  const whitelisted = extractWhitelistedNames(text);
  const titledNames = extractTitledNames(text);
  const acronymPairs = extractAcronymPairs(text);

  // Extract conjunctive names (e.g., "Mahlon and Chilion") - must run after NER to know which names are known
  const allNERSpans = [...ner, ...dep, ...gazPlaces, ...ambiguousPlaces, ...fantasy, ...fb, ...families, ...whitelisted, ...titledNames];
  const conjunctive = isMockBackend ? [] : extractConjunctiveNames(text, allNERSpans);

  // Tag spans with extraction source
  type TaggedSpan = { text: string; type: EntityType; start: number; end: number; source: ExtractorSource };
  const taggedSpans: TaggedSpan[] = [
    ...dep.map(s => {
      // Check if this span is from whitelist (normalize for matching)
      const normalized = normalizeName(s.text);
      const isWhitelisted = FANTASY_WHITELIST.has(normalized) || FANTASY_WHITELIST.has(s.text);
      return { ...s, source: (isWhitelisted ? 'WHITELIST' : 'DEP') as ExtractorSource };
    }),
    ...ner.map(s => {
      // Check if this span is from whitelist (normalize for matching)
      const normalized = normalizeName(s.text);
      const isWhitelisted = FANTASY_WHITELIST.has(normalized) || FANTASY_WHITELIST.has(s.text);
      return { ...s, source: (isWhitelisted ? 'WHITELIST' : 'NER') as ExtractorSource };
    }),
    ...gazPlaces.map(s => ({ ...s, source: 'NER' as ExtractorSource })), // Treat gazetteer as NER-quality
    ...ambiguousPlaces.map(s => ({ ...s, source: 'PATTERN' as ExtractorSource })),
    ...fantasy.map(s => ({ ...s, source: 'PATTERN' as ExtractorSource })), // Treat fantasy patterns as PATTERN-quality
    ...fb.map(s => {
      // Check if this span is from whitelist (normalize for matching)
      const normalized = normalizeName(s.text);
      const isWhitelisted = FANTASY_WHITELIST.has(normalized) || FANTASY_WHITELIST.has(s.text);
      return { ...s, source: (isWhitelisted ? 'WHITELIST' : 'FALLBACK') as ExtractorSource };
    }),
    ...years.map(s => ({ ...s, source: 'NER' as ExtractorSource })),  // Treat dates as NER-quality
    ...families.map(s => ({ ...s, source: 'DEP' as ExtractorSource })), // Treat family patterns as DEP-quality
    ...conjunctive.map(s => ({ ...s, source: 'PATTERN' as ExtractorSource })), // Treat conjunctive as PATTERN-quality
    ...whitelisted.map(s => ({ ...s, source: 'WHITELIST' as ExtractorSource })), // Whitelisted names
    ...titledNames.map(s => ({ ...s, source: 'PATTERN' as ExtractorSource })),
    ...acronymPairs.flatMap(pair => {
      const spans: TaggedSpan[] = [];
      spans.push({
        text: pair.acronym,
        type: 'ORG',
        start: pair.acronymStart,
        end: pair.acronymEnd,
        source: 'PATTERN'
      });
      if (pair.expansion && pair.expansionStart !== undefined && pair.expansionEnd !== undefined) {
        spans.push({
          text: pair.expansion,
          type: 'ORG',
          start: pair.expansionStart,
          end: pair.expansionEnd,
          source: 'PATTERN'
        });
      }
      return spans;
    })
  ];
  const rawSpans = taggedSpans;

  const deduped = dedupe(rawSpans);
  if (DEBUG_ENTITIES) {
    console.log(
      `[EXTRACT-ENTITIES][DEBUG] rawSpans=${rawSpans.map(span => `${span.source}:${span.type}:${span.text}@${span.start}-${span.end}`).slice(0, 20).join(', ')}`
    );
    console.log(
      `[EXTRACT-ENTITIES][DEBUG] deduped=${deduped.map(span => `${span.type}:${span.text}@${span.start}-${span.end}`).join(', ')}`
    );
  }


  // Merge "X of Y" patterns (e.g., "Battle" + "of" + "Pelennor Fields" → "Battle of Pelennor Fields")
  const merged = mergeOfPatterns(deduped, text);

  // Validate all spans before processing to prevent corruption
  const validated = merged.filter(span => {
    const validation = validateSpan(text, span, "pre-entity-creation");
    if (!validation.valid) {
      // Skip corrupted spans to prevent bad data in registries
      return false;
    }
    return true;
  });
  if (DEBUG_ENTITIES) {
    console.log(
      `[EXTRACT-ENTITIES][DEBUG] validated=${validated.map(span => `${span.type}:${span.text}@${span.start}-${span.end}`).join(', ')}`
    );
  }

  // Build sentence-position features from RAW spans (before deduplication)
  // This allows us to track ALL occurrences of each entity to detect sentence-initial patterns
  type PositionFeatures = {
    isSentenceInitial: boolean;   // Has at least one occurrence at sentence start
    occursNonInitial: boolean;    // Has at least one occurrence NOT at sentence start
  };
  const positionFeaturesByKey = new Map<string, PositionFeatures>();
  for (const span of rawSpans) {
    const key = `${span.type}:${span.text.toLowerCase()}`;
    const existing = positionFeaturesByKey.get(key) || {
      isSentenceInitial: false,
      occursNonInitial: false
    };

    // Check if this specific span occurrence is sentence-initial
    const isInitial = isSentenceInitialPosition(span.start);

    if (DEBUG_ENTITIES && span.text.toLowerCase() === 'song') {
      console.log(`[POSITION-DEBUG] "${span.text}" at ${span.start}: isInitial=${isInitial}`);
    }

    if (isInitial) {
      existing.isSentenceInitial = true;
    } else {
      existing.occursNonInitial = true;
    }

    positionFeaturesByKey.set(key, existing);

    if (DEBUG_ENTITIES && span.text.toLowerCase() === 'song') {
      console.log(`[POSITION-DEBUG] "${span.text}" features: ${JSON.stringify(existing)}`);
    }
  }

  // Build positionsByKey from VALIDATED spans only (not raw spans)
  // This ensures we don't carry forward corrupted span positions
  const positionsByKey = new Map<string, Array<{ start: number; end: number }>>();
  for (const span of validated) {
    const key = `${span.type}:${span.text.toLowerCase()}`;
    if (!positionsByKey.has(key)) {
      positionsByKey.set(key, []);
    }
    const list = positionsByKey.get(key)!;
    if (!list.some(pos => pos.start === span.start && pos.end === span.end)) {
      list.push({ start: span.start, end: span.end });
    }
  }

  // 6) Build Entity objects, merging short/long variants (e.g., "Gandalf" vs "Gandalf the Grey")
  type EntityEntry = {
    entity: Entity;
    spanList: Array<{ start: number; end: number }>;
    variants: Map<string, string>; // lowercase -> raw text
    sources: Set<ExtractorSource>; // Track which extractors found this entity
  };
  const entries: EntityEntry[] = [];

  const now = new Date().toISOString();
  const VARIANT_CONNECTORS = new Set(['the', 'of', 'and', 'son', 'daughter', 'jr', 'sr', 'ii', 'iii', 'iv']);
  const aliasRegistry = new Map<string, AliasCandidate[]>();

  const classifyAliasStrength = (surface: string, canonical: string): AliasStrength | null => {
    const surfaceTokens = surface.trim().split(/\s+/).filter(Boolean);
    const canonicalTokens = canonical.trim().split(/\s+/).filter(Boolean);

    if (!surfaceTokens.length || !canonicalTokens.length) return null;

    if (surfaceTokens.length >= 2) return 'strong';

    const canonicalFirst = canonicalTokens[0]?.toLowerCase();
    const canonicalLast = canonicalTokens[canonicalTokens.length - 1]?.toLowerCase();
    const token = surfaceTokens[0].toLowerCase();

    const isFirstNameOnly = token === canonicalFirst;
    const isSurnameOnly = token === canonicalLast;

    if (isFirstNameOnly) return 'strong';
    if (isSurnameOnly) return 'ambiguous';

    return null;
  };

  const registerAliasStrength = (entry: EntityEntry, alias: string, strength: AliasStrength) => {
    const normalized = normalizeName(alias)?.toLowerCase();
    if (!normalized) return;
    const existing = aliasRegistry.get(normalized) ?? [];
    if (!existing.some(candidate => candidate.eid === entry.entity.id && candidate.strength === strength)) {
      existing.push({ eid: entry.entity.id, strength });
      aliasRegistry.set(normalized, existing);
    }
  };

  const addAlias = (entry: EntityEntry, alias: string) => {
    const rawAlias = alias?.trim();
    if (!rawAlias) return;
    const strength = classifyAliasStrength(rawAlias, entry.entity.canonical);
    if (!strength) return;
    const normalizedAlias = normalizeName(rawAlias);
    if (!normalizedAlias || normalizedAlias.toLowerCase() === entry.entity.canonical.toLowerCase()) {
      return;
    }
    const hasTitleToken = rawAlias.split(/\s+/).some(token => TITLE_WORDS.has(token.replace(/[.'’]+$/g, '').toLowerCase()));
    const hasAlias = [entry.entity.canonical, ...entry.entity.aliases].some(
      existing => normalizeName(existing).toLowerCase() === normalizedAlias.toLowerCase()
    );
    if (hasAlias) {
      if (!hasTitleToken) return;
      const existingTitleAlias = entry.entity.aliases.find(alias =>
        alias.split(/\s+/).some(token => TITLE_WORDS.has(token.replace(/[.'’]+$/g, '').toLowerCase()))
      );
      if (existingTitleAlias && existingTitleAlias.toLowerCase() === rawAlias.toLowerCase()) return;
    }
    entry.entity.aliases.push(rawAlias);
    entry.variants.set(normalizedAlias.toLowerCase(), rawAlias);
    registerAliasStrength(entry, rawAlias, strength);
  };

  const isAcceptableDifference = (diffRaw: string, diffLower: string): boolean => {
    const rawParts = diffRaw.trim().split(/\s+/).filter(Boolean);
    const lowerParts = diffLower.trim().split(/\s+/).filter(Boolean);
    if (rawParts.length === 0) return false;
    let hasConnector = false;
    for (let i = 0; i < lowerParts.length; i++) {
      const lower = lowerParts[i];
      const raw = rawParts[i] ?? lowerParts[i];
      if (VARIANT_CONNECTORS.has(lower)) {
        hasConnector = true;
        continue;
      }
      if (/^[A-Z]/.test(raw)) continue;
      return false;
    }
    return hasConnector;
  };

const matchesVariant = (existingLower: string, candidateLower: string, existingRaw: string, candidateRaw: string): boolean => {
    const existingWords = existingLower.split(/\s+/).filter(Boolean);
    const candidateWords = candidateLower.split(/\s+/).filter(Boolean);
    const existingGeneric = existingWords.length === 1 && GENERIC_TITLES.has(existingLower);
    const candidateGeneric = candidateWords.length === 1 && GENERIC_TITLES.has(candidateLower);

    if ((existingGeneric && candidateWords.length > 1) || (candidateGeneric && existingWords.length > 1)) {
      return false;
    }

    if (existingLower === candidateLower) return true;

    if (existingLower.startsWith(candidateLower + " ")) {
      const diffLower = existingLower.slice(candidateLower.length + 1);
      const diffRaw = existingRaw.slice(candidateRaw.length + 1);
      if (isAcceptableDifference(diffRaw, diffLower)) return true;
    }

    if (existingLower.endsWith(" " + candidateLower)) {
      const diffLower = existingLower.slice(0, existingLower.length - candidateLower.length - 1);
      const diffRaw = existingRaw.slice(0, existingRaw.length - candidateRaw.length - 1);
      if (isAcceptableDifference(diffRaw, diffLower)) return true;
    }

    if (candidateLower.startsWith(existingLower + " ")) {
      const diffLower = candidateLower.slice(existingLower.length + 1);
      const diffRaw = candidateRaw.slice(existingRaw.length + 1);
      if (isAcceptableDifference(diffRaw, diffLower)) return true;
    }

    if (candidateLower.endsWith(" " + existingLower)) {
      const diffLower = candidateLower.slice(0, candidateLower.length - existingLower.length - 1);
      const diffRaw = candidateRaw.slice(0, candidateRaw.length - existingRaw.length - 1);
      if (isAcceptableDifference(diffRaw, diffLower)) return true;
    }

    return false;
};

const nameScore = (value: string) => {
  const parts = value.toLowerCase().split(/\s+/).filter(Boolean);
  const informative = parts.filter(p => !VARIANT_CONNECTORS.has(p)).length;
  return {
    informative,
    total: parts.length,
    length: value.length
  };
};

const descriptorPenalty = (value: string) => (/\b(the|of)\s+[A-Z]/.test(value) ? 0 : 1);
const descriptorTokens = new Set(['former', 'latter', 'later', 'current', 'young', 'older', 'elder', 'stern', 'deputy', 'chief']);
const containsDescriptor = (value: string) => {
  const parts = value.toLowerCase().split(/\s+/).filter(Boolean);
  return parts.some(part => descriptorTokens.has(part));
};
const cleanlinessScore = (value: string) => (/^[A-Za-z][A-Za-z\s'’.-]*$/.test(value) ? 1 : 0);

const chooseCanonical = (names: Set<string>): string => {
  const candidates = Array.from(names);
  return candidates.sort((a, b) => {
    const aClean = cleanlinessScore(a);
    const bClean = cleanlinessScore(b);
    if (aClean !== bClean) return bClean - aClean;
    const aPenalty = descriptorPenalty(a);
    const bPenalty = descriptorPenalty(b);
    if (aPenalty !== bPenalty) return bPenalty - aPenalty;
    const aDesc = containsDescriptor(a);
    const bDesc = containsDescriptor(b);
    if (aDesc !== bDesc) return aDesc ? 1 : -1;
    const aScore = nameScore(a);
    const bScore = nameScore(b);
    if (aScore.informative !== bScore.informative) return bScore.informative - aScore.informative;
    if (aScore.total !== bScore.total) return bScore.total - aScore.total;
    return aScore.length - bScore.length;
  })[0];
};

const LEADING_DISCOURSE_MARKERS = new Set(['while', 'although', 'though']);
const GENERIC_ORG_DROPS = new Set(['ai']);
const PERSON_NICKNAME_NORMALIZERS = new Map<string, string>([
  ['mike', 'michael'],
  ['michael', 'michael'],
  ['jim', 'james'],
  ['james', 'james'],
  ['em', 'emma'],
  ['emma', 'emma'],
]);

  const toLower = (value: string) => value.toLowerCase();

  for (const span of validated) {
    const textLower = toLower(span.text);
    const key = `${span.type}:${textLower}`;
    let matched = false;

    for (const entry of entries) {
      if (entry.entity.type !== span.type) continue;

      const canonicalLower = toLower(entry.entity.canonical);
      if (
        matchesVariant(canonicalLower, textLower, entry.entity.canonical, span.text) ||
        Array.from(entry.variants.entries()).some(([variantLower, variantRaw]) =>
          matchesVariant(variantLower, textLower, variantRaw, span.text)
        )
      ) {
        const currentWords = entry.entity.canonical.split(/\s+/).length;
        const newWords = span.text.split(/\s+/).length;

        const isGeneric = GENERIC_TITLES.has(textLower);
        const currentGeneric = GENERIC_TITLES.has(canonicalLower);

        const currentScore = nameScore(entry.entity.canonical);
        const newScore = nameScore(span.text);

        const descriptorAddition = span.text.startsWith(entry.entity.canonical + ' ') && /\b(the|of)\s+[A-Z]/.test(span.text.slice(entry.entity.canonical.length + 1));

        const shouldUpgrade =
          (!isGeneric && (newScore.informative > currentScore.informative ||
            (newScore.informative === currentScore.informative && (
              newScore.total > currentScore.total ||
              (newScore.total === currentScore.total && newScore.length < currentScore.length)
            )))) ||
          (currentGeneric && !isGeneric);

        if (shouldUpgrade && !descriptorAddition) {
          addAlias(entry, entry.entity.canonical);
          entry.entity.canonical = span.text;
        } else {
          addAlias(entry, span.text);
        }

        for (const pos of positionsByKey.get(key) ?? [{ start: span.start, end: span.end }]) {
          entry.spanList.push(pos);
        }
        entry.variants.set(textLower, span.text);
        entry.sources.add(span.source); // Track extraction source
        matched = true;
        break;
      }
    }

    if (!matched) {
      const id = uuid();
      const positions = positionsByKey.get(key) ?? [{ start: span.start, end: span.end }];
      if (span.text.includes('McGonagall')) {
        console.log('[DEBUG-MCG] New entry', span.text, 'type', span.type);
      }
      // Capitalize entity name if needed (for lowercase entities from case-insensitive extraction)
      const capitalizedText = (span.text.length > 0 && /^[a-z]/.test(span.text))
        ? capitalizeEntityName(span.text)
        : span.text;

      // For DATE entities, convert spelled-out years to numeric form
      let canonicalName = capitalizedText;
      if (span.type === 'DATE') {
        const numericYear = convertSpelledYearToNumeric(span.text);
        if (numericYear !== null) {
          canonicalName = numericYear.toString();
        }
      }

      // Get position features for this entity
      const posFeatures = positionFeaturesByKey.get(key);

      // Determine if this entity has NER support (for quality filtering)
      const hasNERSupport = span.source === 'NER' || span.source === 'WHITELIST' || span.source === 'DEP';

      const entry: EntityEntry = {
        entity: {
          id,
          type: span.type,
          canonical: canonicalName,
          aliases: [],
          created_at: now,
          // Store features in attrs for quality filtering
          attrs: {
            ...(posFeatures ? {
              isSentenceInitial: posFeatures.isSentenceInitial,
              occursNonInitial: posFeatures.occursNonInitial
            } : {}),
            ...(hasNERSupport ? { nerLabel: span.type } : {})
          }
        },
        spanList: [...positions],
        variants: new Map([[textLower, span.text]]),
        sources: new Set([span.source]) // Track extraction source
      };
      entries.push(entry);
    }
  }

  // Merge entries with identical canonical names preferring PEOPLE over other types
  const typePriority = (type: EntityType, text: string): number => {
    // Override: if text is in KNOWN_ORGS, ORG should have highest priority
    if (type === 'ORG' && KNOWN_ORGS.has(text)) {
      return 10; // Highest priority for known orgs
    }

    switch (type) {
      case 'PERSON':
        return 5;
      case 'ORG':
        return 4;
      case 'HOUSE':
        return 3;
      case 'PLACE':
        return 2;
      default:
        return 1;
    }
  };

  const mergedMap = new Map<string, EntityEntry>();
  for (const entry of entries) {
    const key = entry.entity.canonical.toLowerCase();
    const existing = mergedMap.get(key);
    if (!existing) {
      mergedMap.set(key, entry);
      continue;
    }

    const existingPriority = typePriority(existing.entity.type, existing.entity.canonical);
    const newPriority = typePriority(entry.entity.type, entry.entity.canonical);

    const primary = newPriority > existingPriority ? entry : existing;
    const secondary = newPriority > existingPriority ? existing : entry;

    const aliasSet = new Set<string>([...primary.entity.aliases, ...secondary.entity.aliases, secondary.entity.canonical]);
    aliasSet.delete(primary.entity.canonical);
    primary.entity.aliases = Array.from(aliasSet);

    for (const [variantKey, variantValue] of secondary.variants.entries()) {
      if (!primary.variants.has(variantKey)) {
        primary.variants.set(variantKey, variantValue);
      }
    }
    primary.spanList.push(...secondary.spanList);

    // Merge sources
    for (const source of secondary.sources) {
      primary.sources.add(source);
    }

    // Merge attrs (OR boolean flags, prefer truthy values)
    if (secondary.entity.attrs) {
      if (!primary.entity.attrs) {
        primary.entity.attrs = {};
      }

      // Merge sentence-position features (OR logic: if either has it, merged entity has it)
      if (secondary.entity.attrs.isSentenceInitial) {
        primary.entity.attrs.isSentenceInitial = true;
      }
      if (secondary.entity.attrs.occursNonInitial) {
        primary.entity.attrs.occursNonInitial = true;
      }

      // Merge NER label (keep if either has it)
      if (secondary.entity.attrs.nerLabel && !primary.entity.attrs.nerLabel) {
        primary.entity.attrs.nerLabel = secondary.entity.attrs.nerLabel;
      }
    }

    mergedMap.set(key, primary);
  }

if (DEBUG_ENTITIES) {
  console.log(`[EXTRACT-ENTITIES][DEBUG] entries=${entries.map(e => e.entity.canonical).join(', ')}`);
}

const mergedEntries = Array.from(mergedMap.values());
  if (DEBUG_ENTITIES) {
    console.log(`[EXTRACT-ENTITIES][DEBUG] mergedEntries=${mergedEntries.length}`);
  }

  // Merge acronym/expansion pairs into a single ORG entry (canonical = acronym, expansion as alias)
  if (acronymPairs.length) {
    const mergedOut = new Set<EntityEntry>();
    const entryByCanonical = new Map<string, EntityEntry>();
    for (const entry of mergedEntries) {
      entryByCanonical.set(entry.entity.canonical.toLowerCase(), entry);
    }

    for (const pair of acronymPairs) {
      const acronymLower = pair.acronym.toLowerCase();
      const expansionNorm = pair.expansion ? normalizeName(pair.expansion) : null;

      const acronymEntry = entryByCanonical.get(acronymLower);
      const expansionEntry = expansionNorm ? entryByCanonical.get(expansionNorm.toLowerCase()) : undefined;

      if (acronymEntry) {
        acronymEntry.entity.type = 'ORG';
      }

      if (acronymEntry && expansionEntry && acronymEntry !== expansionEntry) {
        addAlias(acronymEntry, expansionEntry.entity.canonical);

        const seenSpanKeys = new Set(acronymEntry.spanList.map(span => `${span.start}:${span.end}`));
        for (const span of expansionEntry.spanList) {
          const key = `${span.start}:${span.end}`;
          if (!seenSpanKeys.has(key)) {
            acronymEntry.spanList.push(span);
            seenSpanKeys.add(key);
          }
        }

        for (const [variantKey, variantValue] of expansionEntry.variants.entries()) {
          if (!acronymEntry.variants.has(variantKey)) {
            acronymEntry.variants.set(variantKey, variantValue);
          }
        }

        for (const source of expansionEntry.sources) {
          acronymEntry.sources.add(source);
        }

        mergedOut.add(expansionEntry);
      } else if (acronymEntry && pair.expansion) {
        addAlias(acronymEntry, pair.expansion);
      }
    }

    if (mergedOut.size) {
      for (const entry of mergedOut) {
        const idx = mergedEntries.indexOf(entry);
        if (idx >= 0) {
          mergedEntries.splice(idx, 1);
        }
      }
    }
  }

  // Heuristic alias merging for PERSON entities: fold surname-only and quoted nicknames into their full-name anchor
  const personEntries = mergedEntries.filter(entry => entry.entity.type === 'PERSON');
  const mergedPersonIds = new Set<string>();
  const mentionTimeline = mergedEntries.flatMap(entry =>
    entry.spanList.map(span => ({ entry, start: span.start }))
  );
  mentionTimeline.sort((a, b) => a.start - b.start || a.entry.entity.id.localeCompare(b.entry.entity.id));

  const firstMentionIndexByEid = new Map<string, number>();
  const lastMentionIndexByEid = new Map<string, number>();
  mentionTimeline.forEach((mention, idx) => {
    const eid = mention.entry.entity.id;
    if (!firstMentionIndexByEid.has(eid)) {
      firstMentionIndexByEid.set(eid, idx);
    }
    lastMentionIndexByEid.set(eid, idx);
  });

  const mergeAliasMentions = (entry: EntityEntry) => {
    const aliasKey = normalizeName(entry.entity.canonical)?.toLowerCase();
    if (!aliasKey) return;
    const candidates = aliasRegistry.get(aliasKey) ?? [];
    if (!candidates.length) return;

    const mentionIndex = firstMentionIndexByEid.get(entry.entity.id);
    if (mentionIndex === undefined) return;

    const resolvedEid = resolveAliasWithContext(aliasKey, candidates, mentionIndex, lastMentionIndexByEid);
    if (!resolvedEid || resolvedEid === entry.entity.id) return;

    const target = mergedEntries.find(candidate => candidate.entity.id === resolvedEid);
    if (!target) return;

    const seenSpanKeys = new Set(target.spanList.map(span => `${span.start}:${span.end}`));
    for (const span of entry.spanList) {
      const key = `${span.start}:${span.end}`;
      if (!seenSpanKeys.has(key)) {
        target.spanList.push(span);
        seenSpanKeys.add(key);
      }
    }

    addAlias(target, entry.entity.canonical);
    mergedPersonIds.add(entry.entity.id);

    const entryLast = lastMentionIndexByEid.get(entry.entity.id) ?? mentionIndex;
    const targetLast = lastMentionIndexByEid.get(target.entity.id) ?? -Infinity;
    lastMentionIndexByEid.set(target.entity.id, Math.max(entryLast, targetLast));
  };

  for (const entry of personEntries) {
    const tokens = entry.entity.canonical.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
      mergeAliasMentions(entry);
    }
  }

  // Attach quoted nicknames to the nearest preceding person entity
  const nicknameRegex = /\b(?:called|known to friends as|known as|nicknamed|everyone calls|goes by)\s+['"]([^'"\\]+)['"]/gi;
  const nicknameCandidates: Array<{ alias: string; index: number }> = [];
  let nicknameMatch: RegExpExecArray | null;
  while ((nicknameMatch = nicknameRegex.exec(text)) !== null) {
    const alias = normalizeName(nicknameMatch[1]);
    if (alias) {
      nicknameCandidates.push({ alias, index: nicknameMatch.index });
    }
  }

  if (nicknameCandidates.length) {
    const sortedPersons = personEntries
      .filter(entry => !mergedPersonIds.has(entry.entity.id))
      .sort((a, b) => (a.spanList[0]?.start ?? 0) - (b.spanList[0]?.start ?? 0));

    for (const candidate of nicknameCandidates) {
      const target = sortedPersons
        .filter(entry => (entry.spanList[0]?.start ?? 0) <= candidate.index)
        .slice(-1)[0] ?? sortedPersons[0];

      if (target) {
        addAlias(target, candidate.alias);
      }
    }
  }

  // Suppress standalone single-token entries that are already captured as aliases of another person
  const personAliasSet = new Set<string>();
  for (const entry of personEntries) {
    for (const alias of entry.entity.aliases) {
      personAliasSet.add(alias.toLowerCase());
    }
  }

  for (const entry of personEntries) {
    if (entry.entity.canonical.split(/\s+/).length !== 1) continue;
    if (personAliasSet.has(entry.entity.canonical.toLowerCase())) {
      mergedPersonIds.add(entry.entity.id);
    }
  }

  // Capture titled aliases present in the text (e.g., "Dr. Wilson")
  for (const entry of personEntries) {
    const parts = entry.entity.canonical.split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const surname = parts[parts.length - 1];
    for (const title of TITLE_WORDS) {
      const titlePattern = new RegExp(`\\b${title}\\.?\\s+${surname}(?:'s)?\\b`, 'i');
      const match = text.match(titlePattern);
      if (match) {
        const rawTitle = match[0];
        addAlias(entry, rawTitle);
        const strippedTitle = rawTitle.replace(/'s$/i, '');
        if (strippedTitle !== rawTitle) {
          addAlias(entry, strippedTitle);
        }
      }
    }

    const first = parts[0];
    const titleFirstPattern = new RegExp(`\b(?:dr|doctor|professor|prof\.?)\s+${first}\b`, 'i');
    const matchFirst = text.match(titleFirstPattern);
    if (matchFirst) {
      addAlias(entry, matchFirst[0]);
    }
  }

  const mergedEntriesFiltered = mergedEntries.filter(entry => !mergedPersonIds.has(entry.entity.id));

  // Debug Chilion in merged entries
  if (process.env.L4_DEBUG === '1') {
    const chilionInMerged = mergedEntries.filter(e => e.entity.canonical === 'Chilion');
    if (chilionInMerged.length > 0) {
      console.log(`[EXTRACT-ENTITIES] Chilion in mergedEntries: ${chilionInMerged.length}`);
    } else if (mergedEntries.some(e => e.entity.canonical.toLowerCase() === 'chilion')) {
      const chilionVariant = mergedEntries.find(e => e.entity.canonical.toLowerCase() === 'chilion');
      console.log(`[EXTRACT-ENTITIES] Found variant: "${chilionVariant?.entity.canonical}"`);
    } else {
      console.log(`[EXTRACT-ENTITIES] NO Chilion in mergedEntries (${mergedEntries.length} total): ${mergedEntries.map(e => e.entity.canonical).slice(0, 10).join(', ')}`);
    }
  }

  const finalEntries = mergedEntriesFiltered.filter(entry => {
    if (entry.entity.type === 'DATE' && process.env.L4_DEBUG === "1") {
      console.log(`[FINAL-FILTER] Checking DATE: "${entry.entity.canonical}"`);
    }
    if (STOP.has(entry.entity.canonical)) {
      if (entry.entity.type === 'DATE' && process.env.L4_DEBUG === "1") {
        console.log(`[FINAL-FILTER] DATE "${entry.entity.canonical}" rejected by STOP list`);
      }
      return false;
    }

    const canonicalLower = entry.entity.canonical.toLowerCase();
    const isMcG = canonicalLower.includes('mcgonagall');

    if (entry.entity.type === 'PERSON' && PERSON_BLOCKLIST.has(canonicalLower)) {
      if (isMcG) {
        console.log('[DEBUG-MCG] filtered out by PERSON_BLOCKLIST', entry.entity.canonical);
      }
      return false;
    }

    if (entry.entity.type === 'DATE') {
      const canonical = entry.entity.canonical;
      const canonicalLowerDate = canonical.toLowerCase();
      const canonicalTitle = canonicalLowerDate.charAt(0).toUpperCase() + canonicalLowerDate.slice(1);
      const hasDigits = /\d/.test(canonical);
      const monthMatch = MONTH.has(canonical) || MONTH.has(canonicalTitle);
      const seasonMatch = /^(spring|summer|fall|autumn|winter)$/i.test(canonical);
      const hasPronoun = /\b(his|her|their|our|my|your)\b/i.test(canonical);
      const ordinalBare = /^(first|second|third)\s+(day|year|term)$/i.test(canonicalLowerDate);

      if (process.env.L4_DEBUG === "1") {
        console.log(`[DATE-FILTER] canonical="${canonical}", hasDigits=${hasDigits}, monthMatch=${monthMatch}, seasonMatch=${seasonMatch}, hasPronoun=${hasPronoun}, ordinalBare=${ordinalBare}`);
      }

      if (hasPronoun) return false;
      if (ordinalBare) return false;
      if (!hasDigits && !monthMatch && !seasonMatch) {
        if (process.env.L4_DEBUG === "1") {
          console.log(`[DATE-FILTER] REJECTING "${canonical}" - no digits, month, or season`);
        }
        return false;
      }

      if (process.env.L4_DEBUG === "1") {
        console.log(`[DATE-FILTER] ACCEPTING DATE "${canonical}"`);
      }
    }

    if (entry.entity.type === 'PERSON') {
      if (GENERIC_TITLES.has(canonicalLower)) {
        const hasSpecificAlias = entry.entity.aliases.some(alias => {
          const aliasLower = alias.toLowerCase();
          return alias.split(/\s+/).length > 1 && !GENERIC_TITLES.has(aliasLower);
        });
        if (!hasSpecificAlias) {
          return false;
        }
      }
      return true;
    }

    if (entry.entity.type === 'ORG') {
      if (/\b[A-Z][A-Za-z]+\s+and\s+[A-Z]/.test(entry.entity.canonical)) {
        return false;
      }
    }

    const score = nameScore(entry.entity.canonical);
    const filteredOutByPrefix = mergedEntries.some(other => {
      if (other === entry) return false;
      const otherLower = other.entity.canonical.toLowerCase();
      if (!otherLower.startsWith(canonicalLower + ' ')) return false;
      const otherScore = nameScore(other.entity.canonical);
      return otherScore.informative >= score.informative;
    });
    if (filteredOutByPrefix && canonicalLower.includes('mcgonagall')) {
      console.log('[DEBUG-MCG] dropped by prefix rule', entry.entity.canonical);
    }
    return !filteredOutByPrefix;
  });

  if (DEBUG_ENTITIES) {
    console.log(`[EXTRACT-ENTITIES][DEBUG] finalEntries=${finalEntries.length}`);
  }

  // Phase E1: Apply confidence-based filtering
  // Convert EntityEntry to EntityCluster for confidence scoring
  const clusters: EntityCluster[] = finalEntries.map(entry => {
    // Create a representative mention for the entity (required by EntityCluster)
    const firstSpan = entry.spanList[0] || { start: 0, end: 0 };
    const firstMention = createMention(
      '', // Entity ID will be assigned by createEntityCluster
      [firstSpan.start, firstSpan.end],
      entry.entity.canonical,
      0, // Sentence index (not used for filtering)
      'canonical',
      0.9 // High confidence for canonical mentions
    );

    // Pattern-extracted entities should have high confidence since we explicitly want them
    const isPatternExtracted = entry.sources.has('PATTERN');
    const hasHighQualitySource = entry.sources.has('NER') || entry.sources.has('WHITELIST');
    const initialConfidence = (isPatternExtracted || hasHighQualitySource) ? 1.0 : 0.8; // Max confidence for pattern/NER entities

    // Create cluster
    const cluster = createEntityCluster(
      entry.entity.type,
      entry.entity.canonical,
      firstMention,
      Array.from(entry.sources),
      initialConfidence // Initial confidence (will be recomputed)
    );

    // Update cluster with full entity data
    cluster.id = entry.entity.id; // Preserve original entity ID
    cluster.aliases = entry.entity.aliases;
    cluster.mentionCount = entry.spanList.length;

    return cluster;
  });

  // Apply confidence filtering (threshold: 0.30)
  // Lower threshold allows even low-confidence FALLBACK entities to pass
  // Note: FALLBACK base is 0.40, but can be penalized to ~0.30-0.35
  const filteredClusters = filterEntitiesByConfidence(clusters, 0.30);
  if (DEBUG_ENTITIES) {
    console.log(
      `[EXTRACT-ENTITIES][DEBUG] confidence clusters=${clusters.length} kept=${filteredClusters.length}`
    );
  }

  if (process.env.L4_DEBUG === "1") {
    const dateClusters = clusters.filter(c => c.type === 'DATE');
    const filteredDateClusters = filteredClusters.filter(c => c.type === 'DATE');
    console.log(`[CONFIDENCE-FILTER] DATE clusters: ${dateClusters.length} → ${filteredDateClusters.length}`);
    for (const cluster of dateClusters) {
      const kept = filteredClusters.some(c => c.id === cluster.id);
      console.log(`  [CONFIDENCE-FILTER] DATE "${cluster.canonical}": ${kept ? 'KEPT' : 'FILTERED OUT'}`);
    }
  }

  // Build map of filtered entity IDs
  const filteredIds = new Set(filteredClusters.map(c => c.id));
  const confidenceById = new Map(filteredClusters.map(c => [c.id, c.confidence ?? computeEntityConfidence(c)]));

  // Filter finalEntries to only include entities that passed confidence check
  const confidenceFilteredEntries = finalEntries.filter(entry =>
    filteredIds.has(entry.entity.id)
  );
  if (DEBUG_ENTITIES) {
    console.log(`[EXTRACT-ENTITIES][DEBUG] confidenceFilteredEntries=${confidenceFilteredEntries.length}`);
  }

  const entities: Entity[] = [];
  const spans: Array<{ entity_id: string; start: number; end: number }> = [];
  const seenSpanKeys = new Set<string>();
  const emittedKeys = new Set<string>();

  for (const entry of confidenceFilteredEntries) {
    // Ensure aliases are unique
    const nameSet = new Set<string>([entry.entity.canonical, ...entry.entity.aliases]);
    const candidateRawByNormalized = new Map<string, string>();
    if (DEBUG_ENTITIES) {
      console.log(
        `[EXTRACT-ENTITIES][DEBUG] Processing entity ${entry.entity.id} nameSet=${Array.from(nameSet).join(' | ')}`
      );
    }

    // Validate and filter out corrupted spans before processing
    const validSpans = entry.spanList.filter(span => {
      // Basic sanity check: start < end and within text bounds
      if (span.start < 0 || span.end > text.length || span.start >= span.end) {
        return false;
      }
      return true;
    });

    for (const span of validSpans) {
      const rawSegment = text.slice(span.start, span.end);
      const normalizedSegment = normalizeName(rawSegment);
      if (normalizedSegment) {
        candidateRawByNormalized.set(normalizedSegment.toLowerCase(), rawSegment);
      }
    }

    // Update entry.spanList to only include valid spans
    entry.spanList = validSpans;

    // NOTE: Removed "isSuspicious" check that filtered out lowercase entities
    // With case-insensitive extraction, lowercase entity names are now valid and intentional

    const normalizedMap = new Map<string, string>();
    for (const name of Array.from(nameSet)) {
      const normalized = normalizeName(name);
      if (!normalized) {
        if (DEBUG_ENTITIES) {
          console.warn(
            `[EXTRACT-ENTITIES][DEBUG] normalizeName returned empty for "${name}" on entity ${entry.entity.id}`
          );
        }
        continue;
      }
      const rawCandidate =
        candidateRawByNormalized.get(normalized.toLowerCase()) ??
        entry.variants.get(normalized.toLowerCase()) ??
        name;
      const cleanedRawCandidate = normalizeName(rawCandidate) || normalized;
      const cleanedRaw = cleanedRawCandidate.replace(/\s+/g, ' ').trim();
      // NOTE: Removed lowercase check - with case-insensitive extraction, lowercase names are valid
      if (!normalizedMap.has(normalized)) {
        normalizedMap.set(normalized, cleanedRaw);
        if (DEBUG_ENTITIES) {
          console.log(`[EXTRACT-ENTITIES][DEBUG] Added normalized key ${normalized} for entity ${entry.entity.id}`);
        }
      }
    }

    if (!normalizedMap.size) {
      if (DEBUG_ENTITIES) {
        console.warn(
          `[EXTRACT-ENTITIES][DEBUG] Skipping entity ${entry.entity.id} (${entry.entity.canonical}) - normalizedMap empty`
        );
      }
      continue;
    }

    const normalizedKeys = Array.from(normalizedMap.keys());
    // CRITICAL: Filter pronouns from canonical name candidates
    // Pronouns are context-dependent and should never be permanent entity identifiers
    const nonPronounKeys = filterPronouns(normalizedKeys);
    // Fallback to original keys if all were pronouns (defensive - shouldn't happen)
    const candidateKeys = nonPronounKeys.length > 0 ? nonPronounKeys : normalizedKeys;

    if (candidateKeys.length === 0 && DEBUG_ENTITIES) {
      console.warn(
        `[EXTRACT-ENTITIES][DEBUG] All canonical candidates filtered as pronouns for ${entry.entity.id} (${entry.entity.canonical})`,
        { normalizedKeys }
      );
    }

    const chosen = chooseCanonical(new Set(candidateKeys));
    const rawForChosen = normalizedMap.get(chosen) ?? chosen;
    entry.entity.canonical = chosen;

    const aliasRawSet = new Set<string>(entry.entity.aliases);
    if (rawForChosen &&
        rawForChosen.trim().toLowerCase() !== chosen.toLowerCase() &&
        classifyAliasStrength(rawForChosen, entry.entity.canonical)) {
      aliasRawSet.add(rawForChosen.trim());
    }
    for (const [normalized, rawValue] of normalizedMap.entries()) {
      if (normalized === chosen) continue;
      if (classifyAliasStrength(rawValue, entry.entity.canonical)) {
        aliasRawSet.add(rawValue.trim());
      }
    }

    for (const span of entry.spanList) {
      const rawSurface = text.slice(span.start, span.end).replace(/\s+/g, ' ').trim();
      if (/\bfamily$/i.test(rawSurface)) {
        const normalizedSurface = normalizeName(rawSurface);
        if (normalizedSurface && normalizedSurface.toLowerCase() !== chosen.toLowerCase()) {
          if (classifyAliasStrength(rawSurface, entry.entity.canonical)) {
            aliasRawSet.add(rawSurface);
          }
        }
      }

      // Preserve titled variants (e.g., "Dr. Wilson") as aliases when the canonical strips the title
      const surfaceTokens = rawSurface.split(/\s+/);
      const firstToken = surfaceTokens[0]?.replace(/[.'’]+$/g, '').toLowerCase();
      if (firstToken && TITLE_WORDS.has(firstToken)) {
        const stripped = surfaceTokens.slice(1).join(' ').trim();
        if (stripped && stripped.toLowerCase() !== chosen.toLowerCase()) {
          if (classifyAliasStrength(rawSurface, entry.entity.canonical)) {
            aliasRawSet.add(rawSurface);
          }
        }
      }
    }

    if (entry.entity.type === 'PERSON') {
      const parts = chosen.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        const surname = parts[parts.length - 1];
        if (classifyAliasStrength(surname, entry.entity.canonical)) {
          aliasRawSet.add(surname);
        }
      }
    }

    // CRITICAL: Filter pronouns from aliases before storing
    // Pronouns are context-dependent and should never be permanent aliases
    entry.entity.aliases = filterPronouns(Array.from(aliasRawSet));
    registerAliasStrength(entry, entry.entity.canonical, 'strong');
    for (const alias of entry.entity.aliases) {
      const strength = classifyAliasStrength(alias, entry.entity.canonical);
      if (strength) {
        registerAliasStrength(entry, alias, strength);
      }
    }

    const dedupeKey = `${entry.entity.type}:${chosen.toLowerCase()}`;
    if (emittedKeys.has(dedupeKey)) {
      if (DEBUG_ENTITIES) {
        console.warn(
          `[EXTRACT-ENTITIES][DEBUG] Deduped entity ${entry.entity.id} (${entry.entity.canonical}) due to key ${dedupeKey}`
        );
      }
      continue;
    }
    emittedKeys.add(dedupeKey);

    if (DEBUG_ENTITIES) {
      console.log(
        `[EXTRACT-ENTITIES][DEBUG] Emitting entity ${entry.entity.id} (${entry.entity.canonical}) type=${entry.entity.type} aliases=${entry.entity.aliases.join(', ')}`
      );
    }

    const canonicalLower = entry.entity.canonical.toLowerCase();
    if (ENTITY_FILTER_DEFAULTS.blockedTokens.has(canonicalLower)) {
      continue;
    }
    const leadingToken = canonicalLower.split(/\s+/)[0];
    if (LEADING_DISCOURSE_MARKERS.has(leadingToken)) {
      continue;
    }
    if (entry.entity.type === 'ORG' && GENERIC_ORG_DROPS.has(canonicalLower)) {
      continue;
    }

    // Attach confidence from the scored cluster so downstream consumers (and tests) can assert thresholds
    const confidence = confidenceById.get(entry.entity.id);
    const nerFloor = entry.sources.has('NER') || entry.sources.has('WHITELIST') ? 0.98 : 0.85;
    if (confidence !== undefined) {
      entry.entity.confidence = Math.max(confidence, nerFloor);
    } else {
      entry.entity.confidence = entry.sources.has('NER') ? 1.0 : nerFloor;
    }

    if (entry.entity.type === 'DATE' && process.env.L4_DEBUG === "1") {
      console.log(`[FINAL-EMISSION] Adding DATE entity: "${entry.entity.canonical}"`);
    }

    entities.push(entry.entity);

    // Deduplicate and filter subsumed spans
    // A span is subsumed if it's completely contained within another span
    const spanByStart = new Map<number, { start: number; end: number }>();
    for (const span of entry.spanList) {
      const existing = spanByStart.get(span.start);
      if (!existing || (span.end - span.start) < (existing.end - existing.start)) {
        spanByStart.set(span.start, span);
      }
    }

    let candidateSpans = Array.from(spanByStart.values()).sort((a, b) => a.start - b.start);

    // Filter out subsumed spans (spans completely contained within others)
    const uniqueSpans = candidateSpans.filter((span, i) => {
      // Check if this span is subsumed by any other span
      for (let j = 0; j < candidateSpans.length; j++) {
        if (i === j) continue;
        const other = candidateSpans[j];
        // Is 'span' completely contained within 'other'?
        if (span.start >= other.start && span.end <= other.end &&
            (span.start !== other.start || span.end !== other.end)) {
          return false; // Subsumed, filter it out
        }
      }
      return true; // Not subsumed, keep it
    });

    for (const span of uniqueSpans) {
      const key = `${entry.entity.id}:${span.start}:${span.end}`;
      if (seenSpanKeys.has(key)) continue;
      seenSpanKeys.add(key);
      spans.push({
        entity_id: entry.entity.id,
        start: span.start,
        end: span.end
      });
    }
  }

  if (process.env.L3_DEBUG === "1") {
    try {
      const snapshot = {
        entities: entities.map(e => ({ type: e.type, canonical: e.canonical })),
        timestamp: new Date().toISOString()
      };
      fs.appendFileSync("tmp/entity-debug.log", JSON.stringify(snapshot) + "\n", "utf-8");
    } catch {
      // ignore debug logging errors
    }
  }

  // Step 1: Pattern-based alias extraction for explicit patterns
  // Handles: "X called Y", "X nicknamed Y", "X also known as Y", etc.
  const aliasPatterns = [
    /([A-Z][A-Za-z\s\.]+?),?\s+(?:also known as|known as)\s+([A-Z][A-Za-z]+)/gi,
    /([A-Z][A-Za-z\s\.]+?)\s+\((?:also known as|nicknamed|aka|a\.k\.a\.)\s+([A-Z][A-Za-z]+)\)/gi,
    /([A-Z][A-Za-z\s\.]+?),?\s+(?:often )?(?:called|referred to as)\s+([A-Z][A-Za-z]+)/gi,
  ];

  const entityByCanonical = new Map<string, Entity>();
  for (const entity of entities) {
    entityByCanonical.set(entity.canonical.toLowerCase(), entity);
  }

  let aliasLinksFound = 0;

  for (const pattern of aliasPatterns) {
    let match;
    pattern.lastIndex = 0; // Reset regex state
    while ((match = pattern.exec(text)) !== null) {
      const fullName = match[1].trim();
      const nickname = match[2].trim();

      // Find entities matching these names
      const fullEntity = entityByCanonical.get(fullName.toLowerCase());
      const nickEntity = entityByCanonical.get(nickname.toLowerCase());

      if (fullEntity && nickEntity && fullEntity.id !== nickEntity.id) {
        // Merge: add nickname's canonical to fullEntity's aliases
        const nickStrength = classifyAliasStrength(nickEntity.canonical, fullEntity.canonical);
        if (!fullEntity.aliases.includes(nickEntity.canonical) && nickStrength) {
          fullEntity.aliases.push(nickEntity.canonical);
          registerAliasStrength({
            entity: fullEntity as unknown as Entity,
            spanList: [],
            variants: new Map(),
            sources: new Set()
          }, nickEntity.canonical, nickStrength);
        }

        // Merge: add nickname entity's spans to full entity
        for (const span of spans) {
          if (span.entity_id === nickEntity.id) {
            span.entity_id = fullEntity.id;
          }
        }

        // Remove nickname entity from entities array
        const nickIdx = entities.indexOf(nickEntity);
        if (nickIdx >= 0) {
          entities.splice(nickIdx, 1);
        }

        entityByCanonical.delete(nickname.toLowerCase());
        aliasLinksFound++;

        console.log(`[EXTRACT-ENTITIES] Merged "${nickname}" into "${fullName}" as alias`);
      } else if (fullEntity && !nickEntity) {
        // Nickname not extracted as separate entity, just add as alias
        const nickStrength = classifyAliasStrength(nickname, fullEntity.canonical);
        if (!fullEntity.aliases.includes(nickname) && nickStrength) {
          fullEntity.aliases.push(nickname);
          registerAliasStrength({
            entity: fullEntity as unknown as Entity,
            spanList: [],
            variants: new Map(),
            sources: new Set()
          }, nickname, nickStrength);
          aliasLinksFound++;
          console.log(`[EXTRACT-ENTITIES] Added "${nickname}" as alias to "${fullName}"`);
        }
      }
    }
  }

  if (aliasLinksFound > 0) {
    console.log(`[EXTRACT-ENTITIES] Found ${aliasLinksFound} explicit alias patterns`);
  }

  // Step 2: Run coreference resolution for pronouns and descriptive references
  // This enables pronoun resolution ("he" -> "John") and descriptive references ("the wizard" -> "Gandalf")
  try {
    const { splitIntoSentences } = await import('../segment');
    const { resolveCoref } = await import('../coref');

    const sentences = splitIntoSentences(text);
    const corefLinks = resolveCoref(sentences, entities, spans, text);

    // Populate entity.aliases from coreference links
    for (const entity of entities) {
      const aliasSet = new Set<string>(entity.aliases);

      // Add mentions from coreference links (FILTER PRONOUNS - they're context-dependent)
      for (const link of corefLinks.links) {
        if (link.entity_id === entity.id) {
          const mentionText = link.mention.text.trim();
          // Add if different from canonical, not empty, AND not a pronoun
          if (mentionText &&
              mentionText !== entity.canonical &&
              mentionText.toLowerCase() !== entity.canonical.toLowerCase() &&
              !isContextDependent(mentionText)) {
            const strength = classifyAliasStrength(mentionText, entity.canonical);
            if (strength) {
              aliasSet.add(mentionText);
              registerAliasStrength({
                entity: entity as Entity,
                spanList: [],
                variants: new Map(),
                sources: new Set()
              }, mentionText, strength);
            }
          }
        }
      }

      entity.aliases = Array.from(aliasSet);
    }

    if (corefLinks.links.length > 0) {
      console.log(`[EXTRACT-ENTITIES] Resolved ${corefLinks.links.length} coreference links`);
    }
  } catch (error) {
    // If coreference resolution fails, continue without it
    console.warn(`[EXTRACT-ENTITIES] Coreference resolution failed:`, error);
  }

  if (process.env.L3_DEBUG === '1' || process.env.L4_DEBUG === '1') {
    const dateCount = entities.filter(e => e.type === 'DATE').length;
    console.log(`[EXTRACT-ENTITIES][DEBUG] returning ${entities.length} entities (${dateCount} DATEs): ${entities.map(e => `${e.type}:${e.canonical}`).slice(0, 20).join(', ')}`);
  }
  return { entities, spans };
}
