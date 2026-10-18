import type { Equipment, Exercise } from '@mvp/schemas';
import { describe, expect, it } from 'vitest';

import {
  isAvailable,
  planSubstitutions,
  rankAlternatives,
  roundToStep,
  substitutedWeight,
  weightStepKg,
} from './substitution';

let nextId = 0;
const id = () => `00000000-0000-7000-8000-${String(++nextId).padStart(12, '0')}`;

function exercise(slug: string, overrides: Partial<Exercise> = {}): Exercise {
  const text = {
    name: slug,
    aliases: [],
    description: slug,
    technique_steps: [slug],
    common_mistakes: [],
    warnings: [],
  };
  return {
    id: id(),
    slug,
    kind: 'strength',
    tracking: 'weight_reps',
    movement_pattern: 'horizontal_pull',
    mechanics: 'compound',
    level: 'beginner',
    is_unilateral: false,
    primary_muscles: ['upper_back'],
    secondary_muscles: [],
    equipment: [],
    translations: { ru: text, en: text },
    media: [],
    alternatives: [],
    ...overrides,
  };
}

const tBarRow = exercise('t-bar-row', {
  equipment: ['t_bar'],
  alternatives: [
    { slug: 'barbell-row', weight_ratio: 0.9, priority: 20 },
    { slug: 'cable-row', weight_ratio: null, priority: 5 },
  ],
});
const barbellRow = exercise('barbell-row', { equipment: ['barbell'] });
const cableRow = exercise('cable-row', { equipment: ['cable'] });
const dumbbellRow = exercise('dumbbell-row', { equipment: ['dumbbells', 'bench'] });
const pullUp = exercise('pull-up', {
  movement_pattern: 'vertical_pull',
  primary_muscles: ['lats', 'upper_back'],
  equipment: ['pull_up_bar'],
});
const rearDeltFly = exercise('rear-delt-fly', {
  movement_pattern: 'rear_delt',
  primary_muscles: ['rear_delts'],
  mechanics: 'isolation',
  equipment: ['dumbbells'],
});
const squat = exercise('squat', {
  movement_pattern: 'squat',
  primary_muscles: ['quads'],
  equipment: ['barbell'],
});
const all = [tBarRow, barbellRow, cableRow, dumbbellRow, pullUp, rearDeltFly, squat];

const everything = new Set(['t_bar', 'barbell', 'cable', 'dumbbells', 'bench', 'pull_up_bar']);
const without = (...codes: string[]) => new Set([...everything].filter((c) => !codes.includes(c)));
const ranked = (...args: Parameters<typeof rankAlternatives>) =>
  rankAlternatives(...args).map((alternative) => [alternative.exercise.slug, alternative.score]);

describe('isAvailable', () => {
  it('needs every piece of equipment of the exercise', () => {
    expect(isAvailable(dumbbellRow, new Set(['dumbbells', 'bench']))).toBe(true);
    expect(isAvailable(dumbbellRow, new Set(['dumbbells']))).toBe(false);
  });

  it('treats an exercise without equipment as available anywhere', () => {
    expect(isAvailable(exercise('push-up'), new Set())).toBe(true);
  });
});

describe('rankAlternatives', () => {
  it('scores the same movement +50, a shared primary muscle +30, the same mechanics +10 and a link by its priority', () => {
    expect(ranked(tBarRow, all, { equipment: everything })).toEqual([
      ['barbell-row', 50 + 30 + 10 + 20],
      ['cable-row', 50 + 30 + 10 + 5],
      ['dumbbell-row', 50 + 30 + 10],
      ['pull-up', 30 + 10],
    ]);
  });

  it('leaves out unrelated exercises and the exercise itself', () => {
    const slugs = ranked(tBarRow, all, { equipment: everything }).map(([slug]) => slug);
    expect(slugs).not.toContain('squat');
    expect(slugs).not.toContain('rear-delt-fly');
    expect(slugs).not.toContain('t-bar-row');
  });

  it('offers only what the gym has equipment for', () => {
    expect(ranked(tBarRow, all, { equipment: without('barbell', 'bench') })).toEqual([
      ['cable-row', 95],
      ['pull-up', 40],
    ]);
    expect(rankAlternatives(tBarRow, all, { equipment: new Set() })).toEqual([]);
  });

  it('adds +5 for an exercise the user already has history in', () => {
    const withHistory = new Set([dumbbellRow.id]);
    expect(ranked(tBarRow, all, { equipment: without('barbell'), withHistory })).toEqual([
      ['cable-row', 95],
      ['dumbbell-row', 95],
      ['pull-up', 40],
    ]);
  });

  it('skips exercises that need equipment taken right now', () => {
    const slugs = ranked(barbellRow, all, { equipment: everything, busy: new Set(['barbell']) });
    expect(slugs.map(([slug]) => slug)).toEqual(['cable-row', 'dumbbell-row', 't-bar-row', 'pull-up']);
  });

  it('does not replace a lift with cardio or a stretch that shares its muscle, unless linked', () => {
    const swim = exercise('swim', { kind: 'cardio', tracking: 'distance_time', movement_pattern: 'cardio', equipment: [] });
    const stretch = exercise('lat-stretch', { kind: 'stretch', tracking: 'time', movement_pattern: 'mobility', equipment: [] });
    const pullUp = all.find((candidate) => candidate.slug === 'pull-up')!;
    const slugs = ranked(pullUp, [...all, { ...swim, primary_muscles: pullUp.primary_muscles }, { ...stretch, primary_muscles: pullUp.primary_muscles }], {
      equipment: everything,
    }).map(([slug]) => slug);
    expect(slugs).not.toContain('swim');
    expect(slugs).not.toContain('lat-stretch');

    const linked = { ...pullUp, alternatives: [{ slug: 'swim', weight_ratio: null, priority: 1 }] };
    expect(ranked(linked, [linked, swim], { equipment: everything }).map(([slug]) => slug)).toEqual(['swim']);
  });

  it('keeps a hand-made link even when nothing else relates the exercises', () => {
    const plank = exercise('plank', {
      movement_pattern: 'core_stability',
      primary_muscles: ['abs'],
      mechanics: 'isolation',
      alternatives: [{ slug: 'squat', weight_ratio: null, priority: 7 }],
    });
    expect(ranked(plank, [plank, squat], { equipment: everything })).toEqual([['squat', 7]]);
  });

  it('carries the weight ratio of the link', () => {
    const [best, second] = rankAlternatives(tBarRow, all, { equipment: everything });
    expect(best?.weightRatio).toBe(0.9);
    expect(second?.weightRatio).toBeNull();
  });
});

describe('roundToStep', () => {
  it('rounds to the nearest multiple of the step', () => {
    expect(roundToStep(31.9, 2.5)).toBe(32.5);
    expect(roundToStep(31.2, 2.5)).toBe(30);
    expect(roundToStep(33, 2)).toBe(34);
    expect(roundToStep(7.3, 0.5)).toBe(7.5);
  });

  it('does not round a positive weight down to zero', () => {
    expect(roundToStep(1, 5)).toBe(5);
    expect(roundToStep(0, 5)).toBe(0);
  });

  it('leaves the weight alone when there is no step', () => {
    expect(roundToStep(31.9, 0)).toBe(31.9);
  });
});

describe('substitutedWeight', () => {
  const base = { historyWeightKg: null, currentWeightKg: 80, weightRatio: 0.4, stepKg: 2 };

  it('takes the plan of the new exercise when it has history', () => {
    expect(substitutedWeight({ ...base, historyWeightKg: 26 })).toEqual({
      kind: 'history',
      weightKg: 26,
    });
  });

  it('otherwise multiplies by the ratio of the link and rounds to the step', () => {
    expect(substitutedWeight(base)).toEqual({ kind: 'ratio', weightKg: 32 });
    expect(substitutedWeight({ ...base, currentWeightKg: 82.5 })).toEqual({
      kind: 'ratio',
      weightKg: 34,
    });
  });

  it('asks to find the weight when there is no ratio or no current weight', () => {
    expect(substitutedWeight({ ...base, weightRatio: null })).toEqual({ kind: 'find' });
    expect(substitutedWeight({ ...base, currentWeightKg: null })).toEqual({ kind: 'find' });
  });
});

describe('planSubstitutions', () => {
  const items = [
    { id: 'item-1', exercise_id: tBarRow.id },
    { id: 'item-2', exercise_id: squat.id },
    { id: 'item-3', exercise_id: pullUp.id },
  ];

  it('replaces only what the gym cannot do, with the best alternative', () => {
    expect(planSubstitutions(items, all, without('t_bar'))).toEqual([
      { item_id: 'item-1', from_exercise_id: tBarRow.id, to_exercise_id: barbellRow.id },
    ]);
  });

  it('changes nothing in a gym that has everything', () => {
    expect(planSubstitutions(items, all, everything)).toEqual([]);
  });

  it('marks an exercise with no possible replacement instead of dropping it', () => {
    expect(planSubstitutions(items, all, new Set(['pull_up_bar']))).toEqual([
      { item_id: 'item-1', from_exercise_id: tBarRow.id, to_exercise_id: pullUp.id },
      { item_id: 'item-2', from_exercise_id: squat.id, to_exercise_id: null },
    ]);
  });

  it('leaves an exercise the catalog does not know untouched', () => {
    expect(planSubstitutions([{ id: 'item-9', exercise_id: 'gone' }], all, new Set())).toEqual([]);
  });
});

describe('weightStepKg', () => {
  const equipment: Equipment[] = [
    {
      id: id(),
      code: 'bench',
      category: 'other',
      name: { ru: 'Скамья', en: 'Bench' },
      default_increment_kg: null,
      default_increment_lb: null,
    },
    {
      id: id(),
      code: 'dumbbells',
      category: 'dumbbells',
      name: { ru: 'Гантели', en: 'Dumbbells' },
      default_increment_kg: 2,
      default_increment_lb: 5,
    },
  ];
  const benchFirst = exercise('dumbbell-press', { equipment: ['bench', 'dumbbells'] });

  it('takes the catalog default of the equipment that carries the load', () => {
    expect(weightStepKg(benchFirst, equipment)).toBe(2);
  });

  it('prefers the step set in the gym profile', () => {
    expect(weightStepKg(benchFirst, equipment, new Map([['dumbbells', 2.5]]))).toBe(2.5);
    expect(weightStepKg(benchFirst, equipment, new Map([['dumbbells', null]]))).toBe(2);
  });

  it('steps by the pound for someone who trains in pounds, unless the gym says otherwise', () => {
    expect(weightStepKg(benchFirst, equipment, new Map(), 'lb')).toBeCloseTo(5 * 0.45359237);
    expect(weightStepKg(benchFirst, equipment, new Map([['dumbbells', 2.5]]), 'lb')).toBe(2.5);
  });

  it('has no step for a body-weight exercise', () => {
    expect(weightStepKg(exercise('push-up'), equipment)).toBeNull();
    expect(weightStepKg(exercise('bench-dip', { equipment: ['bench'] }), equipment)).toBeNull();
  });
});
