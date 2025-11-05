/**
 * Conflict Detection - Phase 4
 * Detects contradictions in the knowledge graph
 */

import type { Relation, Predicate } from './schema';
import { SINGLE_VALUED } from './schema';

export interface Conflict {
  type: 'single_valued' | 'cycle' | 'temporal';
  severity: 1 | 2 | 3;  // 1=low, 2=medium, 3=high
  description: string;
  relations: Relation[];
}

/**
 * Detect conflicts in the knowledge graph
 */
export function detectConflicts(relations: Relation[]): Conflict[] {
  const conflicts: Conflict[] = [];

  // 1. Single-valued predicate conflicts
  conflicts.push(...detectSingleValuedConflicts(relations));

  // 2. Cycle detection (parent_of, child_of)
  conflicts.push(...detectCycles(relations));

  // 3. Temporal overlaps (optional, future)
  // conflicts.push(...detectTemporalOverlaps(relations));

  return conflicts;
}

/**
 * Detect single-valued predicate conflicts
 * Example: "X married_to Y" + "X married_to Z" (Y ≠ Z)
 */
function detectSingleValuedConflicts(relations: Relation[]): Conflict[] {
  const conflicts: Conflict[] = [];

  // Group by (subj, pred)
  const groups = new Map<string, Relation[]>();
  for (const rel of relations) {
    if (!SINGLE_VALUED.has(rel.pred)) continue;

    const key = `${rel.subj}::${rel.pred}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(rel);
  }

  // Check for multiple distinct objects
  for (const [key, rels] of groups.entries()) {
    if (rels.length <= 1) continue;

    const distinctObjects = new Set(rels.map(r => r.obj));
    if (distinctObjects.size > 1) {
      const [subj, pred] = key.split('::');

      conflicts.push({
        type: 'single_valued',
        severity: 2,
        description: `Entity ${subj} has multiple values for single-valued predicate '${pred}': ${Array.from(distinctObjects).join(', ')}`,
        relations: rels
      });
    }
  }

  return conflicts;
}

/**
 * Detect cycles in parent_of / child_of relations
 * Example: A→B→C→A (cycle of length 3)
 */
function detectCycles(relations: Relation[]): Conflict[] {
  const conflicts: Conflict[] = [];

  // Build adjacency list for parent_of and child_of
  const graph = new Map<string, string[]>();
  const edgeMap = new Map<string, Relation>();  // "A→B" -> relation

  for (const rel of relations) {
    if (rel.pred !== 'parent_of' && rel.pred !== 'child_of') continue;

    const from = rel.subj;
    const to = rel.obj;

    if (!graph.has(from)) {
      graph.set(from, []);
    }
    graph.get(from)!.push(to);

    const edgeKey = `${from}→${to}`;
    edgeMap.set(edgeKey, rel);
  }

  // DFS to find cycles
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const pathStack: string[] = [];

  function dfs(node: string): boolean {
    visited.add(node);
    recStack.add(node);
    pathStack.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        // Found a cycle!
        const cycleStart = pathStack.indexOf(neighbor);
        const cyclePath = pathStack.slice(cycleStart);
        cyclePath.push(neighbor);  // Complete the cycle

        // Extract relations in cycle
        const cycleRelations: Relation[] = [];
        for (let i = 0; i < cyclePath.length - 1; i++) {
          const edgeKey = `${cyclePath[i]}→${cyclePath[i + 1]}`;
          const rel = edgeMap.get(edgeKey);
          if (rel) cycleRelations.push(rel);
        }

        conflicts.push({
          type: 'cycle',
          severity: 3,
          description: `Cycle detected in parent_of/child_of: ${cyclePath.join(' → ')}`,
          relations: cycleRelations
        });

        return true;
      }
    }

    pathStack.pop();
    recStack.delete(node);
    return false;
  }

  // Check all nodes
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return conflicts;
}

/**
 * Detect temporal overlaps (future enhancement)
 * Example: "born in 1990" + "died in 1980"
 */
function detectTemporalOverlaps(relations: Relation[]): Conflict[] {
  // TODO: Implement temporal conflict detection
  // - Extract date qualifiers from born_in, dies_in
  // - Check for impossible orderings (died before born, etc.)
  return [];
}
