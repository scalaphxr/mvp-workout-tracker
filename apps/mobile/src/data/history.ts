import {
  and,
  asc,
  desc,
  eq,
  gte,
  gt,
  inArray,
  isNull,
  lt,
  program_days,
  programs,
  session_exercises,
  sessions,
  set_logs,
} from '@mvp/db/sqlite';
import { epley } from '@mvp/domain';
import type { SessionRow } from '@mvp/schemas';

import { toLocalDate } from '../lib/format';
import { activityStartTimes } from './activities';
import type { DataContext } from './context';
import { type SessionSummary, type SessionTotals, sessionSummary, sessionTotals } from './sessions';

const finished = and(eq(sessions.status, 'finished'), isNull(sessions.deleted_at));

/** A finished workout with what a report and the history list say about it. */
export interface WorkoutRecord extends SessionSummary {
  /** Which workout of the user this is, counting from 1. */
  number: number;
  dayTitle: string;
  programTitle: string;
}

function record(ctx: DataContext, session: SessionRow): WorkoutRecord | null {
  const summary = sessionSummary(ctx, session.id);
  if (!summary) return null;
  const earlier = ctx.db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(finished, lt(sessions.started_at, session.started_at)))
    .all().length;
  // A workout without a program has neither.
  const day = session.program_day_id
    ? ctx.db.select().from(program_days).where(eq(program_days.id, session.program_day_id)).get()
    : undefined;
  const program = session.program_id
    ? ctx.db.select().from(programs).where(eq(programs.id, session.program_id)).get()
    : undefined;
  return {
    ...summary,
    number: earlier + 1,
    dayTitle: day?.title ?? '',
    programTitle: program?.title ?? '',
  };
}

const records = (ctx: DataContext, rows: SessionRow[]) =>
  rows.flatMap((session) => record(ctx, session) ?? []);

/** A finished workout in a list: its totals, without records and plans. */
export interface WorkoutTotals extends SessionTotals {
  /** Which workout of the user this is, counting from 1. */
  number: number;
  dayTitle: string;
  programTitle: string;
}

/** The totals of workouts with their numbers and titles, a few queries for all of them. */
function totalsWithTitles(ctx: DataContext, rows: SessionRow[]): WorkoutTotals[] {
  if (rows.length === 0) return [];
  // The number of a workout is its place among all finished ones, oldest first.
  const order = new Map(
    ctx.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(finished)
      .orderBy(asc(sessions.started_at))
      .all()
      .map(({ id }, index) => [id, index + 1]),
  );
  const dayIds = rows.flatMap((row) => row.program_day_id ?? []);
  const programIds = rows.flatMap((row) => row.program_id ?? []);
  const days = new Map(
    dayIds.length === 0
      ? []
      : ctx.db
          .select({ id: program_days.id, title: program_days.title })
          .from(program_days)
          .where(inArray(program_days.id, dayIds))
          .all()
          .map((day) => [day.id, day.title]),
  );
  const titles = new Map(
    programIds.length === 0
      ? []
      : ctx.db
          .select({ id: programs.id, title: programs.title })
          .from(programs)
          .where(inArray(programs.id, programIds))
          .all()
          .map((program) => [program.id, program.title]),
  );
  return sessionTotals(ctx, rows).map((totals) => ({
    ...totals,
    number: order.get(totals.session.id) ?? 0,
    dayTitle: (totals.session.program_day_id && days.get(totals.session.program_day_id)) || '',
    programTitle: (totals.session.program_id && titles.get(totals.session.program_id)) || '',
  }));
}

/** Finished workouts with their totals, newest first: for the history and the cards. */
export function listWorkoutTotals(ctx: DataContext, limit = 50): WorkoutTotals[] {
  return totalsWithTitles(
    ctx,
    ctx.db.select().from(sessions).where(finished).orderBy(desc(sessions.started_at)).limit(limit).all(),
  );
}

/** The totals of the workouts started after a moment (an ISO time), oldest first. */
export function workoutTotalsSince(ctx: DataContext, since: string): WorkoutTotals[] {
  return totalsWithTitles(
    ctx,
    ctx.db
      .select()
      .from(sessions)
      .where(and(finished, gt(sessions.started_at, since)))
      .orderBy(asc(sessions.started_at))
      .all(),
  );
}

/** Finished workouts, newest first. */
export function listWorkouts(ctx: DataContext, limit = 50): WorkoutRecord[] {
  return records(
    ctx,
    ctx.db.select().from(sessions).where(finished).orderBy(desc(sessions.started_at)).limit(limit).all(),
  );
}

export function getWorkout(ctx: DataContext, sessionId: string): WorkoutRecord | null {
  const session = ctx.db.select().from(sessions).where(and(finished, eq(sessions.id, sessionId))).get();
  return session ? record(ctx, session) : null;
}

/** Finished workouts in a local day's ISO timestamp bounds, earliest first. */
export function workoutsBetween(ctx: DataContext, from: string, until: string): WorkoutRecord[] {
  return records(ctx, ctx.db.select().from(sessions)
    .where(and(finished, gte(sessions.started_at, from), lt(sessions.started_at, until)))
    .orderBy(asc(sessions.started_at)).all());
}

/** Most recently used programs first, each listed once. */
export function recentProgramIds(ctx: DataContext): string[] {
  const rows = ctx.db.select({ id: sessions.program_id }).from(sessions)
    .where(finished).orderBy(desc(sessions.started_at)).all();
  return [...new Set(rows.flatMap(({ id }) => id ?? []))];
}

/** The workouts of one pass through a program, oldest first. */
export function workoutsOfCycle(ctx: DataContext, programId: string, cycle: number): WorkoutRecord[] {
  return records(
    ctx,
    ctx.db
      .select()
      .from(sessions)
      .where(and(finished, eq(sessions.program_id, programId), eq(sessions.cycle_number, cycle)))
      .orderBy(asc(sessions.started_at))
      .all(),
  );
}

/** The workouts started after a moment (an ISO time), oldest first. */
export function workoutsSince(ctx: DataContext, since: string): WorkoutRecord[] {
  return records(
    ctx,
    ctx.db
      .select()
      .from(sessions)
      .where(and(finished, gt(sessions.started_at, since)))
      .orderBy(asc(sessions.started_at))
      .all(),
  );
}

/** How an exercise went over time: per workout, the top weight and the best estimated maximum. */
export function exerciseProgress(
  ctx: DataContext,
  exerciseId: string,
): { date: string; weight_kg: number; e1rm: number }[] {
  const rows = ctx.db
    .select({ started_at: sessions.started_at, weight_kg: set_logs.weight_kg, reps: set_logs.reps })
    .from(set_logs)
    .innerJoin(session_exercises, eq(session_exercises.id, set_logs.session_exercise_id))
    .innerJoin(sessions, eq(sessions.id, session_exercises.session_id))
    .where(and(
      finished, eq(session_exercises.exercise_id, exerciseId), isNull(session_exercises.deleted_at),
      isNull(set_logs.deleted_at), eq(set_logs.is_warmup, false),
    ))
    .orderBy(asc(sessions.started_at))
    .all();

  const byWorkout = new Map<string, { date: string; weight_kg: number; e1rm: number }>();
  for (const row of rows) {
    if (row.weight_kg === null || row.reps === null || row.reps === 0) continue;
    const point = byWorkout.get(row.started_at) ?? { date: row.started_at, weight_kg: 0, e1rm: 0 };
    point.weight_kg = Math.max(point.weight_kg, row.weight_kg);
    point.e1rm = Math.max(point.e1rm, epley(row.weight_kg, row.reps));
    byWorkout.set(row.started_at, point);
  }
  return [...byWorkout.values()];
}

/** Ids of exercises that have at least one weighted set in a finished workout. */
export function exercisesWithProgress(ctx: DataContext): string[] {
  const rows = ctx.db
    .selectDistinct({ id: session_exercises.exercise_id })
    .from(set_logs)
    .innerJoin(session_exercises, eq(session_exercises.id, set_logs.session_exercise_id))
    .innerJoin(sessions, eq(sessions.id, session_exercises.session_id))
    .where(and(finished, isNull(set_logs.deleted_at), gt(set_logs.weight_kg, 0)))
    .all();
  return rows.map((row) => row.id);
}

/** Only exercises with a saved set in a finished workout appear in progress. */
export function performedExerciseIds(ctx: DataContext): string[] {
  const rows = ctx.db
    .selectDistinct({ id: session_exercises.exercise_id })
    .from(set_logs)
    .innerJoin(session_exercises, eq(session_exercises.id, set_logs.session_exercise_id))
    .innerJoin(sessions, eq(sessions.id, session_exercises.session_id))
    .where(and(finished, isNull(session_exercises.deleted_at), isNull(set_logs.deleted_at)))
    .all();
  return rows.map(({ id }) => id);
}

/** The repetitions of a bodyweight exercise, summed across working sets per workout. */
export function repetitionProgress(ctx: DataContext, exerciseId: string) {
  const rows = ctx.db
    .select({ date: sessions.started_at, reps: set_logs.reps })
    .from(set_logs)
    .innerJoin(session_exercises, eq(session_exercises.id, set_logs.session_exercise_id))
    .innerJoin(sessions, eq(sessions.id, session_exercises.session_id))
    .where(and(
      finished, eq(session_exercises.exercise_id, exerciseId), isNull(session_exercises.deleted_at),
      isNull(set_logs.deleted_at), eq(set_logs.is_warmup, false), gt(set_logs.reps, 0),
    ))
    .orderBy(asc(sessions.started_at))
    .all();
  const totals = new Map<string, number>();
  for (const { date, reps } of rows) totals.set(date, (totals.get(date) ?? 0) + (reps ?? 0));
  return [...totals].map(([date, reps]) => ({ date, reps }));
}

/** How a cardio exercise went over time: per workout, the distance and the time of its sets. */
export function cardioProgress(
  ctx: DataContext,
  exerciseId: string,
): { date: string; distance_m: number; duration_sec: number }[] {
  const rows = ctx.db
    .select({
      started_at: sessions.started_at,
      distance_m: set_logs.distance_m,
      duration_sec: set_logs.duration_sec,
    })
    .from(set_logs)
    .innerJoin(session_exercises, eq(session_exercises.id, set_logs.session_exercise_id))
    .innerJoin(sessions, eq(sessions.id, session_exercises.session_id))
    .where(and(
      finished, eq(session_exercises.exercise_id, exerciseId), isNull(session_exercises.deleted_at),
      isNull(set_logs.deleted_at), eq(set_logs.is_warmup, false),
    ))
    .orderBy(asc(sessions.started_at))
    .all();

  const byWorkout = new Map<string, { date: string; distance_m: number; duration_sec: number }>();
  for (const row of rows) {
    const point = byWorkout.get(row.started_at) ?? { date: row.started_at, distance_m: 0, duration_sec: 0 };
    point.distance_m += row.distance_m ?? 0;
    point.duration_sec += row.duration_sec ?? 0;
    byWorkout.set(row.started_at, point);
  }
  return [...byWorkout.values()].filter((point) => point.duration_sec > 0 || point.distance_m > 0);
}

/** Ids of exercises with a set on time and no reps in a finished workout: cardio and holds. */
export function exercisesOnTime(ctx: DataContext): string[] {
  const rows = ctx.db
    .selectDistinct({ id: session_exercises.exercise_id })
    .from(set_logs)
    .innerJoin(session_exercises, eq(session_exercises.id, set_logs.session_exercise_id))
    .innerJoin(sessions, eq(sessions.id, session_exercises.session_id))
    .where(
      and(finished, isNull(set_logs.deleted_at), isNull(set_logs.reps), gt(set_logs.duration_sec, 0)),
    )
    .all();
  return rows.map((row) => row.id);
}

/** The start times of finished workouts, oldest first: what the weekly series is made of. */
export function finishedWorkoutTimes(ctx: DataContext): string[] {
  return ctx.db
    .select({ started_at: sessions.started_at })
    .from(sessions)
    .where(finished)
    .orderBy(asc(sessions.started_at))
    .all()
    .map((row) => row.started_at);
}

export function workoutCalendarDays(ctx: DataContext) {
  const workouts = new Set(finishedWorkoutTimes(ctx).map((time) => toLocalDate(new Date(time))));
  const activities = activityStartTimes(ctx).map((time) => toLocalDate(new Date(time)));
  return { workouts, recorded: new Set([...workouts, ...activities]) };
}

export function recordedWorkoutDays(ctx: DataContext): Set<string> {
  return workoutCalendarDays(ctx).recorded;
}
