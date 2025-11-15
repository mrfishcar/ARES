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
