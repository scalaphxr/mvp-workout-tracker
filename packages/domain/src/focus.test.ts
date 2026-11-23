import type { Exercise } from '@mvp/schemas';
import { describe, expect, it } from 'vitest';

import {
  applyFocus,
  countMuscleFilters,
  type FocusContext,
  focusAnswers,
  pickVaried,
  planFocusWorkout,
  rankForMuscle,
  startingAnswers,
} from './focus';
import type { Answers, DraftProgram } from './generation';

let nextId = 0;

function exercise(slug: string, overrides: Partial<Exercise> = {}): Exercise {
  nextId += 1;
  return {
    id: `id-${nextId}`,
    slug,
    kind: 'strength',
    tracking: 'weight_reps',
    movement_pattern: 'horizontal_pull',
    mechanics: 'isolation',
    level: 'beginner',
    is_unilateral: false,
    primary_muscles: ['biceps'],
    secondary_muscles: [],
    equipment: [],
    translations: {} as Exercise['translations'],
    media: [],
    alternatives: [],
    ...overrides,
  };
}

const context = (exercises: Exercise[], overrides: Partial<FocusContext> = {}): FocusContext => ({
  exercises,
  equipment: null,
  level: 'intermediate',
  known: new Set(),
  ...overrides,
});

const slugs = (exercises: readonly Exercise[]) => exercises.map((item) => item.slug);

describe('rankForMuscle', () => {
  it('takes exercises where the muscle is primary', () => {
    const curl = exercise('curl');
    const row = exercise('row', { primary_muscles: ['lats'], secondary_muscles: ['biceps'] });
    expect(slugs(rankForMuscle('biceps', context([curl, row])))).toEqual(['curl']);
  });

  it('leaves out cardio, stretches and exercises tracked by distance', () => {
    const list = [
      exercise('curl'),
      exercise('stretch', { kind: 'stretch', tracking: 'time' }),
      exercise('run', { kind: 'cardio', tracking: 'distance_time' }),
    ];
    expect(slugs(rankForMuscle('biceps', context(list)))).toEqual(['curl']);
  });

  it('allows timed exercises only for abs and obliques', () => {
    const plank = exercise('plank', {
      kind: 'timed',
      tracking: 'time',
      primary_muscles: ['abs', 'calves'],
    });
    expect(slugs(rankForMuscle('abs', context([plank])))).toEqual(['plank']);
    expect(rankForMuscle('calves', context([plank]))).toEqual([]);
  });

  it('checks the equipment only when a gym is known', () => {
    const barbell = exercise('barbell-curl', { equipment: ['barbell'] });
    expect(rankForMuscle('biceps', context([barbell], { equipment: new Set() }))).toEqual([]);
    expect(slugs(rankForMuscle('biceps', context([barbell])))).toEqual(['barbell-curl']);
  });

  it('gives a beginner no advanced exercises', () => {
    const hard = exercise('hard', { level: 'advanced' });
    expect(rankForMuscle('biceps', context([hard], { level: 'beginner' }))).toEqual([]);
    expect(slugs(rankForMuscle('biceps', context([hard])))).toEqual(['hard']);
  });

  it('puts compound exercises first, then known ones, then popular ones', () => {
    const list = [
      // `dumbbell-shrug` and `barbell-shrug` are in the popularity list, in this order.
      exercise('zzz-unknown'),
      exercise('barbell-shrug'),
      exercise('dumbbell-shrug'),
      exercise('aaa-known'),
      exercise('zzz-compound', { mechanics: 'compound' }),
    ];
    const known = new Set([list[3]?.id ?? '']);
    expect(slugs(rankForMuscle('biceps', context(list, { known })))).toEqual([
      'zzz-compound',
      'aaa-known',
      'dumbbell-shrug',
      'barbell-shrug',
      'zzz-unknown',
    ]);
  });
});

describe('pickVaried', () => {
  it('takes different movement patterns before it repeats one', () => {
    const list = [
      exercise('a', { movement_pattern: 'horizontal_push' }),
      exercise('b', { movement_pattern: 'horizontal_push' }),
      exercise('c', { movement_pattern: 'vertical_push' }),
    ];
    expect(slugs(pickVaried(list, 2, new Set()))).toEqual(['a', 'c']);
    expect(slugs(pickVaried(list, 3, new Set()))).toEqual(['a', 'c', 'b']);
  });

  it('skips what is taken', () => {
    const list = [exercise('a'), exercise('b')];
    expect(slugs(pickVaried(list, 2, new Set([list[0]?.id ?? ''])))).toEqual(['b']);
  });
});

describe('planFocusWorkout', () => {
  const many = (muscle: string, count: number) =>
    Array.from({ length: count }, (_, index) =>
      exercise(`${muscle}-${index}`, { primary_muscles: [muscle] }),
    );
  const setsOf = (plan: ReturnType<typeof planFocusWorkout>, muscle: string) =>
    plan.items.filter((item) => item.muscle === muscle).reduce((sum, item) => sum + item.sets, 0);

  it('stops at 12 sets on a muscle, however long the workout is', () => {
    const plan = planFocusWorkout(['biceps'], 60, context(many('biceps', 8)));
    expect(setsOf(plan, 'biceps')).toBe(12);
    expect(plan.items).toHaveLength(4);
    expect(plan.short).toBe(false);
  });

  it('shares the limit between muscles', () => {
    const list = [...many('biceps', 6), ...many('triceps', 6)];
    const plan = planFocusWorkout(['biceps', 'triceps'], 60, context(list));
    expect([setsOf(plan, 'biceps'), setsOf(plan, 'triceps')]).toEqual([8, 8]);
  });

  it('gives the rest of the limit to the muscles picked first', () => {
    const list = [...many('biceps', 6), ...many('triceps', 6), ...many('chest', 6)];
    const plan = planFocusWorkout(['biceps', 'triceps', 'chest'], 90, context(list));
    expect([setsOf(plan, 'biceps'), setsOf(plan, 'triceps'), setsOf(plan, 'chest')]).toEqual([
      9, 9, 8,
    ]);
  });

  it('leaves out the muscles picked last when 2 sets each do not fit', () => {
    const muscles = ['biceps', 'triceps', 'chest', 'abs'];
    const plan = planFocusWorkout(muscles, 30, context(muscles.flatMap((code) => many(code, 3))));
    expect(plan.dropped).toEqual(['abs']);
    expect(plan.items.reduce((sum, item) => sum + item.sets, 0)).toBe(6);
  });

  it('says so when there are too few exercises', () => {
    const plan = planFocusWorkout(['biceps'], 60, context(many('biceps', 2)));
    expect(setsOf(plan, 'biceps')).toBe(8);
    expect(plan.short).toBe(true);
  });

  it('takes an exercise with two picked muscles once', () => {
    const both = exercise('both', { primary_muscles: ['biceps', 'forearms'] });
    const plan = planFocusWorkout(['biceps', 'forearms'], 60, context([both, ...many('biceps', 2)]));
    expect(plan.items.filter((item) => item.exercise_id === both.id)).toHaveLength(1);
    expect(plan.dropped).toEqual(['forearms']);
  });

  it('puts compound exercises first, in the order of the muscles', () => {
    const list = [
      exercise('curl'),
      exercise('dip', { primary_muscles: ['triceps'], mechanics: 'compound' }),
    ];
    const plan = planFocusWorkout(['biceps', 'triceps'], 30, context(list));
    expect(plan.items.map((item) => item.muscle)).toEqual(['triceps', 'biceps']);
  });

  it('makes an empty plan when the gym has nothing for the muscles', () => {
    const plan = planFocusWorkout(['biceps'], 60, context([]));
    expect(plan).toMatchObject({ items: [], dropped: ['biceps'], short: false });
  });
});

describe('countMuscleFilters', () => {
  it('counts a whole category as one filter', () => {
    expect(countMuscleFilters(['biceps', 'triceps', 'forearms'])).toBe(1);
    expect(countMuscleFilters(['chest'])).toBe(1);
  });

  it('counts anything else muscle by muscle', () => {
    expect(countMuscleFilters([])).toBe(0);
    expect(countMuscleFilters(['biceps', 'triceps'])).toBe(2);
    expect(countMuscleFilters(['biceps', 'chest'])).toBe(2);
  });
});

describe('startingAnswers', () => {
  const saved: Answers = {
    goal: 'cut',
    level: 'advanced',
    frequency: 5,
    duration_min: 75,
    split: 'auto',
  };

  it('prefers the last answers given', () => {
    const program = { goal: 'mass' as const, level: 'beginner' as const, days_per_week: 2 };
    expect(startingAnswers(saved, program)).toBe(saved);
  });

  it('takes what it can from the active program', () => {
    const program = { goal: 'strength' as const, level: 'advanced' as const, days_per_week: 4 };
    expect(startingAnswers(null, program)).toEqual({
      goal: 'strength',
      level: 'advanced',
      frequency: 4,
      duration_min: 60,
      split: 'auto',
    });
    expect(startingAnswers(null, { goal: null, level: null, days_per_week: 7 })).toMatchObject({
      goal: 'mass',
      level: 'beginner',
      frequency: 3,
    });
  });

  it('starts as the questionnaire always did without either', () => {
    expect(startingAnswers(null, null)).toEqual({
      goal: 'mass',
      level: 'beginner',
      frequency: 3,
      duration_min: 60,
      split: 'auto',
    });
  });
});

describe('focusAnswers', () => {
  const answers: Answers = {
    goal: 'mass',
    level: 'advanced',
    frequency: 4,
    duration_min: 30,
    split: 'auto',
  };

  it('moves a 30-minute workout to 45 minutes and keeps the rest', () => {
    expect(focusAnswers(answers)).toEqual({ ...answers, duration_min: 45 });
    expect(focusAnswers({ ...answers, duration_min: 75 }).duration_min).toBe(75);
  });
});

describe('applyFocus', () => {
  const answers: Answers = {
    goal: 'mass',
    level: 'intermediate',
    frequency: 2,
    duration_min: 60,
    split: 'auto',
  };
  const squat = exercise('squat', { primary_muscles: ['quads'], mechanics: 'compound' });
  const bench = exercise('bench', { primary_muscles: ['chest'], mechanics: 'compound' });
  const row = exercise('row', { primary_muscles: ['lats'], mechanics: 'compound' });
  const press = exercise('press', { primary_muscles: ['side_delts'], mechanics: 'compound' });
  const base = [squat, bench, row, press];

  const item = (subject: Exercise, group: 'quads' | 'chest' | 'back' | 'shoulders') => ({
    exercise_id: subject.id,
    group,
    sets: 3,
    rep_min: 8,
    rep_max: 12,
    rest_sec: 90,
    target_rir: 2,
  });
  const draft = (): DraftProgram => ({
    split: 'full_body_ab',
    days_per_week: 2,
    set_cap: 16,
    days: [
      { key: 'full_body_a', items: [item(squat, 'quads'), item(bench, 'chest')] },
      { key: 'full_body_b', items: [item(row, 'back'), item(press, 'shoulders')] },
    ],
    weekly_sets: { quads: 3, chest: 3, back: 3, shoulders: 3 },
  });

  it('adds the focus muscle first and counts its sets', () => {
    const curls = [exercise('curl-1'), exercise('curl-2'), exercise('curl-3'), exercise('curl-4')];
    const result = applyFocus(draft(), ['biceps'], answers, context([...base, ...curls]));

    for (const day of result.days) {
      expect(curls.map((curl) => curl.id)).toContain(day.items[0]?.exercise_id);
      expect(day.items[0]?.group).toBe('biceps');
    }
    expect(result.focus_weekly_sets.biceps).toBeGreaterThan(result.weekly_sets.chest ?? 0);
    expect(result.dropped).toEqual([]);
    expect(result.short).toEqual([]);
  });

  it('does not repeat an exercise with two picked muscles in a day', () => {
    const both = exercise('both', { primary_muscles: ['biceps', 'forearms'] });
    const result = applyFocus(draft(), ['biceps', 'forearms'], answers, context([...base, both]));
    for (const day of result.days) {
      const ids = day.items.map((entry) => entry.exercise_id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('reports a muscle that got nothing', () => {
    const result = applyFocus(draft(), ['biceps'], answers, context(base));
    expect(result.dropped).toEqual(['biceps']);
    expect(result.focus_weekly_sets.biceps).toBe(0);
  });

  it('reports a muscle with too few exercises to reach the goal', () => {
    const answers45 = { ...answers, level: 'advanced' as const };
    const shortDraft = { ...draft(), set_cap: 11 };
    const result = applyFocus(shortDraft, ['biceps'], answers45, context([...base, exercise('curl')]));
    expect(result.short).toEqual(['biceps']);
    expect(result.dropped).toEqual([]);
  });

  it('leaves the given draft alone', () => {
    const given = draft();
    const copy = JSON.parse(JSON.stringify(given)) as DraftProgram;
    applyFocus(given, ['biceps'], answers, context([...base, exercise('curl')]));
    expect(given).toEqual(copy);
  });
});
