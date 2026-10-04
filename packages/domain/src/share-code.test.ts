import { describe, expect, it } from 'vitest';

import { uuidv7 } from './ids';
import { formatShareCode, generateShareCode, normalizeShareCode } from './share-code';

describe('generateShareCode', () => {
  it('turns 5 random bytes into 8 symbols of the Crockford alphabet', () => {
    expect(generateShareCode(new Uint8Array([0, 0, 0, 0, 0]))).toBe('00000000');
    expect(generateShareCode(new Uint8Array([255, 255, 255, 255, 255]))).toBe('ZZZZZZZZ');
    // 0b00001_00010_00011_00100_00101_00110_00111_01000 → symbols 1..8
    expect(generateShareCode(new Uint8Array([0x08, 0x86, 0x42, 0x98, 0xe8]))).toBe('12345678');
  });

  it('never produces the confusable letters I, L, O, U', () => {
    for (let seed = 0; seed < 256; seed++) {
      const code = generateShareCode(new Uint8Array([seed, seed * 7, seed * 13, seed * 31, seed * 3]));
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    }
  });

  it('refuses to work with too little randomness', () => {
    expect(() => generateShareCode(new Uint8Array(4))).toThrow();
  });
});

describe('formatShareCode', () => {
  it('shows a code as XXXX-XXXX', () => {
    expect(formatShareCode('KX7P2QMD')).toBe('KX7P-2QMD');
  });
});

describe('normalizeShareCode', () => {
  it('ignores case, dashes and spaces', () => {
    expect(normalizeShareCode('kx7p-2qmd')).toBe('KX7P2QMD');
    expect(normalizeShareCode('  KX7P 2QMD ')).toBe('KX7P2QMD');
  });

  it('reads O as 0 and I, L as 1', () => {
    expect(normalizeShareCode('OIL0-oil1')).toBe('01100111');
  });

  it('round-trips a generated and formatted code', () => {
    const code = generateShareCode(new Uint8Array([200, 17, 99, 250, 3]));
    expect(normalizeShareCode(formatShareCode(code).toLowerCase())).toBe(code);
  });

  it.each([
    ['empty', ''],
    ['too short', 'KX7P-2QM'],
    ['too long', 'KX7P-2QMDD'],
    ['the letter U, which the alphabet does not have', 'KX7P-2QMU'],
    ['punctuation', 'KX7P_2QMD'],
    ['Cyrillic look-alikes', 'КХ7Р-2QMD'],
  ])('rejects %s', (_name, input) => {
    expect(normalizeShareCode(input)).toBeNull();
  });
});

describe('uuidv7', () => {
  const random = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

  it('puts the time first and marks the version and variant', () => {
    expect(uuidv7(0x0192a7c4d5e6, random)).toBe('0192a7c4-d5e6-7fff-bfff-ffffffffffff');
    expect(uuidv7(0, new Uint8Array(10))).toBe('00000000-0000-7000-8000-000000000000');
  });

  it('sorts by creation time as a string', () => {
    const earlier = uuidv7(Date.UTC(2026, 9, 4), random);
    const later = uuidv7(Date.UTC(2026, 9, 5), new Uint8Array(10));
    expect(earlier < later).toBe(true);
  });

  it('refuses to work with too little randomness', () => {
    expect(() => uuidv7(0, new Uint8Array(9))).toThrow();
  });
});
