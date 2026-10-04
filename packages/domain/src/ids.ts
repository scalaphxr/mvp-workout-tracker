const hex = (bytes: number[]) => bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * A UUID v7: 48 bits of time followed by random bits, so ids created on the phone sort by
 * creation time. `random` – at least 10 bytes from a cryptographic generator.
 */
export function uuidv7(timestampMs: number, random: Uint8Array): string {
  if (random.length < 10) throw new Error('uuidv7 needs 10 random bytes');
  const byte = (index: number) => random[index] as number;

  const time: number[] = [];
  for (let shift = 40; shift >= 0; shift -= 8) {
    time.push(Math.floor(timestampMs / 2 ** shift) % 256);
  }
  const versioned = [0x70 | (byte(0) & 0x0f), byte(1)];
  const variant = [0x80 | (byte(2) & 0x3f), byte(3)];
  const rest = [4, 5, 6, 7, 8, 9].map(byte);

  return [
    hex(time.slice(0, 4)),
    hex(time.slice(4)),
    hex(versioned),
    hex(variant),
    hex(rest),
  ].join('-');
}
