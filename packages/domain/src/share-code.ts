/** Crockford Base32: no I, L, O, U, so a code survives being read aloud or retyped. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const SHARE_CODE_LENGTH = 8;

/**
 * A program code: 8 symbols, about 1.1 trillion variants (spec 6.8).
 * `random` – 5 bytes from a cryptographic generator: exactly 8 symbols of 5 bits.
 */
export function generateShareCode(random: Uint8Array): string {
  if (random.length < 5) throw new Error('A share code needs 5 random bytes');

  // 40 bits fit a double exactly, so plain arithmetic is enough.
  let bits = 0;
  for (let index = 0; index < 5; index++) bits = bits * 256 + (random[index] as number);

  let code = '';
  for (let index = 0; index < SHARE_CODE_LENGTH; index++) {
    code = ALPHABET.charAt(bits % 32) + code;
    bits = Math.floor(bits / 32);
  }
  return code;
}

/** `KX7P2QMD` → `KX7P-2QMD`, the way a code is shown. */
export function formatShareCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * What the user typed → the stored form, or `null` if it cannot be a code. Case, spaces and
 * dashes do not matter; O reads as 0, I and L as 1.
 */
export function normalizeShareCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');

  if (code.length !== SHARE_CODE_LENGTH) return null;
  for (const symbol of code) {
    if (!ALPHABET.includes(symbol)) return null;
  }
  return code;
}
