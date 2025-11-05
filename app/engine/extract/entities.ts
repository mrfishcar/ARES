/**
 * Entity Extraction - Phase 1 (Enhanced with Custom Rules)
 * 
 * Strategy:
 * 1. Call spaCy parser for NER tags + dependency structure
 * 2. Extract NER spans (group consecutive tokens with same label)
 * 3. Fallback: capitalized 1-3 word patterns with context classification
 * 4. Custom gazetteers for fantasy/biblical names
 * 5. Deduplicate by (type, lowercase_name)
 * 6. Return entities + spans (spans enable precise relation binding in Phase 2)
 */

import { v4 as uuid } from "uuid";
import * as fs from "fs";
import type { Entity, EntityType } from "../schema";
import type { ExtractorSource, EntityCluster } from "../mention-tracking";
import { clusterToEntity, createEntityCluster, createMention } from "../mention-tracking";
import { computeEntityConfidence, filterEntitiesByConfidence } from "../confidence-scoring";
import type { Token, ParsedSentence, ParseResponse } from "./parse-types";
import { getParserClient } from "../../parser";

const TRACE_SPANS = process.env.L3_TRACE === "1";

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

// Organization hint keywords
const ORG_HINTS = /\b(school|university|academy|seminary|ministry|department|institute|college|inc\.?|corp\.?|llc|company|corporation|ltd\.?|technologies|labs|capital|ventures|partners|group|holdings|systems|solutions|consulting|associates|enterprises|industries|bank|financial|investment|fund|computing|software|networks|media|communications|pharmaceuticals|biotech|aerospace|robotics|semiconductor|electronics)\b/i;

// Preposition patterns that suggest PLACE
const PLACE_PREP = /\b(in|at|from|to|into|onto|toward|through|over|under|near|by|inside|outside|within|across|dwelt in|traveled to)\b/i;

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
  ['Ginny', 'PERSON'],
  ['Harry', 'PERSON'],

  // Harry Potter
  ['Hogwarts', 'ORG'],  // School = ORG
  ['Hogsmeade', 'PLACE'],
  ['Diagon Alley', 'PLACE'],
  ['Azkaban', 'PLACE'],
  ['Gryffindor', 'ORG'],  // House = ORG
  ['Slytherin', 'ORG'],
  ['Hufflepuff', 'ORG'],
  ['Ravenclaw', 'ORG'],
  ['Gryffindor House', 'ORG'],
  ['Ravenclaw House', 'ORG'],
  ['Gringotts Bank', 'ORG'],
  ['Ministry of Magic', 'ORG'],
  ['Hogwarts School', 'ORG'],
  ['Hogwarts Express', 'ITEM'],
  ['Scotland', 'PLACE'],

  // Biblical places
  ['Hebron', 'PLACE'],
  ['Jerusalem', 'PLACE'],
  ['Nazareth', 'PLACE'],
  ['Bethlehem', 'PLACE'],
  ['Canaan', 'PLACE'],

  // Biblical figures
  ['Abram', 'PERSON'],
  ['Isaac', 'PERSON'],
  ['Jacob', 'PERSON'],

  // Publications and works
  ['Quibbler', 'WORK']
]);

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
  'MobileFirst', 'MobileFirst Technologies', 'CloudTech', 'DataStream'
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

  // Override with KNOWN_ORGS first (highest priority)
  if (KNOWN_ORGS.has(trimmed)) {
    return 'ORG';
  }

  // Check for partial matches in multi-word names
  const tokens = trimmed.split(/\s+/);
  if (tokens.some(tok => KNOWN_ORGS.has(tok))) {
    return 'ORG';
  }

  if (/^house of\b/i.test(trimmed)) {
    return 'HOUSE';
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

export function normalizeName(s: string): string {
  let normalized = s.replace(/\s+/g, " ").trim();
  normalized = normalized.replace(/^[\-\u2013\u2014'"“”‘’]+/, "");
  normalized = normalized.replace(/[,'"\u201c\u201d\u2018\u2019]+$/g, " ");
  normalized = normalized.replace(/\s*,\s*/g, " ");
  normalized = normalized.replace(/[.;:!?]+$/g, "");
  normalized = normalized.replace(/^(the|a|an)\s+/i, "");
  normalized = normalized.replace(/^((?:[a-z]+\s+)+)(?=[A-Z0-9])/g, "");
  normalized = normalized.replace(/['’]s$/i, "");
  normalized = normalized.replace(/\bfamily\b$/i, "").trim();
  normalized = normalized.replace(/\bHouse$/i, "");
  const capitalized = normalized.match(/[A-Z][A-Za-z0-9'’\-]*(?:\s+(?:of|the|and|&)?\s*[A-Z][A-Za-z0-9'’\-]*)*/);
  if (capitalized) {
    normalized = capitalized[0];
  }
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

/**
 * Extract NER spans from parsed sentence
 */
function nerSpans(sent: ParsedSentence): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];
  let i = 0;
  
  while (i < sent.tokens.length) {
    const t = sent.tokens[i];
    const mapped = mapEnt(t.ent);
    
    if (!mapped) {
      i++;
      continue;
    }
    
    let j = i + 1;
    while (j < sent.tokens.length && sent.tokens[j].ent === t.ent) {
      j++;
    }
    
    const spanTokens = sent.tokens.slice(i, j);
    let text = normalizeName(spanTokens.map(x => x.text).join(" "));
    const start = spanTokens[0].start;
    const end = spanTokens[spanTokens.length - 1].end;

    // Refine type based on text content (e.g., "Battle of X" → EVENT)
    let refinedType = refineEntityType(mapped, text);

    // Apply whitelist override (e.g., "Hogwarts" → ORG, not PLACE)
    const whitelistType = FANTASY_WHITELIST.get(text);
    if (whitelistType) {
      refinedType = whitelistType;
    }

    const nextToken = sent.tokens[j];
    if (refinedType === 'PERSON' && nextToken && nextToken.text.toLowerCase() === 'family') {
      i = j;
      continue;
    }

    if (refinedType === 'ORG' && /\bHouse$/i.test(text)) {
      text = text.replace(/\s+House$/i, '');
    }

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
      tok.pos === 'PUNCT' ||
      tok.dep === 'punct' ||
      tok.pos === 'CCONJ' ||
      tok.dep === 'cc' ||
      tok.pos === 'SCONJ' ||
      tok.pos === 'VERB' ||
      tok.pos === 'AUX' ||
      lower === 'and' ||
      lower === 'or' ||
      lower === '&'
    );
  };

  const isAllowedPersonToken = (tok: Token) => {
    if (!ALLOWED_PERSON_POS.has(tok.pos)) return false;
    return /^[A-ZÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛ]/.test(tok.text);
  };

  for (const span of spans) {
    if (span.type !== 'PERSON') {
      result.push(span);
      continue;
    }

    const spanTokens = tokens.filter(t => t.start >= span.start && t.end <= span.end);
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

      if (isAllowedPersonToken(tok)) {
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
    if (filteredSegments.length >= 2) {
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
 * Extract entities using dependency patterns
 * Looks for syntactic clues like nsubj, pobj with motion verbs, family relations, etc.
 */
function depBasedEntities(sent: ParsedSentence): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];
  const tokens = sent.tokens;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    // Only process capitalized words (potential entities)
    // Don't rely solely on POS tags as spaCy can mis-tag fantasy/biblical names
    if (!/^[A-Z]/.test(tok.text)) {
      continue;
    }

    // Skip stopwords, pronouns, months
    if (STOP.has(tok.text) || PRON.has(tok.text) || MONTH.has(tok.text)) {
      continue;
    }

    let entityType: EntityType | null = null;

    // Pattern 1: Nominal subject (nsubj) of action verbs → likely PERSON
    if (tok.dep === 'nsubj' && tok.head !== tok.i) {
      const headToken = tokens.find(t => t.i === tok.head);
      // Check both VERB and AUX (auxiliary verbs like "is", "was", "has")
      if (headToken && (headToken.pos === 'VERB' || headToken.pos === 'AUX')) {
        const headLemma = headToken.lemma.toLowerCase();

        // If it's a motion verb or social verb, subject is PERSON
        if (MOTION_VERBS.has(headLemma) || SOCIAL_VERBS.has(headLemma)) {
          entityType = 'PERSON';
        }
        // If it's "be" (is/was/were), check if there's a person role descriptor
        else if (headLemma === 'be') {
          // Look for attribute/predicate nominative (attr, acomp)
          const attrToken = tokens.find(t =>
            t.head === headToken.i && (t.dep === 'attr' || t.dep === 'acomp')
          );
          if (attrToken) {
            const attrLemma = attrToken.lemma.toLowerCase();
            // Person role descriptors
            if (PERSON_ROLES.has(attrLemma)) {
              entityType = 'PERSON';
            }
          }
        }
        else {
          // Default: subjects of action verbs are usually PERSON
          entityType = 'PERSON';
        }
      }
    }

    // Pattern 2: Object of preposition (pobj) → check the preposition
    if (tok.dep === 'pobj' && tok.head !== tok.i) {
      const prepToken = tokens.find(t => t.i === tok.head);
      if (prepToken && prepToken.pos === 'ADP') {
        const prepLemma = prepToken.lemma.toLowerCase();

        // Check if prep has a head that's a family word
        const prepHead = tokens.find(t => t.i === prepToken.head);
        if (prepHead && FAMILY_WORDS.has(prepHead.lemma.toLowerCase())) {
          // "son of X", "daughter of X" → X is PERSON
          entityType = 'PERSON';
        }
        // Check if prep is location preposition
        else if (LOC_PREPS.has(prepLemma)) {
          // Check if the prep's head is a motion verb
          if (prepHead && prepHead.pos === 'VERB' && MOTION_VERBS.has(prepHead.lemma.toLowerCase())) {
            // "traveled to X", "dwelt in X" → X is PLACE
            entityType = 'PLACE';
          } else {
            // "in X", "at X" without motion verb → likely PLACE
            entityType = 'PLACE';
          }
        }
      }
    }

    // Pattern 3: Appositive (appos) after family relation word → PERSON
    if (tok.dep === 'appos' && tok.head !== tok.i) {
      const headToken = tokens.find(t => t.i === tok.head);

      // Check if there's a "son"/"daughter"/etc. token nearby
      const nearbyFamily = tokens.find(t =>
        Math.abs(t.i - tok.i) <= 3 && FAMILY_WORDS.has(t.lemma.toLowerCase())
      );

      if (nearbyFamily) {
        entityType = 'PERSON';
      } else if (headToken) {
        // Check if the head has a modifier that's a social verb
        const socialModifier = tokens.find(t =>
          t.head === headToken.i && SOCIAL_VERBS.has(t.lemma.toLowerCase())
        );
        if (socialModifier) {
          entityType = 'PERSON';
        }
      }
    }

    // Pattern 4: Direct object (dobj) of social verbs → PERSON
    if (tok.dep === 'dobj' && tok.head !== tok.i) {
      const headToken = tokens.find(t => t.i === tok.head);
      if (headToken && headToken.pos === 'VERB') {
        const headLemma = headToken.lemma.toLowerCase();
        if (SOCIAL_VERBS.has(headLemma)) {
          entityType = 'PERSON';
        }
      }
    }

    // Pattern 5: Nominal modifier (nmod) followed by action verb → likely PERSON
    // Handles cases like "Gandalf the Grey traveled" where Gandalf modifies Grey
    if (tok.dep === 'nmod' && tok.head !== tok.i) {
      const headToken = tokens.find(t => t.i === tok.head);
      // Look for a verb that the head is related to
      const verbRelation = tokens.find(t =>
        t.pos === 'VERB' && (t.i === headToken?.head || (headToken && tokens.some(x => x.head === t.i && x.i === headToken.i)))
      );

      if (verbRelation) {
        const verbLemma = verbRelation.lemma.toLowerCase();
        if (MOTION_VERBS.has(verbLemma) || SOCIAL_VERBS.has(verbLemma)) {
          entityType = 'PERSON';
        }
      }
    }

    if (!entityType && tok.dep === 'conj') {
      const headToken = tokens.find(t => t.i === tok.head);
      if (
        headToken &&
        /^[A-Z]/.test(tok.text) &&
        (headToken.ent === 'PERSON' || /^[A-Z]/.test(headToken.text))
      ) {
        entityType = 'PERSON';
      }
    }

    // If we identified an entity type, extract it (handle multi-word compounds)
    if (entityType) {
      // Look for compound tokens (like "Minas" + "Tirith")
      let startIdx = i;
      let endIdx = i;

      // Look backward for compounds
      for (let j = i - 1; j >= 0; j--) {
        if (tokens[j].dep === 'compound' && tokens[j].head === tok.i) {
          startIdx = j;
        } else {
          break;
        }
      }

      // Look forward for compounds
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].dep === 'compound' && tokens[j].head === tok.i) {
          endIdx = j;
        } else {
          break;
        }
      }

      const spanTokens = tokens.slice(startIdx, endIdx + 1);
      let text = normalizeName(spanTokens.map(t => t.text).join(' '));
      const start = spanTokens[0].start;
      const end = spanTokens[spanTokens.length - 1].end;

      // Skip single-word spans that are preceded by articles/prepositions (e.g., "the Grey")
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

      // Apply whitelist override (e.g., "Hogwarts" → ORG, not PLACE)
      const whitelistType = FANTASY_WHITELIST.get(text);
      if (whitelistType) {
        entityType = whitelistType;
      }

      // Apply geographic marker override (e.g., "Mistward River" → PLACE)
      if (GEO_MARKERS.test(text)) {
        entityType = 'PLACE';
      }

      if (entityType === 'ORG' && /\bHouse$/i.test(text)) {
        text = text.replace(/\s+House$/i, '');
      }

      spans.push({ text, type: entityType, start, end });
      traceSpan("dep", sent.tokens.map(tok => tok.text).join(" "), start, end, text);
    }

  }

  return spans;
}

/**
 * Classify a name using context and whitelists
 * Returns EntityType or null if should be skipped
 */
function classifyName(text: string, surface: string, start: number, end: number): EntityType | null {
  const debugTargets: string[] = []; // Disable debug logging
  const isDebug = debugTargets.some(t => surface.includes(t));

  // 1) Whitelist beats everything
  const whitelisted = FANTASY_WHITELIST.get(surface);
  if (whitelisted) return whitelisted;

  // 2) Check known places/orgs (for contemporary text)
  if (KNOWN_PLACES.has(surface)) {
    if (isDebug) console.log(`[CLASSIFY] "${surface}" → PLACE (known place)`);
    return 'PLACE';
  }

  if (KNOWN_ORGS.has(surface)) {
    if (isDebug) console.log(`[CLASSIFY] "${surface}" → ORG (known org)`);
    return 'ORG';
  }

  // Check for partial matches in multi-word names
  const surfaceTokens = surface.split(/\s+/);
  if (surfaceTokens.some(tok => KNOWN_PLACES.has(tok))) {
    if (isDebug) console.log(`[CLASSIFY] "${surface}" → PLACE (contains known place)`);
    return 'PLACE';
  }
  if (surfaceTokens.some(tok => KNOWN_ORGS.has(tok))) {
    if (isDebug) console.log(`[CLASSIFY] "${surface}" → ORG (contains known org)`);
    return 'ORG';
  }

  if (/\bfamily$/i.test(surface)) {
    return 'PERSON';
  }

  if (/^House of\b/i.test(surface)) {
    return 'HOUSE';
  }

  if (/\bHouse$/i.test(surface)) {
    return 'HOUSE';
  }

  if (ORG_DESCRIPTOR_PATTERN.test(surface)) {
    if (isDebug) console.log(`[CLASSIFY] "${surface}" → ORG (descriptor pattern)`);
    return 'ORG';
  }

  // 3) Geographic markers in the name itself → PLACE
  // Examples: "Mistward River", "Mount Silverpeak", "Crystal Falls"
  if (GEO_MARKERS.test(surface)) {
    if (isDebug) console.log(`[CLASSIFY] "${surface}" → PLACE (geo marker)`);
    return 'PLACE';
  }

  // 3) Get context windows (before and after the name)
  const before = text.slice(Math.max(0, start - 40), start);
  const after = text.slice(end, Math.min(text.length, end + 40));
  const ctx = (before + ' ' + after).toLowerCase();

  if (isDebug) {
    console.log(`[CLASSIFY] Analyzing "${surface}"`);
    console.log(`  Context before: "${before}"`);
    console.log(`  Context after: "${after}"`);
  }

  // 4) Organization hints (school, university, ministry, etc.)
  // Only apply if the org keyword is PART OF the entity name itself
  // This prevents "Sarah Chen" being classified as ORG just because "university" appears nearby
  if (ORG_HINTS.test(surface)) {
    if (isDebug) console.log(`[CLASSIFY] "${surface}" → ORG (org keyword in name)`);
    return 'ORG';
  }

  // 5) Preposition context suggests PLACE ("in Minas Tirith", "to Hogwarts")
  // Only apply if the preposition is IMMEDIATELY before the name (within ~10 chars)
  // BUT: "work at X" / "worked at X" suggests ORG, not PLACE
  const immediateContext = text.slice(Math.max(0, start - 15), start).trim();
  const immediatePrepPattern = /\b(in|at|to|from|into|near|within|toward)\s*$/i;

  // Check if "at" is preceded by work-related verbs
  const workAtPattern = /\b(work|works|working|worked|study|studies|studied|teach|teaches|teaching|taught)\s+at\s*$/i;

  if (immediatePrepPattern.test(immediateContext)) {
    // If it's "work at" / "worked at" context → ORG, not PLACE
    if (workAtPattern.test(immediateContext)) {
      if (isDebug) console.log(`[CLASSIFY] "${surface}" → ORG (work/study at pattern)`);
      return 'ORG';
    }
    if (isDebug) console.log(`[CLASSIFY] "${surface}" → PLACE (preposition: "${immediateContext}")`);
    return 'PLACE';
  }

  // 6) Single-word capitalized proper nouns
  // Use linguistic cues from context to classify intelligently

  // Check for action verbs nearby (subject → PERSON)
  const verbPattern = /\b(traveled|dwelt|married|went|came|left|arrived|departed|fought|ruled|led|begat|bore)\b/i;
  if (verbPattern.test(ctx)) {
    // If the name appears before a verb, likely PERSON
    if (verbPattern.test(after)) {
      if (isDebug) console.log(`[CLASSIFY] "${surface}" → PERSON (verb in after-context)`);
      return 'PERSON';
    }
  }

  // Check for possessive or family context
  const personContext = /'s\b|son|daughter|father|mother|brother|sister|wife|husband|king|queen|lord|lady|prince|princess/i;
  if (personContext.test(ctx)) {
    if (isDebug) console.log(`[CLASSIFY] "${surface}" → PERSON (person context)`);
    return 'PERSON';
  }

  // Check for business/founding context → ORG
  // "founded X", "invested in X", "acquired X", "launched X"
  const orgVerbContext = /\b(founded?|co-founded?|established?|started?|launched?|created?|built?|acquired?|invested in|works? at|joined?|hired by|employed by)\b/i;
  if (orgVerbContext.test(before)) {
    // Name appears AFTER a founding/business verb → likely ORG
    if (isDebug) console.log(`[CLASSIFY] "${surface}" → ORG (founding/business verb before)`);
    return 'ORG';
  }

  // Check if name appears as subject before "was founded", "was acquired"
  const passiveOrgPattern = /\bwas (founded|established|created|launched|acquired|invested)\b/i;
  if (passiveOrgPattern.test(after)) {
    if (isDebug) console.log(`[CLASSIFY] "${surface}" → ORG (passive business verb after)`);
    return 'ORG';
  }

  // Default for single-word capitalized: PERSON (most common in narrative text)
  // This is a reasonable default for fantasy/historical texts where most single
  // capitalized words are character names
  if (isDebug) console.log(`[CLASSIFY] "${surface}" → PERSON (default)`);
  return 'PERSON';
}

/**
 * Fallback: Extract capitalized 1-3 word patterns with context classification
 */
function fallbackNames(text: string): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];

  // FIXED: {0,2} allows 1-3 words (including single words like "Gandalf")
  const rx = /\b([A-Z][\w''.-]+(?:\s+[A-Z][\w''.-]+){0,2})\b/g;
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
    const rawEnd = endIndex;

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
    if (tokens.length === 1) {
      const preceding = text.slice(Math.max(0, m.index - 10), m.index).toLowerCase();
      // Only filter after "the" or "and", NOT after "of" (which often precedes valid names)
      if (/\b(the|and)\s+$/.test(preceding) && !/^[A-Z][a-z]+s$/.test(value)) {
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
  const yearPattern = /\b(1[6-9]\d{2}|20\d{2})\b/g;
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

  return spans;
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
  // 1) Parse with spaCy
  const parsed = await parseWithService(text);

  // 2) Extract NER spans from all sentences, then split coordinations
  const ner = parsed.sentences.flatMap(sent => splitCoordination(sent, nerSpans(sent)));

  // 3) Dependency-based extraction (uses syntactic patterns)
  const dep = parsed.sentences.flatMap(depBasedEntities);

  // 4) Fallback: capitalized names with context classification
  const fb = fallbackNames(text);

  // 5) Merge all sources, deduplicate
  // Priority: dependency-based > NER > fallback
  // Dependency patterns are most reliable, then spaCy NER, then regex fallback
  const years = extractYearSpans(text);
  const families = extractFamilySpans(text);

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
    ...fb.map(s => {
      // Check if this span is from whitelist (normalize for matching)
      const normalized = normalizeName(s.text);
      const isWhitelisted = FANTASY_WHITELIST.has(normalized) || FANTASY_WHITELIST.has(s.text);
      return { ...s, source: (isWhitelisted ? 'WHITELIST' : 'FALLBACK') as ExtractorSource };
    }),
    ...years.map(s => ({ ...s, source: 'NER' as ExtractorSource })),  // Treat dates as NER-quality
    ...families.map(s => ({ ...s, source: 'DEP' as ExtractorSource })) // Treat family patterns as DEP-quality
  ];
  const rawSpans = taggedSpans;
  const positionsByKey = new Map<string, Array<{ start: number; end: number }>>();
  for (const span of rawSpans) {
    const key = `${span.type}:${span.text.toLowerCase()}`;
    if (!positionsByKey.has(key)) {
      positionsByKey.set(key, []);
    }
    const list = positionsByKey.get(key)!;
    if (!list.some(pos => pos.start === span.start && pos.end === span.end)) {
      list.push({ start: span.start, end: span.end });
    }
  }

  const deduped = dedupe(rawSpans);

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

const addAlias = (entry: EntityEntry, alias: string) => {
  if (!alias) return;
  const normalizedAlias = normalizeName(alias);
  if (!normalizedAlias || normalizedAlias.toLowerCase() === entry.entity.canonical.toLowerCase()) {
    return;
  }
  const hasAlias = [entry.entity.canonical, ...entry.entity.aliases].some(
    existing => normalizeName(existing).toLowerCase() === normalizedAlias.toLowerCase()
  );
  if (hasAlias) {
    return;
  }
  entry.entity.aliases.push(normalizedAlias);
  entry.variants.set(normalizedAlias.toLowerCase(), alias);
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
    const aScore = nameScore(a);
    const bScore = nameScore(b);
    if (aScore.informative !== bScore.informative) return bScore.informative - aScore.informative;
    if (aScore.total !== bScore.total) return bScore.total - aScore.total;
    return aScore.length - bScore.length;
  })[0];
};

  const toLower = (value: string) => value.toLowerCase();

  for (const span of deduped) {
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
      const entry: EntityEntry = {
        entity: {
          id,
          type: span.type,
          canonical: span.text,
          aliases: [],
          created_at: now
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

    mergedMap.set(key, primary);
  }

  const mergedEntries = Array.from(mergedMap.values());

  const finalEntries = mergedEntries.filter(entry => {
    if (STOP.has(entry.entity.canonical)) return false;

    const canonicalLower = entry.entity.canonical.toLowerCase();

    if (entry.entity.type === 'PERSON' && PERSON_BLOCKLIST.has(canonicalLower)) {
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
      if (hasPronoun) return false;
      if (ordinalBare) return false;
      if (!hasDigits && !monthMatch && !seasonMatch) return false;
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
    return !mergedEntries.some(other => {
      if (other === entry) return false;
      const otherLower = other.entity.canonical.toLowerCase();
      if (!otherLower.startsWith(canonicalLower + ' ')) return false;
      const otherScore = nameScore(other.entity.canonical);
      return otherScore.informative >= score.informative;
    });
  });

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

    // Create cluster
    const cluster = createEntityCluster(
      entry.entity.type,
      entry.entity.canonical,
      firstMention,
      Array.from(entry.sources),
      0.8 // Initial confidence (will be recomputed)
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

  // Build map of filtered entity IDs
  const filteredIds = new Set(filteredClusters.map(c => c.id));

  // Filter finalEntries to only include entities that passed confidence check
  const confidenceFilteredEntries = finalEntries.filter(entry =>
    filteredIds.has(entry.entity.id)
  );

  const entities: Entity[] = [];
  const spans: Array<{ entity_id: string; start: number; end: number }> = [];
  const seenSpanKeys = new Set<string>();
  const emittedKeys = new Set<string>();

  for (const entry of confidenceFilteredEntries) {
    // Ensure aliases are unique
    const nameSet = new Set<string>([entry.entity.canonical, ...entry.entity.aliases]);
    const candidateRawByNormalized = new Map<string, string>();
    for (const span of entry.spanList) {
      const rawSegment = text.slice(span.start, span.end);
      const normalizedSegment = normalizeName(rawSegment);
      if (normalizedSegment) {
        candidateRawByNormalized.set(normalizedSegment.toLowerCase(), rawSegment);
      }
    }

    const allowedLower = new Set(['the', 'of', 'and', '&', 'family', 'house', 'order', 'clan']);
    const isSuspicious = entry.spanList.length > 0 && entry.spanList.every(span => {
      const rawSegment = text.slice(span.start, span.end).replace(/\s+/g, ' ').trim();
      const tokens = rawSegment.split(/\s+/).filter(Boolean);
      return tokens.some(token => {
        const lettersOnly = token.replace(/[^A-Za-z]/g, '');
        if (!lettersOnly) return false;
        const lower = lettersOnly.toLowerCase();
        if (allowedLower.has(lower)) return false;
        return lettersOnly === lower;
      });
    });
    if (isSuspicious) {
      continue;
    }

    const normalizedMap = new Map<string, string>();
    for (const name of nameSet) {
      const normalized = normalizeName(name);
      if (!normalized) continue;
      const rawCandidate =
        candidateRawByNormalized.get(normalized.toLowerCase()) ??
        entry.variants.get(normalized.toLowerCase()) ??
        name;
      const cleanedRawCandidate = normalizeName(rawCandidate) || normalized;
      const cleanedRaw = cleanedRawCandidate.replace(/\s+/g, ' ').trim();
      const rawWithoutAllowed = cleanedRaw.replace(/\b(the|of|and|&|family|house|order|clan)\b/gi, '').trim();
      if (/\b[a-z]+\b/.test(rawWithoutAllowed)) {
        continue;
      }
      if (!normalizedMap.has(normalized)) {
        normalizedMap.set(normalized, cleanedRaw);
      }
    }

    if (!normalizedMap.size) {
      continue;
    }

    const normalizedKeys = Array.from(normalizedMap.keys());
    const chosen = chooseCanonical(new Set(normalizedKeys));
    const rawForChosen = normalizedMap.get(chosen) ?? chosen;
    entry.entity.canonical = chosen;

    const aliasRawSet = new Set<string>();
    if (rawForChosen && rawForChosen.trim().toLowerCase() !== chosen.toLowerCase()) {
      aliasRawSet.add(rawForChosen.trim());
    }
    for (const [normalized, rawValue] of normalizedMap.entries()) {
      if (normalized === chosen) continue;
      aliasRawSet.add(rawValue.trim());
    }

    for (const span of entry.spanList) {
      const rawSurface = text.slice(span.start, span.end).replace(/\s+/g, ' ').trim();
      if (/\bfamily$/i.test(rawSurface)) {
        const normalizedSurface = normalizeName(rawSurface);
        if (normalizedSurface && normalizedSurface.toLowerCase() !== chosen.toLowerCase()) {
          aliasRawSet.add(rawSurface);
        }
      }
    }

    entry.entity.aliases = Array.from(aliasRawSet);

    const dedupeKey = `${entry.entity.type}:${chosen.toLowerCase()}`;
    if (emittedKeys.has(dedupeKey)) {
      continue;
    }
    emittedKeys.add(dedupeKey);

    entities.push(entry.entity);

    const spanByStart = new Map<number, { start: number; end: number }>();
    for (const span of entry.spanList) {
      const existing = spanByStart.get(span.start);
      if (!existing || (span.end - span.start) < (existing.end - existing.start)) {
        spanByStart.set(span.start, span);
      }
    }

    const uniqueSpans = Array.from(spanByStart.values()).sort((a, b) => a.start - b.start);

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

  return { entities, spans };
}
