/**
 * HERT (Hierarchical Entity Reference Tag) Types
 *
 * Compact, stable entity references with sense disambiguation
 * and precise document locations.
 */

/**
 * Entity ID (32-bit unsigned integer)
 * The "Strong's root" - stable across documents and aliases
 */
export type EID = number;

/**
 * Alias ID (24-bit unsigned integer)
 * Maps surface forms to entities (per language/script)
 */
export type AID = number;

/**
 * Document ID (64-bit hash)
 * Fingerprint of document (mmh3_64 or similar)
 */
export type DID = bigint;

/**
 * Sense/Subreference Path
 * Dot-path of small ints for semantic disambiguation
 * Example: [2, 1, 0] → "sense 2, subsense 1, variant 0"
 */
export type SP = number[];

/**
 * Location Path
 * Hierarchical offsets within document
 * [section?, chapter?, paragraph, tokenStart, tokenLength]
 */
export interface LP {
  section?: number;
  chapter?: number;
  paragraph: number;
  tokenStart: number;
  tokenLength: number;
}

/**
 * HERT Flags (bitfield)
 */
export interface HERTFlags {
  hasSection: boolean;      // LP includes section
  hasChapter: boolean;      // LP includes chapter
  aliasPresent: boolean;    // AID is present
  chainNext: boolean;       // Part of a reference chain
  confidenceBin: number;    // 0-7 (3 bits) confidence level
  keyRotation: number;      // 0-31 (5 bits) for encryption key ID
  encrypted: boolean;       // Payload is encrypted
}

/**
 * HERT Metadata (optional)
 */
export interface HERTMeta {
  modelVersion?: number;    // Extractor model version
  extractorId?: number;     // Which extractor produced this
  timestamp?: number;       // When reference was created
}

/**
 * Complete HERT structure
 */
export interface HERT {
  eid: EID;                 // Entity ID
  aid?: AID;                // Alias ID (surface form identifier) - Phase 3
  sp?: SP;                  // Sense path (optional)
  did: DID;                 // Document ID
  lp: LP;                   // Location path
  flags: HERTFlags;         // Bitfield flags
  meta?: HERTMeta;          // Optional metadata
}

/**
 * Encoded HERT (compact text form)
 */
export interface EncodedHERT {
  version: 'v1' | 'v1e';    // v1 = plain, v1e = encrypted
  payload: string;          // Base62-encoded binary
  checksum?: string;        // Optional CRC32C
}

/**
 * Entity record
 */
export interface Entity {
  eid: EID;
  canonical: string;
  types: string[];
  senseRegistry: SenseEntry[];
  status: 'active' | 'merged' | 'split' | 'deprecated';
  mergedInto?: EID;         // If status = 'merged'
  splitInto?: EID[];        // If status = 'split'
}

/**
 * Sense registry entry
 */
export interface SenseEntry {
  index: number;            // SP component value
  label: string;            // Human-readable label
  description: string;      // Detailed description
  examples: string[];       // Example usages
  parent?: number;          // Parent sense index (for hierarchical)
}

/**
 * Alias record
 */
export interface Alias {
  aid: AID;
  eid: EID;
  sp?: SP;                  // Associated sense path (optional)
  surface: string;          // Surface form
  lang: string;             // Language code (ISO 639-1)
  script?: string;          // Script code (ISO 15924)
  normalized: string;       // Normalized form (for matching)
  confidence: number;       // 0-1
  contexts: string[];       // Example contexts
}

/**
 * Document record
 */
export interface Document {
  did: DID;
  canonicalUri: string;
  title: string;
  contentHash: string;      // SHA256 or similar
  version: number;
  metadata?: Record<string, unknown>;
}

/**
 * Reference record (sparse storage)
 */
export interface Reference {
  eid: EID;
  did: DID;
  lp: LP;
  lpHash: number;           // 20-bit hash for fast lookup
  sp?: SP;
  flags: HERTFlags;
  hert: string;             // Encoded HERT string
  createdAt: number;        // Timestamp
}

/**
 * Reference bundle (for batch export/import)
 */
export interface ReferenceBundle {
  did: DID;
  baseLp: {                 // Base location for delta encoding
    section?: number;
    chapter?: number;
    paragraph: number;
  };
  entries: Array<{
    eid: EID;
    sp?: SP;
    deltaTokenStart: number; // Relative to previous entry
    tokenLength: number;
    flags: HERTFlags;
  }>;
  signature?: string;       // Optional MAC for tamper detection
}
