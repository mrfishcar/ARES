/**
 * Coreference Resolution (Phase E2)
 *
 * Links pronouns and descriptors to their antecedent entities
 * Reduces over-extraction and improves precision
 */

import type { EntityType } from "./schema";
import type { EntityCluster } from "./mention-tracking";

/**
 * Pronoun sets by type
 */
const PERSON_PRONOUNS = new Set([
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'they', 'them', 'their', 'theirs', 'themselves'
]);

const MALE_PRONOUNS = new Set(['he', 'him', 'his', 'himself']);
const FEMALE_PRONOUNS = new Set(['she', 'her', 'hers', 'herself']);
const PLURAL_PRONOUNS = new Set(['they', 'them', 'their', 'theirs', 'themselves']);

/**
 * Descriptor patterns that indicate entity references
 */
const DESCRIPTOR_PATTERNS = [
  // Role-based: "the strategist", "the explorer", "the wizard"
  /\bthe\s+([a-z]+(?:ist|er|or|ian|ant))\b/i,

  // Professional: "the professor", "the captain", "the doctor"
  /\bthe\s+(professor|captain|doctor|teacher|scientist|researcher|leader|commander)\b/i,

  // Relational: "the son", "the daughter", "the father"
  /\bthe\s+(son|daughter|father|mother|brother|sister|parent|child|husband|wife)\b/i,

  // Descriptive: "the young woman", "the old man"
  /\bthe\s+(young|old|wise|brave|cunning)\s+(man|woman|boy|girl|person)\b/i,

  // Multi-word roles: "the head of research", "the leader of the expedition"
  /\bthe\s+([a-z]+)\s+of\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/i
];

/**
 * Check if a surface form is a pronoun
 */
export function isPronoun(surface: string): boolean {
  return PERSON_PRONOUNS.has(surface.toLowerCase());
}

/**
 * Check if a surface form is a descriptor
 */
export function isDescriptor(surface: string): boolean {
  const trimmed = surface.trim().toLowerCase();
  return DESCRIPTOR_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Get pronoun gender/number for matching
 */
export function getPronounType(pronoun: string): 'male' | 'female' | 'plural' | 'neutral' {
  const lower = pronoun.toLowerCase();
  if (MALE_PRONOUNS.has(lower)) return 'male';
  if (FEMALE_PRONOUNS.has(lower)) return 'female';
  if (PLURAL_PRONOUNS.has(lower)) return 'plural';
  return 'neutral';
}

/**
 * Extract role from descriptor
 * "The strategist" → "strategist"
 * "The head of research" → "head of research"
 */
export function extractRole(descriptor: string): string | null {
  const trimmed = descriptor.trim();

  for (const pattern of DESCRIPTOR_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      // Return the captured role (group 1)
      return match[1].toLowerCase();
    }
  }

  return null;
}

/**
 * Find antecedent entity for a pronoun within sentence window
 */
export function resolvePronoun(
  pronoun: string,
  currentSentenceIdx: number,
  clusters: EntityCluster[],
  windowSize: number = 3
): EntityCluster | null {
  const pronounType = getPronounType(pronoun);

  // Filter to PERSON entities within recent sentences
  const candidates = clusters.filter(cluster => {
    if (cluster.type !== 'PERSON') return false;

    // Check if cluster has mentions in recent context
    const recentMentions = cluster.mentions.filter(
      m => m.sentenceIdx >= currentSentenceIdx - windowSize &&
           m.sentenceIdx < currentSentenceIdx
    );

    return recentMentions.length > 0;
  });

  if (candidates.length === 0) return null;

  // For gendered pronouns, prefer entities with gendered names
  if (pronounType === 'male' || pronounType === 'female') {
    // Simple heuristic: names ending in 'a', 'ah', 'ia' are often female
    const genderedCandidates = candidates.filter(cluster => {
      const canonical = cluster.canonical.toLowerCase();
      const tokens = canonical.split(/\s+/);
      const firstName = tokens[0] || '';

      const isFemale = firstName.endsWith('a') || firstName.endsWith('ah') || firstName.endsWith('ia');

      if (pronounType === 'female') return isFemale;
      if (pronounType === 'male') return !isFemale;
      return false;
    });

    if (genderedCandidates.length > 0) {
      // Return most recent (last mentioned)
      return genderedCandidates.reduce((latest, candidate) => {
        const latestSentence = Math.max(...latest.mentions.map(m => m.sentenceIdx));
        const candidateSentence = Math.max(...candidate.mentions.map(m => m.sentenceIdx));
        return candidateSentence > latestSentence ? candidate : latest;
      });
    }
  }

  // For plural pronouns or no gender match, return most recent PERSON
  return candidates.reduce((latest, candidate) => {
    const latestSentence = Math.max(...latest.mentions.map(m => m.sentenceIdx));
    const candidateSentence = Math.max(...candidate.mentions.map(m => m.sentenceIdx));
    return candidateSentence > latestSentence ? candidate : latest;
  });
}

/**
 * Find antecedent entity for a descriptor based on role matching
 */
export function resolveDescriptor(
  descriptor: string,
  currentSentenceIdx: number,
  clusters: EntityCluster[],
  windowSize: number = 5
): EntityCluster | null {
  const role = extractRole(descriptor);
  if (!role) return null;

  // Look for entities with this role in aliases or canonical name
  const candidates = clusters.filter(cluster => {
    if (cluster.type !== 'PERSON') return false;

    // Check if cluster has mentions in recent context
    const recentMentions = cluster.mentions.filter(
      m => m.sentenceIdx >= currentSentenceIdx - windowSize &&
           m.sentenceIdx < currentSentenceIdx
    );

    if (recentMentions.length === 0) return false;

    // Check if canonical or aliases contain the role
    const canonicalLower = cluster.canonical.toLowerCase();
    const aliasesLower = cluster.aliases.map(a => a.toLowerCase());

    if (canonicalLower.includes(role)) return true;
    if (aliasesLower.some(alias => alias.includes(role))) return true;

    return false;
  });

  if (candidates.length === 0) {
    // Fallback: return most recent PERSON (descriptor likely refers to them)
    const recentPersons = clusters.filter(cluster => {
      if (cluster.type !== 'PERSON') return false;

      const recentMentions = cluster.mentions.filter(
        m => m.sentenceIdx >= currentSentenceIdx - windowSize &&
             m.sentenceIdx < currentSentenceIdx
      );

      return recentMentions.length > 0;
    });

    if (recentPersons.length === 0) return null;

    return recentPersons.reduce((latest, candidate) => {
      const latestSentence = Math.max(...latest.mentions.map(m => m.sentenceIdx));
      const candidateSentence = Math.max(...candidate.mentions.map(m => m.sentenceIdx));
      return candidateSentence > latestSentence ? candidate : latest;
    });
  }

  // Return most recent match
  return candidates.reduce((latest, candidate) => {
    const latestSentence = Math.max(...latest.mentions.map(m => m.sentenceIdx));
    const candidateSentence = Math.max(...candidate.mentions.map(m => m.sentenceIdx));
    return candidateSentence > latestSentence ? candidate : latest;
  });
}

/**
 * Batch resolve coreferences in text
 * Returns map of surface form → resolved entity ID
 */
export function resolveCoreferences(
  text: string,
  clusters: EntityCluster[]
): Map<string, string> {
  const resolutions = new Map<string, string>();

  // Split into sentences (simple heuristic)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  sentences.forEach((sentence, idx) => {
    const words = sentence.trim().split(/\s+/);

    words.forEach(word => {
      const clean = word.replace(/[^\w\s'-]/g, '').toLowerCase();

      // Check for pronouns
      if (isPronoun(clean)) {
        const antecedent = resolvePronoun(clean, idx, clusters);
        if (antecedent) {
          resolutions.set(clean, antecedent.id);
        }
      }
    });

    // Check for descriptors (multi-word patterns)
    // Use the full sentence to match descriptors
    for (const pattern of DESCRIPTOR_PATTERNS) {
      const match = sentence.match(pattern);
      if (match) {
        const descriptor = match[0];
        const antecedent = resolveDescriptor(descriptor, idx, clusters);
        if (antecedent) {
          resolutions.set(descriptor.toLowerCase(), antecedent.id);
        }
      }
    }
  });

  return resolutions;
}
