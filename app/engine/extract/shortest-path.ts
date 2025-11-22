/**
 * Shortest Dependency Path (SDP) for Relation Extraction
 *
 * Finds the shortest path between two entities in a dependency tree
 * and uses it to infer relation types.
 *
 * Based on: "A Shortest Path Dependency Kernel for Relation Extraction" (Bunescu & Mooney, 2005)
 */

import type { Token } from './parse-types';

export interface DependencyPath {
  tokens: Token[];
  edges: string[];  // Dependency labels
  path: string;     // String representation: "A:↑nsubj:verb:↓prep:at:↓pobj:B"
}

/**
 * Find shortest path between two tokens in dependency tree
 * Uses BFS to find the shortest undirected path
 */
export function findShortestPath(
  tokenA: Token,
  tokenB: Token,
  allTokens: Token[]
): DependencyPath | null {
  if (tokenA.i === tokenB.i) return null;

  // Build adjacency list (undirected graph)
  const adj = new Map<number, Array<{ tokenIdx: number; label: string; direction: 'up' | 'down' }>>();

  for (const tok of allTokens) {
    if (!adj.has(tok.i)) adj.set(tok.i, []);

    // Downward edge: token → child
    for (const child of allTokens) {
      if (child.head === tok.i && child.i !== tok.i) {
        adj.get(tok.i)!.push({ tokenIdx: child.i, label: child.dep, direction: 'down' });
      }
    }

    // Upward edge: token → parent
    if (tok.head !== tok.i && tok.head >= 0 && tok.head < allTokens.length) {
      adj.get(tok.i)!.push({ tokenIdx: tok.head, label: tok.dep, direction: 'up' });
    }
  }

  // BFS to find shortest path
  const queue: Array<{ idx: number; path: number[]; edges: Array<{ label: string; direction: 'up' | 'down' }> }> = [
    { idx: tokenA.i, path: [tokenA.i], edges: [] }
  ];

  const visited = new Set<number>([tokenA.i]);

  while (queue.length > 0) {
    const { idx, path, edges } = queue.shift()!;

    if (idx === tokenB.i) {
      // Found path!
      const pathTokens = path.map(i => allTokens[i]);
      const pathString = buildPathString(pathTokens, edges);

      return {
        tokens: pathTokens,
        edges: edges.map(e => e.label),
        path: pathString
      };
    }

    const neighbors = adj.get(idx) || [];
    for (const { tokenIdx, label, direction } of neighbors) {
      if (!visited.has(tokenIdx)) {
        visited.add(tokenIdx);
        queue.push({
          idx: tokenIdx,
          path: [...path, tokenIdx],
          edges: [...edges, { label, direction }]
        });
      }
    }
  }

  return null;  // No path found
}

/**
 * Build path string representation
 * Format: "token:↑dep:token:↓dep:token"
 */
function buildPathString(
  tokens: Token[],
  edges: Array<{ label: string; direction: 'up' | 'down' }>
): string {
  if (tokens.length === 0) return '';
  if (tokens.length === 1) return tokens[0].lemma;

  let result = tokens[0].lemma;

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const nextToken = tokens[i + 1];

    const arrow = edge.direction === 'up' ? '↑' : '↓';
    result += `:${arrow}${edge.label}:${nextToken.lemma}`;
  }

  return result;
}

/**
 * Extract path features for machine learning (future)
 */
export function extractPathFeatures(path: DependencyPath): Record<string, any> {
  return {
    length: path.tokens.length,
    path_string: path.path,
    has_verb: path.tokens.some(t => t.pos.startsWith('V')),
    has_prep: path.tokens.some(t => t.pos === 'ADP'),
    edge_types: Array.from(new Set(path.edges)),
    pos_sequence: path.tokens.map(t => t.pos).join('-')
  };
}

/**
 * Match path against known relation patterns
 * Returns predicate if path matches a known pattern
 */
export function matchPathToRelation(
  path: string,
  knownPatterns: Map<RegExp, string>
): string | null {
  for (const [pattern, predicate] of knownPatterns) {
    if (pattern.test(path)) {
      return predicate;
    }
  }
  return null;
}
