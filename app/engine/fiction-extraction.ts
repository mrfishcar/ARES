/**
 * Fiction-Specific Extraction
 * Patterns optimized for narrative fiction (dialogue, character actions, etc.)
 */

import type { Relation } from './schema';
import { v4 as uuid } from 'uuid';

export type FictionEntityType = 'character' | 'location' | 'artifact' | 'organization' | 'address' | 'other';

export interface FictionEntity {
  name: string;
  type: FictionEntityType;
  mentions: number;
}

const NAME_CORE = "[A-Z][a-z]+(?:[-'’][A-Z][a-z]+)*";
const NAME_CAPTURE = `${NAME_CORE}(?:\\s+${NAME_CORE})*`;
const NAME_PATTERN = `(${NAME_CAPTURE})`;

const TITLE_PATTERN = `(?:Mr\\.|Mrs\\.|Ms\\.|Dr\\.|Sir|Lady|Captain|Prof\\.|Professor|Lord|Madam|Master|Miss)`;

const CONNECTOR_WORDS = new Set([
  'of',
  'the',
  'and',
  'for',
  'to',
  'in',
  'on',
  'at',
  'by',
  'with',
  'from',
  'into',
  'de',
  'la',
  'van',
  'von',
  'del',
  'da',
  'di',
  'no',
  'no.',
  '№',
  'st.',
  'mt.',
  'st',
  'mt'
]);

const LOCATION_KEYWORDS = [
  'city',
  'street',
  'house',
  'garden',
  'gate',
  'rooftop',
  'roof',
  'stairs',
  'stoop',
  'door',
  'hall',
  'office',
  'station',
  'neighborhood',
  'library',
  'church',
  'route',
  'plaza',
  'square',
  'tower',
  'bridge'
];

const ARTIFACT_KEYWORDS = [
  'song',
  'record',
  'player',
  'statue',
  'chair',
  'tune',
  'placard',
  'label',
  'gate',
  'instrument',
  'device',
  'machine',
  'album',
  'painting',
  'journal',
  'book'
];

const ORGANIZATION_KEYWORDS = [
  'ministry',
  'department',
  'company',
  'council',
  'academy',
  'guild',
  'association',
  'agency',
  'office',
  'bureau'
];

const ENTITY_TYPE_PRIORITY: Record<FictionEntityType, number> = {
  character: 6,
  location: 5,
  artifact: 5,
  organization: 4,
  address: 3,
  other: 1
};

const LOWERCASE_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'for',
  'nor',
  'but',
  'so',
  'yet',
  'to',
  'of',
  'in',
  'on',
  'at',
  'by',
  'with',
  'from',
  'into',
  'onto',
  'per',
  'via'
]);

const DESCRIPTIVE_KEYWORDS: Array<{keyword: string; type: FictionEntityType; maxPrefixWords: number}> = [
  {keyword: 'record player', type: 'artifact', maxPrefixWords: 3},
  {keyword: 'record-player', type: 'artifact', maxPrefixWords: 3},
  {keyword: 'song', type: 'artifact', maxPrefixWords: 3},
  {keyword: 'statue', type: 'artifact', maxPrefixWords: 3},
  {keyword: 'gate', type: 'location', maxPrefixWords: 2},
  {keyword: 'house', type: 'location', maxPrefixWords: 3},
  {keyword: 'garden', type: 'location', maxPrefixWords: 3},
  {keyword: 'door', type: 'location', maxPrefixWords: 2},
  {keyword: 'rooftop', type: 'location', maxPrefixWords: 2},
  {keyword: "devil's niece", type: 'character', maxPrefixWords: 3},
  {keyword: 'lovers', type: 'character', maxPrefixWords: 3},
  {keyword: 'couple', type: 'character', maxPrefixWords: 3},
  {keyword: 'tiger', type: 'other', maxPrefixWords: 2},
  {keyword: 'mail carrier', type: 'other', maxPrefixWords: 1}
];

/**
 * Extract character names from fiction using proper name patterns
 * Looks for capitalized names in context (dialogue attribution, actions, etc.)
 */
export function extractFictionCharacters(text: string): Array<{name: string; mentions: number}> {
  const characterCandidates = new Map<string, number>();

  const addCandidate = (raw: string, weight = 1) => {
    const cleaned = normalizeName(raw);
    if (!cleaned) {
      return;
    }
    characterCandidates.set(cleaned, (characterCandidates.get(cleaned) || 0) + weight);
  };

  const speechVerbs = buildVerbAlternation([
    'said',
    'spoke',
    'replied',
    'asked',
    'answered',
    'shouted',
    'whispered',
    'muttered',
    'continued',
    'began',
    'yelled',
    'called',
    'cried',
    'begged',
    'pleaded',
    'warned',
    'insisted',
    'promised',
    'ordered',
    'commanded',
    'urged',
    'remarked',
    'noted',
    'responded',
    'added',
    'whimpered',
    'laughed',
    'sighed'
  ]);

  // Pattern 1: Dialogue attribution - "X said", "X replied", "X asked"
  const dialoguePattern = new RegExp(`((?:${TITLE_PATTERN}\\s+)?${NAME_CAPTURE})\\s+(?:${speechVerbs})`, 'g');
  let match;
  while ((match = dialoguePattern.exec(text)) !== null) {
    addCandidate(match[1]);
  }

  // Pattern 2: Dialogue attribution following quotation - ""...," X said"
  const quoteAttributionPattern = new RegExp(`"[^"]+"\\s*,?\\s*((?:${TITLE_PATTERN}\\s+)?${NAME_CAPTURE})\\s+(?:${speechVerbs})`, 'g');
  while ((match = quoteAttributionPattern.exec(text)) !== null) {
    addCandidate(match[1]);
  }

  // Pattern 3: Possessive - "X's [something]"
  const possessivePattern = new RegExp(`((?:${TITLE_PATTERN}\\s+)?${NAME_CAPTURE})'s\\s+`, 'g');
  while ((match = possessivePattern.exec(text)) !== null) {
    addCandidate(match[1]);
  }

  // Pattern 4: Subject of action verbs - "X walked", "X opened", "X looked"
  const actionVerbs = buildVerbAlternation([
    'walked',
    'ran',
    'opened',
    'closed',
    'looked',
    'turned',
    'stepped',
    'moved',
    'stood',
    'sat',
    'entered',
    'left',
    'fought',
    'helped',
    'grabbed',
    'held',
    'warned',
    'begged',
    'pleaded',
    'promised',
    'betrayed',
    'attacked',
    'chased',
    'pursued',
    'threatened',
    'struck',
    'punched',
    'kicked',
    'slapped',
    'stabbed',
    'shot',
    'hunted',
    'ambushed',
    'confronted',
    'challenged',
    'rescued',
    'saved',
    'comforted',
    'supported',
    'defended',
    'guarded',
    'guided',
    'followed',
    'approached',
    'joined',
    'met',
    'observed',
    'watched',
    'worked',
    'teamed',
    'partnered',
    'embraced',
    'encouraged',
    'reassured',
    'backed',
    'listened',
    'waited',
    'hid',
    'smiled',
    'glared'
  ]);
  const actionPattern = new RegExp(`((?:${TITLE_PATTERN}\\s+)?${NAME_CAPTURE})\\s+(?:${actionVerbs})`, 'g');
  while ((match = actionPattern.exec(text)) !== null) {
    addCandidate(match[1]);
  }

  // Pattern 5: Character introduction - "X, a/an/the [role]"
  const introPattern = new RegExp(`((?:${TITLE_PATTERN}\\s+)?${NAME_CAPTURE}),?\\s+(?:a|an|the)\\s+\\w+`, 'g');
  while ((match = introPattern.exec(text)) !== null) {
    addCandidate(match[1], 0.5);
  }

  // Pattern 6: Title + Name detection even without verbs (e.g., "Mr. Preston")
  const titledNamePattern = new RegExp(`(${TITLE_PATTERN}\\s+${NAME_CAPTURE})`, 'g');
  while ((match = titledNamePattern.exec(text)) !== null) {
    addCandidate(match[1], 0.5);
  }

  // Pattern 7: Nicknames in quotes "Captain "Wildfire" James"
  const nicknamePattern = new RegExp(`(${NAME_CAPTURE})\\s+"([A-Z][^"]+)"\\s+(${NAME_CAPTURE})`, 'g');
  while ((match = nicknamePattern.exec(text)) !== null) {
    addCandidate(match[1]);
    addCandidate(match[3]);
    addCandidate(`${match[1]} "${match[2]}" ${match[3]}`, 1.5);
  }

  // Filter out common false positives and pronouns
  const stopWords = new Set(['He', 'She', 'It', 'They', 'I', 'We', 'You', 'Chapter', 'The', 'His', 'Her', 'Their', 'This', 'That', 'These', 'Those', 'When', 'Where', 'What', 'Who', 'Why', 'How', 'And', 'But', 'Or', 'So', 'Yet', 'For', 'Nor', 'As', 'At', 'By', 'From', 'In', 'Into', 'Of', 'On', 'To', 'With', 'About', 'After', 'Before', 'During', 'Until', 'While', 'Because', 'Since', 'Unless', 'Although', 'Though', 'If', 'Only', 'Even', 'Ever', 'Never', 'Always', 'Sometimes', 'Often', 'Rarely', 'Finally', 'Eventually', 'Suddenly', 'Immediately', 'Quickly', 'Slowly', 'Carefully', 'Loudly', 'Quietly', 'Maybe', 'Perhaps', 'Probably', 'Certainly', 'Definitely', 'Absolutely', 'Completely', 'Entirely', 'Frankly', 'Honestly', 'Actually', 'Really', 'Truly', 'Indeed', 'Surely', 'Besides', 'However', 'Moreover', 'Furthermore', 'Therefore', 'Thus', 'Hence', 'Otherwise', 'Instead', 'Meanwhile', 'Adrenaline', 'Bullet', 'Combined', 'Caged', 'Familiar', 'Bad', 'Good', 'Another', 'Everybody', 'Everything', 'Someone', 'Something', 'Anyone', 'Anything', 'Everyone', 'Like', 'Then', 'Now', 'Here', 'There']);

  const filteredCharacters: Array<{name: string; mentions: number}> = [];
  for (const [name, count] of characterCandidates.entries()) {
    // Must appear with sufficient weight, not be a stop word, and not be a single letter
    if (count >= 1.5 && !stopWords.has(name) && !stopWords.has(name.split(' ')[0]) && name.length > 1) {
      filteredCharacters.push({name, mentions: count});
    }
  }

  return filteredCharacters.sort((a, b) => b.mentions - a.mentions);
}

/**
 * Extract fiction-specific relations
 */
export function extractFictionRelations(
  text: string,
  characters: Array<{name: string; mentions: number}>,
  _docId: string
): Relation[] {
  const relations: Relation[] = [];
  const canonicalNames = new Map<string, string>();
  for (const character of characters) {
    canonicalNames.set(normalizeName(character.name).toLowerCase(), character.name);
  }

  if (canonicalNames.size === 0) {
    return relations;
  }

  const namesPattern = buildNamePattern(Array.from(canonicalNames.values()));
  if (!namesPattern) {
    return relations;
  }

  const seenRelationKeys = new Set<string>();

  // Helper to create a relation
  const addRelation = (subj: string, pred: string, obj: string, extractor: 'fiction-dialogue' | 'fiction-action' | 'fiction-family') => {
    const normalizedSubj = normalizeName(subj).toLowerCase();
    const normalizedObj = normalizeName(obj).toLowerCase();

    const canonicalSubj = canonicalNames.get(normalizedSubj);
    const canonicalObj = canonicalNames.get(normalizedObj);

    if (!canonicalSubj || !canonicalObj) {
      return;
    }

    const key = `${canonicalSubj.toLowerCase()}::${pred}::${canonicalObj.toLowerCase()}`;
    if (seenRelationKeys.has(key)) {
      return;
    }
    seenRelationKeys.add(key);

    // Create temporary entity IDs (these will be matched to real entities later)
    relations.push({
      id: uuid(),
      subj: `fiction:${canonicalSubj}`,
      pred: pred as any,
      obj: `fiction:${canonicalObj}`,
      evidence: [],  // Will be filled in when integrated with full system
      confidence: 0.7,  // Pattern-based extraction - medium confidence
      extractor
    });
  };

  const applyPattern = (pattern: RegExp, pred: string, extractor: 'fiction-dialogue' | 'fiction-action' | 'fiction-family') => {
    pattern.lastIndex = 0;
    let patternMatch;
    while ((patternMatch = pattern.exec(text)) !== null) {
      const subjMatch = patternMatch[1];
      const objMatch = patternMatch[patternMatch.length - 1];
      addRelation(subjMatch, pred, objMatch, extractor);
    }
  };

  // Pattern 1: Dialogue - "X said to Y", "X told Y"
  const speechToVerbs = buildVerbAlternation(['said', 'spoke', 'replied', 'whispered', 'muttered', 'shouted', 'yelled', 'called', 'cried', 'barked', 'murmured', 'hissed', 'insisted']);
  const dialogueToPattern = new RegExp(`(${namesPattern})\\s+(?:${speechToVerbs})\\s+to\\s+(${namesPattern})`, 'gi');
  applyPattern(dialogueToPattern, 'spoke_to', 'fiction-dialogue');

  const speechAtVerbs = buildVerbAlternation(['shouted at', 'yelled at', 'screamed at', 'called at', 'barked at']);
  const dialogueAtPattern = new RegExp(`(${namesPattern})\\s+(?:${speechAtVerbs})\\s+(${namesPattern})`, 'gi');
  applyPattern(dialogueAtPattern, 'spoke_to', 'fiction-dialogue');

  const speechDirectVerbs = buildVerbAlternation([
    'told',
    'warned',
    'asked',
    'begged',
    'pleaded with',
    'pleaded to',
    'urged',
    'reminded',
    'assured',
    'promised',
    'informed',
    'ordered',
    'commanded',
    'instructed',
    'thanked'
  ]);
  const dialogueDirectPattern = new RegExp(`(${namesPattern})\\s+(?:${speechDirectVerbs})\\s+(?:the\\s+|a\\s+|an\\s+|this\\s+|that\\s+|these\\s+|those\\s+|their\\s+|his\\s+|her\\s+)?(${namesPattern})`, 'gi');
  applyPattern(dialogueDirectPattern, 'spoke_to', 'fiction-dialogue');

  const quotedSpeechVerbs = buildVerbAlternation(['said', 'asked', 'whispered', 'replied', 'shouted', 'yelled', 'called', 'cried', 'murmured', 'warned', 'promised', 'begged']);
  const dialogueQuotePattern = new RegExp(`"[^"]+"\\s*,?\\s*(${namesPattern})\\s+(?:${quotedSpeechVerbs})\\s+(?:to\\s+|at\\s+)?(${namesPattern})`, 'gi');
  applyPattern(dialogueQuotePattern, 'spoke_to', 'fiction-dialogue');

  // Pattern 2: Fighting/conflict - "X fought Y", "X attacked Y", "X battled Y"
  const conflictVerbs = buildVerbAlternation([
    'fought',
    'attacked',
    'battled',
    'struck',
    'hit',
    'kicked',
    'punched',
    'slapped',
    'stabbed',
    'shot',
    'killed',
    'hunted',
    'chased',
    'pursued',
    'ambushed',
    'threatened',
    'betrayed',
    'confronted',
    'challenged',
    'blamed',
    'cursed',
    'argued with',
    'fought with',
    'wrestled'
  ]);
  const conflictPattern = new RegExp(`(${namesPattern})\\s+(?:${conflictVerbs})\\s+(?:with\\s+|against\\s+|at\\s+)?(${namesPattern})`, 'gi');
  applyPattern(conflictPattern, 'enemy_of', 'fiction-action');

  // Pattern 3: Helping - "X helped Y", "X saved Y", "X protected Y"
  const supportVerbs = buildVerbAlternation([
    'helped',
    'saved',
    'protected',
    'rescued',
    'assisted',
    'comforted',
    'supported',
    'guided',
    'guarded',
    'defended',
    'encouraged',
    'reassured',
    'healed',
    'treated',
    'backed',
    'stood by',
    'covered'
  ]);
  const helpPattern = new RegExp(`(${namesPattern})\\s+(?:${supportVerbs})\\s+(?:the\\s+|a\\s+|an\\s+|this\\s+|that\\s+|these\\s+|those\\s+|their\\s+|his\\s+|her\\s+)?(${namesPattern})`, 'gi');
  applyPattern(helpPattern, 'ally_of', 'fiction-action');

  // Pattern 4: Family relations - "X, son of Y", "X, daughter of Y"
  const familyPattern = new RegExp(`(${namesPattern}),?\\s+(?:son|daughter)\\s+of\\s+(${namesPattern})`, 'gi');
  applyPattern(familyPattern, 'parent_of', 'fiction-family');

  // Pattern 5: Friendships - "X and Y were friends", "X befriended Y"
  const friendsVerbs = buildVerbAlternation(['were friends', 'became friends', 'are friends', 'stayed friends', 'remained friends']);
  const friendPattern = new RegExp(`(${namesPattern})\\s+(?:and|&)\\s+(${namesPattern})\\s+(?:${friendsVerbs})`, 'gi');
  applyPattern(friendPattern, 'friends_with', 'fiction-action');

  const teamedPattern = new RegExp(`(${namesPattern})\\s+(?:teamed\\s+up\\s+with|worked\\s+with|joined\\s+forces\\s+with|partnered\\s+with|stood\\s+with)\\s+(${namesPattern})`, 'gi');
  applyPattern(teamedPattern, 'ally_of', 'fiction-action');

  // Pattern 6: Meeting - "X met Y", "X encountered Y"
  const meetingVerbs = buildVerbAlternation(['met', 'encountered', 'found', 'discovered', 'joined', 'approached', 'reached', 'caught up with']);
  const meetPattern = new RegExp(`(${namesPattern})\\s+(?:${meetingVerbs})\\s+(?:the\\s+|a\\s+|an\\s+|this\\s+|that\\s+|these\\s+|those\\s+|their\\s+|his\\s+|her\\s+)?(${namesPattern})`, 'gi');
  applyPattern(meetPattern, 'met', 'fiction-action');

  // Pattern 7: Co-occurrence - characters appearing in the same sentence
  // This is a weaker signal but better than nothing for fiction
  const sentences = text.split(/[.!?]+/);
  const cooccurrences = new Map<string, number>();

  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase();
    const mentionedChars = Array.from(canonicalNames.values()).filter(name =>
      sentenceLower.includes(name.toLowerCase())
    );

    // If 2+ characters in same sentence, they interact
    if (mentionedChars.length >= 2) {
      for (let i = 0; i < mentionedChars.length; i++) {
        for (let j = i + 1; j < mentionedChars.length; j++) {
          const pair = [mentionedChars[i], mentionedChars[j]].sort().join('::');
          cooccurrences.set(pair, (cooccurrences.get(pair) || 0) + 1);
        }
      }
    }
  }

  // Create "met" relations for characters that co-occur 2+ times (lowered threshold for fiction)
  for (const [pair, count] of cooccurrences.entries()) {
    if (count >= 2) {
      const [char1, char2] = pair.split('::');
      addRelation(char1, 'met', char2, 'fiction-action');
    }
  }

  return relations;
}

export function extractFictionEntities(text: string): FictionEntity[] {
  const characters = extractFictionCharacters(text);
  const entities = new Map<string, FictionEntity>();

  const addEntity = (rawName: string, type: FictionEntityType, mentions: number) => {
    const cleanedName = tidyEntityName(rawName);
    if (!cleanedName) {
      return;
    }

    const key = cleanedName.toLowerCase();
    const existing = entities.get(key);
    if (existing) {
      existing.mentions += mentions;
      if (ENTITY_TYPE_PRIORITY[type] > ENTITY_TYPE_PRIORITY[existing.type]) {
        existing.type = type;
      }
      if (cleanedName.length > existing.name.length) {
        existing.name = cleanedName;
      }
    } else {
      entities.set(key, {
        name: cleanedName,
        type,
        mentions
      });
    }
  };

  const characterKeys = new Set<string>();
  for (const character of characters) {
    const normalized = normalizeName(character.name).toLowerCase();
    characterKeys.add(normalized);
    addEntity(character.name, 'character', character.mentions);
  }

  const properNouns = collectProperNounPhrases(text);
  for (const {name, mentions} of properNouns) {
    const key = normalizeName(name).toLowerCase();
    if (characterKeys.has(key)) {
      continue;
    }
    const classification = classifyProperNoun(name);
    if (classification === 'other' && mentions < 2) {
      continue;
    }
    addEntity(name, classification, mentions);
  }

  const descriptive = collectDescriptivePhrases(text);
  for (const {name, type, mentions} of descriptive) {
    const key = normalizeName(name).toLowerCase();
    if (characterKeys.has(key)) {
      continue;
    }
    addEntity(name, type, mentions);
  }

  const addressPattern = /\b(?:number|no\.?|#)\s+(\d{2,})\b/gi;
  let addressMatch: RegExpExecArray | null;
  while ((addressMatch = addressPattern.exec(text)) !== null) {
    const address = `Number ${addressMatch[1]}`;
    addEntity(address, 'address', 1);
  }

  return Array.from(entities.values()).sort((a, b) => {
    if (b.mentions !== a.mentions) {
      return b.mentions - a.mentions;
    }
    return a.name.localeCompare(b.name);
  });
}

function normalizeName(raw: string): string {
  return raw
    .replace(/^[\s"“”'‘’`(]+/, '')
    .replace(/[\s"“”'‘’`,.;:!?)+-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildNamePattern(names: string[]): string {
  if (!names.length) {
    return '';
  }

  const escaped = names
    .map(name => normalizeName(name))
    .filter(Boolean)
    .map(name =>
      escapeRegExp(name).replace(/\s+/g, '\\s+')
    )
    .sort((a, b) => b.length - a.length); // Match longer names first

  if (!escaped.length) {
    return '';
  }

  return `(?:${escaped.join('|')})`;
}

function buildVerbAlternation(verbs: string[]): string {
  return verbs
    .map(verb =>
      verb
        .trim()
        .split(/\s+/)
        .map(part => escapeRegExp(part))
        .join('\\s+')
    )
    .join('|');
}

function collectProperNounPhrases(text: string): Array<{name: string; mentions: number}> {
  const counts = new Map<string, {name: string; mentions: number}>();

  const tokens = text.split(/\s+/);
  let currentTokens: string[] = [];
  let capitalizedCount = 0;

  const flush = () => {
    if (currentTokens.length === 0 || capitalizedCount < 2) {
      currentTokens = [];
      capitalizedCount = 0;
      return;
    }

    const phrase = tidyProperNounPhrase(currentTokens.join(' '));
    const normalized = normalizeName(phrase);
    if (!normalized) {
      currentTokens = [];
      capitalizedCount = 0;
      return;
    }
    const key = normalized.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.mentions += 1;
      if (phrase.length > existing.name.length) {
        existing.name = phrase;
      }
    } else {
      counts.set(key, {name: phrase, mentions: 1});
    }
    currentTokens = [];
    capitalizedCount = 0;
  };

  for (const rawToken of tokens) {
    const stripped = rawToken.replace(/^[^A-Za-z0-9№#]+|[^A-Za-z0-9№#]+$/g, '');
    if (!stripped) {
      flush();
      continue;
    }

    const lower = stripped.toLowerCase();
    const isConnector = CONNECTOR_WORDS.has(lower);
    const isRomanNumeral = /^[ivxlcdm]+$/i.test(stripped);
    const isNumber = /^\d+$/.test(stripped);
    const isAllCaps = /^[A-Z]+$/.test(stripped) && stripped.length > 1;
    const isCapitalized = /^[A-Z][A-Za-z'’.-]*$/.test(stripped) || isAllCaps || isRomanNumeral;

    if (isCapitalized) {
      currentTokens.push(stripped);
      capitalizedCount += 1;
    } else if (currentTokens.length && (isConnector || isNumber || isRomanNumeral)) {
      currentTokens.push(formatConnectorToken(stripped, lower));
    } else {
      flush();
    }
  }

  flush();

  return Array.from(counts.values());
}

function classifyProperNoun(phrase: string): FictionEntityType {
  const lower = phrase.toLowerCase();

  if (ARTIFACT_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return 'artifact';
  }

  if (LOCATION_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return 'location';
  }

  if (ORGANIZATION_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return 'organization';
  }

  if (/\bno\.?\s+\d{2,}\b/.test(lower) || /\bnumber\s+\d{2,}\b/.test(lower)) {
    return 'address';
  }

  return 'other';
}

function collectDescriptivePhrases(text: string): Array<{name: string; type: FictionEntityType; mentions: number}> {
  const results = new Map<string, {name: string; type: FictionEntityType; mentions: number}>();

  for (const descriptor of DESCRIPTIVE_KEYWORDS) {
    const keywordPattern = descriptor.keyword
      .split(/\s+/)
      .map(part => escapeRegExp(part).replace(/\\-/g, '[-\\s]?'))
      .join('\\s+');

    const regex = new RegExp(
      `\\b(the|this|that|these|those)\\s+((?:[a-z0-9'’]+\\s+){0,${descriptor.maxPrefixWords}}${keywordPattern})`,
      'gi'
    );

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const determiner = match[1];
      const body = match[2].replace(/\s+/g, ' ').trim();
      const phrase = toTitleCase(`${determiner} ${body}`);
      const key = normalizeName(phrase).toLowerCase();

      const existing = results.get(key);
      if (existing) {
        existing.mentions += 1;
      } else {
        results.set(key, {name: phrase, type: descriptor.type, mentions: 1});
      }
    }
  }

  return Array.from(results.values());
}

function tidyEntityName(raw: string): string {
  const normalized = normalizeName(raw);
  if (!normalized) {
    return normalized;
  }
  return normalized
    .replace(/\bno\b\s+(\d+)/gi, 'No. $1')
    .replace(/\bst\b/gi, 'St.')
    .replace(/\bmt\b/gi, 'Mt.');
}

function tidyProperNounPhrase(phrase: string): string {
  return tidyEntityName(phrase);
}

function formatConnectorToken(original: string, lower: string): string {
  if (lower === 'no' || lower === 'no.' || lower === '№') {
    return 'No.';
  }
  if (lower === 'st' || lower === 'st.') {
    return 'St.';
  }
  if (lower === 'mt' || lower === 'mt.') {
    return 'Mt.';
  }
  return lower;
}

function toTitleCase(phrase: string): string {
  const words = phrase.split(/\s+/);
  return words
    .map((word, index) => {
      if (!word) {
        return word;
      }
      const lower = word.toLowerCase();
      if (index > 0 && LOWERCASE_WORDS.has(lower)) {
        return lower;
      }
      return word[0].toUpperCase() + word.slice(1);
    })
    .join(' ');
}
