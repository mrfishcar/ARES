/**
 * Relay-style cursor pagination helpers
 * Implements stable, deterministic pagination with safety limits
 * Sprint R4: Enhanced with keyset pagination and validation
 */

export type ConnectionArgs = {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
};

export type Edge<T> = {
  cursor: string;
  node: T;
};

export type PageInfo = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
};

export type Connection<T> = {
  edges: Edge<T>[];
  pageInfo: PageInfo;
};

export type Cursor = string;

// Performance guardrails (Sprint R4)
export const MAX_PAGE = 200;  // hard cap
export const DEFAULT_PAGE = 50;
export const MIN_PAGE = 1;

interface CursorPayload {
  k: string;  // sort key
}

/**
 * Encode a sort key as a base64 cursor
 * Format: base64({k:<sortKey>})
 */
export function encodeCursor(sortKey: string): Cursor {
  const payload: CursorPayload = { k: sortKey };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

/**
 * Decode a base64 cursor back to payload
 * Throws on invalid format
 */
export function decodeCursor(cursor: Cursor): CursorPayload {
  try {
    const json = Buffer.from(cursor, 'base64').toString('utf8');
    const payload = JSON.parse(json);

    if (!payload || typeof payload.k !== 'string') {
      throw new Error('INVALID_CURSOR: missing key field');
    }

    return payload as CursorPayload;
  } catch (err: any) {
    throw new Error(`INVALID_CURSOR: ${err.message}`);
  }
}

/**
 * Validate limit within bounds
 */
export function validateLimit(limit?: number): number {
  if (limit === undefined || limit === null) {
    return DEFAULT_PAGE;
  }

  if (limit < MIN_PAGE || limit > MAX_PAGE) {
    throw new Error(`Limit must be between ${MIN_PAGE} and ${MAX_PAGE}, got ${limit}`);
  }

  return limit;
}

/**
 * Build a Relay-style connection from pre-sorted items
 *
 * @param items - Array of items, MUST be pre-sorted deterministically
 * @param args - Connection arguments (first, after, last, before)
 * @param makeKey - Function to generate unique key for each item (used for cursor)
 * @returns Connection with edges and pageInfo
 *
 * Usage:
 *   const sorted = entities.sort((a, b) => a.canonical.localeCompare(b.canonical));
 *   const conn = buildConnection(sorted, { first: 10 }, (e) => e.id);
 */
export function buildConnection<T>(
  items: T[],
  args: ConnectionArgs,
  makeKey: (x: T) => string
): Connection<T> {
  // Validate args
  if (args.first && args.last) {
    throw new Error('Cannot use both "first" and "last" arguments');
  }

  // Determine pagination direction and limit
  const first = args.first ?? null;
  const last = args.last ?? null;
  const limit = Math.min(
    first ?? last ?? DEFAULT_PAGE,
    MAX_PAGE
  );

  // Decode cursors if provided (Sprint R4: validates cursor format)
  let afterKey: string | null = null;
  let beforeKey: string | null = null;

  try {
    if (args.after) {
      const payload = decodeCursor(args.after);
      afterKey = payload.k;
    }
    if (args.before) {
      const payload = decodeCursor(args.before);
      beforeKey = payload.k;
    }
  } catch (err: any) {
    throw new Error(`Invalid cursor: ${err.message}`);
  }

  // Find slice boundaries
  let start = 0;
  let end = items.length;

  if (afterKey) {
    const idx = items.findIndex(i => makeKey(i) === afterKey);
    if (idx < 0) {
      throw new Error('INVALID_CURSOR: key not found in current dataset');
    }
    start = idx + 1;  // Start after the cursor
  }

  if (beforeKey) {
    const idx = items.findIndex(i => makeKey(i) === beforeKey);
    if (idx < 0) {
      throw new Error('INVALID_CURSOR: key not found in current dataset');
    }
    end = idx;  // End before the cursor
  }

  // Slice to get items in range
  let sliced = items.slice(start, end);

  // Track where we actually sliced for page info
  let actualStart = start;
  let actualEnd = start + sliced.length;

  // Apply limit based on direction
  if (args.last) {
    // Backward pagination: take last N items
    const offset = Math.max(0, sliced.length - limit);
    sliced = sliced.slice(offset);
    actualStart = start + offset;
    actualEnd = end;
  } else {
    // Forward pagination: take first N items
    sliced = sliced.slice(0, limit);
    actualStart = start;
    actualEnd = Math.min(start + sliced.length, end);
  }

  // Build edges with cursors
  const edges: Edge<T>[] = sliced.map(node => ({
    node,
    cursor: encodeCursor(makeKey(node))
  }));

  // Compute page info
  const pageInfo: PageInfo = {
    hasPreviousPage: actualStart > 0,
    hasNextPage: actualEnd < items.length,
    startCursor: edges[0]?.cursor,
    endCursor: edges[edges.length - 1]?.cursor
  };

  return { edges, pageInfo };
}

/**
 * Simplified keyset slicing utility for Sprint R4
 * Slices pre-sorted items by cursor, returns nodes + pagination info
 *
 * @param items - Pre-sorted array
 * @param getKey - Function to extract stable sort key from item
 * @param after - Optional cursor to start after
 * @param limit - Page size (default 50, max 200)
 * @returns Object with nodes, endCursor, hasNextPage
 */
export function sliceByCursor<T>(
  items: T[],
  getKey: (t: T) => string,
  after?: Cursor,
  limit: number = DEFAULT_PAGE
): {
  nodes: T[];
  endCursor: Cursor | null;
  hasNextPage: boolean;
} {
  // Validate limit
  const validLimit = validateLimit(limit);

  // Find start index
  let startIdx = 0;
  if (after) {
    try {
      const payload = decodeCursor(after);
      const idx = items.findIndex(i => getKey(i) === payload.k);
      if (idx < 0) {
        throw new Error('INVALID_CURSOR: key not found');
      }
      startIdx = idx + 1;
    } catch (err: any) {
      throw new Error(`Cursor error: ${err.message}`);
    }
  }

  // Slice items
  const sliced = items.slice(startIdx, startIdx + validLimit);

  // Determine if there are more items
  const hasNextPage = startIdx + validLimit < items.length;

  // Generate end cursor
  const endCursor = sliced.length > 0
    ? encodeCursor(getKey(sliced[sliced.length - 1]))
    : null;

  return {
    nodes: sliced,
    endCursor,
    hasNextPage
  };
}
