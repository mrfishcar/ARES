/**
 * Document Fingerprinting
 *
 * Generates stable 64-bit Document IDs (DID) from:
 * - Canonical path
 * - Content hash
 * - Version
 */

import * as crypto from 'crypto';
import type { DID } from './types';

/**
 * Generate DID from document metadata
 *
 * Uses MurmurHash3-like approach:
 * 1. Normalize canonical path
 * 2. Hash content (SHA256)
 * 3. Combine with version
 * 4. Produce 64-bit ID
 */
export function generateDID(
  canonicalUri: string,
  contentHash: string,
  version: number = 1
): DID {
  // Normalize URI (lowercase, trim, remove trailing slashes)
  const normalizedUri = canonicalUri.toLowerCase().trim().replace(/\/+$/, '');

  // Combine inputs
  const input = `${normalizedUri}::${contentHash}::v${version}`;

  // Hash to 64-bit
  const hash = crypto.createHash('sha256').update(input).digest();

  // Take first 8 bytes as 64-bit integer
  let did = 0n;
  for (let i = 0; i < 8; i++) {
    did |= BigInt(hash[i]) << BigInt(i * 8);
  }

  return did;
}

/**
 * Hash document content (SHA256)
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generate LP hash (20-bit SipHash-like)
 *
 * For fast lookups and drift detection
 */
export function generateLPHash(
  section: number | undefined,
  chapter: number | undefined,
  paragraph: number,
  tokenStart: number,
  tokenLength: number
): number {
  // Simple hash combining all components
  const input = [
    section || 0,
    chapter || 0,
    paragraph,
    tokenStart,
    tokenLength
  ];

  let hash = 0;
  for (const val of input) {
    hash = ((hash << 5) - hash) + val;
    hash = hash & hash; // Convert to 32-bit
  }

  // Take lower 20 bits
  return hash & 0xFFFFF;
}

/**
 * Normalize text for aliasing
 *
 * - Case fold
 * - Unicode NFKC normalization
 * - Remove diacritics
 * - Light punctuation/whitespace normalization
 */
export function normalizeForAliasing(text: string): string {
  // Case fold
  let normalized = text.toLowerCase();

  // Unicode NFKC normalization
  normalized = normalized.normalize('NFKC');

  // Remove diacritics (simple approach - decompose and remove combining marks)
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Trim and collapse whitespace
  normalized = normalized.trim().replace(/\s+/g, ' ');

  // Remove common punctuation (but keep hyphens, apostrophes in middle)
  normalized = normalized.replace(/^[^\w]+|[^\w]+$/g, '');

  return normalized;
}
