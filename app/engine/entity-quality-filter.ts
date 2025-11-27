/**
 * Entity Quality Filter (Layer 1 of Precision Defense System)
 *
 * Filters low-quality entities BEFORE relation extraction to prevent
 * cascading false positives.
 *
 * Rationale: Bad entities → bad relations
 * - "Maybe" as PERSON → false relations
 * - "It" as ORG → false relations
 * - Pronouns without proper resolution → false relations
 */

import type { Entity, EntityType } from './schema';

export interface EntityQualityConfig {
  minConfidence: number;
  minNameLength: number;
  blockedTokens: Set<string>;
  requireCapitalization: boolean;
  strictMode: boolean; // Extra strict for complex text
}

const TITLE_PREFIXES = new Set([
  'mr', 'mrs', 'miss', 'ms', 'dr', 'doctor',
  'prof', 'professor', 'sir', 'madam', 'madame',
  'lord', 'lady', 'king', 'queen', 'prince', 'princess',
  'captain', 'commander', 'head', 'headmaster', 'headmistress',
  'chief', 'general'
]);

/**
 * LEXICAL SANITY FILTER (Phase 2)
 *
 * Global stopwords for entity filtering - catches common function words,
 * discourse markers, and high-frequency verbs/abstracts that should never
 * be entities.
 *
 * This is broader than the blockedTokens in DEFAULT_CONFIG, covering
 * sentence-initial capitalized words that are still invalid entities.
 */
const GLOBAL_ENTITY_STOPWORDS = new Set([
  // Pronouns (comprehensive list)
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'mine', 'yours', 'hers', 'ours', 'theirs',
  'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves',

  // Determiners and particles
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'some', 'any', 'all', 'each', 'every', 'both', 'few', 'many', 'much',

  // High-frequency verbs that shouldn't be entities (even when capitalized at sentence start)
  'like', 'just', 'really', 'actually', 'maybe', 'must', 'should', 'could',
  'would', 'might', 'will', 'shall', 'can', 'may',
  'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing', 'done',
  'go', 'goes', 'went', 'going', 'gone',
  'get', 'gets', 'got', 'getting', 'gotten',
  'make', 'makes', 'made', 'making',
  'take', 'takes', 'took', 'taking', 'taken',
  'come', 'comes', 'came', 'coming',
  'see', 'sees', 'saw', 'seeing', 'seen',
  'know', 'knows', 'knew', 'knowing', 'known',
  'think', 'thinks', 'thought', 'thinking',
  'say', 'says', 'said', 'saying',
  'tell', 'tells', 'told', 'telling',
  'ask', 'asks', 'asked', 'asking',
  'give', 'gives', 'gave', 'giving', 'given',
  'find', 'finds', 'found', 'finding',
  'want', 'wants', 'wanted', 'wanting',
  'try', 'tries', 'tried', 'trying',
  'use', 'uses', 'used', 'using',
  'work', 'works', 'worked', 'working',
  'call', 'calls', 'called', 'calling',
  'feel', 'feels', 'felt', 'feeling',
  'seem', 'seems', 'seemed', 'seeming',
  'leave', 'leaves', 'left', 'leaving',
  'keep', 'keeps', 'kept', 'keeping',
  'let', 'lets', 'letting',
  'begin', 'begins', 'began', 'beginning', 'begun',
  'help', 'helps', 'helped', 'helping',
  'show', 'shows', 'showed', 'showing', 'shown',
  'hear', 'hears', 'heard', 'hearing',
  'play', 'plays', 'played', 'playing',
  'run', 'runs', 'ran', 'running',
  'move', 'moves', 'moved', 'moving',
  'live', 'lives', 'lived', 'living',
  'believe', 'believes', 'believed', 'believing',
  'bring', 'brings', 'brought', 'bringing',
  'happen', 'happens', 'happened', 'happening',
  'write', 'writes', 'wrote', 'writing', 'written',
  'sit', 'sits', 'sat', 'sitting',
  'stand', 'stands', 'stood', 'standing',
  'lose', 'loses', 'lost', 'losing',
  'pay', 'pays', 'paid', 'paying',
  'meet', 'meets', 'met', 'meeting',
  'include', 'includes', 'included', 'including',
  'continue', 'continues', 'continued', 'continuing',
  'set', 'sets', 'setting',
  'learn', 'learns', 'learned', 'learning',
  'change', 'changes', 'changed', 'changing',
  'lead', 'leads', 'led', 'leading',
  'understand', 'understands', 'understood', 'understanding',
  'watch', 'watches', 'watched', 'watching',
  'follow', 'follows', 'followed', 'following',
  'stop', 'stops', 'stopped', 'stopping',
  'create', 'creates', 'created', 'creating',
  'speak', 'speaks', 'spoke', 'speaking', 'spoken',
  'read', 'reads', 'reading',
  'allow', 'allows', 'allowed', 'allowing',
  'add', 'adds', 'added', 'adding',
  'spend', 'spends', 'spent', 'spending',
  'grow', 'grows', 'grew', 'growing', 'grown',
  'open', 'opens', 'opened', 'opening',
  'walk', 'walks', 'walked', 'walking',
  'win', 'wins', 'won', 'winning',
  'offer', 'offers', 'offered', 'offering',
  'remember', 'remembers', 'remembered', 'remembering',
  'love', 'loves', 'loved', 'loving',
  'consider', 'considers', 'considered', 'considering',
  'appear', 'appears', 'appeared', 'appearing',
  'buy', 'buys', 'bought', 'buying',
  'wait', 'waits', 'waited', 'waiting',
  'serve', 'serves', 'served', 'serving',
  'die', 'dies', 'died', 'dying',
  'send', 'sends', 'sent', 'sending',
  'expect', 'expects', 'expected', 'expecting',
  'build', 'builds', 'built', 'building',
  'stay', 'stays', 'stayed', 'staying',
  'fall', 'falls', 'fell', 'falling', 'fallen',
  'cut', 'cuts', 'cutting',
  'reach', 'reaches', 'reached', 'reaching',
  'kill', 'kills', 'killed', 'killing',
  'remain', 'remains', 'remained', 'remaining',
  'suggest', 'suggests', 'suggested', 'suggesting',
  'raise', 'raises', 'raised', 'raising',
  'pass', 'passes', 'passed', 'passing',
  'sell', 'sells', 'sold', 'selling',
  'require', 'requires', 'required', 'requiring',
  'report', 'reports', 'reported', 'reporting',
  'decide', 'decides', 'decided', 'deciding',
  'pull', 'pulls', 'pulled', 'pulling',

  // Abstract nouns that appear capitalized at sentence start
  // NOTE: Removed potentially ambiguous terms (song, justice, etc.) from here
  // as they can be valid names (e.g., "Song" is a Chinese surname, "Justice" could be a name)
  // These are now checked in type-specific functions with context
  'hello',
  'goodbye',
  'thanks',
  'yes', 'no',

  // Discourse markers
  'however', 'therefore', 'moreover', 'furthermore', 'nevertheless',
  'thus', 'hence', 'consequently', 'accordingly',
  'indeed', 'certainly', 'surely', 'obviously', 'clearly',
  'perhaps', 'possibly', 'probably', 'likely',
  'meanwhile', 'otherwise', 'instead', 'besides',

  // Question words
  'who', 'what', 'where', 'when', 'why', 'how', 'which',

  // Common conjunctions
  'and', 'or', 'but', 'nor', 'yet', 'so', 'for',
  'because', 'since', 'unless', 'until', 'while', 'although', 'though',
  'if', 'then', 'else', 'whether',

  // Prepositions
  'in', 'on', 'at', 'by', 'with', 'from', 'to', 'of', 'for', 'about',
  'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'among', 'under', 'over', 'into', 'onto', 'upon', 'within', 'without',

  // Adverbs
  'very', 'too', 'also', 'only', 'even', 'still', 'never', 'always',
  'often', 'sometimes', 'usually', 'rarely', 'seldom',
  'here', 'there', 'everywhere', 'nowhere', 'somewhere', 'anywhere',
  'now', 'then', 'later', 'soon', 'today', 'yesterday', 'tomorrow',

  // Common adjectives that shouldn't be entities
  'good', 'bad', 'new', 'old', 'first', 'last', 'long', 'short',
  'big', 'small', 'great', 'little', 'own', 'other', 'different', 'same',
  'high', 'low', 'next', 'early', 'young', 'important', 'large', 'small',
  'able', 'ready', 'sure', 'certain', 'clear', 'full', 'free',

  // Generic nouns that are too vague
  'thing', 'things', 'stuff',
  'person', 'people', 'somebody', 'someone', 'anybody', 'anyone', 'nobody', 'everyone',
  'place', 'places', 'somewhere', 'anywhere', 'nowhere', 'everywhere',
  'time', 'times', 'day', 'days', 'year', 'years', 'moment', 'moments',
  'way', 'ways', 'kind', 'sort', 'type',
  'case', 'cases', 'point', 'points', 'part', 'parts',
  'number', 'numbers', 'group', 'groups',
  'example', 'examples', 'instance', 'instances',
  'fact', 'facts', 'idea', 'ideas',
  'problem', 'problems', 'issue', 'issues',
  'situation', 'situations', 'condition', 'conditions',
  'reason', 'reasons', 'result', 'results',
]);

function hasTitlePrefix(name: string): boolean {
  const tokens = name
    .split(/\s+/)
    .map(token => token.toLowerCase())
    .filter(Boolean);
  if (tokens.length < 2) return false;
  return TITLE_PREFIXES.has(tokens[0]);
}

export const DEFAULT_CONFIG: EntityQualityConfig = {
  minConfidence: 0.65,        // Reject entities with confidence < 65%
  minNameLength: 2,            // Reject single-letter entities
  blockedTokens: new Set([
    // Pronouns (should be resolved via coreference, not extracted as entities)
    'he', 'she', 'it', 'they', 'them', 'we', 'us', 'i', 'you', 'me',
    'him', 'her', 'his', 'hers', 'their', 'theirs', 'our', 'ours',

    // Demonstratives
    'this', 'that', 'these', 'those',

    // Determiners
    'the', 'a', 'an',

    // Vague terms
    'something', 'someone', 'somebody', 'somewhere',
    'thing', 'person', 'people', 'place',
    'situation', 'case', 'instance', 'example',
    'way', 'time', 'day', 'year',

    // Question words
    'who', 'what', 'where', 'when', 'why', 'how',

    // Common false positives
    'maybe', 'perhaps', 'if', 'then', 'else',
    'and', 'or', 'but', 'nor',
  ]),
  requireCapitalization: true,  // PERSON/ORG/PLACE must start with capital
  strictMode: false
};

export const STRICT_CONFIG: EntityQualityConfig = {
  ...DEFAULT_CONFIG,
  minConfidence: 0.75,  // Higher bar in strict mode
  minNameLength: 3,      // Longer names required
  strictMode: true
};

/**
 * Check if entity name looks like a valid proper noun
 */
function isValidProperNoun(name: string, type: EntityType): boolean {
  // Proper nouns (PERSON, ORG, PLACE, HOUSE) should start with capital letter
  if (['PERSON', 'ORG', 'PLACE', 'HOUSE', 'TRIBE'].includes(type)) {
    if (hasTitlePrefix(name)) {
      return true;
    }
    const trimmed = name.trim();
    const firstChar = trimmed[0];
    if (!firstChar || firstChar !== firstChar.toUpperCase()) {
      return false;
    }
  }

  return true;
}

/**
 * Check if entity name contains valid characters
 */
function hasValidCharacters(name: string): boolean {
  // Should contain mostly letters
  const letterCount = (name.match(/[a-zA-Z]/g) || []).length;
  const totalChars = name.replace(/\s/g, '').length; // Exclude spaces

  if (totalChars === 0) return false;

  // At least 70% letters (allows for names like "Henry VIII")
  const letterRatio = letterCount / totalChars;
  return letterRatio >= 0.70;
}

/**
 * Validate DATE entities have temporal markers
 */
function isValidDate(name: string): boolean {
  // Dates should contain numbers or temporal keywords
  const hasNumbers = /\d/.test(name);
  const hasTemporalKeywords = /\b(year|month|day|century|age|era|bc|ad|today|yesterday|tomorrow)\b/i.test(name);
  // Also check for spelled-out numbers like "one thousand seven hundred"
  const hasSpelledOutNumbers = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/i.test(name);

  return hasNumbers || hasTemporalKeywords || hasSpelledOutNumbers;
}

/**
 * Check if name is too generic
 */
function isTooGeneric(name: string): boolean {
  const lowerName = name.toLowerCase();

  // Single common words
  const genericWords = [
    'man', 'woman', 'boy', 'girl', 'child',
    'king', 'queen', 'lord', 'lady',
    'group', 'team', 'organization',
    'city', 'town', 'village', 'country',
    'world', 'earth', 'universe',
    'thing', 'stuff', 'item', 'object',
  ];

  if (genericWords.includes(lowerName)) {
    return true;
  }

  // Descriptive phrases without proper nouns
  if (lowerName.match(/^(the|a|an)\s+\w+$/)) {
    // "the man", "a woman", etc.
    return true;
  }

  return false;
}

/**
 * Check if word looks like a surname (vs first name)
 */
function looksLikeSurname(word: string): boolean {
  const lower = word.toLowerCase();

  // Common surname endings
  const surnameEndings = [
    // Patronymic/occupational endings
    'son', 'sen', 'sson', 'ton', 'ham', 'ley', 'field',
    'man', 'stein', 'berg', 'ski', 'sky', 'wicz',
    'ing', 'ford', 'wood', 'ridge', 'dale', 'hill',
    // Additional common endings
    'er', 'or', 'ar',           // Potter, Miller, Granger, etc.
    'kins', 'kin',              // Larkins, Perkins, etc.
    'well', 'wall', 'wick',     // Maxwell, Powell, Warwick, etc.
    'ape', 'ope',               // Snape, Pope, etc.
    'good',                     // Lovegood, etc.
    'more', 'ore',              // Blackmore, Dumbledore, etc.
    'grave', 'grove',           // Graves, Groves, etc.
    'stone', 'strom',           // Stone, Stromberg, etc.
    'water', 'worth',           // Waterford, Worthing, etc.
    'foy', 'roy',               // Malfoy, Leroy, etc.
    'aw', 'ew',                 // Ravenclaw, Crenshaw, etc.
    'om', 'um',                 // Longbottom, etc.
    'in', 'an', 'on',           // Lupin, Petunia->Pettigrew pattern (wider), etc.
  ];

  if (surnameEndings.some(end => lower.endsWith(end))) {
    return true;
  }

  // Common surname prefixes
  const surnamePrefixes = ['mc', 'mac', "o'", 'van', 'von', 'de', 'di', 'du', 'le', 'la'];
  if (surnamePrefixes.some(pre => lower.startsWith(pre))) {
    return true;
  }

  return false;
}

/**
 * Check if name looks like two first names mashed together (no surname)
 */
function looksLikeTwoFirstNames(name: string): boolean {
  const words = name.split(/\s+/).filter(Boolean);

  // Must be exactly 2 words
  if (words.length !== 2) return false;

  // Both must be capitalized
  if (!words.every(w => /^[A-Z]/.test(w))) return false;

  // Check if second word looks like a surname
  const secondWord = words[1];
  if (looksLikeSurname(secondWord)) {
    return false; // Valid: "Harry Potter" (Potter is a surname)
  }

  // Two capitalized words, second is NOT a surname
  // Pattern: "Elimelech Naomi" (two first names - REJECT)
  return true;
}

/**
 * Check if name is a role/title description rather than a proper name
 */
function isRoleBasedName(name: string): boolean {
  const lowerName = name.toLowerCase();
  const words = lowerName.split(/\s+/).filter(Boolean);

  const ROLE_DESCRIPTORS = new Set([
    'man', 'woman', 'boy', 'girl', 'child', 'person', 'people',
    'young', 'old', 'elder', 'eldest', 'youngest',
    'master', 'mistress', 'servant', 'slave',
    'messenger', 'soldier', 'warrior', 'guard',
    'stranger', 'visitor', 'traveler'
  ]);

  // Single role word
  if (words.length === 1 && ROLE_DESCRIPTORS.has(words[0])) {
    return true;
  }

  // "the [role]" or "a [role]"
  if (words.length === 2) {
    const [first, second] = words;
    if ((first === 'the' || first === 'a' || first === 'an') && ROLE_DESCRIPTORS.has(second)) {
      return true;
    }

    // "young man", "old woman"
    if (ROLE_DESCRIPTORS.has(first) && ROLE_DESCRIPTORS.has(second)) {
      return true;
    }
  }

  return false;
}

/**
 * Split a two-first-names entity into constituent parts
 */
function splitTwoFirstNamesEntity(entity: Entity): Entity[] {
  const words = entity.canonical.split(/\s+/).filter(Boolean);
  if (words.length !== 2) return [];

  // Create two entities from the parts
  // Use canonical names as basis for IDs so they naturally dedupe with separately-extracted entities
  return words.map(word => {
    // Generate a deterministic ID based on canonical name (similar to how entities are normally created)
    const canonicalLower = word.toLowerCase();
    const newId = `entity-${entity.type.toLowerCase()}-${canonicalLower}`;

    return {
      ...entity,
      id: newId,
      canonical: word,
      attrs: {
        ...entity.attrs,
        confidence: ((entity.attrs?.confidence as number) || 1.0) * 0.95, // Slightly lower confidence
      }
    };
  });
}

/**
 * PHASE 3: TYPE-SPECIFIC VALIDATION
 *
 * Type-aware sanity checks for PERSON, RACE, SPECIES, ITEM entities.
 * These rules are broadly correct across corpora, not tuned for specific texts.
 */

/**
 * Check if a name looks like a valid PERSON entity
 *
 * Allows:
 * - Multi-token proper names with >1 capitalized word (e.g., "Charles Garrison")
 * - Names with title prefixes (Mr/Mrs/Dr/Professor/King/etc.)
 * - spaCy NER-backed PERSON labels
 *
 * Rejects:
 * - Single-token names that only appear sentence-initial without NER support
 * - Common abstract nouns or verbs (song, justice, darkness, learning, listen, etc.)
 *
 * @param tokens - Array of words in the name
 * @param normalized - Lowercase normalized name
 * @param hasNERSupport - Whether spaCy NER labeled this as PERSON
 * @param isSentenceInitialOnly - Whether name only appears at sentence starts
 */
function isPersonLikeName(
  tokens: string[],
  normalized: string,
  hasNERSupport: boolean,
  isSentenceInitialOnly: boolean
): boolean {
  // Allow if has title prefix
  if (hasTitlePrefix(tokens.join(' '))) {
    return true;
  }

  // Allow if multi-token proper name (>1 capitalized word)
  const capitalizedWords = tokens.filter(t => /^[A-Z]/.test(t));
  if (capitalizedWords.length > 1) {
    return true;
  }

  // Allow if spaCy NER strongly labels as PERSON
  // NER evidence overrides abstract noun checks
  if (hasNERSupport) {
    return true;
  }

  // Reject common abstract/verbish terms (even if capitalized)
  // But only if they're sentence-initial-only (no NER, no other occurrences)
  const COMMON_ABSTRACT_OR_VERBISH = new Set([
    'song', 'songs', 'justice', 'darkness', 'light', 'learning',
    'questions', 'question', 'answers', 'answer',
    'listen', 'listening', 'familiar', 'hello', 'goodbye',
    'perched', 'perching', 'stabbing', 'breaking',
  ]);

  if (COMMON_ABSTRACT_OR_VERBISH.has(normalized) && isSentenceInitialOnly) {
    // Abstract noun that only appears sentence-initial → reject
    return false;
  }

  // Reject single-token names that only appear sentence-initial (and aren't NER-backed)
  if (tokens.length === 1 && isSentenceInitialOnly) {
    // These are likely capitalized function words, not names
    return false;
  }

  // Default: allow (benefit of the doubt for single proper nouns)
  return true;
}

/**
 * Check if a name looks like a valid RACE/ethnicity entity
 *
 * Allows:
 * - Demonym-like suffixes: -an, -ian, -ese, -ish, -i (e.g., American, Egyptian, Martian)
 * - Curated race/species list (can be extended)
 *
 * Rejects:
 * - Gerunds ending in -ing (stabbing, learning)
 * - Generic group nouns (people, citizens, folks, crowd)
 * - Verbs
 */
function isRaceName(tokens: string[], normalized: string): boolean {
  // Allow known races/demonyms
  const KNOWN_RACES = new Set([
    'human', 'humans', 'elf', 'elves', 'elven', 'dwarf', 'dwarves', 'dwarven',
    'orc', 'orcs', 'goblin', 'goblins', 'troll', 'trolls',
    'hobbit', 'hobbits', 'wizard', 'wizards', 'witch', 'witches',
    'vampire', 'vampires', 'werewolf', 'werewolves', 'zombie', 'zombies',
    'demon', 'demons', 'angel', 'angels', 'dragon', 'dragons',
    'giant', 'giants', 'fairy', 'fairies', 'sprite', 'sprites',
    // Real-world demonyms
    'american', 'americans', 'british', 'french', 'german', 'italian', 'spanish',
    'chinese', 'japanese', 'korean', 'indian', 'russian', 'arab', 'african',
    'european', 'asian', 'martian', 'martians', 'venusian', 'venusians',
  ]);

  if (KNOWN_RACES.has(normalized)) {
    return true;
  }

  // Allow demonym-like suffixes
  const DEMONYM_SUFFIXES = ['-an', '-ian', '-ese', '-ish', '-i'];
  for (const suffix of DEMONYM_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      // But not if it's clearly a verb (-ing forms, etc.)
      if (normalized.endsWith('ing') || normalized.endsWith('ising') || normalized.endsWith('izing')) {
        return false;
      }
      return true;
    }
  }

  // Reject gerunds (-ing verbs)
  if (normalized.endsWith('ing')) {
    return false;
  }

  // Reject generic group nouns
  const GENERIC_GROUP_NOUNS = new Set([
    'people', 'citizens', 'folks', 'crowd', 'crowds',
    'men', 'women', 'children', 'boys', 'girls',
    'population', 'populations', 'group', 'groups',
  ]);

  if (GENERIC_GROUP_NOUNS.has(normalized)) {
    return false;
  }

  // Default: allow (benefit of the doubt)
  return true;
}

/**
 * Check if a name looks like a valid SPECIES/creature entity
 *
 * Allows:
 * - Curated list of known species/creatures (extensible)
 *
 * Rejects:
 * - Verbs (break, run, etc.)
 * - Abstract nouns that aren't creatures
 */
function isSpeciesName(tokens: string[], normalized: string): boolean {
  // Allow known species/creatures
  const KNOWN_SPECIES = new Set([
    'cat', 'cats', 'dog', 'dogs', 'horse', 'horses', 'wolf', 'wolves',
    'bear', 'bears', 'lion', 'lions', 'tiger', 'tigers', 'eagle', 'eagles',
    'snake', 'snakes', 'spider', 'spiders', 'rat', 'rats', 'mouse', 'mice',
    'dragon', 'dragons', 'phoenix', 'phoenixes', 'griffin', 'griffins',
    'unicorn', 'unicorns', 'pegasus', 'chimera', 'hydra', 'basilisk',
    'demon', 'demons', 'devil', 'devils', 'imp', 'imps',
    'goblin', 'goblins', 'troll', 'trolls', 'ogre', 'ogres',
    'vampire', 'vampires', 'werewolf', 'werewolves', 'zombie', 'zombies',
    'ghost', 'ghosts', 'specter', 'specters', 'wraith', 'wraiths',
    'bird', 'birds', 'fish', 'fishes', 'beast', 'beasts', 'creature', 'creatures',
    'monster', 'monsters', 'animal', 'animals',
  ]);

  if (KNOWN_SPECIES.has(normalized)) {
    return true;
  }

  // Reject common verbs that might be mislabeled
  const COMMON_VERBS = new Set([
    'break', 'breaks', 'run', 'runs', 'walk', 'walks',
    'fight', 'fights', 'attack', 'attacks', 'defend', 'defends',
  ]);

  if (COMMON_VERBS.has(normalized)) {
    return false;
  }

  // Default: allow (benefit of the doubt)
  return true;
}

/**
 * Check if a name looks like a valid ITEM/object entity
 *
 * Allows:
 * - Concrete noun phrases (record player, front gate, Pool of Souls)
 * - Phrases with at least one NOUN or PROPN that isn't a stopword
 *
 * Rejects:
 * - Verb-headed phrases (walk past, do it, kill him)
 * - Pronoun-heavy phrases (it, him, her, them, etc.)
 * - Short function-word phrases (the, to, not, or, etc.)
 *
 * @param tokens - Array of words in the name
 * @param normalized - Lowercase normalized name
 */
function isItemName(tokens: string[], normalized: string): boolean {
  // Reject if contains personal pronouns
  const PERSONAL_PRONOUNS = new Set([
    'i', 'you', 'he', 'she', 'we', 'they',
    'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'her', 'our', 'their',
  ]);

  for (const token of tokens) {
    if (PERSONAL_PRONOUNS.has(token.toLowerCase())) {
      return false;
    }
  }

  // Reject short phrases that start or end with function words
  const FUNCTION_WORDS = new Set([
    'the', 'a', 'an', 'to', 'do', 'get', 'not', 'or', 'and', 'but',
    'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'will', 'would', 'should', 'could',
  ]);

  if (tokens.length <= 2) {
    const firstToken = tokens[0].toLowerCase();
    const lastToken = tokens[tokens.length - 1].toLowerCase();

    if (FUNCTION_WORDS.has(firstToken) || FUNCTION_WORDS.has(lastToken)) {
      return false;
    }
  }

  // Reject obvious verb phrases (simple heuristic: starts with common verb)
  const COMMON_ACTION_VERBS = new Set([
    'walk', 'run', 'do', 'get', 'make', 'take', 'go', 'come',
    'kill', 'help', 'access', 'slowed', 'decided', 'wanted',
    'break', 'fight', 'attack', 'defend', 'use', 'give',
  ]);

  const firstWord = tokens[0].toLowerCase();
  if (COMMON_ACTION_VERBS.has(firstWord)) {
    // Exception: if it's part of a compound noun (e.g., "walking stick", "running shoes")
    // For now, reject to be safe
    return false;
  }

  // Require at least one capitalized word or a known concrete noun
  const hasCapitalizedWord = tokens.some(t => /^[A-Z]/.test(t));
  if (!hasCapitalizedWord && tokens.length === 1) {
    // Single lowercase word is unlikely to be a proper item
    // Unless it's a common concrete noun like "sword", "shield", "book"
    const COMMON_CONCRETE_NOUNS = new Set([
      'sword', 'shield', 'armor', 'helmet', 'bow', 'arrow',
      'book', 'scroll', 'potion', 'ring', 'amulet', 'staff',
      'key', 'door', 'gate', 'window', 'table', 'chair',
      'house', 'castle', 'tower', 'bridge', 'road', 'path',
    ]);

    if (!COMMON_CONCRETE_NOUNS.has(normalized)) {
      return false;
    }
  }

  // Default: allow
  return true;
}

/**
 * PHASE 2: Central Lexical Sanity Function
 *
 * Check if an entity name passes basic lexical sanity tests.
 * This is the main entry point for all entity validation.
 *
 * @param name - Entity canonical name
 * @param type - Entity type (PERSON, ORG, PLACE, RACE, SPECIES, ITEM, etc.)
 * @param source - Where this entity came from (NER, heuristic, pattern, etc.)
 * @param features - Optional context features for more informed decisions
 * @returns true if entity is lexically valid, false otherwise
 */
export function isLexicallyValidEntityName(
  name: string,
  type: EntityType,
  source?: string,
  features?: {
    isSentenceInitial?: boolean;
    occurrenceCount?: number;
    occursNonInitial?: boolean;
    hasNERSupport?: boolean;
  }
): boolean {
  // 1. GLOBAL RULES (all types)

  // Reject empty names
  if (!name || name.trim().length === 0) {
    return false;
  }

  // Reject all-digit strings (except for dates)
  if (type !== 'DATE' && /^\d+$/.test(name.trim())) {
    return false;
  }

  // Reject names shorter than 3 characters (except whitelisted)
  // Allow 2-char names if they're proper nouns (capitalized) or dates
  if (name.trim().length < 2) {
    return false;
  }

  if (name.trim().length === 2) {
    // Allow if all caps (acronyms like "US", "UK")
    if (!/^[A-Z]{2}$/.test(name.trim()) && type !== 'DATE') {
      return false;
    }
  }

  // Normalize for stopword check
  const normalized = name.toLowerCase().trim();

  // Reject if in global stopwords
  if (GLOBAL_ENTITY_STOPWORDS.has(normalized)) {
    return false;
  }

  // 2. SENTENCE-INITIAL SINGLE-TOKEN RULE
  // If the name:
  // - Appears only as the first token in sentences (isSentenceInitial=true, occursNonInitial=false)
  // - Is a single word
  // - Is NOT backed by spaCy NER for that type
  // Then reject it (likely capitalized function word)

  const tokens = name.split(/\s+/).filter(Boolean);
  const isSingleToken = tokens.length === 1;

  if (
    isSingleToken &&
    features?.isSentenceInitial &&
    !features?.occursNonInitial &&
    !features?.hasNERSupport
  ) {
    // Single-token, sentence-initial-only, no NER → reject
    // This catches "Song", "Perched", "Like", "Familiar", etc.
    return false;
  }

  // 3. TYPE-SPECIFIC RULES

  switch (type) {
    case 'PERSON':
      return isPersonLikeName(
        tokens,
        normalized,
        features?.hasNERSupport ?? false,
        features?.isSentenceInitial && !features?.occursNonInitial ? true : false
      );

    case 'RACE':
    case 'SPECIES':
      if (type === 'RACE') {
        return isRaceName(tokens, normalized);
      } else {
        return isSpeciesName(tokens, normalized);
      }

    case 'ITEM':
    case 'OBJECT':
      return isItemName(tokens, normalized);

    default:
      // For other types (ORG, PLACE, DATE, TIME, WORK, etc.),
      // rely on global rules only
      return true;
  }
}

/**
 * Main entity quality filter
 */
export function filterLowQualityEntities(
  entities: Entity[],
  config: EntityQualityConfig = DEFAULT_CONFIG
): Entity[] {
  const filtered: Entity[] = [];

  for (const entity of entities) {
    const name = entity.canonical;
    const lowerName = name.toLowerCase();

    const isDateEntity = entity.type === 'DATE';
    if (isDateEntity && process.env.L4_DEBUG === "1") {
      console.log(`[QUALITY-FILTER] Processing DATE: "${name}"`);
    }

    // 1. Confidence check
    const confidence = (entity.attrs?.confidence as number) || 1.0;
    if (confidence < config.minConfidence) {
      continue;
    }

    // 2. Name length check
    if (name.length < config.minNameLength) {
      continue;
    }

    // 3. Blocked tokens check
    if (config.blockedTokens.has(lowerName)) {
      continue;
    }

    // 4. Capitalization check for proper nouns
    if (config.requireCapitalization && !isValidProperNoun(name, entity.type)) {
      if (name.toLowerCase().includes('mcgonagall') && process.env.L3_DEBUG === '1') {
        console.log(`[DEBUG-MCG] filterLowQualityEntities rejecting ${name} due to capitalization`);
      }
      continue;
    }

    // 5. Valid characters check
    if (entity.type !== 'DATE' && !hasValidCharacters(name)) {
      continue;
    }

    // 5.5. LEXICAL SANITY CHECK (Phase 2 - new comprehensive filter)
    // Check global stopwords and type-specific rules
    // Note: We don't have full sentence-position features yet, so we use minimal features
    // Future enhancement: pass sentence position and NER support from extraction phase
    const hasNERSupport = Boolean(entity.attrs?.nerLabel); // Approximate: check if NER was involved
    if (!isLexicallyValidEntityName(name, entity.type, undefined, { hasNERSupport })) {
      if (process.env.L4_DEBUG === '1') {
        console.log(`[LEXICAL-SANITY] Rejecting "${name}" (${entity.type}) - failed lexical sanity checks`);
      }
      continue;
    }

    // 6. Type-specific validation
    if (entity.type === 'DATE') {
      // Allow simple numeric years (like "1775", "2024", etc.)
      const isSimpleYear = /^\d{4}$/.test(name);
      if (!isSimpleYear && !isValidDate(name)) {
        if (isDateEntity && process.env.L4_DEBUG === "1") {
          console.log(`[QUALITY-FILTER] DATE "${name}" failed isValidDate check`);
        }
        continue;
      }
    }

    // 7. Too generic check
    if (isTooGeneric(name)) {
      continue;
    }

    // 8. Strict mode additional checks
    if (config.strictMode) {
      // In strict mode, reject entities that look suspicious

      // Reject all-caps (likely acronyms without context)
      if (name.length > 1 && name === name.toUpperCase()) {
        // Allow known acronyms like "US", "UK", "FBI"
        const knownAcronyms = ['US', 'UK', 'USA', 'FBI', 'CIA', 'NASA', 'NATO'];
        if (!knownAcronyms.includes(name)) {
          continue;
        }
      }

      // Reject single words that are common nouns
      const words = name.split(/\s+/);
      if (words.length === 1) {
        // Single-word proper nouns should be at least 3 chars in strict mode
        if (name.length < 3) {
          continue;
        }
      }
    }

    // 9. Handle entities with two first names (biblical text issue - FILTER 1)
    if (entity.type === 'PERSON' && looksLikeTwoFirstNames(name)) {
      // Instead of rejecting, split into constituent parts
      if (process.env.L4_DEBUG === '1') {
        console.log(`[QUALITY-FILTER] Splitting PERSON "${name}" into constituent parts`);
      }
      const splitEntities = splitTwoFirstNamesEntity(entity);
      filtered.push(...splitEntities);
      continue;
    }

    // 10. Reject role-based names (FILTER 2)
    if (isRoleBasedName(name)) {
      if (process.env.L4_DEBUG === '1') {
        console.log(`[QUALITY-FILTER] Rejecting "${name}" - role descriptor`);
      }
      continue;
    }

    // Entity passed all checks, add to filtered list
    filtered.push(entity);
  }

  return filtered;
}

/**
 * Get statistics about filtered entities
 */
export interface FilterStats {
  original: number;
  filtered: number;
  removed: number;
  removalRate: number;
  removedByReason: {
    lowConfidence: number;
    tooShort: number;
    blockedToken: number;
    noCapitalization: number;
    invalidCharacters: number;
    invalidDate: number;
    tooGeneric: number;
    strictMode: number;
    twoFirstNames: number;
    roleDescriptor: number;
  };
}

export function getFilterStats(
  originalEntities: Entity[],
  filteredEntities: Entity[],
  config: EntityQualityConfig = DEFAULT_CONFIG
): FilterStats {
  const removed = originalEntities.length - filteredEntities.length;
  const removedIds = new Set(filteredEntities.map(e => e.id));
  const removedEntities = originalEntities.filter(e => !removedIds.has(e.id));

  const stats: FilterStats = {
    original: originalEntities.length,
    filtered: filteredEntities.length,
    removed,
    removalRate: removed / originalEntities.length,
    removedByReason: {
      lowConfidence: 0,
      tooShort: 0,
      blockedToken: 0,
      noCapitalization: 0,
      invalidCharacters: 0,
      invalidDate: 0,
      tooGeneric: 0,
      strictMode: 0,
      twoFirstNames: 0,
      roleDescriptor: 0,
    }
  };

  // Analyze removal reasons
  for (const entity of removedEntities) {
    const name = entity.canonical;
    const lowerName = name.toLowerCase();

    const confidence = (entity.attrs?.confidence as number) || 1.0;
    if (confidence < config.minConfidence) {
      stats.removedByReason.lowConfidence++;
    } else if (name.length < config.minNameLength) {
      stats.removedByReason.tooShort++;
    } else if (config.blockedTokens.has(lowerName)) {
      stats.removedByReason.blockedToken++;
    } else if (config.requireCapitalization && !isValidProperNoun(name, entity.type)) {
      stats.removedByReason.noCapitalization++;
    } else if (entity.type !== 'DATE' && !hasValidCharacters(name)) {
      stats.removedByReason.invalidCharacters++;
    } else if (entity.type === 'DATE' && !isValidDate(name)) {
      stats.removedByReason.invalidDate++;
    } else if (isTooGeneric(name)) {
      stats.removedByReason.tooGeneric++;
    } else if (entity.type === 'PERSON' && looksLikeTwoFirstNames(name)) {
      stats.removedByReason.twoFirstNames++;
    } else if (isRoleBasedName(name)) {
      stats.removedByReason.roleDescriptor++;
    } else if (config.strictMode) {
      stats.removedByReason.strictMode++;
    }
  }

  return stats;
}

/**
 * Check if entity quality filtering is enabled
 *
 * DEFAULT: ENABLED (proven effective in Phase 1)
 * To disable: ARES_ENTITY_FILTER=off
 */
export function isEntityFilterEnabled(): boolean {
  // Explicitly disabled
  if (process.env.ARES_ENTITY_FILTER === 'off' || process.env.ARES_ENTITY_FILTER === '0') {
    return false;
  }

  // Enabled by default (or explicitly enabled)
  return true;
}

/**
 * Get filter config based on environment
 */
export function getFilterConfig(): EntityQualityConfig {
  const strict = process.env.ARES_PRECISION_MODE === 'strict';
  return strict ? STRICT_CONFIG : DEFAULT_CONFIG;
}
