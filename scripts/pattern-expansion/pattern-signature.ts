/**
 * Pattern Signature System
 *
 * Computes normalized signatures for relation patterns to enable de-duplication
 * across surface patterns, dependency patterns, and different voices/forms.
 */

import { createHash } from 'crypto';

export interface PatternSignature {
  hash: string;              // MD5 of normalized form
  lemmas: string[];          // Core lemmas (sorted)
  roles: string[];           // Dependency roles (sorted)
  prepositions: string[];    // Key prepositions (sorted)
  voice: 'active' | 'passive' | 'neutral';
  structure: string;         // Canonical structure (X-REL-Y)
  family: string;            // Relation family
}

export interface SurfacePattern {
  id: string;
  regex: string;
  predicate: string;
  family: string;
  lemma_form: string;
  examples: string[];
}

export interface DependencyPattern {
  id: string;
  signature_regex: string;
  predicate: string;
  family: string;
  dep_roles: string[];
  lemmas: string[];
  examples: string[];
}

/**
 * Normalize a word to its lemma form using simple rules
 */
export function lemmatize(word: string): string {
  const lower = word.toLowerCase();

  // Common verb forms
  const verbMap: Record<string, string> = {
    'married': 'marry',
    'wed': 'marry',
    'wedded': 'marry',
    'born': 'bear',
    'died': 'die',
    'lived': 'live',
    'worked': 'work',
    'studied': 'study',
    'taught': 'teach',
    'wrote': 'write',
    'written': 'write',
    'created': 'create',
    'founded': 'found',
    'established': 'establish',
    'ruled': 'rule',
    'led': 'lead',
    'managed': 'manage',
    'owned': 'own',
    'possessed': 'possess',
    'defeated': 'defeat',
    'killed': 'kill',
    'loved': 'love',
    'hated': 'hate',
    'feared': 'fear',
    'admired': 'admire',
  };

  if (verbMap[lower]) return verbMap[lower];

  // Remove common suffixes
  if (lower.endsWith('ed')) return lower.slice(0, -2);
  if (lower.endsWith('ing')) return lower.slice(0, -3);
  if (lower.endsWith('s') && lower.length > 3) return lower.slice(0, -1);

  return lower;
}

/**
 * Determine voice of a pattern
 */
export function detectVoice(text: string): 'active' | 'passive' | 'neutral' {
  const lower = text.toLowerCase();

  // Passive indicators
  if (/(was|is|been|being)\s+\w+ed\s+by/.test(lower)) return 'passive';
  if (/nsubjpass|agent/.test(lower)) return 'passive';  // Dependency labels

  // Active indicators
  if (/\bnsubj\b.*\b(dobj|obj)\b/.test(lower)) return 'active';

  return 'neutral';
}

/**
 * Extract dependency roles from a pattern
 */
export function extractDepRoles(pattern: string): string[] {
  const roles = new Set<string>();

  // Match dependency labels in signatures like ":↑nsubj:" or ":↓prep:"
  const depRegex = /:(?:↑|↓)?(\w+):/g;
  let match;

  while ((match = depRegex.exec(pattern)) !== null) {
    roles.add(match[1]);
  }

  return Array.from(roles).sort();
}

/**
 * Extract key prepositions from pattern
 */
export function extractPrepositions(pattern: string): string[] {
  const preps = new Set<string>();
  const commonPreps = ['of', 'to', 'by', 'in', 'at', 'for', 'with', 'from', 'on', 'near'];

  const lower = pattern.toLowerCase();
  for (const prep of commonPreps) {
    if (new RegExp(`\\b${prep}\\b`).test(lower)) {
      preps.add(prep);
    }
  }

  return Array.from(preps).sort();
}

/**
 * Extract core lemmas from pattern
 */
export function extractLemmas(pattern: string): string[] {
  const lemmas = new Set<string>();

  // Extract words from pattern (ignoring special characters)
  const words = pattern.match(/\b[a-z]{3,}\b/gi) || [];

  for (const word of words) {
    const lower = word.toLowerCase();
    // Skip common stopwords
    if (['the', 'and', 'was', 'were', 'been', 'has', 'had', 'that', 'this'].includes(lower)) {
      continue;
    }
    lemmas.add(lemmatize(lower));
  }

  return Array.from(lemmas).sort();
}

/**
 * Compute canonical structure (X-REL-Y form)
 */
export function computeStructure(
  predicate: string,
  voice: 'active' | 'passive' | 'neutral',
  roles: string[]
): string {
  // Normalize to active voice structure
  if (voice === 'passive') {
    return `Y-${predicate}-X`;
  }

  // Check for appositive or special structures
  if (roles.includes('appos')) {
    return `X(appos)-${predicate}-Y`;
  }

  if (roles.includes('poss')) {
    return `X(poss)-${predicate}-Y`;
  }

  return `X-${predicate}-Y`;
}

/**
 * Compute signature hash for a pattern
 */
export function computeSignature(
  pattern: string,
  predicate: string,
  family: string,
  type: 'surface' | 'dependency'
): PatternSignature {
  const lemmas = extractLemmas(pattern);
  const roles = type === 'dependency' ? extractDepRoles(pattern) : [];
  const preps = extractPrepositions(pattern);
  const voice = detectVoice(pattern);
  const structure = computeStructure(predicate, voice, roles);

  // Create normalized string for hashing
  const normalized = [
    ...lemmas,
    ...roles,
    ...preps,
    voice,
    predicate,
    structure,
    family
  ].join('|');

  const hash = createHash('md5').update(normalized).digest('hex').slice(0, 16);

  return {
    hash,
    lemmas,
    roles,
    prepositions: preps,
    voice,
    structure,
    family
  };
}

/**
 * Check if two signatures are equivalent (de-duplication)
 */
export function signaturesMatch(sig1: PatternSignature, sig2: PatternSignature): boolean {
  // Exact hash match
  if (sig1.hash === sig2.hash) return true;

  // Semantic match: same lemmas + same structure + same family
  const lemmasMatch =
    sig1.lemmas.length === sig2.lemmas.length &&
    sig1.lemmas.every((l, i) => l === sig2.lemmas[i]);

  const structureMatch = sig1.structure === sig2.structure;
  const familyMatch = sig1.family === sig2.family;

  // If lemmas and structure match, it's a duplicate even if voice differs
  return lemmasMatch && structureMatch && familyMatch;
}

/**
 * Format signature for debugging
 */
export function formatSignature(sig: PatternSignature): string {
  return [
    `Hash: ${sig.hash}`,
    `Lemmas: [${sig.lemmas.join(', ')}]`,
    `Roles: [${sig.roles.join(', ')}]`,
    `Preps: [${sig.prepositions.join(', ')}]`,
    `Voice: ${sig.voice}`,
    `Structure: ${sig.structure}`,
    `Family: ${sig.family}`
  ].join(' | ');
}
