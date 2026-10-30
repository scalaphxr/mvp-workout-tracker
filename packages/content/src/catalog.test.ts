import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  type Answers,
  DEFAULT_STEPS_KG,
  findCatalogProblems,
  generateProgram,
  isAvailable,
  planSubstitutions,
  POPULAR_EXERCISES,
  rankAlternatives,
  stepGroup,
} from '@mvp/domain';
import { CatalogSeedSchema, EXERCISE_KINDS } from '@mvp/schemas';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { catalogSeed, programTemplates } from './index';

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

  it('ranks every exercise by popularity, once', () => {
    expect([...POPULAR_EXERCISES].sort()).toEqual(
      catalogSeed.exercises.map((exercise) => exercise.slug).sort(),
    );
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

/** Programs made from the questionnaire, on the real catalog and the real templates. */
describe('generated programs', () => {
  const { exercises } = catalogSeed;
  const everything = catalogSeed.equipment.map((item) => item.code);
  const gymWithout = (...codes: string[]) => new Set(everything.filter((c) => !codes.includes(c)));
  const slugOf = (id: string) => exercises.find((exercise) => exercise.id === id)?.slug;
  const answers: Answers = {
    goal: 'mass',
    level: 'intermediate',
    frequency: 4,
    duration_min: 60,
    split: 'auto',
  };
  const slugs = (gym: ReadonlySet<string>, overrides: Partial<Answers> = {}) =>
    generateProgram({ ...answers, ...overrides }, programTemplates, exercises, gym).days.map(
      (day) => day.items.map((item) => slugOf(item.exercise_id)),
    );

  it('know every exercise their templates name, and every day a split needs', () => {
    const known = new Set(exercises.map((exercise) => exercise.slug));
    for (const [key, slot] of Object.entries(programTemplates.slots)) {
      for (const slug of slot.candidates) expect(known.has(slug), `${key}: ${slug}`).toBe(true);
    }
    for (const [day, slotKeys] of Object.entries(programTemplates.days)) {
      for (const key of slotKeys) expect(programTemplates.slots[key], `${day}: ${key}`).toBeDefined();
    }
    for (const frequency of [2, 3, 4, 5, 6, '2-3'] as const) {
      for (const level of ['beginner', 'advanced'] as const) {
        const draft = generateProgram(
          { ...answers, frequency, level },
          programTemplates,
          exercises,
          new Set(everything),
        );
        expect(draft.days.length, `${frequency} ${level}`).toBeGreaterThanOrEqual(2);
        for (const day of draft.days) {
          expect(day.items.length, `${frequency} ${level} ${day.key}`).toBeGreaterThanOrEqual(2);
          const sets = day.items.reduce((sum, item) => sum + item.sets, 0);
          expect(sets, `${frequency} ${level} ${day.key}`).toBeLessThanOrEqual(draft.set_cap);
        }
      }
    }
  });

  it('give the big muscle groups the weekly volume of the level when a workout is an hour', () => {
    const draft = generateProgram(
      { ...answers, level: 'beginner', frequency: 3 },
      programTemplates,
      exercises,
      new Set(everything),
    );
    // An hour is 16 sets: a day keeps five exercises, and the sets of the sixth go to the rest.
    for (const day of draft.days) expect(day.items, day.key).toHaveLength(5);
    for (const group of ['chest', 'back', 'shoulders', 'quads'] as const) {
      expect(draft.weekly_sets[group], group).toBeGreaterThanOrEqual(8);
      expect(draft.weekly_sets[group], group).toBeLessThanOrEqual(10);
    }
  });

  it('have the T-bar row in a full gym and a row of the same movement in a gym without a T-bar', () => {
    expect(slugs(new Set(everything)).flat()).toContain('t-bar-row');

    const withoutTBar = slugs(gymWithout('t_bar')).flat();
    expect(withoutTBar).not.toContain('t-bar-row');
    expect(withoutTBar).toContain('barbell-bent-over-row');
  });

  it('have calf raises in a variant the gym has when there is no calf machine', () => {
    const legs = (gym: ReadonlySet<string>) => slugs(gym, { duration_min: 90 }).flat();

    expect(legs(new Set(everything))).toContain('standing-calf-raise-machine');
    const withoutMachine = legs(gymWithout('calf_raise_machine'));
    expect(withoutMachine).not.toContain('standing-calf-raise-machine');
    expect(withoutMachine).toContain('smith-machine-calf-raise');
    expect(legs(gymWithout('calf_raise_machine', 'smith_machine'))).toContain(
      'single-leg-dumbbell-calf-raise',
    );
  });

  it('use only exercises the gym has equipment for', () => {
    const home = new Set(['dumbbells', 'adjustable_bench', 'pull_up_bar', 'mat']);
    for (const slug of slugs(home, { frequency: 3 }).flat()) {
      const exercise = exercises.find((candidate) => candidate.slug === slug);
      expect(isAvailable(exercise!, home), slug).toBe(true);
    }
  });

  it('still make a program for training with no equipment at all', () => {
    const days = slugs(new Set(['mat']), { frequency: 2, level: 'beginner' });
    expect(days).toHaveLength(2);
    for (const day of days) expect(day.length).toBeGreaterThanOrEqual(2);
    expect(days.flat()).toContain('push-up');
    expect(days.flat()).toContain('bodyweight-squat');
  });
});
