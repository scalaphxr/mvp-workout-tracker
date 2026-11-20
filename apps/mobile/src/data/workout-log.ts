import { eq, sessions } from '@mvp/db/sqlite';
import type { ItemParams } from '@mvp/domain';
import type { Exercise, ProgramRow } from '@mvp/schemas';

import { setWeight } from './body';
import type { DataContext } from './context';
import {
  createProgramFromDraft,
  getProgramTree,
  listPrograms,
  updateItem,
  updateProgram,
} from './programs';
import {
  addFreeExercise,
  type ExerciseFacts,
  finishSession,
  getSession,
  logSet,
  startFreeSession,
  startSession,
  substituteExercise,
} from './sessions';

/**
 * A training log kept somewhere else – a spreadsheet, a notebook – written out as data: the
 * program, the workouts already done with it and before it, morning weights. Exercises are
 * named by catalog slug, dates are calendar days.
 */
export interface WorkoutLog {
  program: {
    title: string;
    description: string;
    goal: ProgramRow['goal'];
    level: ProgramRow['level'];
    days_per_week: number | null;
    days: {
      title: string;
      items: (ItemParams & {
        slug: string;
        /** The weight step of this item; `null` – the step of the equipment. */
        increment_kg: number | null;
        notes: string;
        /** Done as a superset with the item above. */
        superset?: boolean;
      })[];
    }[];
  };
  /** Oldest first. */
  workouts: LoggedWorkout[];
  weights: { date: string; weight_kg: number }[];
}

export interface LoggedWorkout {
  /** YYYY-MM-DD. */
  date: string;
  /** Index of the program day; absent – a workout without the program (an older one). */
  day?: number;
  notes: string;
  exercises: LoggedExercise[];
}

export interface LoggedExercise {
  /** In a program workout: the index of the item in the day. */
  item?: number;
  /**
   * The exercise done. In a program workout – only when it was not the one of the item:
   * a replacement for this workout ("the benches were taken").
   */
  slug?: string;
  sets: LoggedSet[];
}

export interface LoggedSet {
  /** `null` – body weight. */
  weight_kg: number | null;
  reps: number;
}

/** Sets with one weight: `at(22, 12, 11, 6)` – 22 kg × 12, 11, 6. */
export const at = (weight_kg: number | null, ...reps: number[]): LoggedSet[] =>
  reps.map((count) => ({ weight_kg, reps: count }));

export interface WorkoutLogImport {
  program: ProgramRow;
  workouts: number;
  sets: number;
  weights: number;
}

/** When a workout of the log starts: the log keeps days, not hours. */
const START_HOUR = 18;
/** Time a set itself takes, on top of the rest after it. */
const SET_SEC = 45;

/**
 * Writes a log into the app the way it would have got there had the workouts been logged on
 * the phone: each workout is started, its sets logged and the workout finished on its own
 * date, so plans for the next workout, the pointer of the program, records and history are
 * worked out by the app itself. A log whose program is already there is refused.
 */
export function importWorkoutLog(
  ctx: DataContext,
  log: WorkoutLog,
  exercises: readonly Exercise[],
  facts: ExerciseFacts,
): WorkoutLogImport {
  if (listPrograms(ctx).some((program) => program.title === log.program.title)) {
    throw new Error(`The program "${log.program.title}" is already in the app`);
  }
  const bySlug = new Map(exercises.map((exercise) => [exercise.slug, exercise.id]));
  const idOf = (slug: string) => {
    const id = bySlug.get(slug);
    if (!id) throw new Error(`No exercise "${slug}" in the catalog`);
    return id;
  };

  // The clock of the log: every reading is the moment the log is at.
  let clock = Date.now();
  const logged = { ...ctx, now: () => new Date(clock).toISOString() };
  const startOf = (date: string, hour: number) => {
    const [year, month, day] = date.split('-').map(Number) as [number, number, number];
    return new Date(year, month - 1, day, hour).getTime();
  };

  return ctx.db.transaction((tx) => {
    const inTx = { ...logged, db: tx };
    const first = log.workouts[0]?.date ?? log.weights[0]?.date;
    if (first) clock = startOf(first, START_HOUR) - 24 * 3600_000;

    const program = createProgramFromDraft(inTx, {
      title: log.program.title,
      goal: log.program.goal,
      level: log.program.level,
      days_per_week: log.program.days_per_week,
      days: log.program.days.map((day) => ({
        title: day.title,
        items: day.items.map(({ slug, increment_kg: _step, notes: _notes, ...params }) => ({
          ...params,
          exercise_id: idOf(slug),
        })),
      })),
    });
    const tree = getProgramTree(inTx, program.id);
    if (!tree) throw new Error('The program was not saved');
    const days = tree.days.map((day) => tree.items.filter((item) => item.program_day_id === day.id));
    log.program.days.forEach((day, d) =>
      day.items.forEach((item, i) => {
        const row = days[d]?.[i];
        if (row) updateItem(inTx, row.id, { increment_kg: item.increment_kg, notes: item.notes });
      }),
    );
    if (log.program.description) {
      updateProgram(inTx, program.id, { description: log.program.description });
    }

    // Weights and workouts on one timeline, so every row is written on its own date.
    const events = [
      ...log.weights.map((entry) => ({ date: entry.date, hour: 8, weight: entry })),
      ...log.workouts.map((workout) => ({ date: workout.date, hour: START_HOUR, workout })),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);

    let sets = 0;
    for (const event of events) {
      clock = startOf(event.date, event.hour);
      if ('weight' in event && event.weight) {
        setWeight(inTx, event.weight.date, event.weight.weight_kg);
        continue;
      }
      const workout = 'workout' in event ? event.workout : undefined;
      if (!workout) continue;

      const dayId = workout.day === undefined ? null : tree.days[workout.day]?.id;
      if (dayId === undefined) throw new Error(`No day ${workout.day} in the program`);
      const session = dayId ? startSession(inTx, program.id, dayId) : startFreeSession(inTx);
      const entries = getSession(inTx, session.id)?.exercises ?? [];

      for (const done of workout.exercises) {
        clock += 60_000;
        let entryId: string;
        let rest = 90;
        if (dayId) {
          const entry = done.item === undefined ? undefined : entries[done.item];
          if (!entry) throw new Error(`No item ${done.item} on ${workout.date}`);
          entryId = entry.exercise.id;
          rest = entry.item?.rest_sec ?? rest;
          if (done.slug) substituteExercise(inTx, entryId, idOf(done.slug), false);
        } else {
          if (!done.slug) throw new Error(`An exercise without a slug on ${workout.date}`);
          entryId = addFreeExercise(inTx, session.id, idOf(done.slug), done.sets.length).id;
        }
        for (const set of done.sets) {
          clock += SET_SEC * 1000;
          logSet(inTx, entryId, { weight_kg: set.weight_kg, reps: set.reps });
          sets++;
          clock += rest * 1000;
        }
      }

      if (workout.notes) {
        tx.update(sessions)
          .set({ notes: workout.notes, updated_at: logged.now() })
          .where(eq(sessions.id, session.id))
          .run();
      }
      clock += 120_000;
      finishSession(inTx, session.id, dayId ? facts : () => null, { smart: false });
    }

    return {
      program: getProgramTree(inTx, program.id)?.program ?? program,
      workouts: log.workouts.length,
      sets,
      weights: log.weights.length,
    };
  });
}
