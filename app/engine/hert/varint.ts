/**
 * Varint Encoding/Decoding
 *
 * Variable-length integer encoding for compact binary serialization.
 * Uses protobuf-style varint encoding (7 bits per byte, MSB = continuation).
 */

/**
 * Encode unsigned integer as varint
 * Returns byte array
 */
export function encodeVarint(value: number): Uint8Array {
  if (value < 0) {
    throw new Error('Varint encoding requires non-negative integers');
  }

  const bytes: number[] = [];

  while (value >= 0x80) {
    bytes.push((value & 0x7F) | 0x80); // 7 bits + continuation bit
    value >>>= 7;
  }

  bytes.push(value & 0x7F); // Last byte (no continuation)

  return new Uint8Array(bytes);
}

/**
 * Decode varint from byte array
 * Returns { value, bytesRead }
 */
export function decodeVarint(
  bytes: Uint8Array,
  offset: number = 0
): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;

  while (offset + bytesRead < bytes.length) {
    const byte = bytes[offset + bytesRead];
    bytesRead++;

    value |= (byte & 0x7F) << shift;

    if ((byte & 0x80) === 0) {
      // No continuation bit - done
      return { value, bytesRead };
    }

    shift += 7;

    if (shift > 35) {
      throw new Error('Varint too long (max 5 bytes for 32-bit)');
    }
  }

  throw new Error('Incomplete varint');
}

/**
 * Encode array of varints
 */
export function encodeVarintArray(values: number[]): Uint8Array {
  const chunks: Uint8Array[] = values.map(encodeVarint);
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
 * Decode array of varints
 * Returns { values, bytesRead }
 */
export function decodeVarintArray(
  bytes: Uint8Array,
  count: number,
  offset: number = 0
): { values: number[]; bytesRead: number } {
  const values: number[] = [];
  let totalBytesRead = 0;

  for (let i = 0; i < count; i++) {
    const { value, bytesRead } = decodeVarint(bytes, offset + totalBytesRead);
    values.push(value);
    totalBytesRead += bytesRead;
  }

  return { values, bytesRead: totalBytesRead };
}

/**
 * Encode 64-bit unsigned integer (for DID)
 * Uses 8 bytes (fixed length for simplicity)
 */
export function encode64(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  let remaining = value;

  for (let i = 0; i < 8; i++) {
    bytes[i] = Number(remaining & 0xFFn);
    remaining >>= 8n;
  }

  return bytes;
}

/**
 * Decode 64-bit unsigned integer
 */
export function decode64(bytes: Uint8Array, offset: number = 0): bigint {
  let value = 0n;

  for (let i = 0; i < 8; i++) {
    value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
  }

  return value;
}
