/**
 * HERT (Hierarchical Entity Reference Tag) System
 *
 * Stable, compact entity references with sense disambiguation
 * and precise document locations.
 *
 * Main exports:
 * - encodeHERT() / decodeHERT() - Text form encoding/decoding
 * - generateDID() - Document fingerprinting
 * - normalizeForAliasing() - Text normalization
 * - Types: HERT, EID, DID, SP, LP, etc.
 */

// Types
export type { HERT, EID, AID, DID, SP, LP, HERTFlags, HERTMeta, EncodedHERT } from './types';
export type { Entity, SenseEntry, Alias, Document, Reference, ReferenceBundle } from './types';

// Codec
export {
  encodeHERT,
  decodeHERT,
  encodeHERTBinary,
  decodeHERTBinary,
  encodeHERTReadable,
  createDefaultFlags
} from './codec';

// Fingerprinting
export {
  generateDID,
  hashContent,
  generateLPHash,
  normalizeForAliasing
} from './fingerprint';

// Varint (for advanced usage)
export {
  encodeVarint,
  decodeVarint,
  encodeVarintArray,
  decodeVarintArray,
  encode64,
  decode64
} from './varint';

// Base62 (for advanced usage)
export {
  encodeBase62,
  decodeBase62
} from './base62';

/**
 * Quick HERT creation helper
 *
 * Example:
 * ```typescript
 * const hert = createHERT({
 *   eid: 4102,
 *   sp: [2, 1],
 *   documentPath: '/library/faith.docx',
 *   contentHash: 'abc123...',
 *   paragraph: 14,
 *   tokenStart: 823,
 *   tokenLength: 4
 * });
 *
 * const encoded = encodeHERT(hert);
 * // "HERTv1:PVr0Cw8Z..."
 *
 * const readable = encodeHERTReadable(hert);
 * // "4102.S2.1 @ d:Zf7qJ9 p:14 t:823+4"
 * ```
 */
export function createHERT(options: {
  eid: number;
  aid?: number;          // Phase 3: Alias ID
  sp?: number[];
  documentPath: string;
  contentHash: string;
  version?: number;
  section?: number;
  chapter?: number;
  paragraph: number;
  tokenStart: number;
  tokenLength: number;
  confidence?: number;
}): import('./types').HERT {
  const {
    eid,
    aid,
    sp,
    documentPath,
    contentHash,
    version = 1,
    section,
    chapter,
    paragraph,
    tokenStart,
    tokenLength,
    confidence = 1.0
  } = options;

  // Generate DID
  const did = require('./fingerprint').generateDID(documentPath, contentHash, version);

  // Create flags
  const confidenceBin = Math.min(7, Math.max(0, Math.floor(confidence * 7)));

  const flags: import('./types').HERTFlags = {
    hasSection: section !== undefined,
    hasChapter: chapter !== undefined,
    aliasPresent: aid !== undefined,  // Phase 3: Set flag when AID present
    chainNext: false,
    confidenceBin,
    keyRotation: 0,
    encrypted: false
  };

  // Create LP
  const lp: import('./types').LP = {
    section,
    chapter,
    paragraph,
    tokenStart,
    tokenLength
  };

  return {
    eid,
    aid,  // Phase 3: Include AID
    sp,
    did,
    lp,
    flags
  };
}
