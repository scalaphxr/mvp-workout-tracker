import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  ne,
  program_days,
  program_items,
  program_state,
  progression_state,
  session_exercises,
  sessions,
  set_logs,
} from '@mvp/db/sqlite';
import {
  acceptReduction,
  advancePointer,
  type CardioRecord,
  deloadSets,
  type ExerciseResult,
  findCardioRecords,
  findRecords,
  planNext,
  type RecordKind,
  shouldOfferDeload,
  volumeKg,
} from '@mvp/domain';
import {
  type ProgramDayRow,
  type ProgramItemRow,
  type ProgramStateRow,
  type ProgressionStateRow,
  ProgressionStateRowSchema,
  type SessionExerciseRow,
  type SessionRow,
  SessionRowSchema,
  type SetLogRow,
  SetLogRowSchema,
} from '@mvp/schemas';

import { type DataContext, fresh } from './context';
import { replaceExercise } from './programs';

// --- Where the user is in a program ---

/** The pointer of a program; a program never trained by starts at its first day. */
export function getProgramState(ctx: DataContext, programId: string): ProgramStateRow {
  const stored = ctx.db
    .select()
    .from(program_state)
    .where(and(eq(program_state.program_id, programId), isNull(program_state.deleted_at)))
    .get();
  if (stored) return stored;
  const now = ctx.now();
  return {
    // One pointer per program on every device: it takes the id of the program.
    id: programId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    program_id: programId,
    next_day_position: 0,
    cycle_number: 1,
    deload_cycle: null,
  };
}

function saveProgramState(ctx: DataContext, state: ProgramStateRow) {
  const row = { ...state, updated_at: ctx.now() };
  ctx.db
    .insert(program_state)
    .values(row)
    .onConflictDoUpdate({ target: program_state.id, set: row })
    .run();
}

const regularDays = (ctx: DataContext, programId: string) =>
  ctx.db
    .select()
    .from(program_days)
    .where(
      and(
        eq(program_days.program_id, programId),
        eq(program_days.kind, 'regular'),
        isNull(program_days.deleted_at),
      ),
    )
    .orderBy(asc(program_days.position))
    .all();

const itemsOfDay = (ctx: DataContext, dayId: string) =>
  ctx.db
    .select()
    .from(program_items)
    .where(and(eq(program_items.program_day_id, dayId), isNull(program_items.deleted_at)))
    .orderBy(asc(program_items.position))
    .all();

/** The workout that is next in the round of a program, and the other days to pick from. */
export function nextWorkout(
  ctx: DataContext,
  programId: string,
): { day: ProgramDayRow; days: ProgramDayRow[]; cycle: number; deload: boolean } | null {
  const days = regularDays(ctx, programId);
  const state = getProgramState(ctx, programId);
  // Days may have been removed since the pointer was set.
  const day = days[state.next_day_position] ?? days[0];
  if (!day) return null;
  return {
    day,
    days,
    cycle: state.cycle_number,
    deload: state.deload_cycle === state.cycle_number,
  };
}

// --- A workout ---

/** The workout in progress: there is at most one. */
export function activeSession(ctx: DataContext): SessionRow | null {
  return (
    ctx.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.status, 'active'), isNull(sessions.deleted_at)))
      .orderBy(desc(sessions.started_at))
      .get() ?? null
  );
}

/**
 * Starts a workout of a day: its exercises, then the "every workout" block of the program.
 * If a workout is already in progress, that one is returned instead.
 */
export function startSession(ctx: DataContext, programId: string, dayId: string): SessionRow {
  const running = activeSession(ctx);
  if (running) return running;

  return ctx.db.transaction((tx) => {
    const inTx = { ...ctx, db: tx };
    const now = ctx.now();
    const session = SessionRowSchema.parse({
      ...fresh(ctx),
      program_id: programId,
      program_day_id: dayId,
      cycle_number: getProgramState(inTx, programId).cycle_number,
      status: 'active',
      started_at: now,
      finished_at: null,
      wellbeing: null,
      notes: '',
    });
    tx.insert(sessions).values(session).run();

    const block = tx
      .select()
      .from(program_days)
      .where(
        and(
          eq(program_days.program_id, programId),
          eq(program_days.kind, 'every_session'),
          isNull(program_days.deleted_at),
        ),
      )
      .get();
    const items = [...itemsOfDay(inTx, dayId), ...(block ? itemsOfDay(inTx, block.id) : [])];
    items.forEach((item, position) => {
      tx.insert(session_exercises)
        .values({
          ...fresh(ctx),
          session_id: session.id,
          position,
          program_item_id: item.id,
          exercise_id: item.exercise_id,
          substituted_from_id: null,
        })
        .run();
    });
    return session;
  });
}

export interface SessionExerciseView {
  exercise: SessionExerciseRow;
  /** The item of the program the exercise was planned by, if it still exists. */
  item: ProgramItemRow | null;
  /** The plan the last workout left for this item. */
  plan: ProgressionStateRow | null;
  /** Sets done so far, in order. */
  sets: SetLogRow[];
  /** How many work sets are planned: half of them in a deload week. */
  plannedSets: number;
}

export interface SessionView {
  session: SessionRow;
  /** The cycle is a deload: half the sets, the same weights, no change of plans. */
  deload: boolean;
  exercises: SessionExerciseView[];
}

const setsOf = (ctx: DataContext, sessionExerciseIds: string[]) =>
  sessionExerciseIds.length === 0
    ? []
    : ctx.db
        .select()
        .from(set_logs)
        .where(
          and(inArray(set_logs.session_exercise_id, sessionExerciseIds), isNull(set_logs.deleted_at)),
        )
        .orderBy(asc(set_logs.set_number))
        .all();

export function getSession(ctx: DataContext, sessionId: string): SessionView | null {
  const session = ctx.db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), isNull(sessions.deleted_at)))
    .get();
  if (!session) return null;

  const exercises = ctx.db
    .select()
    .from(session_exercises)
    .where(and(eq(session_exercises.session_id, sessionId), isNull(session_exercises.deleted_at)))
    .orderBy(asc(session_exercises.position))
    .all();
  const itemIds = exercises.flatMap((exercise) => exercise.program_item_id ?? []);
  const items =
    itemIds.length === 0
      ? []
      : ctx.db.select().from(program_items).where(inArray(program_items.id, itemIds)).all();
  const plans =
    itemIds.length === 0
      ? []
      : ctx.db
          .select()
          .from(progression_state)
          .where(
            and(
              inArray(progression_state.program_item_id, itemIds),
              isNull(progression_state.deleted_at),
            ),
          )
          .all();
  const sets = setsOf(
    ctx,
    exercises.map((exercise) => exercise.id),
  );
  const deload = getProgramState(ctx, session.program_id).deload_cycle === session.cycle_number;

  return {
    session,
    deload,
    exercises: exercises.map((exercise) => {
      const item = items.find((candidate) => candidate.id === exercise.program_item_id) ?? null;
      return {
        exercise,
        item,
        plan: plans.find((plan) => plan.program_item_id === exercise.program_item_id) ?? null,
        sets: sets.filter((set) => set.session_exercise_id === exercise.id),
        plannedSets: item ? (deload ? deloadSets(item.sets) : item.sets) : 0,
      };
    }),
  };
}

export type SetValues = Partial<
  Pick<
    SetLogRow,
    | 'planned_weight_kg'
    | 'planned_rep_min'
    | 'planned_rep_max'
    | 'weight_kg'
    | 'reps'
    | 'rir'
    | 'duration_sec'
    | 'distance_m'
    | 'speed_kmh'
    | 'incline_pct'
    | 'resistance_level'
    | 'avg_hr'
    | 'calories'
  >
>;

/** Saves a set. It is in the database before the screen can show it as done. */
export function logSet(ctx: DataContext, sessionExerciseId: string, values: SetValues): SetLogRow {
  const row = SetLogRowSchema.parse({
    ...fresh(ctx),
    session_exercise_id: sessionExerciseId,
    set_number: setsOf(ctx, [sessionExerciseId]).length + 1,
    is_warmup: false,
    planned_weight_kg: null,
    planned_rep_min: null,
    planned_rep_max: null,
    weight_kg: null,
    reps: null,
    rir: null,
    duration_sec: null,
    distance_m: null,
    speed_kmh: null,
    incline_pct: null,
    resistance_level: null,
    avg_hr: null,
    calories: null,
    completed_at: ctx.now(),
    ...values,
  });
  ctx.db.insert(set_logs).values(row).run();
  return row;
}

/** Takes back the last set of an exercise (a mistap). */
export function removeLastSet(ctx: DataContext, sessionExerciseId: string): void {
  const last = setsOf(ctx, [sessionExerciseId]).at(-1);
  if (!last) return;
  ctx.db
    .update(set_logs)
    .set({ deleted_at: ctx.now(), updated_at: ctx.now() })
    .where(eq(set_logs.id, last.id))
    .run();
}

/**
 * Replaces an exercise of the workout ("the machine is taken"). `permanent` also changes the
 * program; the plan of the item belonged to the old exercise and is dropped.
 */
export function substituteExercise(
  ctx: DataContext,
  sessionExerciseId: string,
  exerciseId: string,
  permanent: boolean,
): void {
  const row = ctx.db
    .select()
    .from(session_exercises)
    .where(eq(session_exercises.id, sessionExerciseId))
    .get();
  if (!row || row.exercise_id === exerciseId) return;

  ctx.db.transaction((tx) => {
    const inTx = { ...ctx, db: tx };
    tx.update(session_exercises)
      .set({
        exercise_id: exerciseId,
        // Replacing a replacement still remembers what the program asked for.
        substituted_from_id: permanent ? null : (row.substituted_from_id ?? row.exercise_id),
        updated_at: ctx.now(),
      })
      .where(eq(session_exercises.id, sessionExerciseId))
      .run();
    if (permanent && row.program_item_id) {
      replaceExercise(inTx, row.program_item_id, exerciseId);
      tx.update(progression_state)
        .set({ deleted_at: ctx.now(), updated_at: ctx.now() })
        .where(eq(progression_state.program_item_id, row.program_item_id))
        .run();
    }
  });
}

// --- History ---

/** Sets of an exercise in finished workouts other than `exceptSessionId`, newest first. */
function earlierSets(ctx: DataContext, exerciseId: string, exceptSessionId: string) {
  return ctx.db
    .select({ set: set_logs, sessionId: sessions.id })
    .from(set_logs)
    .innerJoin(session_exercises, eq(session_exercises.id, set_logs.session_exercise_id))
    .innerJoin(sessions, eq(sessions.id, session_exercises.session_id))
    .where(
      and(
        eq(session_exercises.exercise_id, exerciseId),
        eq(sessions.status, 'finished'),
        ne(sessions.id, exceptSessionId),
        isNull(set_logs.deleted_at),
        isNull(sessions.deleted_at),
      ),
    )
    .orderBy(desc(sessions.started_at), asc(set_logs.set_number))
    .all();
}

export interface SetRecords {
  weight: SummaryExercise['records'];
  cardio: CardioRecord[];
}

/**
 * The records a set is about to set, before it is saved: against every earlier workout and
 * the sets already done in this one. What the screen celebrates right on the set.
 */
export function recordsOfSet(
  ctx: DataContext,
  sessionExerciseId: string,
  values: Partial<Pick<SetLogRow, 'weight_kg' | 'reps' | 'duration_sec' | 'distance_m'>>,
): SetRecords {
  const entry = ctx.db
    .select()
    .from(session_exercises)
    .where(eq(session_exercises.id, sessionExerciseId))
    .get();
  if (!entry) return { weight: [], cardio: [] };
  const earlier = [
    ...earlierSets(ctx, entry.exercise_id, entry.session_id).map((row) => row.set),
    ...setsOf(ctx, [sessionExerciseId]),
  ];
  const set = {
    weight_kg: values.weight_kg ?? null,
    reps: values.reps ?? null,
    duration_sec: values.duration_sec ?? null,
    distance_m: values.distance_m ?? null,
  };
  return { weight: findRecords([set], earlier), cardio: findCardioRecords([set], earlier) };
}

/** What was done in this exercise the last time: "last time: 80 × 12, 11, 10". */
export function lastPerformance(
  ctx: DataContext,
  exerciseId: string,
  exceptSessionId: string,
): SetLogRow[] {
  const sets = earlierSets(ctx, exerciseId, exceptSessionId);
  return sets.filter((row) => row.sessionId === sets[0]?.sessionId).map((row) => row.set);
}

// --- Finishing ---

/** What the catalog and the gym say about an exercise; `null` – the catalog does not know it. */
export type ExerciseFacts = (
  exerciseId: string,
  item: ProgramItemRow,
) => { step_kg: number | null; progresses: boolean } | null;

/**
 * Ends a workout: plans the next one for every exercise done as the program asked, and
 * moves the pointer of the program to the day after this one.
 */
export function finishSession(
  ctx: DataContext,
  sessionId: string,
  facts: ExerciseFacts,
  options: { smart: boolean },
): void {
  const view = getSession(ctx, sessionId);
  if (!view || view.session.status !== 'active') return;
  const { session } = view;

  ctx.db.transaction((tx) => {
    const inTx = { ...ctx, db: tx };
    const now = ctx.now();
    tx.update(sessions)
      .set({ status: 'finished', finished_at: now, updated_at: now })
      .where(eq(sessions.id, sessionId))
      .run();

    for (const { exercise, item, plan, sets } of view.exercises) {
      // A deload week changes no plans; neither does an exercise replaced for one workout.
      if (!item || view.deload || exercise.exercise_id !== item.exercise_id) continue;
      const known = facts(exercise.exercise_id, item);
      if (!known?.progresses) continue;

      const next = planNext({
        sets: item.sets,
        rep_min: item.rep_min,
        rep_max: item.rep_max,
        step_kg: item.increment_kg ?? known.step_kg,
        work_sets: sets.filter((set) => !set.is_warmup),
        fail_streak: plan?.fail_streak ?? 0,
        smart: options.smart,
      });
      if (next) savePlan(inTx, item.id, next, plan);
    }

    const days = regularDays(inTx, session.program_id);
    const position = days.findIndex((day) => day.id === session.program_day_id);
    const state = getProgramState(inTx, session.program_id);
    if (position >= 0) {
      saveProgramState(inTx, {
        ...state,
        ...advancePointer(position, days.length, state.cycle_number),
      });
    }
  });
}

function savePlan(
  ctx: DataContext,
  programItemId: string,
  plan: ReturnType<typeof planNext> & object,
  existing: ProgressionStateRow | null,
) {
  const now = ctx.now();
  const row = ProgressionStateRowSchema.parse({
    // One plan per item on every device: it takes the id of the item.
    id: programItemId,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    deleted_at: null,
    program_item_id: programItemId,
    ...plan,
  });
  ctx.db
    .insert(progression_state)
    .values(row)
    .onConflictDoUpdate({ target: progression_state.id, set: row })
    .run();
}

/** Stops a workout without finishing it: its sets stay in history, plans do not change. */
export function abandonSession(ctx: DataContext, sessionId: string): void {
  ctx.db
    .update(sessions)
    .set({ status: 'abandoned', finished_at: ctx.now(), updated_at: ctx.now() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.status, 'active')))
    .run();
}

export function setWellbeing(ctx: DataContext, sessionId: string, wellbeing: number | null): void {
  ctx.db
    .update(sessions)
    .set({ wellbeing, updated_at: ctx.now() })
    .where(eq(sessions.id, sessionId))
    .run();
}

/** The user's answer to an offer to take 10% off: the weight drops only on "yes". */
export function resolveReduction(ctx: DataContext, programItemId: string, accept: boolean): void {
  const plan = ctx.db
    .select()
    .from(progression_state)
    .where(eq(progression_state.program_item_id, programItemId))
    .get();
  if (!plan || plan.reason_code !== 'reduce_offer') return;
  // Declined: the weight stays, and the next failed workout brings the offer back.
  const { reduced_weight_kg: _offer, ...params } = plan.reason_params;
  const answered = accept
    ? acceptReduction(plan)
    : { ...plan, reason_code: 'retry' as const, reason_params: params };
  savePlan(
    ctx,
    programItemId,
    {
      next_weight_kg: answered.next_weight_kg,
      next_target_reps: answered.next_target_reps,
      fail_streak: answered.fail_streak,
      reason_code: answered.reason_code,
      reason_params: answered.reason_params,
    },
    plan,
  );
}

/** Makes the coming cycle of a program a deload: half the sets, the same weights. */
export function startDeload(ctx: DataContext, programId: string): void {
  const state = getProgramState(ctx, programId);
  // In the middle of a cycle the deload waits for the next one, so a whole week is lighter.
  const cycle = state.next_day_position === 0 ? state.cycle_number : state.cycle_number + 1;
  saveProgramState(ctx, { ...state, deload_cycle: cycle });
}

// --- Summary ---

export interface SummaryExercise {
  exercise: SessionExerciseRow;
  item: ProgramItemRow | null;
  sets: SetLogRow[];
  records: { kind: RecordKind; weight_kg: number; reps: number }[];
  /** Records of distance and time, for cardio and holds. */
  cardioRecords: CardioRecord[];
  /** The plan for the next workout; `null` – this exercise is not planned automatically. */
  plan: ProgressionStateRow | null;
}

export interface SessionSummary {
  session: SessionRow;
  volumeKg: number;
  durationSec: number;
  exercises: SummaryExercise[];
  /** Half of the exercises of the day have not grown for 3 workouts: time for a lighter week. */
  offerDeload: boolean;
}

const result = (sets: readonly SetLogRow[]): ExerciseResult => ({
  weight_kg: sets.reduce<number | null>(
    (top, set) => (set.weight_kg !== null && set.weight_kg > (top ?? -1) ? set.weight_kg : top),
    null,
  ),
  total_reps: sets.reduce((sum, set) => sum + (set.reps ?? 0), 0),
});

export function sessionSummary(ctx: DataContext, sessionId: string): SessionSummary | null {
  const view = getSession(ctx, sessionId);
  if (!view) return null;
  const { session } = view;

  const exercises = view.exercises.map(({ exercise, item, plan, sets }) => {
    const before = earlierSets(ctx, exercise.exercise_id, sessionId)
      .filter((row) => row.set.completed_at < session.started_at)
      .map((row) => row.set);
    return {
      exercise,
      item,
      sets,
      records: findRecords(sets, before),
      cardioRecords: findCardioRecords(sets, before),
      plan: item && exercise.exercise_id === item.exercise_id ? plan : null,
    };
  });

  // The last workouts of the same day, this one included, oldest first.
  const sameDay = ctx.db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.program_day_id, session.program_day_id),
        eq(sessions.status, 'finished'),
        isNull(sessions.deleted_at),
        lt(sessions.started_at, session.finished_at ?? ctx.now()),
      ),
    )
    .orderBy(desc(sessions.started_at))
    .limit(3)
    .all()
    .reverse();
  const histories = view.exercises
    .filter(({ item, sets }) => item !== null && sets.some((set) => set.weight_kg !== null))
    .map(({ item }) =>
      sameDay.map(({ id }) => {
        const past = getSession(ctx, id)?.exercises.find((entry) => entry.item?.id === item?.id);
        return result(past?.sets ?? []);
      }),
    );
  const state = getProgramState(ctx, session.program_id);

  return {
    session,
    volumeKg: volumeKg(exercises.flatMap((entry) => entry.sets)),
    durationSec: session.finished_at
      ? Math.round((Date.parse(session.finished_at) - Date.parse(session.started_at)) / 1000)
      : 0,
    exercises,
    offerDeload:
      !view.deload &&
      (state.deload_cycle ?? 0) < state.cycle_number &&
      shouldOfferDeload(histories),
  };
}

/** The most recent finished workout. */
export function lastFinishedSession(ctx: DataContext): SessionRow | null {
  return (
    ctx.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.status, 'finished'), isNull(sessions.deleted_at)))
      .orderBy(desc(sessions.started_at))
      .get() ?? null
  );
}
