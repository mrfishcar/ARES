/**
 * Cross-Document Merge - Phase 4
 * Merges entities across documents using Jaro-Winkler clustering
 */

import type { Entity, Relation, EntityType } from './schema';

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

/**
 * Check if one name is a substring of another (after normalization)
 */
function isSubstringMatch(name1: string, name2: string): boolean {
  const n1 = normalizeKey(name1);
  const n2 = normalizeKey(name2);
  if (n1 === n2) return true;
  if (!n1.length || !n2.length) return false;
  return (
    n1.startsWith(n2 + ' ') ||
    n1.endsWith(' ' + n2) ||
    n2.startsWith(n1 + ' ') ||
    n2.endsWith(' ' + n1)
  );
}

/**
 * Merge entities across documents using Jaro-Winkler clustering
 */
export function mergeEntitiesAcrossDocs(
  entities: Entity[]
): {
  globals: Entity[];
  idMap: Map<string, string>;  // local_id -> global_id
} {
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

  // Process each type group
  for (const [type, group] of byType.entries()) {
    const clusters: Entity[][] = [];

    for (const entity of group) {
      const canonical = normalizeKey(entity.canonical);
      let bestClusterIdx = -1;
      let bestScore = 0;
      let hasSubstringMatch = false;

      // Find best matching cluster
      for (let i = 0; i < clusters.length; i++) {
        const cluster = clusters[i];

        // Check against all names in cluster (canonical + aliases)
        for (const member of cluster) {
          const memberNames = [member.canonical, ...member.aliases];
          const entityNames = [entity.canonical, ...entity.aliases];

          for (const mName of memberNames) {
            for (const eName of entityNames) {
              // Check for substring match (e.g., "Harry" in "Harry Potter")
              if (isSubstringMatch(mName, eName)) {
                hasSubstringMatch = true;
                bestScore = 1.0;  // Force merge for substring matches
                bestClusterIdx = i;
                break;
              }

              const score = jaroWinkler(
                normalizeKey(mName),
                normalizeKey(eName)
              );

              if (score > bestScore) {
                bestScore = score;
                bestClusterIdx = i;
              }
            }
            if (hasSubstringMatch) break;
          }
          if (hasSubstringMatch) break;
        }
        if (hasSubstringMatch) break;
      }

      // Add to cluster if strong match or substring match, or create new cluster
      if ((bestScore >= STRONG_THRESHOLD || hasSubstringMatch) && bestClusterIdx >= 0) {
        clusters[bestClusterIdx].push(entity);
      } else {
        clusters.push([entity]);
      }
    }

    // Convert clusters to global entities
    for (const cluster of clusters) {
      // Debug: log person clusters
      if (type === 'PERSON' && process.env.DEBUG_MERGE === '1') {
        console.log('[merge] cluster', cluster.map(e => e.canonical));
      }

      // Pick canonical name (shortest, most common)
      const allNames = cluster.flatMap(e => [e.canonical, ...e.aliases]);
      const nameCounts = new Map<string, number>();
      for (const name of allNames) {
        nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
      }

      const nameScore = (value: string) => {
        const parts = value.toLowerCase().split(/\s+/).filter(Boolean);
        const connectors = new Set(['the', 'of', 'and', 'jr', 'sr', 'ii', 'iii', 'iv']);
        const informative = parts.filter(p => !connectors.has(p)).length;
        return {
          informative,
          total: parts.length,
          length: value.length
        };
      };

      // Sort by frequency (desc), then informative word count (desc), then total words (desc), then length (asc)
      const sortedNames = Array.from(nameCounts.entries())
        .sort((a, b) => {
          const aScore = nameScore(a[0]);
          const bScore = nameScore(b[0]);

          if (aScore.informative !== bScore.informative) {
            return bScore.informative - aScore.informative;
          }
          if (a[1] !== b[1]) return b[1] - a[1];  // Frequency desc
          if (aScore.total !== bScore.total) {
            return bScore.total - aScore.total;
          }
          return aScore.length - bScore.length;
        });

      let canonical = sortedNames[0][0];
      if (type === 'ORG' && /\bHouse$/i.test(canonical)) {
        canonical = canonical.replace(/\s+House$/i, '');
      }
      const aliases = Array.from(new Set(
        allNames.filter(n => n !== canonical)
      ));

      // Create global entity
      const globalId = `global_${type.toLowerCase()}_${globals.length}`;
      const globalEntity: Entity = {
        id: globalId,
        type: type as EntityType,
        canonical,
        aliases,
        created_at: new Date().toISOString(),
        centrality: Math.max(...cluster.map(e => e.centrality || 0))
      };

      globals.push(globalEntity);

      // Map all local IDs to this global ID
      for (const localEntity of cluster) {
        idMap.set(localEntity.id, globalId);
      }
    }
  }

  return { globals, idMap };
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
