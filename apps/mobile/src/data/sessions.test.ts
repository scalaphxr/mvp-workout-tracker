import { body_logs, outbox, program_state, set_logs } from '@mvp/db/sqlite';
import { createTestDb } from '@mvp/db/sqlite/testing';
import { type ItemParams, uuidv7 } from '@mvp/domain';
import type { ProgramItemRow } from '@mvp/schemas';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  activitiesSince,
  deleteActivity,
  getActivity,
  listActivities,
  saveActivity,
} from './activities';
import { deleteWeight, listWeights, setWeight } from './body';
import type { DataContext } from './context';
import {
  deleteIntervalPreset,
  getIntervalPreset,
  listIntervalPresets,
  saveIntervalPreset,
} from './intervals';
import {
  cardioProgress,
  exerciseProgress,
  exercisesOnTime,
  exercisesWithProgress,
  getWorkout,
  listWorkouts,
  workoutsOfCycle,
} from './history';
import {
  addDay,
  addItem,
  createProgram,
  createProgramFromDraft,
  getProgramTree,
  listPrograms,
  updateItem,
} from './programs';
import {
  abandonSession,
  activeSession,
  type ExerciseFacts,
  finishSession,
  getProgramState,
  getSession,
  lastFinishedSession,
  lastPerformance,
  logSet,
  nextWorkout,
  recordsOfSet,
  removeLastSet,
  resolveReduction,
  sessionSummary,
  startDeload,
  startSession,
  substituteExercise,
} from './sessions';
import {
  applyPulled,
  getSyncState,
  markPushed,
  pendingChanges,
  pendingCount,
  setSyncState,
  wipeLocalData,
} from './sync';

let ctx: DataContext;
let clock: number;

const id = (n: number) => uuidv7(n, new Uint8Array(10));
const [BENCH, CURL, PLANK, DUMBBELL_BENCH] = [id(11), id(12), id(13), id(14)];
const PARAMS: ItemParams = { sets: 3, rep_min: 10, rep_max: 12, rest_sec: 120, target_rir: 1 };

/** Every exercise is loaded in 2.5 kg steps, except the plank, which is held for time. */
const facts: ExerciseFacts = (exerciseId) => ({ step_kg: 2.5, progresses: exerciseId !== PLANK });

beforeEach(async () => {
  clock = Date.UTC(2026, 9, 4, 10);
  let ids = 1000;
  ctx = {
    db: await createTestDb(),
    now: () => new Date((clock += 1000)).toISOString(),
    newId: () => id(++ids),
  };
});

/** A program of two days: bench and curl on day 1, bench on day 2, a plank every workout. */
function program() {
  const created = createProgram(ctx, { title: 'Upper', firstDayTitle: 'Day 1' });
  const [day1] = getProgramTree(ctx, created.id)!.days;
  const day2 = addDay(ctx, created.id, 'Day 2', 'regular');
  const block = addDay(ctx, created.id, 'Every workout', 'every_session');
  const bench = addItem(ctx, day1!.id, BENCH, PARAMS);
  const curl = addItem(ctx, day1!.id, CURL, PARAMS);
  addItem(ctx, day2.id, BENCH, PARAMS);
  const plank = addItem(ctx, block.id, PLANK, { ...PARAMS, rep_min: 30, rep_max: 60, target_rir: null });
  return { id: created.id, day1: day1!, day2, bench, curl, plank };
}

/** Does a whole workout of a day: `reps` per exercise, each with the given weight. */
function workout(programId: string, dayId: string, done: Record<string, [number, number[]]>) {
  const session = startSession(ctx, programId, dayId);
  for (const { exercise } of getSession(ctx, session.id)!.exercises) {
    const [weight, reps] = done[exercise.exercise_id] ?? [0, []];
    for (const count of reps) logSet(ctx, exercise.id, { weight_kg: weight, reps: count, rir: 1 });
  }
  finishSession(ctx, session.id, facts, { smart: false });
  return session.id;
}

const planOf = (sessionId: string, item: ProgramItemRow) =>
  sessionSummary(ctx, sessionId)!.exercises.find((entry) => entry.item?.id === item.id)!.plan;

describe('the round of a program', () => {
  it('starts at the first day and offers the other days', () => {
    const { id: programId, day1 } = program();
    const next = nextWorkout(ctx, programId)!;

    expect(next.day.id).toBe(day1.id);
    expect(next.days.map((day) => day.title)).toEqual(['Day 1', 'Day 2']);
    expect(next.cycle).toBe(1);
  });

  it('moves to the next day after a workout and to a new cycle after the last day', () => {
    const { id: programId, day1, day2 } = program();

    workout(programId, day1.id, {});
    expect(nextWorkout(ctx, programId)).toMatchObject({ day: { id: day2.id }, cycle: 1 });

    workout(programId, day2.id, {});
    expect(nextWorkout(ctx, programId)).toMatchObject({ day: { id: day1.id }, cycle: 2 });
  });

  it('follows the day the user chose instead of the next one', () => {
    const { id: programId, day2 } = program();
    workout(programId, day2.id, {});
    expect(nextWorkout(ctx, programId)).toMatchObject({ cycle: 2 });
    expect(getProgramState(ctx, programId).next_day_position).toBe(0);
  });

  it('has nothing to offer for a program without days', () => {
    expect(nextWorkout(ctx, id(999))).toBeNull();
  });
});

describe('a workout', () => {
  it('takes the exercises of the day and appends the "every workout" block', () => {
    const { id: programId, day1 } = program();
    const session = startSession(ctx, programId, day1.id);

    const view = getSession(ctx, session.id)!;
    expect(view.session).toMatchObject({ status: 'active', cycle_number: 1, finished_at: null });
    expect(view.exercises.map((entry) => entry.exercise.exercise_id)).toEqual([BENCH, CURL, PLANK]);
    expect(view.exercises.map((entry) => entry.plannedSets)).toEqual([3, 3, 3]);
  });

  it('is found again after the app was closed, with every set in place', () => {
    const { id: programId, day1, day2 } = program();
    const session = startSession(ctx, programId, day1.id);
    const [bench] = getSession(ctx, session.id)!.exercises;
    logSet(ctx, bench!.exercise.id, { weight_kg: 80, reps: 12, rir: 2 });
    logSet(ctx, bench!.exercise.id, { weight_kg: 80, reps: 11, rir: 1 });

    // A new launch asks the database, not the memory of the app.
    const resumed = activeSession(ctx)!;
    expect(resumed.id).toBe(session.id);
    expect(getSession(ctx, resumed.id)!.exercises[0]!.sets.map((set) => [set.set_number, set.reps])).toEqual([
      [1, 12],
      [2, 11],
    ]);
    // Starting another workout returns the one in progress.
    expect(startSession(ctx, programId, day2.id).id).toBe(session.id);
  });

  it('stores the planned range of a set as two numbers', () => {
    const { id: programId, day1 } = program();
    const session = startSession(ctx, programId, day1.id);
    const [bench] = getSession(ctx, session.id)!.exercises;
    logSet(ctx, bench!.exercise.id, {
      planned_weight_kg: 80,
      planned_rep_min: 8,
      planned_rep_max: 9,
      weight_kg: 80,
      reps: 9,
    });

    const [raw] = ctx.db.select().from(set_logs).all();
    expect([raw!.planned_rep_min, raw!.planned_rep_max]).toEqual([8, 9]);
  });

  it('takes back the last set', () => {
    const { id: programId, day1 } = program();
    const session = startSession(ctx, programId, day1.id);
    const [bench] = getSession(ctx, session.id)!.exercises;
    logSet(ctx, bench!.exercise.id, { weight_kg: 80, reps: 12 });
    logSet(ctx, bench!.exercise.id, { weight_kg: 80, reps: 1 });

    removeLastSet(ctx, bench!.exercise.id);
    expect(getSession(ctx, session.id)!.exercises[0]!.sets.map((set) => set.reps)).toEqual([12]);
    // The next set takes the freed number.
    expect(logSet(ctx, bench!.exercise.id, { weight_kg: 80, reps: 11 }).set_number).toBe(2);
  });

  it('can be abandoned: the sets stay, the plans and the pointer do not move', () => {
    const { id: programId, day1 } = program();
    const session = startSession(ctx, programId, day1.id);
    logSet(ctx, getSession(ctx, session.id)!.exercises[0]!.exercise.id, { weight_kg: 80, reps: 12 });

    abandonSession(ctx, session.id);
    expect(activeSession(ctx)).toBeNull();
    expect(getSession(ctx, session.id)!.session.status).toBe('abandoned');
    expect(nextWorkout(ctx, programId)!.day.id).toBe(day1.id);
    expect(lastFinishedSession(ctx)).toBeNull();
  });
});

describe('the plan for the next workout', () => {
  it('adds a step when every set reached the top of the range', () => {
    const { id: programId, day1, bench } = program();
    const sessionId = workout(programId, day1.id, { [BENCH]: [80, [12, 12, 12]] });

    expect(planOf(sessionId, bench)).toMatchObject({
      next_weight_kg: 82.5,
      next_target_reps: 10,
      reason_code: 'increase',
      reason_params: { step_kg: 2.5, sets: 3, reps: 12 },
    });
  });

  it('shows that plan when the same day comes round again', () => {
    const { id: programId, day1, day2 } = program();
    workout(programId, day1.id, { [BENCH]: [80, [12, 12, 12]], [CURL]: [14, [12, 11, 10]] });
    workout(programId, day2.id, {});

    const session = startSession(ctx, programId, day1.id);
    const [bench, curl] = getSession(ctx, session.id)!.exercises;
    expect(bench!.plan).toMatchObject({ next_weight_kg: 82.5, reason_code: 'increase' });
    expect(curl!.plan).toMatchObject({ next_weight_kg: 14, reason_code: 'same' });
  });

  it('uses the step set for the item over the step of the gym', () => {
    const { id: programId, day1, bench } = program();
    updateItem(ctx, bench.id, { increment_kg: 1.25 });
    const sessionId = workout(programId, day1.id, { [BENCH]: [80, [12, 12, 12]] });
    expect(planOf(sessionId, bench)?.next_weight_kg).toBe(81.25);
  });

  it('offers 10% off after two failed workouts and drops the weight only when accepted', () => {
    const { id: programId, day1, bench } = program();
    const failed = { [BENCH]: [80, [9, 8, 8]] as [number, number[]] };

    expect(planOf(workout(programId, day1.id, failed), bench)).toMatchObject({
      reason_code: 'retry',
      fail_streak: 1,
      next_weight_kg: 80,
    });
    const second = workout(programId, day1.id, failed);
    expect(planOf(second, bench)).toMatchObject({
      reason_code: 'reduce_offer',
      fail_streak: 2,
      next_weight_kg: 80,
      reason_params: { reduced_weight_kg: 70 },
    });

    resolveReduction(ctx, bench.id, false);
    expect(planOf(second, bench)).toMatchObject({ reason_code: 'retry', next_weight_kg: 80, fail_streak: 2 });
    // Declined: the third failure brings the offer back.
    const third = workout(programId, day1.id, failed);
    expect(planOf(third, bench)).toMatchObject({ reason_code: 'reduce_offer', fail_streak: 3 });

    resolveReduction(ctx, bench.id, true);
    expect(planOf(third, bench)).toMatchObject({
      reason_code: 'reduced',
      next_weight_kg: 70,
      fail_streak: 0,
    });
  });

  it('keeps the old plan for an exercise that was skipped', () => {
    const { id: programId, day1, bench } = program();
    workout(programId, day1.id, { [BENCH]: [80, [12, 12, 12]] });
    const skipped = workout(programId, day1.id, {});
    expect(planOf(skipped, bench)).toMatchObject({ next_weight_kg: 82.5, reason_code: 'increase' });
  });

  it('plans nothing for an exercise held for time', () => {
    const { id: programId, day1, plank } = program();
    const session = startSession(ctx, programId, day1.id);
    const held = getSession(ctx, session.id)!.exercises.find((e) => e.exercise.exercise_id === PLANK)!;
    logSet(ctx, held.exercise.id, { duration_sec: 60 });
    finishSession(ctx, session.id, facts, { smart: false });

    expect(planOf(session.id, plank)).toBeNull();
  });
});

describe('replacing an exercise during a workout', () => {
  it('for this workout only: the program and its plan stay as they were', () => {
    const { id: programId, day1, bench } = program();
    workout(programId, day1.id, { [BENCH]: [80, [12, 12, 12]] });

    const session = startSession(ctx, programId, day1.id);
    const [first] = getSession(ctx, session.id)!.exercises;
    substituteExercise(ctx, first!.exercise.id, DUMBBELL_BENCH, false);
    logSet(ctx, first!.exercise.id, { weight_kg: 32, reps: 12 });
    finishSession(ctx, session.id, facts, { smart: false });

    const [replaced] = getSession(ctx, session.id)!.exercises;
    expect(replaced!.exercise).toMatchObject({
      exercise_id: DUMBBELL_BENCH,
      substituted_from_id: BENCH,
    });
    expect(getProgramTree(ctx, programId)!.items.find((i) => i.id === bench.id)!.exercise_id).toBe(BENCH);
    // The bench plan was not touched by a workout done with dumbbells.
    const next = startSession(ctx, programId, day1.id);
    expect(getSession(ctx, next.id)!.exercises[0]!.plan).toMatchObject({ next_weight_kg: 82.5 });
  });

  it('for good: the program changes and the plan of the old exercise is dropped', () => {
    const { id: programId, day1, bench } = program();
    workout(programId, day1.id, { [BENCH]: [80, [12, 12, 12]] });

    const session = startSession(ctx, programId, day1.id);
    const [first] = getSession(ctx, session.id)!.exercises;
    substituteExercise(ctx, first!.exercise.id, DUMBBELL_BENCH, true);

    const [replaced] = getSession(ctx, session.id)!.exercises;
    expect(replaced!.exercise).toMatchObject({ exercise_id: DUMBBELL_BENCH, substituted_from_id: null });
    expect(replaced!.plan).toBeNull();
    expect(getProgramTree(ctx, programId)!.items.find((i) => i.id === bench.id)!.exercise_id).toBe(
      DUMBBELL_BENCH,
    );
  });
});

describe('summary', () => {
  it('adds up the volume and the time and finds records against earlier workouts', () => {
    const { id: programId, day1 } = program();
    const first = workout(programId, day1.id, { [BENCH]: [80, [10, 10, 9]] });
    expect(sessionSummary(ctx, first)!.exercises[0]!.records).toEqual([]);

    const second = workout(programId, day1.id, { [BENCH]: [82.5, [10, 9, 8]], [CURL]: [14, [12, 12]] });
    const summary = sessionSummary(ctx, second)!;
    expect(summary.volumeKg).toBe(82.5 * 27 + 14 * 24);
    expect(summary.durationSec).toBeGreaterThan(0);
    expect(summary.exercises[0]!.records.map((record) => record.kind)).toEqual(['weight', 'e1rm']);
    expect(lastFinishedSession(ctx)!.id).toBe(second);
  });

  it('remembers what was done the last time, for "like last time"', () => {
    const { id: programId, day1 } = program();
    workout(programId, day1.id, { [BENCH]: [80, [12, 11, 10]] });
    const session = startSession(ctx, programId, day1.id);

    expect(lastPerformance(ctx, BENCH, session.id).map((set) => [set.weight_kg, set.reps])).toEqual([
      [80, 12],
      [80, 11],
      [80, 10],
    ]);
  });

  it('offers a deload after three workouts of a day without growth, and halves the sets in it', () => {
    const { id: programId, day1 } = program();
    const stuck = { [BENCH]: [80, [11, 11, 10]] as [number, number[]], [CURL]: [14, [11, 10, 10]] as [number, number[]] };

    expect(sessionSummary(ctx, workout(programId, day1.id, stuck))!.offerDeload).toBe(false);
    expect(sessionSummary(ctx, workout(programId, day1.id, stuck))!.offerDeload).toBe(false);
    const third = workout(programId, day1.id, stuck);
    expect(sessionSummary(ctx, third)!.offerDeload).toBe(true);

    startDeload(ctx, programId);
    // Day 1 was done three times running, so the pointer is on day 2 of cycle 1:
    // the lighter week is the next cycle.
    expect(getProgramState(ctx, programId).deload_cycle).toBe(2);
    workout(programId, getProgramTree(ctx, programId)!.days[1]!.id, {});

    const light = startSession(ctx, programId, day1.id);
    const view = getSession(ctx, light.id)!;
    expect(view.deload).toBe(true);
    expect(view.exercises.map((entry) => entry.plannedSets)).toEqual([2, 2, 2]);
    // A light week changes no plans.
    const before = view.exercises[0]!.plan;
    logSet(ctx, view.exercises[0]!.exercise.id, { weight_kg: 80, reps: 12 });
    finishSession(ctx, light.id, facts, { smart: false });
    expect(getSession(ctx, light.id)!.exercises[0]!.plan).toEqual(before);
    expect(sessionSummary(ctx, light.id)!.offerDeload).toBe(false);
  });
});

describe('the queue of unsent rows', () => {
  const serverTakes = (sent: ReturnType<typeof pendingChanges>['sent']) =>
    markPushed(ctx, sent, { accepted: sent.map((row) => row.id), rejected: [], cursor: '0' });

  it('queues every row a workout writes, with no network at all', () => {
    const { id: programId, day1 } = program();
    serverTakes(pendingChanges(ctx, 1000).sent);
    expect(pendingCount(ctx)).toBe(0);

    workout(programId, day1.id, { [BENCH]: [80, [12, 12, 12]] });

    const { changes } = pendingChanges(ctx, 1000);
    const tables = changes.map((change) => change.table);
    // Parents first: the server needs a workout before its exercises, those before sets.
    expect([...new Set(tables)]).toEqual([
      'program_state',
      'progression_state',
      'sessions',
      'session_exercises',
      'set_logs',
    ]);
    expect(tables.filter((table) => table === 'set_logs')).toHaveLength(3);
    expect(tables.filter((table) => table === 'sessions')).toHaveLength(1);
  });

  it('sends a row once however many times it changed', () => {
    const { bench } = program();
    serverTakes(pendingChanges(ctx, 1000).sent);

    updateItem(ctx, bench.id, { sets: 4 });
    updateItem(ctx, bench.id, { sets: 5 });

    const { changes } = pendingChanges(ctx);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ table: 'program_items', row: { id: bench.id, sets: 5 } });
  });

  it('keeps a row queued when it changed while the request was on its way', () => {
    const { bench } = program();
    const { sent } = pendingChanges(ctx, 1000);
    updateItem(ctx, bench.id, { sets: 5 });
    serverTakes(sent);

    expect(pendingChanges(ctx).changes.map((change) => change.op === 'upsert' && change.row.id)).toEqual([
      bench.id,
    ]);
  });

  it('keeps a row whose parent the server lacks, and drops a row the server refuses', () => {
    const { bench, curl } = program();
    const { sent } = pendingChanges(ctx, 1000);
    markPushed(ctx, sent, {
      accepted: sent.map((row) => row.id).filter((rowId) => rowId !== bench.id && rowId !== curl.id),
      rejected: [
        { id: bench.id, code: 'missing_parent' },
        { id: curl.id, code: 'validation_error' },
      ],
      cursor: '0',
    });

    expect(ctx.db.select().from(outbox).all()).toEqual([
      { table_name: 'program_items', row_id: bench.id },
    ]);
  });

  it('writes rows from the server without queueing them, and keeps a newer local row', () => {
    const { id: programId, bench } = program();
    serverTakes(pendingChanges(ctx, 1000).sent);
    updateItem(ctx, bench.id, { sets: 5 });
    const local = getProgramTree(ctx, programId)!.items.find((item) => item.id === bench.id)!;

    const applied = applyPulled(ctx, [
      // An older copy of a row this phone has changed since: the phone's version stays.
      { table: 'program_items', row: { ...local, sets: 2, updated_at: '2026-01-01T00:00:00.000Z' } },
      // A pointer written by another device.
      {
        table: 'program_state',
        row: {
          id: programId,
          created_at: '2027-01-01T00:00:00.000Z',
          updated_at: '2027-01-01T00:00:00.000Z',
          deleted_at: null,
          program_id: programId,
          next_day_position: 1,
          cycle_number: 7,
          deload_cycle: null,
        },
      },
      // A row that does not fit the schema is skipped.
      { table: 'programs', row: { id: programId, title: '' } },
    ]);

    expect(applied).toBe(1);
    expect(getProgramTree(ctx, programId)!.items.find((item) => item.id === bench.id)!.sets).toBe(5);
    expect(ctx.db.select().from(program_state).all()).toHaveLength(1);
    expect(nextWorkout(ctx, programId)).toMatchObject({ cycle: 7, day: { title: 'Day 2' } });
    // Only the phone's own change is waiting; what came from the server is not sent back.
    expect(ctx.db.select().from(outbox).all()).toEqual([
      { table_name: 'program_items', row_id: bench.id },
    ]);
    expect(getSyncState(ctx, 'applying')).toBeNull();
  });
});

describe('cardio and free activity, with no network at all', () => {
  const TREADMILL = id(15);

  it('a cardio set keeps every number of the machine and is queued for the server', () => {
    const created = createProgram(ctx, { title: 'Cardio', firstDayTitle: 'Run' });
    const [day] = getProgramTree(ctx, created.id)!.days;
    addItem(ctx, day!.id, TREADMILL, { ...PARAMS, sets: 1, rep_min: 20, rep_max: 30, target_rir: null });
    const session = startSession(ctx, created.id, day!.id);
    const [entry] = getSession(ctx, session.id)!.exercises;
    logSet(ctx, entry!.exercise.id, {
      duration_sec: 25 * 60 + 30,
      distance_m: 4200,
      speed_kmh: 10,
      incline_pct: 2,
      resistance_level: null,
      avg_hr: 145,
      calories: 310,
    });
    finishSession(ctx, session.id, facts, { smart: false });

    const [set] = getWorkout(ctx, session.id)!.exercises[0]!.sets;
    expect(set).toMatchObject({ duration_sec: 1530, distance_m: 4200, incline_pct: 2, avg_hr: 145, reps: null });
    expect(pendingChanges(ctx, 1000).changes).toContainEqual(
      expect.objectContaining({ table: 'set_logs', row: expect.objectContaining({ distance_m: 4200 }) }),
    );
    // A chart of distance, with no progression behind it.
    expect(exercisesOnTime(ctx)).toEqual([TREADMILL]);
    expect(exercisesWithProgress(ctx)).toEqual([]);
    expect(cardioProgress(ctx, TREADMILL)).toEqual([
      { date: session.started_at, distance_m: 4200, duration_sec: 1530 },
    ]);
  });

  it('a longer run is a record right on the set and in the summary, the first one is not', () => {
    const created = createProgram(ctx, { title: 'Cardio', firstDayTitle: 'Run' });
    const [day] = getProgramTree(ctx, created.id)!.days;
    addItem(ctx, day!.id, TREADMILL, { ...PARAMS, sets: 2, rep_min: 20, rep_max: 30, target_rir: null });
    const run = (distance_m: number, minutes: number) => ({
      duration_sec: minutes * 60,
      distance_m,
      speed_kmh: null,
      incline_pct: null,
      resistance_level: null,
      avg_hr: null,
      calories: null,
    });
    const workoutOf = (sets: ReturnType<typeof run>[]) => {
      const session = startSession(ctx, created.id, day!.id);
      const entryId = getSession(ctx, session.id)!.exercises[0]!.exercise.id;
      const found = sets.map((set) => {
        const records = recordsOfSet(ctx, entryId, set);
        logSet(ctx, entryId, set);
        return records;
      });
      finishSession(ctx, session.id, facts, { smart: false });
      return { found, summary: sessionSummary(ctx, session.id)!.exercises[0]!.cardioRecords };
    };

    const first = workoutOf([run(4200, 25)]);
    expect(first.found).toEqual([[]]);
    expect(first.summary).toEqual([]);

    // The second set beats the first one of the same workout too.
    const second = workoutOf([run(4500, 25), run(5100, 30)]);
    expect(second.found).toEqual([
      [{ kind: 'distance', value: 4500 }],
      [
        { kind: 'distance', value: 5100 },
        { kind: 'duration', value: 1800 },
      ],
    ]);
    expect(second.summary).toEqual([
      { kind: 'distance', value: 5100 },
      { kind: 'duration', value: 1800 },
    ]);
  });

  const football = {
    activity_type: 'football',
    started_at: '2026-10-03T16:00:00.000Z',
    duration_sec: 90 * 60,
    intensity: 7,
    distance_m: 8200,
    avg_hr: null,
    calories: null,
    notes: '',
  };

  it('an activity is saved, changed and deleted softly, each change queued', () => {
    const saved = saveActivity(ctx, football);
    saveActivity(ctx, { ...football, activity_type: 'Сапборд', started_at: '2026-10-04T08:00:00.000Z' });
    expect(listActivities(ctx).map((a) => a.activity_type)).toEqual(['Сапборд', 'football']);
    expect(activitiesSince(ctx, '2026-10-04T00:00:00.000Z').map((a) => a.activity_type)).toEqual(['Сапборд']);

    saveActivity(ctx, { ...football, intensity: 9 }, saved.id);
    expect(getActivity(ctx, saved.id)).toMatchObject({ intensity: 9, created_at: saved.created_at });

    deleteActivity(ctx, saved.id);
    expect(listActivities(ctx)).toHaveLength(1);
    expect(pendingChanges(ctx).changes).toContainEqual(
      expect.objectContaining({
        table: 'activity_logs',
        row: expect.objectContaining({ id: saved.id, deleted_at: expect.any(String) }),
      }),
    );
  });

  it('an activity out of the limits is refused', () => {
    expect(() => saveActivity(ctx, { ...football, intensity: 11 })).toThrow();
    expect(() => saveActivity(ctx, { ...football, duration_sec: 0 })).toThrow();
    expect(() => saveActivity(ctx, { ...football, activity_type: '  ' })).toThrow();
    expect(listActivities(ctx)).toEqual([]);
  });
});

describe('interval presets', () => {
  const plan = { title: 'Sprints', work_sec: 30, rest_sec: 90, rounds: 6, cycles: 1, cycle_rest_sec: 0 };

  it('are saved, changed and deleted softly, each change queued for the server', () => {
    const created = saveIntervalPreset(ctx, plan);
    expect(listIntervalPresets(ctx)).toEqual([created]);

    saveIntervalPreset(ctx, { ...plan, rounds: 8 }, created.id);
    expect(getIntervalPreset(ctx, created.id)).toMatchObject({ rounds: 8, created_at: created.created_at });
    expect(pendingChanges(ctx).changes).toMatchObject([
      { table: 'interval_presets', row: { id: created.id, rounds: 8 } },
    ]);

    deleteIntervalPreset(ctx, created.id);
    expect(listIntervalPresets(ctx)).toEqual([]);
    expect(pendingChanges(ctx).changes).toMatchObject([
      { table: 'interval_presets', row: { id: created.id, deleted_at: expect.any(String) } },
    ]);
  });

  it('refuse values out of the limits', () => {
    expect(() => saveIntervalPreset(ctx, { ...plan, work_sec: 0 })).toThrow();
    expect(() => saveIntervalPreset(ctx, { ...plan, title: ' ' })).toThrow();
    expect(listIntervalPresets(ctx)).toEqual([]);
  });
});

describe('after the account is deleted', () => {
  it('the phone forgets every row, the queue and whose data it was', () => {
    const { id: programId, day1 } = program();
    workout(programId, day1.id, { [BENCH]: [80, [12, 12, 12]] });
    setWeight(ctx, '2026-10-04', 84.6);
    saveIntervalPreset(ctx, { title: 'Mine', work_sec: 30, rest_sec: 30, rounds: 5, cycles: 1, cycle_rest_sec: 0 });
    saveActivity(ctx, {
      activity_type: 'walking',
      started_at: '2026-10-04T08:00:00.000Z',
      duration_sec: 1800,
      intensity: null,
      distance_m: null,
      avg_hr: null,
      calories: null,
      notes: '',
    });
    setSyncState(ctx, 'account_id', id(99));
    setSyncState(ctx, 'pull_cursor', '42');

    wipeLocalData(ctx);

    expect(listPrograms(ctx)).toEqual([]);
    expect(lastFinishedSession(ctx)).toBeNull();
    expect(ctx.db.select().from(set_logs).all()).toEqual([]);
    expect(listWeights(ctx)).toEqual([]);
    expect(listIntervalPresets(ctx)).toEqual([]);
    expect(listActivities(ctx)).toEqual([]);
    expect(pendingCount(ctx)).toBe(0);
    expect(getSyncState(ctx, 'account_id')).toBeNull();
    expect(getSyncState(ctx, 'pull_cursor')).toBeNull();
  });
});

describe('stage 4 data', () => {
  it('keeps one weight per day, replaces it on a second entry, and can remove it', () => {
    setWeight(ctx, '2026-10-03', 85);
    setWeight(ctx, '2026-10-04', 84.6);
    setWeight(ctx, '2026-10-04', 84.4);

    expect(listWeights(ctx)).toEqual([
      { date: '2026-10-03', weight_kg: 85 },
      { date: '2026-10-04', weight_kg: 84.4 },
    ]);
    expect(ctx.db.select().from(body_logs).all()).toHaveLength(2);

    deleteWeight(ctx, '2026-10-03');
    expect(listWeights(ctx)).toEqual([{ date: '2026-10-04', weight_kg: 84.4 }]);
    expect(() => setWeight(ctx, '2026-10-05', 5)).toThrow();
  });

  it('takes the entry written last when two devices logged the same day', () => {
    setWeight(ctx, '2026-10-04', 84.6);
    applyPulled(ctx, [
      {
        table: 'body_logs',
        row: {
          id: id(77),
          created_at: '2027-01-01T00:00:00.000Z',
          updated_at: '2027-01-01T00:00:00.000Z',
          deleted_at: null,
          date: '2026-10-04',
          weight_kg: 84.1,
          measured_at: '2027-01-01T00:00:00.000Z',
        },
      },
    ]);
    expect(listWeights(ctx)).toEqual([{ date: '2026-10-04', weight_kg: 84.1 }]);
  });

  it('saves a draft as a program, supersets included', () => {
    const item = (exercise_id: string, superset = false) => ({ ...PARAMS, exercise_id, superset });
    const created = createProgramFromDraft(ctx, {
      title: 'From text',
      goal: 'mass',
      level: 'beginner',
      days_per_week: 2,
      days: [
        { title: 'Day 1', items: [item(BENCH), item(CURL), item(PLANK, true), item(DUMBBELL_BENCH)] },
        { title: 'Day 2', items: [item(CURL, true), item(BENCH, true), item(PLANK, true)] },
      ],
    });

    const tree = getProgramTree(ctx, created.id)!;
    expect(tree.program).toMatchObject({ title: 'From text', goal: 'mass', days_per_week: 2 });
    expect(tree.days.map((day) => day.title)).toEqual(['Day 1', 'Day 2']);
    const groupsOf = (dayIndex: number) =>
      tree.items.filter((i) => i.program_day_id === tree.days[dayIndex]!.id).map((i) => i.superset_group);
    expect(groupsOf(0)).toEqual([null, 1, 1, null]);
    // A "superset" mark on the first item of a day has nothing above it to join.
    expect(groupsOf(1)).toEqual([1, 1, 1]);
  });

  it('numbers workouts, lists them newest first and tracks an exercise over time', () => {
    const { id: programId, day1, day2 } = program();
    const first = workout(programId, day1.id, { [BENCH]: [80, [10, 10]] });
    const second = workout(programId, day2.id, { [BENCH]: [82.5, [8]] });

    expect(listWorkouts(ctx).map((entry) => [entry.session.id, entry.number, entry.dayTitle])).toEqual([
      [second, 2, 'Day 2'],
      [first, 1, 'Day 1'],
    ]);
    expect(getWorkout(ctx, first)).toMatchObject({ number: 1, programTitle: 'Upper', volumeKg: 1600 });
    expect(workoutsOfCycle(ctx, programId, 1).map((entry) => entry.session.id)).toEqual([first, second]);
    expect(workoutsOfCycle(ctx, programId, 2)).toEqual([]);

    expect(exerciseProgress(ctx, BENCH).map((point) => [point.weight_kg, Math.round(point.e1rm)])).toEqual([
      [80, 107],
      [82.5, 105],
    ]);
    expect(exercisesWithProgress(ctx)).toEqual([BENCH]);
  });
});
