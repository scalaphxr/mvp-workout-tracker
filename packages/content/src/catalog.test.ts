import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { findCatalogProblems } from '@mvp/domain';
import { CatalogSeedSchema, EXERCISE_KINDS } from '@mvp/schemas';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { catalogSeed } from './index';

describe('catalog seed', () => {
  it('matches the seed schema', () => {
    const result = CatalogSeedSchema.safeParse(catalogSeed);
    expect(result.success ? '' : z.prettifyError(result.error)).toBe('');
  });

  it('has no broken references or duplicates', () => {
    expect(findCatalogProblems(catalogSeed)).toEqual([]);
  });

  it('includes every file of catalog/exercises', () => {
    const directory = fileURLToPath(new URL('../catalog/exercises', import.meta.url));
    const inFiles = readdirSync(directory)
      .filter((file) => file.endsWith('.json'))
      .flatMap((file) =>
        z
          .array(z.object({ slug: z.string() }))
          .parse(JSON.parse(readFileSync(`${directory}/${file}`, 'utf8'))),
      )
      .map((exercise) => exercise.slug)
      .sort();

    expect(catalogSeed.exercises.map((exercise) => exercise.slug).sort()).toEqual(inFiles);
  });

  it('covers every kind of exercise', () => {
    const kinds = new Set(catalogSeed.exercises.map((exercise) => exercise.kind));
    expect([...kinds].sort()).toEqual([...EXERCISE_KINDS].sort());
  });

  it('gives every loaded piece of equipment a weight step in both units', () => {
    for (const item of catalogSeed.equipment) {
      expect(item.default_increment_kg === null, item.code).toBe(item.default_increment_lb === null);
    }
  });

  it('needs loaded equipment for every exercise tracked by weight', () => {
    const loaded = new Set(
      catalogSeed.equipment.filter((item) => item.default_increment_kg !== null).map((i) => i.code),
    );
    for (const exercise of catalogSeed.exercises) {
      if (exercise.tracking !== 'weight_reps') continue;
      expect(
        exercise.equipment.some((code) => loaded.has(code)),
        exercise.slug,
      ).toBe(true);
    }
  });
});
