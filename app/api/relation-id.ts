/**
 * Stable Relation ID Generation
 * Sprint R4: Create deterministic IDs for relations using SHA1
 */

import * as crypto from 'crypto';

/**
 * Generate a stable relation ID from subject|predicate|object
 * Uses SHA1 hash for deterministic sorting
 */
export function generateRelationId(subject: string, predicate: string, object: string): string {
  const composite = `${subject}|${predicate}|${object}`;
  return crypto.createHash('sha1').update(composite).digest('hex');
}

/**
 * Add stable IDs to relations if not present
 * Mutates the relations array in place
 */
export function ensureRelationIds(relations: any[]): void {
  for (const rel of relations) {
    if (!rel.id) {
      rel.id = generateRelationId(rel.subj, rel.pred, rel.obj);
    }
  }
}
