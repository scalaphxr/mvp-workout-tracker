/**
 * Gives an `id` to every catalog record that has none: `pnpm --filter @mvp/content assign-ids`.
 * Ids are written into the files once and never change, so programs keep pointing at the same
 * exercise even if its slug or name is edited later.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { v7 as uuidv7 } from 'uuid';

const catalog = fileURLToPath(new URL('../catalog', import.meta.url));
const exercises = `${catalog}/exercises`;
const files = [
  `${catalog}/equipment.json`,
  `${catalog}/muscles.json`,
  ...readdirSync(exercises).map((file) => `${exercises}/${file}`),
];

let assigned = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  // A record without an id opens with its key field: "code" on the same line, "slug" on the next
  // one (a "slug" on the same line is a reference to an alternative, not a record).
  const withIds = text.replace(/\{( *)"(code)":|\{(\s*\n\s*)"(slug)":/g, (...match: string[]) => {
    const space = match[1] ?? match[3];
    const key = match[2] ?? match[4];
    assigned++;
    return `{${space}"id": "${uuidv7()}",${space}"${key}":`;
  });
  if (withIds !== text) writeFileSync(file, withIds);
}

console.log(`Assigned ${assigned} new ids`);
