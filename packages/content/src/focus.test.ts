import {
  type Answers,
  applyFocus,
  categoryOfMuscles,
  generateProgram,
  MUSCLE_CATEGORIES,
  MUSCLE_TO_GROUP,
} from '@mvp/domain';
import { LEVELS } from '@mvp/schemas';
import { describe, expect, it } from 'vitest';

import { catalogSeed, programTemplates } from './index';

const FREQUENCIES = [2, '2-3', 3, 4, 5, 6] as const;
const DURATIONS = [30, 45, 60, 75, 90] as const;

const exercises = catalogSeed.exercises;
const slugById = new Map(exercises.map((exercise) => [exercise.id, exercise.slug]));
const fullGym = new Set(catalogSeed.equipment.map((item) => item.code));

const baseAnswers: Answers = {
  goal: 'mass',
  level: 'intermediate',
  frequency: 3,
  duration_min: 60,
  split: 'auto',
};

describe('the ordinary questionnaire', () => {
  it('keeps making the same programs', () => {
    const programs: Record<string, string[]> = {};
    for (const level of LEVELS) {
      for (const frequency of FREQUENCIES) {
        for (const duration_min of DURATIONS) {
          const draft = generateProgram(
            { ...baseAnswers, level, frequency, duration_min },
            programTemplates,
            exercises,
            fullGym,
          );
          programs[`${level} ${frequency} ${duration_min}`] = draft.days.map(
            (day) =>
              `${day.key}: ${day.items
                .map((item) => `${slugById.get(item.exercise_id)} ${item.sets}`)
                .join(', ')}`,
          );
        }
      }
    }
    expect(programs).toMatchSnapshot();
  });
});

describe('muscle categories', () => {
  it('hold every muscle of the catalog exactly once', () => {
    const codes = catalogSeed.muscles.map((muscle) => muscle.code).sort();
    expect(Object.values(MUSCLE_CATEGORIES).flat().sort()).toEqual(codes);
  });

  it('name the category of a set of muscles', () => {
    expect(categoryOfMuscles(['biceps', 'triceps'])).toBe('arms');
    expect(categoryOfMuscles(['biceps', 'chest'])).toBeNull();
    expect(categoryOfMuscles([])).toBeNull();
  });
});

describe('programs with a focus', () => {
  const PAIRS = [
    ['biceps'],
    ['biceps', 'traps'],
    ['side_delts', 'calves'],
    ['chest', 'lats'],
    ['quads', 'glutes'],
    ...catalogSeed.muscles.map((muscle) => [muscle.code]),
  ];
  const ZONES = [
    ['chest'],
    ['lats', 'upper_back'],
    ['front_delts', 'side_delts', 'rear_delts'],
    ['quads', 'hamstrings', 'glutes'],
  ];
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const trains = (id: string, muscles: readonly string[]) =>
    byId.get(id)?.primary_muscles.some((code) => muscles.includes(code)) ?? false;
  const groupsOf = (muscles: readonly string[]) =>
    new Set<string | undefined>(muscles.map((muscle) => MUSCLE_TO_GROUP[muscle]));

  it('keep every promise of the design for a fully equipped gym', () => {
    for (const level of LEVELS) {
      for (const frequency of FREQUENCIES) {
        for (const duration_min of [45, 60, 75, 90] as const) {
          for (const muscles of PAIRS) {
            const answers = { ...baseAnswers, level, frequency, duration_min };
            const label = `${level} ${frequency} ${duration_min} ${muscles.join('+')}`;
            const draft = generateProgram(answers, programTemplates, exercises, fullGym);
            const before = draft.days
              .flatMap((day) => day.items)
              .filter((item) => trains(item.exercise_id, muscles));
            const context = { exercises, equipment: fullGym, level, known: new Set<string>() };
            const result = applyFocus(draft, muscles, answers, context);

            for (const day of result.days) {
              const ids = day.items.map((item) => item.exercise_id);
              expect(new Set(ids).size, `${label}: repeated in ${day.key}`).toBe(ids.length);

              // The block of the focus comes first in the day.
              const flags = day.items.map((item) => trains(item.exercise_id, muscles));
              if (flags.includes(false)) {
                expect(flags.lastIndexOf(true), `${label}: order in ${day.key}`).toBeLessThan(
                  flags.indexOf(false),
                );
              }

              const others = day.items.filter((item) => !trains(item.exercise_id, muscles));
              const original = draft.days.find((entry) => entry.key === day.key);
              const own = (original?.items ?? []).filter((item) =>
                trains(item.exercise_id, muscles),
              );
              const limit = Math.max(
                draft.set_cap,
                own.reduce((sum, item) => sum + item.sets, 0) +
                  others.reduce((sum, item) => sum + item.sets, 0),
              );
              const sets = day.items.reduce((sum, item) => sum + item.sets, 0);
              expect(sets, `${label}: limit of ${day.key}`).toBeLessThanOrEqual(limit);
            }

            const all = result.days.flatMap((day) => day.items);
            for (const zone of ZONES) {
              expect(
                all.some((item) => trains(item.exercise_id, zone)),
                `${label}: lost ${zone.join()}`,
              ).toBe(true);
            }
            expect(result.dropped, label).toEqual([]);

            for (const muscle of muscles) {
              if (result.short.includes(muscle)) continue;
              const was = before
                .filter((item) => trains(item.exercise_id, [muscle]))
                .reduce((sum, item) => sum + item.sets, 0);
              const now = result.focus_weekly_sets[muscle] ?? 0;
              expect(now, `${label}: ${muscle} gained`).toBeGreaterThan(was);

              const focusGroups = groupsOf(muscles);
              for (const [group, sets] of Object.entries(result.weekly_sets)) {
                if (focusGroups.has(group)) continue;
                expect(sets, `${label}: ${group} ahead of ${muscle}`).toBeLessThanOrEqual(now);
              }
            }
          }
        }
      }
    }
  });

  it('warn about a gym with too little for a muscle', () => {
    const answers = { ...baseAnswers, frequency: 3 as const };
    const noEquipment = new Set<string>();
    const draft = generateProgram(answers, programTemplates, exercises, noEquipment);
    const context = {
      exercises,
      equipment: noEquipment,
      level: 'intermediate' as const,
      known: new Set<string>(),
    };
    const result = applyFocus(draft, ['traps'], answers, context);
    expect(result.dropped).toEqual(['traps']);
  });
});
