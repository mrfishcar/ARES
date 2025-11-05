/**
 * Base62 Encoding (URL-safe)
 *
 * Uses: 0-9, A-Z, a-z (62 characters)
 * More compact than base64, no special characters needed
 */

const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Encode bytes to base62 string
 */
export function encodeBase62(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';

  // Convert bytes to big integer
  let num = 0n;
  for (let i = 0; i < bytes.length; i++) {
    num = (num << 8n) | BigInt(bytes[i]);
  }

  // Convert to base62
  if (num === 0n) return '0';

  const result: string[] = [];
  while (num > 0n) {
    const remainder = Number(num % 62n);
    result.push(BASE62_ALPHABET[remainder]);
    num /= 62n;
  }

  return result.reverse().join('');
}

/**
 * Decode base62 string to bytes
 */
export function decodeBase62(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);

  // Convert base62 to big integer
  let num = 0n;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const value = BASE62_ALPHABET.indexOf(char);

    if (value === -1) {
      throw new Error(`Invalid base62 character: ${char}`);
    }

    num = num * 62n + BigInt(value);
  }

  // Convert big integer to bytes
  if (num === 0n) return new Uint8Array([0]);

  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num & 0xFFn));
    num >>= 8n;
  }

  return new Uint8Array(bytes);
}
