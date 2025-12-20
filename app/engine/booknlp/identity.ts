/**
 * BookNLP Identity Helpers
 *
 * Provides deterministic IDs derived from BookNLP cluster IDs so they remain
 * stable across runs and can be mapped into HERT/EID space.
 */

/**
 * Normalize a BookNLP cluster ID to the canonical form used by the runner
 * (e.g., "char_5").
 */
export function normalizeBookNLPId(rawId: string): string {
  if (!rawId) return '';
  const trimmed = rawId.trim();
  return trimmed.startsWith('char_') ? trimmed : `char_${trimmed}`;
}

/**
 * Deterministic entity ID used inside ARES for BookNLP clusters.
 */
export function toBookNLPStableEntityId(rawId: string): string {
  const normalized = normalizeBookNLPId(rawId);
  const cluster = normalized.replace('char_', '');
  return `booknlp_entity_${cluster}`;
}

/**
 * Deterministic global ID for merged storage when BookNLP data is present.
 */
export function toBookNLPGlobalId(rawId: string): string {
  const normalized = normalizeBookNLPId(rawId);
  const cluster = normalized.replace('char_', '');
  return `global_booknlp_${cluster}`;
}

/**
 * Deterministic EID seed for BookNLP clusters. We offset the cluster integer
 * to avoid collisions with existing registry-assigned IDs while keeping the
 * mapping stable even if registries are cleared.
 */
export function toBookNLPEID(rawId: string, offset: number = 1_000_000): number {
  const normalized = normalizeBookNLPId(rawId);
  const numericPart = normalized.replace('char_', '');
  const parsed = parseInt(numericPart, 10);

  if (!Number.isNaN(parsed)) {
    return offset + parsed;
  }

  // Fallback: simple deterministic hash for non-numeric IDs
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return offset + (hash % offset);
}

// ============================================================================
// NON-CHARACTER ENTITY IDS (LOC, ORG, FAC, GPE, VEH)
// ============================================================================

/**
 * Generate stable entity ID for non-character entities extracted from BookNLP mentions.
 * These are entities like locations, organizations, etc. that BookNLP identifies
 * via NER but doesn't cluster into characters.
 *
 * Format: booknlp_{type}_{normalized_text}
 * Example: booknlp_loc_hogwarts, booknlp_org_ministry_of_magic
 */
export function toBookNLPNonCharEntityId(entityType: string, text: string): string {
  const typeCode = entityType.toLowerCase().slice(0, 3);  // loc, org, fac, gpe, veh
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);  // Limit length
  return `booknlp_${typeCode}_${normalized}`;
}

/**
 * Generate global ID for non-character entities.
 * Used for cross-document merging.
 */
export function toBookNLPNonCharGlobalId(entityType: string, text: string): string {
  const typeCode = entityType.toLowerCase().slice(0, 3);
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  return `global_booknlp_${typeCode}_${normalized}`;
}

/**
 * Generate EID for non-character entities.
 * Uses a different offset range (2_000_000) to avoid collisions with character EIDs.
 */
export function toBookNLPNonCharEID(entityType: string, text: string, offset: number = 2_000_000): number {
  const key = `${entityType}:${text}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return offset + (hash % 1_000_000);  // Stay in 2M-3M range
}
