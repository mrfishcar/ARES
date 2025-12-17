/**
 * Pronoun Utilities
 * Comprehensive pronoun lists based on Grammar Monster rules
 * https://www.grammar-monster.com/lessons/pronouns.htm
 */

/**
 * Personal pronouns (subjective, objective, possessive)
 * These should NEVER be stored as permanent entity aliases
 */
export const PERSONAL_PRONOUNS = new Set([
  // Subjective (subject of sentence)
  'i', 'you', 'he', 'she', 'it', 'we', 'they',

  // Objective (object of verb/preposition)
  'me', 'you', 'him', 'her', 'it', 'us', 'them',

  // Possessive (ownership)
  'my', 'mine', 'your', 'yours', 'his', 'her', 'hers', 'its', 'our', 'ours', 'their', 'theirs'
]);

/**
 * Demonstrative pronouns (point to specific things)
 */
export const DEMONSTRATIVE_PRONOUNS = new Set([
  'this', 'that', 'these', 'those'
]);

/**
 * Reflexive pronouns (refer back to subject)
 */
export const REFLEXIVE_PRONOUNS = new Set([
  'myself', 'yourself', 'himself', 'herself', 'itself',
  'ourselves', 'yourselves', 'themselves'
]);

/**
 * Indefinite pronouns (non-specific reference)
 */
export const INDEFINITE_PRONOUNS = new Set([
  'anyone', 'everyone', 'someone', 'no one', 'nobody',
  'anybody', 'everybody', 'somebody',
  'anything', 'everything', 'something', 'nothing',
  'one', 'ones', 'another', 'other', 'others',
  'each', 'either', 'neither', 'both', 'all', 'some', 'any', 'none'
]);

/**
 * Relative pronouns (introduce relative clauses)
 */
export const RELATIVE_PRONOUNS = new Set([
  'who', 'whom', 'whose', 'which', 'that'
]);

/**
 * Interrogative pronouns (ask questions)
 */
export const INTERROGATIVE_PRONOUNS = new Set([
  'who', 'whom', 'whose', 'which', 'what'
]);

/**
 * Deictic expressions (context-dependent spatial/temporal references)
 * Not technically pronouns but similar in that they're context-dependent
 */
export const DEICTIC_EXPRESSIONS = new Set([
  'here', 'there', 'now', 'then', 'today', 'yesterday', 'tomorrow'
]);

/**
 * All pronouns combined (master set)
 */
export const ALL_PRONOUNS = new Set([
  ...PERSONAL_PRONOUNS,
  ...DEMONSTRATIVE_PRONOUNS,
  ...REFLEXIVE_PRONOUNS,
  ...INDEFINITE_PRONOUNS,
  ...RELATIVE_PRONOUNS,
  ...INTERROGATIVE_PRONOUNS
]);

/**
 * All context-dependent terms (pronouns + deictics)
 * These should NEVER be permanent aliases
 */
export const CONTEXT_DEPENDENT_TERMS = new Set([
  ...ALL_PRONOUNS,
  ...DEICTIC_EXPRESSIONS
]);

/**
 * Check if a string is a pronoun
 * Case-insensitive, handles multi-word expressions like "no one"
 */
export function isPronoun(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return ALL_PRONOUNS.has(normalized);
}

/**
 * Check if a string is context-dependent (pronoun or deictic)
 * These should be resolved to entities, not stored as permanent aliases
 */
export function isContextDependent(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return CONTEXT_DEPENDENT_TERMS.has(normalized);
}

/**
 * Generic descriptors that shouldn't be entity-specific aliases
 * These describe roles or relationships, not unique identities
 */
const GENERIC_DESCRIPTORS = new Set([
  'the family', 'the old woman', 'the old man', 'the young man', 'the young woman',
  'the boy', 'the girl', 'the man', 'the woman', 'the child', 'the children',
  'the group', 'the crowd', 'the people', 'the others',
  'the king of', 'the queen of', 'the prince of', 'the princess of',
  'the professional family', 'the family much', 'the family information',
  'linola jr',  // Partial school name
  // Garbage token combinations from extraction artifacts
  'if mr', 'if ms', 'if dr', 'mr if', 'ms if', 'dr if',
]);

/**
 * Very short tokens that are almost never valid aliases
 */
const SHORT_GARBAGE_TOKENS = new Set([
  'if', 'mr', 'ms', 'dr', 'or', 'an', 'at', 'by', 'to', 'of', 'in', 'on',
  'is', 'it', 'be', 'as', 'so', 'no', 'we', 'us', 'my', 'me', 'he', 'do',
]);

/**
 * Check if a string is a garbage alias that should be filtered
 * Returns true if the alias should NOT be stored
 */
export function isGarbageAlias(text: string): boolean {
  if (!text || typeof text !== 'string') return true;

  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Empty or whitespace-only
  if (!trimmed) return true;

  // Very short (< 3 chars) unless it's a valid abbreviation with period
  if (trimmed.length < 3 && !trimmed.includes('.')) {
    return true;
  }

  // Short garbage tokens
  if (SHORT_GARBAGE_TOKENS.has(lower)) {
    return true;
  }

  // Generic descriptors
  if (GENERIC_DESCRIPTORS.has(lower)) {
    return true;
  }

  // Starts with "the " followed by a lowercase word (generic reference)
  if (lower.startsWith('the ') && trimmed.length < 20) {
    const afterThe = trimmed.slice(4).trim();
    // "The family" is generic, "The Doctor" might be a title
    if (afterThe && /^[a-z]/.test(afterThe)) {
      return true;
    }
  }

  // Looks like a truncated artifact (starts with lowercase 1-2 char + space)
  const tokens = trimmed.split(/\s+/);
  if (tokens.length >= 2 && tokens[0].length <= 2 && /^[a-z]+$/.test(tokens[0])) {
    return true;
  }

  // Contains encoding artifacts
  if (trimmed.includes('�')) {
    return true;
  }

  // Ends with verb-like suffixes (likely sentence fragment)
  const verbEndings = ['ing', ' ed', 'ied', 'ang', 'ung'];
  if (tokens.length >= 2 && verbEndings.some(e => lower.endsWith(e))) {
    // Check if last token is lowercase (fragment vs proper name)
    const lastToken = tokens[tokens.length - 1];
    if (/^[a-z]/.test(lastToken)) {
      return true;
    }
  }

  // Too long to be a meaningful alias (likely a sentence fragment)
  if (tokens.length > 4) {
    return true;
  }

  return false;
}

/**
 * Infer grammatical gender from pronoun
 */
export type Gender = 'male' | 'female' | 'neutral' | 'plural';

export function inferGenderFromPronoun(pronoun: string): Gender {
  const lower = pronoun.toLowerCase();

  if (['he', 'him', 'his', 'himself'].includes(lower)) return 'male';
  if (['she', 'her', 'hers', 'herself'].includes(lower)) return 'female';
  if (['it', 'its', 'itself'].includes(lower)) return 'neutral';
  if (['they', 'them', 'their', 'theirs', 'themselves'].includes(lower)) return 'plural';

  return 'neutral';
}

/**
 * Infer grammatical number from pronoun
 */
export type Number = 'singular' | 'plural';

export function inferNumberFromPronoun(pronoun: string): Number {
  const lower = pronoun.toLowerCase();
  return ['they', 'them', 'their', 'theirs', 'themselves', 'we', 'us', 'our', 'ours', 'ourselves'].includes(lower)
    ? 'plural'
    : 'singular';
}

/**
 * Get pronoun category (for debugging/logging)
 */
export function getPronounCategory(pronoun: string): string | null {
  const lower = pronoun.toLowerCase().trim();

  if (PERSONAL_PRONOUNS.has(lower)) return 'personal';
  if (DEMONSTRATIVE_PRONOUNS.has(lower)) return 'demonstrative';
  if (REFLEXIVE_PRONOUNS.has(lower)) return 'reflexive';
  if (INDEFINITE_PRONOUNS.has(lower)) return 'indefinite';
  if (RELATIVE_PRONOUNS.has(lower)) return 'relative';
  if (INTERROGATIVE_PRONOUNS.has(lower)) return 'interrogative';

  return null;
}

/**
 * Filter pronouns from an array of strings (e.g., entity aliases)
 * Returns only non-pronoun strings
 */
export function filterPronouns(strings: string[]): string[] {
  return strings.filter(s => !isContextDependent(s));
}
