import { z } from 'zod';

/** Rows of workouts and progress. Like programs, they are created on the phone and synced. */
const syncFields = {
  id: z.uuid(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  deleted_at: z.iso.datetime().nullable(),
};

const weight = z.number().min(0).max(2000);
const count = z.number().int().min(0);

export const SESSION_STATUSES = ['active', 'finished', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SessionRowSchema = z.object({
  ...syncFields,
  program_id: z.uuid(),
  program_day_id: z.uuid(),
  /** Which pass through the program this workout belongs to. */
  cycle_number: z.number().int().min(1),
  status: z.enum(SESSION_STATUSES),
  started_at: z.iso.datetime(),
  finished_at: z.iso.datetime().nullable(),
  /** How the user felt, 1–5. */
  wellbeing: z.number().int().min(1).max(5).nullable(),
  notes: z.string().max(2000),
});
export type SessionRow = z.infer<typeof SessionRowSchema>;

export const SessionExerciseRowSchema = z.object({
  ...syncFields,
  session_id: z.uuid(),
  position: count,
  /** The item of the program this exercise was planned by. */
  program_item_id: z.uuid().nullable(),
  exercise_id: z.uuid(),
  /** Set when the planned exercise was replaced for this workout. */
  substituted_from_id: z.uuid().nullable(),
});
export type SessionExerciseRow = z.infer<typeof SessionExerciseRowSchema>;

/** One set. Sets are only added and softly deleted, so they hardly ever conflict in sync. */
export const SetLogRowSchema = z.object({
  ...syncFields,
  session_exercise_id: z.uuid(),
  set_number: z.number().int().min(1),
  is_warmup: z.boolean(),
  planned_weight_kg: weight.nullable(),
  // The planned range, as two numbers.
  planned_rep_min: count.nullable(),
  planned_rep_max: count.nullable(),
  weight_kg: weight.nullable(),
  reps: count.nullable(),
  rir: z.number().int().min(0).max(10).nullable(),
  duration_sec: count.nullable(),
  distance_m: z.number().min(0).nullable(),
  speed_kmh: z.number().min(0).nullable(),
  incline_pct: z.number().nullable(),
  resistance_level: z.number().min(0).nullable(),
  avg_hr: count.nullable(),
  calories: count.nullable(),
  completed_at: z.iso.datetime(),
});
export type SetLogRow = z.infer<typeof SetLogRowSchema>;

/**
 * Why the plan for the next workout is what it is. Stored as a code with parameters; the text
 * is put together on the phone in the user's language.
 */
export const REASON_CODES = [
  /** Every set reached the top of the range: the weight goes up a step. */
  'increase',
  /** The same, with reps to spare in every set: two steps (smart progression). */
  'increase_fast',
  /** Some set is short of the top: the same weight, one more rep in the weakest set. */
  'same',
  /** Half of the sets or more fell below the range, the first time: try the weight again. */
  'retry',
  /** The second such workout in a row: the app offers to take 10% off. */
  'reduce_offer',
  /** The user took the offer. */
  'reduced',
  /** No weight to go by yet: the first workout finds it. */
  'find_weight',
  /** A body-weight exercise progresses in reps. */
  'reps_only',
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/** The plan of an item of a program for the next workout. */
export const ProgressionStateRowSchema = z.object({
  ...syncFields,
  program_item_id: z.uuid(),
  next_weight_kg: weight.nullable(),
  next_target_reps: count,
  /** Workouts in a row that failed the range. */
  fail_streak: count,
  reason_code: z.enum(REASON_CODES),
  reason_params: z.record(z.string(), z.number()),
});
export type ProgressionStateRow = z.infer<typeof ProgressionStateRowSchema>;

/** Where the user is in a program: workouts go round the days, not by the days of the week. */
export const ProgramStateRowSchema = z.object({
  ...syncFields,
  program_id: z.uuid(),
  /** Position of the next day among the regular days of the program. */
  next_day_position: count,
  cycle_number: z.number().int().min(1),
  /** The cycle done as a deload (half the sets, the same weight), if the user agreed to one. */
  deload_cycle: z.number().int().min(1).nullable(),
});
export type ProgramStateRow = z.infer<typeof ProgramStateRowSchema>;
