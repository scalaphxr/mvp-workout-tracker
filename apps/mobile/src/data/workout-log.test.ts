import { catalogSeed } from '@mvp/content';
import { sessions, set_logs } from '@mvp/db/sqlite';
import { createTestDb } from '@mvp/db/sqlite/testing';
import { uuidv7 } from '@mvp/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { listWeights } from './body';
import type { DataContext } from './context';
import { listWorkouts } from './history';
import { getProgramTree, listPrograms } from './programs';
import { type ExerciseFacts, getSession } from './sessions';
import { at, importWorkoutLog, type WorkoutLog } from './workout-log';

const exercises = catalogSeed.exercises;
const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
const slugOf = (id: string) => byId.get(id)?.slug;

// What the workout screen tells progression: the step of the item wins over the equipment's.
const facts: ExerciseFacts = (exerciseId) => {
  const exercise = byId.get(exerciseId);
  if (!exercise) return null;
  return { step_kg: null, progresses: exercise.tracking === 'weight_reps' || exercise.tracking === 'reps' };
};

let ctx: DataContext;

beforeEach(async () => {
  let ids = 0;
  ctx = {
    db: await createTestDb(),
    now: () => '2026-11-11T20:00:00.000Z',
    newId: () => uuidv7(Date.UTC(2026, 10, 11) + ++ids, new Uint8Array(10)),
  };
});

const tiny: WorkoutLog = {
  program: {
    title: 'Тест',
    description: '',
    goal: null,
    level: null,
    days_per_week: 2,
    days: [
      {
        title: 'День 1',
        items: [
          { slug: 'barbell-bench-press', sets: 3, rep_min: 8, rep_max: 10, rest_sec: 120, target_rir: 1, increment_kg: 2.5, notes: 'Пауза на груди' },
          { slug: 'dumbbell-hammer-curl', sets: 2, rep_min: 12, rep_max: 15, rest_sec: 0, target_rir: 1, increment_kg: null, notes: '' },
          { slug: 'cable-rope-pushdown', sets: 2, rep_min: 12, rep_max: 15, rest_sec: 60, target_rir: 1, increment_kg: null, notes: '', superset: true },
        ],
      },
      { title: 'День 2', items: [{ slug: 'leg-press', sets: 3, rep_min: 10, rep_max: 12, rest_sec: 150, target_rir: 1, increment_kg: 10, notes: '' }] },
    ],
  },
  workouts: [
    { date: '2026-10-01', notes: 'До программы', exercises: [{ slug: 'barbell-bench-press', sets: at(70, 10, 10, 9) }] },
    { date: '2026-10-03', day: 0, notes: '', exercises: [{ item: 0, sets: at(75, 10, 10, 10) }] },
    { date: '2026-10-05', day: 0, notes: 'Скамья занята', exercises: [{ item: 0, slug: 'incline-dumbbell-press', sets: at(30, 10, 9, 8) }] },
  ],
  weights: [{ date: '2026-10-02', weight_kg: 80.4 }],
};

describe('importing a training log', () => {
  it('saves the program with its steps, notes and supersets', () => {
    const { program } = importWorkoutLog(ctx, tiny, exercises, facts);
    const tree = getProgramTree(ctx, program.id)!;

    expect(tree.days.map((day) => day.title)).toEqual(['День 1', 'День 2']);
    const items = tree.days.map((day) =>
      tree.items
        .filter((item) => item.program_day_id === day.id)
        .map((item) => [slugOf(item.exercise_id), item.increment_kg, item.notes, item.superset_group]),
    );
    expect(items).toEqual([
      [
        ['barbell-bench-press', 2.5, 'Пауза на груди', null],
        ['dumbbell-hammer-curl', null, '', 1],
        ['cable-rope-pushdown', null, '', 1],
      ],
      [['leg-press', 10, '', null]],
    ]);
  });

  it('writes every workout on its own date, a workout before the program without one', () => {
    importWorkoutLog(ctx, tiny, exercises, facts);
    const workouts = listWorkouts(ctx).reverse();

    expect(workouts.map((w) => [w.session.started_at.slice(0, 10), w.dayTitle, w.session.notes])).toEqual([
      ['2026-10-01', '', 'До программы'],
      ['2026-10-03', 'День 1', ''],
      ['2026-10-05', 'День 1', 'Скамья занята'],
    ]);
    for (const { session } of workouts) {
      expect(session.status).toBe('finished');
      expect(session.finished_at! > session.started_at).toBe(true);
    }
    // Sets are done during their workout, not on the day of the import.
    const done = ctx.db.select().from(set_logs).all().map((set) => set.completed_at.slice(0, 10));
    expect(new Set(done)).toEqual(new Set(['2026-10-01', '2026-10-03', '2026-10-05']));
  });

  it('records a replacement for one workout and leaves the plan of the item alone', () => {
    importWorkoutLog(ctx, tiny, exercises, facts);
    const last = listWorkouts(ctx)[0]!;
    const [bench] = getSession(ctx, last.session.id)!.exercises;

    expect(slugOf(bench!.exercise.exercise_id)).toBe('incline-dumbbell-press');
    expect(slugOf(bench!.exercise.substituted_from_id!)).toBe('barbell-bench-press');
    // 75 × 10/10/10 on the 3rd reached the top once; the incline press changed nothing.
    expect(bench!.plan).toMatchObject({ next_weight_kg: 75, reason_code: 'top_once' });
  });

  it('measures progress against the workouts before the program', () => {
    importWorkoutLog(ctx, tiny, exercises, facts);
    const first = listWorkouts(ctx).find((w) => w.session.started_at.startsWith('2026-10-03'))!;
    expect(first.exercises[0]!.records.map((record) => record.kind)).toContain('weight');
  });

  it('saves the morning weights', () => {
    importWorkoutLog(ctx, tiny, exercises, facts);
    expect(listWeights(ctx)).toEqual([{ date: '2026-10-02', weight_kg: 80.4 }]);
  });

  it('skips workouts already in the app even if the exercises are listed in another order', () => {
    const twoExercises = {
      ...tiny,
      workouts: tiny.workouts.map((workout, index) => index === 0 ? {
        ...workout,
        exercises: [...workout.exercises, { slug: 'dumbbell-hammer-curl', sets: at(10, 12, 12) }],
      } : workout),
    };
    const first = importWorkoutLog(ctx, twoExercises, exercises, facts);
    const reordered = {
      ...twoExercises,
      workouts: twoExercises.workouts.map((workout) => ({
        ...workout,
        exercises: [...workout.exercises].reverse(),
      })),
    };
    expect(importWorkoutLog(ctx, reordered, exercises, facts)).toMatchObject({
      program: { id: first.program.id }, workouts: 0, skippedWorkouts: 3, sets: 0, weights: 0,
    });
    expect(listPrograms(ctx)).toHaveLength(1);
    expect(listWorkouts(ctx)).toHaveLength(3);
  });

  it('preserves distinct workouts on the same date', () => {
    importWorkoutLog(ctx, tiny, exercises, facts);
    const other = {
      ...tiny,
      workouts: [{ ...tiny.workouts[0]!, exercises: [{ slug: 'barbell-bench-press', sets: at(70, 10, 10, 10) }] }],
    };
    expect(importWorkoutLog(ctx, other, exercises, facts)).toMatchObject({ workouts: 1, skippedWorkouts: 0 });
    expect(listWorkouts(ctx)).toHaveLength(4);
  });

  it('writes nothing when an exercise is not in the catalog', () => {
    const broken = { ...tiny, workouts: [{ date: '2026-10-01', notes: '', exercises: [{ slug: 'no-such-exercise', sets: at(10, 10) }] }] };
    expect(() => importWorkoutLog(ctx, broken, exercises, facts)).toThrow(/no-such-exercise/);
    expect(listPrograms(ctx)).toEqual([]);
    expect(ctx.db.select().from(sessions).all()).toEqual([]);
  });
});
