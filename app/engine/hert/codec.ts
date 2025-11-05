/**
 * HERT Codec - Encoding/Decoding
 *
 * Converts HERT structures to/from compact binary and text forms.
 *
 * Binary format:
 * - EID (varint)
 * - SP count (varint) + SP values (varints)
 * - DID (8 bytes fixed)
 * - FLAGS (1 byte)
 * - LP components (varints, conditional on FLAGS)
 * - META (optional varints)
 *
 * Text format:
 * - HERTv1:<base62(binary)>
 * - HERTv1e:<base62(encrypted)>
 */

import type { HERT, HERTFlags, LP, EncodedHERT } from './types';
import { encodeVarint, decodeVarint, encodeVarintArray, decodeVarintArray, encode64, decode64 } from './varint';
import { encodeBase62, decodeBase62 } from './base62';

/**
 * Pack HERTFlags into a single byte
 */
function packFlags(flags: HERTFlags): number {
  let byte = 0;

  if (flags.hasSection) byte |= 0b10000000;
  if (flags.hasChapter) byte |= 0b01000000;
  if (flags.aliasPresent) byte |= 0b00100000;
  if (flags.chainNext) byte |= 0b00010000;
  if (flags.encrypted) byte |= 0b00001000;

  // Confidence (3 bits): bits 2-0
  byte |= (flags.confidenceBin & 0b111);

  // Note: keyRotation stored separately if encrypted

  return byte;
}

/**
 * Unpack HERTFlags from a single byte
 */
function unpackFlags(byte: number): Partial<HERTFlags> {
  return {
    hasSection: (byte & 0b10000000) !== 0,
    hasChapter: (byte & 0b01000000) !== 0,
    aliasPresent: (byte & 0b00100000) !== 0,
    chainNext: (byte & 0b00010000) !== 0,
    encrypted: (byte & 0b00001000) !== 0,
    confidenceBin: byte & 0b111,
    keyRotation: 0  // Will be read separately if encrypted
  };
}

/**
 * Encode HERT to binary
 */
export function encodeHERTBinary(hert: HERT): Uint8Array {
  const chunks: Uint8Array[] = [];

  // 1. EID (varint)
  chunks.push(encodeVarint(hert.eid));

  // 2. SP (count + varints)
  const sp = hert.sp || [];
  chunks.push(encodeVarint(sp.length));
  if (sp.length > 0) {
    chunks.push(encodeVarintArray(sp));
  }

  // 3. DID (8 bytes fixed)
  chunks.push(encode64(hert.did));

  // 4. FLAGS (1 byte)
  chunks.push(new Uint8Array([packFlags(hert.flags)]));

  // 5. AID (varint, only if aliasPresent) - Phase 3
  if (hert.flags.aliasPresent && hert.aid !== undefined) {
    chunks.push(encodeVarint(hert.aid));
  }

  // 6. Key rotation (1 byte, only if encrypted)
  if (hert.flags.encrypted) {
    chunks.push(new Uint8Array([hert.flags.keyRotation]));
  }

  // 7. LP (conditional varints based on flags)
  const lpValues: number[] = [];

  if (hert.flags.hasSection && hert.lp.section !== undefined) {
    lpValues.push(hert.lp.section);
  }

  if (hert.flags.hasChapter && hert.lp.chapter !== undefined) {
    lpValues.push(hert.lp.chapter);
  }

  lpValues.push(hert.lp.paragraph);
  lpValues.push(hert.lp.tokenStart);
  lpValues.push(hert.lp.tokenLength);

  chunks.push(encodeVarintArray(lpValues));

  // 7. META (optional varints)
  if (hert.meta) {
    const metaValues: number[] = [];

    if (hert.meta.modelVersion !== undefined) {
      metaValues.push(hert.meta.modelVersion);
    }

    if (hert.meta.extractorId !== undefined) {
      metaValues.push(hert.meta.extractorId);
    }

    if (hert.meta.timestamp !== undefined) {
      metaValues.push(hert.meta.timestamp);
    }

    if (metaValues.length > 0) {
      chunks.push(encodeVarint(metaValues.length));
      chunks.push(encodeVarintArray(metaValues));
    }
  }

  // Concatenate all chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Decode HERT from binary
 */
export function decodeHERTBinary(bytes: Uint8Array): HERT {
  let offset = 0;

  // 1. EID (varint)
  const { value: eid, bytesRead: eidBytes } = decodeVarint(bytes, offset);
  offset += eidBytes;

  // 2. SP (count + varints)
  const { value: spCount, bytesRead: spCountBytes } = decodeVarint(bytes, offset);
  offset += spCountBytes;

  let sp: number[] | undefined;
  if (spCount > 0) {
    const { values: spValues, bytesRead: spBytes } = decodeVarintArray(bytes, spCount, offset);
    sp = spValues;
    offset += spBytes;
  }

  // 3. DID (8 bytes fixed)
  const did = decode64(bytes, offset);
  offset += 8;

  // 4. FLAGS (1 byte)
  const flagsByte = bytes[offset];
  const flags = unpackFlags(flagsByte) as HERTFlags;
  offset += 1;

  // 5. AID (varint, only if aliasPresent) - Phase 3
  let aid: number | undefined;
  if (flags.aliasPresent) {
    const { value: aidValue, bytesRead: aidBytes } = decodeVarint(bytes, offset);
    aid = aidValue;
    offset += aidBytes;
  }

  // 6. Key rotation (1 byte, only if encrypted)
  if (flags.encrypted) {
    flags.keyRotation = bytes[offset];
    offset += 1;
  }

  // 7. LP (conditional varints)
  const lpCount = (flags.hasSection ? 1 : 0) + (flags.hasChapter ? 1 : 0) + 3; // para, tokenStart, tokenLen
  const { values: lpValues, bytesRead: lpBytes } = decodeVarintArray(bytes, lpCount, offset);
  offset += lpBytes;

  let lpIndex = 0;
  const lp: LP = {
    section: flags.hasSection ? lpValues[lpIndex++] : undefined,
    chapter: flags.hasChapter ? lpValues[lpIndex++] : undefined,
    paragraph: lpValues[lpIndex++],
    tokenStart: lpValues[lpIndex++],
    tokenLength: lpValues[lpIndex++]
  };

  // 7. META (optional varints)
  let meta;
  if (offset < bytes.length) {
    const { value: metaCount, bytesRead: metaCountBytes } = decodeVarint(bytes, offset);
    offset += metaCountBytes;

    if (metaCount > 0) {
      const { values: metaValues } = decodeVarintArray(bytes, metaCount, offset);
      meta = {
        modelVersion: metaValues[0],
        extractorId: metaValues[1],
        timestamp: metaValues[2]
      };
    }
  }

  return {
    eid,
    aid,
    sp,
    did,
    lp,
    flags,
    meta
  };
}

/**
 * Encode HERT to text form
 */
export function encodeHERT(hert: HERT): string {
  const binary = encodeHERTBinary(hert);
  const base62 = encodeBase62(binary);
  const version = hert.flags.encrypted ? 'v1e' : 'v1';

  return `HERTv1:${base62}`;
}

/**
 * Decode HERT from text form
 */
export function decodeHERT(encoded: string): HERT {
  // Parse format: HERTv1:<base62> or HERTv1e:<base62>
  const match = encoded.match(/^HERT(v1e?):(.+)$/);

  if (!match) {
    throw new Error('Invalid HERT format');
  }

  const [, version, base62] = match;
  const binary = decodeBase62(base62);

  return decodeHERTBinary(binary);
}

/**
 * Encode HERT to human-readable form (for debugging)
 *
 * Format: EID.S{sp} @ d:{did} p:{section}.{chapter}.{para} t:{tokenStart}+{len}
 * Example: 4102.S2.1 @ d:Zf7qJ9 p:1.3.14 t:823+4
 */
export function encodeHERTReadable(hert: HERT): string {
  const parts: string[] = [];

  // EID + SP
  let eidPart = hert.eid.toString();
  if (hert.sp && hert.sp.length > 0) {
    eidPart += '.S' + hert.sp.join('.');
  }
  parts.push(eidPart);

  // DID (first 6 chars of base62)
  const didBase62 = encodeBase62(encode64(hert.did)).substring(0, 6);
  parts.push(`d:${didBase62}`);

  // LP
  const lpParts: string[] = [];
  if (hert.lp.section !== undefined) lpParts.push(hert.lp.section.toString());
  if (hert.lp.chapter !== undefined) lpParts.push(hert.lp.chapter.toString());
  lpParts.push(hert.lp.paragraph.toString());
  parts.push(`p:${lpParts.join('.')}`);

  // Token position
  parts.push(`t:${hert.lp.tokenStart}+${hert.lp.tokenLength}`);

  return parts.join(' @ ');
}

/**
 * Create a default HERT flags object
 */
export function createDefaultFlags(): HERTFlags {
  return {
    hasSection: false,
    hasChapter: false,
    aliasPresent: false,
    chainNext: false,
    confidenceBin: 7,  // Max confidence by default
    keyRotation: 0,
    encrypted: false
  };
}
