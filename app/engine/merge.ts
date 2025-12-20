/**
 * Cross-Document Merge - Phase 4
 * Merges entities across documents using Jaro-Winkler clustering
 */

import type { Entity, Relation, EntityType } from './schema';
import { toBookNLPGlobalId, toBookNLPEID } from './booknlp/identity';

/**
 * Merge decision with confidence and provenance
 */
export interface MergeDecision {
  local_entity_id: string;
  global_entity_id: string;
  confidence: number;
  method: 'substring_match' | 'jaro_winkler_strong' | 'jaro_winkler_weak';
  similarity_score: number;
  matched_names: { local: string; cluster: string };
}

/**
 * Merge result with confidence tracking
 */
export interface MergeResult {
  globals: Entity[];
  idMap: Map<string, string>;  // local_id -> global_id
  decisions: MergeDecision[];  // Detailed merge provenance
  stats: {
    total_entities: number;
    merged_clusters: number;
    avg_confidence: number;
    low_confidence_count: number;  // confidence < 0.7
  };
}

/**
 * Jaro-Winkler similarity (inline, dependency-free)
 */
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;

  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0.0;

  const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, len2);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0;

  // Winkler prefix boost (max 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Normalize name for blocking
 */
function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

const SURNAME_STOPWORDS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'doctor',
  'prof', 'professor', 'sir', 'madam', 'lord', 'lady',
  'king', 'queen', 'prince', 'princess', 'the', 'a', 'an',
  'of', 'and', 'd', 'jr', 'sr', 'ii', 'iii', 'iv', 'head',
  'headmaster', 'headmistress', 'captain', 'chief', 'lord',
  'lady', 'former', 'later', 'stern', 'current', 'acting',
  'young', 'youngest', 'older', 'elder'
]);

function getSurname(name: string): string | null {
  const normalized = normalizeKey(name);
  if (!normalized) return null;
  const tokens = normalized
    .split(/\s+/)
    .map(token => token.replace(/[^a-z]/g, ''))
    .filter(Boolean)
    .filter(token => !SURNAME_STOPWORDS.has(token));
  if (!tokens.length) return null;
  return tokens[tokens.length - 1];
}

function samePersonByName(nameA: string, nameB: string): boolean {
  const normalizeParts = (name: string) =>
    name
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

  const partsA = normalizeParts(nameA);
  const partsB = normalizeParts(nameB);

  if (partsA.length < 2 || partsB.length < 2) return false;

  const firstMatch = partsA[0] === partsB[0];
  const lastMatch = partsA[partsA.length - 1] === partsB[partsB.length - 1];

  return firstMatch && lastMatch;
}

/**
 * Pronouns and non-discriminative terms that should NEVER be used for entity matching
 * These are temporary references, not permanent entity identifiers
 */
const INVALID_MATCH_TERMS = new Set([
  'he', 'she', 'it', 'they', 'him', 'her', 'his', 'hers', 'its', 'their', 'theirs', 'them',
  'i', 'you', 'we', 'me', 'us', 'my', 'your', 'our',
  'this', 'that', 'these', 'those',
  'here', 'there',
  'the', 'a', 'an'
]);

/**
 * Check if a name is a pronoun or other invalid match term
 */
function isPronounOrInvalidTerm(name: string): boolean {
  const normalized = normalizeKey(name);
  return INVALID_MATCH_TERMS.has(normalized);
}

/**
 * Check if one name is a substring of another (after normalization)
 * IMPORTANT: Filters out pronouns and non-discriminative words to prevent false merges
 */
function isSubstringMatch(name1: string, name2: string): boolean {
  // Reject if either name is a pronoun/article
  if (isPronounOrInvalidTerm(name1) || isPronounOrInvalidTerm(name2)) {
    return false;
  }

  const n1 = normalizeKey(name1);
  const n2 = normalizeKey(name2);

  if (n1 === n2) return true;
  if (!n1.length || !n2.length) return false;

  // STAGE 3 FIX: Detect coordination lists (e.g., "Gryffindor Slytherin Hufflepuff")
  // If one entity has 3+ capitalized words and the other has fewer, don't merge
  // This prevents distinct entities from being merged into list-style entities
  const countCapitalizedWords = (str: string) => {
    return str.split(/\s+/).filter(word => /^[A-Z]/.test(word)).length;
  };

  const cap1 = countCapitalizedWords(name1);
  const cap2 = countCapitalizedWords(name2);

  // If one has 3+ capitalized words and the other has 1-2, likely a coordination list
  if ((cap1 >= 3 && cap2 <= 2) || (cap2 >= 3 && cap1 <= 2)) {
    return false;
  }

  // CRITICAL FIX: Don't merge on surname-only matches
  // E.g., "Harry Potter" and "Lily Potter" both match "Potter" but shouldn't merge
  // Only allow substring match if the shorter string has 2+ words (includes first name)
  const words1 = n1.split(/\s+/).filter(w => w.length > 0);
  const words2 = n2.split(/\s+/).filter(w => w.length > 0);
  const shorterWordCount = Math.min(words1.length, words2.length);

  // If the shorter name is only 1 word, it might be a surname-only reference
  // Only allow this if both names have the same word count (e.g., "Harry" vs "Harry Potter" is OK)
  // But block "Potter" matching both "Harry Potter" and "Lily Potter"
  if (shorterWordCount === 1 && words1.length !== words2.length) {
    // Additional check: if the 1-word name appears in multiple positions
    // in the longer name, it's ambiguous (could be first or last name)
    const shorter = words1.length === 1 ? n1 : n2;
    const longer = words1.length === 1 ? n2 : n1;
    const longerWords = longer.split(/\s+/);

    // If the shorter word matches the LAST word of the longer name,
    // it's likely a surname - don't allow this match for multi-word names
    if (longerWords.length >= 2 && longer.endsWith(' ' + shorter)) {
      if (process.env.L3_DEBUG === '1' && (name1.toLowerCase().includes('potter') || name2.toLowerCase().includes('potter'))) {
        console.log(`[MERGE-DEBUG] Blocking surname-only match: "${name1}" vs "${name2}"`);
      }
      return false;  // Block surname-only matching
    }
  }

  if (process.env.L3_DEBUG === '1' && (name1.toLowerCase().includes('potter') || name2.toLowerCase().includes('potter'))) {
    const result = (
      n1.startsWith(n2 + ' ') ||
      n1.endsWith(' ' + n2) ||
      n2.startsWith(n1 + ' ') ||
      n2.endsWith(' ' + n1)
    );
    console.log(`[MERGE-DEBUG] isSubstringMatch("${name1}", "${name2}") = ${result}`);
  }

  return (
    n1.startsWith(n2 + ' ') ||
    n1.endsWith(' ' + n2) ||
    n2.startsWith(n1 + ' ') ||
    n2.endsWith(' ' + n1)
  );
}

/**
 * Calculate confidence score for a merge decision
 */
function calculateMergeConfidence(
  score: number,
  method: 'substring_match' | 'jaro_winkler_strong' | 'jaro_winkler_weak'
): number {
  if (method === 'substring_match') {
    return 0.95;  // High confidence for exact substring matches
  } else if (method === 'jaro_winkler_strong') {
    // Map 0.92-1.0 to 0.85-0.95
    return 0.85 + (score - 0.92) * 1.25;
  } else {
    // jaro_winkler_weak (0.75-0.92 range)
    // Map 0.75-0.92 to 0.55-0.85
    return 0.55 + (score - 0.75) * 1.76;
  }
}

/**
 * Merge entities across documents using Jaro-Winkler clustering
 */
export function mergeEntitiesAcrossDocs(
  entities: Entity[]
): MergeResult {
  const STRONG_THRESHOLD = 0.92;  // Increased from 0.85 to prevent false merges (e.g., Aragorn/Arathorn)
  const WEAK_THRESHOLD = 0.75;

  // Group by type (blocking)
  const byType = new Map<string, Entity[]>();
  for (const entity of entities) {
    if (!byType.has(entity.type)) {
      byType.set(entity.type, []);
    }
    byType.get(entity.type)!.push(entity);
  }

  const globals: Entity[] = [];
  const idMap = new Map<string, string>();
  const decisions: MergeDecision[] = [];

  // Track merge metadata for each entity
  const entityMergeInfo = new Map<string, {
    score: number;
    method: 'substring_match' | 'jaro_winkler_strong' | 'jaro_winkler_weak';
    matchedNames: { local: string; cluster: string };
  }>();

  // Process each type group
  for (const [type, group] of byType.entries()) {
    const clusters: Entity[][] = [];

    for (const entity of group) {
      if (process.env.L3_DEBUG === '1' && entity.canonical.toLowerCase().includes('mcgonagall')) {
        console.log(`[DEBUG-MCG][merge] processing candidate ${entity.canonical}`);
      }
      const canonical = normalizeKey(entity.canonical);
      let bestClusterIdx = -1;
      let bestScore = 0;
      let hasSubstringMatch = false;
      let bestMatchedNames = { local: entity.canonical, cluster: '' };

      // Find best matching cluster
      for (let i = 0; i < clusters.length; i++) {
        const cluster = clusters[i];

        // Check against all names in cluster (canonical + aliases)
        for (const member of cluster) {
          const memberNames = [member.canonical, ...member.aliases];
          const entityNames = [entity.canonical, ...entity.aliases];

          for (const mName of memberNames) {
            for (const eName of entityNames) {
              // CRITICAL: Skip pronouns entirely - they are temporary references, not entity identifiers
              if (isPronounOrInvalidTerm(mName) || isPronounOrInvalidTerm(eName)) {
                continue;  // Don't use pronouns for matching at all
              }

              // Check for substring match (e.g., "Harry" in "Harry Potter")
              if (isSubstringMatch(mName, eName)) {
                const tokenCount = (name: string) => name.trim().split(/\s+/).filter(Boolean).length;
                if (tokenCount(mName) === 1 || tokenCount(eName) === 1) {
                  continue; // Don't merge based on single-token alias overlap
                }
                hasSubstringMatch = true;
                bestScore = 1.0;  // Force merge for substring matches
                bestClusterIdx = i;
                bestMatchedNames = { local: eName, cluster: mName };
                break;
              }

              const score = jaroWinkler(
                normalizeKey(mName),
                normalizeKey(eName)
              );

              if (score > bestScore) {
                bestScore = score;
                bestClusterIdx = i;
                bestMatchedNames = { local: eName, cluster: mName };
              }
            }
            if (hasSubstringMatch) break;
          }
          if (hasSubstringMatch) break;
        }
        if (hasSubstringMatch) break;
      }

      // Add to cluster if strong match or substring match, or create new cluster
      if (entity.type === 'PERSON' && hasSubstringMatch && bestClusterIdx >= 0) {
        if (!samePersonByName(bestMatchedNames.local, bestMatchedNames.cluster)) {
          hasSubstringMatch = false;
          bestClusterIdx = -1;
        }
      }

      if (entity.type === 'PERSON' && bestClusterIdx >= 0) {
        const entitySurname = getSurname(entity.canonical);
        const cluster = clusters[bestClusterIdx];
        const clusterSurnames = new Set<string>();
        for (const member of cluster) {
          const memberSurname = getSurname(member.canonical);
          if (memberSurname) {
            clusterSurnames.add(memberSurname);
          }
        }
        if (entitySurname && clusterSurnames.size > 0 && !clusterSurnames.has(entitySurname)) {
          bestClusterIdx = -1;
          hasSubstringMatch = false;
        }
      }

      if ((bestScore >= STRONG_THRESHOLD || hasSubstringMatch) && bestClusterIdx >= 0) {
        // DEBUG: Log why this entity is being merged
        console.log(`[MERGE] Merging "${entity.canonical}" into cluster ${bestClusterIdx} (score: ${bestScore.toFixed(3)}, method: ${hasSubstringMatch ? 'substring' : 'jaro-winkler'}, matched: "${bestMatchedNames.local}" ↔ "${bestMatchedNames.cluster}")`);

        clusters[bestClusterIdx].push(entity);

        // Store merge metadata
        const method = hasSubstringMatch ? 'substring_match' :
                      (bestScore >= STRONG_THRESHOLD ? 'jaro_winkler_strong' : 'jaro_winkler_weak');

        if (process.env.L3_DEBUG === '1' && entity.canonical.toLowerCase().includes('mcgonagall')) {
          console.log(`[DEBUG-MCG][merge] merging ${entity.canonical} into cluster ${bestClusterIdx} via ${method} (${bestMatchedNames.local} vs ${bestMatchedNames.cluster})`);
        }

        entityMergeInfo.set(entity.id, {
          score: bestScore,
          method,
          matchedNames: bestMatchedNames
        });
      } else {
        // DEBUG: Log new cluster creation
        console.log(`[MERGE] Creating new cluster ${clusters.length} for "${entity.canonical}"`);

        clusters.push([entity]);
        // Singleton cluster - perfect confidence
        entityMergeInfo.set(entity.id, {
          score: 1.0,
          method: 'substring_match',  // Using as default for singletons
          matchedNames: { local: entity.canonical, cluster: entity.canonical }
        });
        if (process.env.L3_DEBUG === '1' && entity.canonical.toLowerCase().includes('mcgonagall')) {
          console.log(`[DEBUG-MCG][merge] creating new cluster for ${entity.canonical}`);
        }
      }
    }

    // Convert clusters to global entities
    // DEBUG: Log all clusters to diagnose why Frederick/Saul disappear
    console.log(`[MERGE] Type ${type}: ${clusters.length} clusters from ${group.length} entities`);
    clusters.forEach((cluster, idx) => {
      const names = cluster.map(e => e.canonical).join(', ');
      const confidences = cluster.map(e => e.confidence?.toFixed(3) || 'N/A').join(', ');
      console.log(`  Cluster ${idx}: [${names}] (confidences: ${confidences})`);
    });

    for (const cluster of clusters) {
      // Debug: log person clusters
      if (type === 'PERSON' && process.env.DEBUG_MERGE === '1') {
        console.log('[merge] cluster', cluster.map(e => e.canonical));
      }

      // Pick canonical name (shortest, most common)
      const allNames = cluster.flatMap(e => [e.canonical, ...e.aliases]);

      // Filter out bad canonical candidates (verbs)
      // NOTE: Pronouns are no longer stored in aliases (filtered in orchestrator.ts)
      // so we only need to filter verbs that might appear in extracted text
      const commonVerbs = new Set(['ruled', 'teaches', 'lived', 'studied', 'went', 'became', 'was', 'were', 'is', 'are', 'has', 'have', 'had', 'said', 'says', 'asked', 'replied']);

      const isValidCanonical = (name: string): boolean => {
        const lower = name.toLowerCase().trim();
        // Reject names containing verbs (e.g., "the king ruled")
        const words = lower.split(/\s+/);
        if (words.some(w => commonVerbs.has(w))) {
          return false;
        }
        return true;
      };

      const validNames = allNames.filter(isValidCanonical);
      const candidateNames = validNames.length > 0 ? validNames : allNames; // Fallback if all filtered

      const nameCounts = new Map<string, number>();
      for (const name of candidateNames) {
        nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
      }

      const nameScore = (value: string) => {
        const parts = value.toLowerCase().split(/\s+/).filter(Boolean);
        const connectors = new Set([
          'the', 'of', 'and', 'jr', 'sr', 'ii', 'iii', 'iv',
          'sir', 'lord', 'lady', 'king', 'queen', 'prince', 'princess',
          'professor', 'dr', 'mr', 'mrs', 'ms'
        ]);
        const descriptors = new Set([
          'former', 'latter', 'later', 'current', 'young', 'younger',
          'older', 'eldest', 'elder', 'stern', 'brave', 'wise', 'noted'
        ]);
        const informative = parts.filter(p => !connectors.has(p) && !descriptors.has(p)).length;

        // Penalty: Descriptive titles starting with "the" are less desirable than proper names
        // "Aragorn" should beat "the king"
        const hasThe = parts[0] === 'the';
        const isProperName = !hasThe && /^[A-Z]/.test(value);

        return {
          informative,
          total: parts.length,
          length: value.length,
          isProperName,  // true for "Aragorn", false for "the king"
          hasThe         // false for "Aragorn", true for "the king"
        };
      };

      // Sort by: proper names first, then informative words, then frequency, then total words, then length
      const sortedNames = Array.from(nameCounts.entries())
        .sort((a, b) => {
          const aScore = nameScore(a[0]);
          const bScore = nameScore(b[0]);

          // 1. Prefer proper names over descriptive titles ("Aragorn" over "the king")
          if (aScore.isProperName !== bScore.isProperName) {
            return bScore.isProperName ? 1 : -1;
          }

          // 2. Penalize "the" prefix (avoid "the king" when "Aragorn" available)
          if (aScore.hasThe !== bScore.hasThe) {
            return aScore.hasThe ? 1 : -1;
          }

          // 3. Prefer more informative words
          if (aScore.informative !== bScore.informative) {
            return bScore.informative - aScore.informative;
          }

          // 4. Prefer higher frequency
          if (a[1] !== b[1]) return b[1] - a[1];

          // 5. Prefer fewer total words (simpler canonical)
          if (aScore.total !== bScore.total) {
            return aScore.total - bScore.total;
          }

          // 6. Prefer shorter names
          if (aScore.length !== bScore.length) {
            return aScore.length - bScore.length;
          }

          return 0;
        });

      let canonical = sortedNames[0][0];
      if (type === 'ORG' && /\bHouse$/i.test(canonical)) {
        canonical = canonical.replace(/\s+House$/i, '');
      }
      const aliases = Array.from(new Set(
        allNames.filter(n => n !== canonical)
      ));

      // Create global entity
      const bookSource = cluster.find(e => (e as any).booknlp_id);
      const globalId = bookSource && (bookSource as any).booknlp_id
        ? toBookNLPGlobalId((bookSource as any).booknlp_id)
        : `global_${type.toLowerCase()}_${globals.length}`;
      const globalEntity: Entity = {
        id: globalId,
        type: type as EntityType,
        canonical,
        aliases,
        created_at: new Date().toISOString(),
        centrality: Math.max(...cluster.map(e => e.centrality || 0)),
        confidence: Math.max(...cluster.map(e => e.confidence || 0.5))  // Preserve max confidence from cluster
      };
      const source = cluster.find(e => (e as any).source === 'booknlp')?.source || cluster.find(e => (e as any).source)?.source;
      if (source) {
        (globalEntity as any).source = source;
      }
      const booknlpId = cluster.find(e => (e as any).booknlp_id)?.booknlp_id;
      if (booknlpId) {
        (globalEntity as any).booknlp_id = booknlpId;
      }
      const eidCandidate = cluster.find(e => (e as any).eid)?.eid;
      if (eidCandidate) {
        (globalEntity as any).eid = eidCandidate;
      } else if (booknlpId) {
        (globalEntity as any).eid = toBookNLPEID(booknlpId);
      }
      const mentionCount = cluster.reduce((sum, e) => sum + ((e as any).mention_count || 0), 0);
      if (mentionCount > 0) {
        (globalEntity as any).mention_count = mentionCount;
      }

      globals.push(globalEntity);

      // Map all local IDs to this global ID and record decisions
      for (const localEntity of cluster) {
        idMap.set(localEntity.id, globalId);

        // Create merge decision with confidence
        const mergeInfo = entityMergeInfo.get(localEntity.id)!;
        const confidence = calculateMergeConfidence(mergeInfo.score, mergeInfo.method);

        decisions.push({
          local_entity_id: localEntity.id,
          global_entity_id: globalId,
          confidence,
          method: mergeInfo.method,
          similarity_score: mergeInfo.score,
          matched_names: mergeInfo.matchedNames
        });
      }
    }
  }

  // Calculate statistics
  const totalEntities = entities.length;
  const mergedClusters = globals.length;
  const avgConfidence = decisions.length > 0
    ? decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length
    : 1.0;
  const lowConfidenceCount = decisions.filter(d => d.confidence < 0.7).length;

  return {
    globals,
    idMap,
    decisions,
    stats: {
      total_entities: totalEntities,
      merged_clusters: mergedClusters,
      avg_confidence: avgConfidence,
      low_confidence_count: lowConfidenceCount
    }
  };
}

/**
 * Rewire relations to use global entity IDs
 */
export function rewireRelationsToGlobal(
  relations: Relation[],
  idMap: Map<string, string>
): Relation[] {
  return relations.map(rel => ({
    ...rel,
    subj: idMap.get(rel.subj) || rel.subj,
    obj: idMap.get(rel.obj) || rel.obj
  }));
}
