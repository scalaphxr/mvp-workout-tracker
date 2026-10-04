import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_STEPS_KG,
  findCatalogProblems,
  planSubstitutions,
  rankAlternatives,
  stepGroup,
} from '@mvp/domain';
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

  it('gives loaded equipment the default step of its kind: dumbbells, plates or a stack', () => {
    for (const item of catalogSeed.equipment) {
      const group = stepGroup(item);
      if (group) expect(item.default_increment_kg, item.code).toBe(DEFAULT_STEPS_KG[group]);
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

/** The acceptance criteria of the spec about replacements, checked on the real catalog. */
describe('replacements in the catalog', () => {
  const { exercises } = catalogSeed;
  const everything = catalogSeed.equipment.map((item) => item.code);
  const gymWithout = (...codes: string[]) => new Set(everything.filter((c) => !codes.includes(c)));
  const bySlug = (slug: string) => {
    const exercise = exercises.find((candidate) => candidate.slug === slug);
    if (!exercise) throw new Error(`No exercise ${slug}`);
    return exercise;
  };
  /** What an exercise is replaced with in a gym, as a slug. */
  const replacement = (slug: string, gym: ReadonlySet<string>) => {
    const [plan] = planSubstitutions([{ id: 'item', exercise_id: bySlug(slug).id }], exercises, gym);
    return exercises.find((candidate) => candidate.id === plan?.to_exercise_id)?.slug;
  };

  it('replaces the T-bar row with a row of the same movement in a gym without a T-bar', () => {
    const slug = replacement('t-bar-row', gymWithout('t_bar'));
    expect(slug).toBe('barbell-bent-over-row');
    expect(bySlug(slug!).movement_pattern).toBe(bySlug('t-bar-row').movement_pattern);
  });

  it('walks down the list of rows as the gym loses equipment', () => {
    expect(replacement('t-bar-row', gymWithout('t_bar', 'barbell'))).toBe('one-arm-dumbbell-row');
    expect(replacement('t-bar-row', gymWithout('t_bar', 'barbell', 'dumbbells'))).toBe(
      'lever-machine-row',
    );
    expect(
      replacement('t-bar-row', gymWithout('t_bar', 'barbell', 'dumbbells', 'lever_row_machine')),
    ).toBe('seated-cable-row');
  });

  it('replaces the calf machine with calf raises in a variant the gym has', () => {
    const calves = 'standing-calf-raise-machine';
    expect(replacement(calves, gymWithout('calf_raise_machine'))).toBe('smith-machine-calf-raise');
    expect(replacement(calves, gymWithout('calf_raise_machine', 'smith_machine'))).toBe(
      'single-leg-dumbbell-calf-raise',
    );
    expect(
      replacement(calves, gymWithout('calf_raise_machine', 'smith_machine', 'dumbbells')),
    ).toBe('leg-press-calf-raise');
  });

  it('offers at least 2 alternatives for any exercise whose equipment is taken', () => {
    const full = new Set(everything);
    for (const exercise of exercises) {
      if (exercise.equipment.length === 0) continue;
      const alternatives = rankAlternatives(exercise, exercises, {
        equipment: full,
        busy: new Set(exercise.equipment),
      });
      expect(alternatives.length, exercise.slug).toBeGreaterThanOrEqual(2);
    }
  });
});
