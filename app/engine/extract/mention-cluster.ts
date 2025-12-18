/**
 * Mention Clustering - Conservative Grouping
 *
 * Groups mentions into clusters using safe heuristics:
 * - Exact normalized match
 * - Title stripping (Mr/Mrs/Dr/etc.)
 * - First/last name rules
 * - Optional fuzzy matching with supporting evidence only
 *
 * Does NOT use naive edit distance as sole clustering criterion.
 */

import type { DurableMention, MentionBuffer } from './mention-buffer';
import type { StatsCollector } from './extraction-stats';

// ============================================================================
// TYPES
// ============================================================================

export interface MentionCluster {
  id: string;
  canonicalForm: string;
  mentions: DurableMention[];
  aliasVariants: Set<string>;
  nerHints: Map<string, number>;  // NER label → count
  positions: number[];

  mentionCount(): number;
  hasStrongNER(): boolean;
  hasIntroductionPattern(): boolean;
  getRepresentativeNER(): string | undefined;
}

// ============================================================================
// TITLE PATTERNS
// ============================================================================

const TITLE_PREFIXES = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'doctor', 'prof', 'professor',
  'sir', 'madam', 'madame', 'lord', 'lady', 'king', 'queen',
  'prince', 'princess', 'captain', 'commander', 'general', 'colonel',
  'major', 'sergeant', 'lieutenant', 'father', 'mother', 'brother',
  'sister', 'coach', 'detective', 'officer', 'nurse', 'principal',
  'judge', 'justice', 'senator', 'governor', 'mayor', 'president',
  'headmaster', 'headmistress', 'master', 'mistress',
]);

// ============================================================================
// CLUSTERING IMPLEMENTATION
// ============================================================================

class MentionClusterImpl implements MentionCluster {
  id: string;
  canonicalForm: string;
  mentions: DurableMention[] = [];
  aliasVariants: Set<string> = new Set();
  nerHints: Map<string, number> = new Map();
  positions: number[] = [];

  constructor(id: string, canonicalForm: string) {
    this.id = id;
    this.canonicalForm = canonicalForm;
  }

  addMention(mention: DurableMention): void {
    this.mentions.push(mention);
    this.positions.push(mention.documentPosition);

    // Track surface variants
    this.aliasVariants.add(mention.candidate.surface);
    this.aliasVariants.add(mention.candidate.normalized);

    // Track NER hints
    if (mention.candidate.nerHint) {
      const count = this.nerHints.get(mention.candidate.nerHint) || 0;
      this.nerHints.set(mention.candidate.nerHint, count + 1);
    }
  }

  mentionCount(): number {
    return this.mentions.length;
  }

  hasStrongNER(): boolean {
    // Strong NER = PERSON/GPE/ORG/LOC with count > 1 or high confidence
    const strongLabels = ['PERSON', 'GPE', 'ORG', 'LOC'];
    for (const label of strongLabels) {
      const count = this.nerHints.get(label) || 0;
      if (count >= 2) return true;
      if (count >= 1 && this.mentionCount() <= 2) {
        // For small clusters, even 1 strong label counts
        return true;
      }
    }
    return false;
  }

  hasIntroductionPattern(): boolean {
    // Check for introduction patterns in mentions
    for (const mention of this.mentions) {
      const { candidate } = mention;
      // TODO: Check for patterns like "X, a wizard" or "named X"
      // For now, check dep role
      if (candidate.depRole === 'appos') {
        return true;
      }
    }
    return false;
  }

  getRepresentativeNER(): string | undefined {
    if (this.nerHints.size === 0) return undefined;

    // Get most common NER hint
    let maxCount = 0;
    let maxLabel: string | undefined;
    for (const [label, count] of this.nerHints) {
      if (count > maxCount) {
        maxCount = count;
        maxLabel = label;
      }
    }
    return maxLabel;
  }
}

// ============================================================================
// CLUSTERING FUNCTIONS
// ============================================================================

/**
 * Strip title prefix from a name
 */
function stripTitle(name: string): { title?: string; name: string } {
  const words = name.split(/\s+/);
  if (words.length < 2) return { name };

  const first = words[0].toLowerCase().replace(/\.$/, '');
  if (TITLE_PREFIXES.has(first)) {
    return {
      title: words[0],
      name: words.slice(1).join(' '),
    };
  }

  return { name };
}

/**
 * Get potential cluster keys for a mention
 */
function getClusterKeys(surface: string): string[] {
  const normalized = surface.toLowerCase().trim().replace(/\s+/g, ' ');
  const keys: string[] = [normalized];

  // Add title-stripped version
  const { title, name } = stripTitle(surface);
  if (title) {
    const strippedNorm = name.toLowerCase().trim().replace(/\s+/g, ' ');
    if (strippedNorm !== normalized) {
      keys.push(strippedNorm);
    }
  }

  // Add last-name-only version for multi-word names
  const words = surface.split(/\s+/);
  if (words.length >= 2) {
    const lastName = words[words.length - 1].toLowerCase();
    if (lastName.length >= 3 && /^[a-z]+$/i.test(lastName)) {
      keys.push(`lastname:${lastName}`);
    }
  }

  return keys;
}

/**
 * Main clustering function
 */
export function clusterMentions(
  buffer: MentionBuffer,
  stats?: StatsCollector
): MentionCluster[] {
  const clusters: Map<string, MentionClusterImpl> = new Map();
  const mentionGroups = buffer.getAllMentionGroups();
  let clusterId = 0;

  // First pass: Create clusters from exact matches
  for (const [key, mentions] of mentionGroups) {
    if (mentions.length === 0) continue;

    // Use first mention's surface as canonical
    const canonical = mentions[0].candidate.surface;
    const cluster = new MentionClusterImpl(`cluster-${clusterId++}`, canonical);

    for (const mention of mentions) {
      cluster.addMention(mention);
    }

    clusters.set(key, cluster);
    stats?.recordCluster(cluster.mentionCount());
  }

  // Second pass: Merge clusters that should be combined
  const merged = mergeClusters(clusters);

  return merged;
}

/**
 * Merge clusters that refer to the same entity
 */
function mergeClusters(
  clusters: Map<string, MentionClusterImpl>
): MentionCluster[] {
  // Build index of title-stripped forms and last names
  const titleStrippedIndex: Map<string, MentionClusterImpl[]> = new Map();
  const lastNameIndex: Map<string, MentionClusterImpl[]> = new Map();

  for (const cluster of clusters.values()) {
    for (const variant of cluster.aliasVariants) {
      const { title, name } = stripTitle(variant);
      if (title) {
        const stripped = name.toLowerCase().trim();
        const existing = titleStrippedIndex.get(stripped) || [];
        existing.push(cluster);
        titleStrippedIndex.set(stripped, existing);
      }

      // Last name indexing
      const words = variant.split(/\s+/);
      if (words.length >= 2) {
        const lastName = words[words.length - 1].toLowerCase();
        if (lastName.length >= 3) {
          const existing = lastNameIndex.get(lastName) || [];
          existing.push(cluster);
          lastNameIndex.set(lastName, existing);
        }
      }
    }
  }

  // Find merge candidates (same title-stripped form or last name with evidence)
  const mergeGroups: Map<MentionClusterImpl, MentionClusterImpl> = new Map();

  for (const [stripped, matchingClusters] of titleStrippedIndex) {
    if (matchingClusters.length < 2) continue;

    // Find the cluster with more mentions
    const sorted = [...matchingClusters].sort(
      (a, b) => b.mentionCount() - a.mentionCount()
    );
    const primary = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const secondary = sorted[i];
      // Only merge if they have compatible NER hints
      if (areNERCompatible(primary, secondary)) {
        mergeGroups.set(secondary, primary);
      }
    }
  }

  // Apply merges
  const mergedClusters: MentionClusterImpl[] = [];
  const consumed = new Set<MentionClusterImpl>();

  for (const cluster of clusters.values()) {
    if (consumed.has(cluster)) continue;

    const target = mergeGroups.get(cluster);
    if (target && !consumed.has(target)) {
      // Merge into target
      for (const mention of cluster.mentions) {
        target.addMention(mention);
      }
      consumed.add(cluster);
    } else if (!mergeGroups.has(cluster)) {
      // This is a primary or standalone cluster
      mergedClusters.push(cluster);
    }
  }

  return mergedClusters;
}

/**
 * Check if two clusters have compatible NER hints
 */
function areNERCompatible(
  a: MentionClusterImpl,
  b: MentionClusterImpl
): boolean {
  const aType = a.getRepresentativeNER();
  const bType = b.getRepresentativeNER();

  // If neither has NER, assume compatible
  if (!aType && !bType) return true;

  // If only one has NER, compatible
  if (!aType || !bType) return true;

  // Same type = compatible
  if (aType === bType) return true;

  // GPE and LOC are compatible
  if (
    (aType === 'GPE' && bType === 'LOC') ||
    (aType === 'LOC' && bType === 'GPE')
  ) {
    return true;
  }

  return false;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createMentionCluster(
  id: string,
  canonical: string
): MentionCluster {
  return new MentionClusterImpl(id, canonical);
}
