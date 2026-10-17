import { z } from 'zod';

import { LevelSchema } from './catalog';
import {
  type ActivityLogRow,
  ActivityLogRowSchema,
  type BodyLogRow,
  BodyLogRowSchema,
  type IntervalPresetRow,
  IntervalPresetRowSchema,
  type ProgramStateRow,
  ProgramStateRowSchema,
  type ProgressionStateRow,
  ProgressionStateRowSchema,
  type SessionExerciseRow,
  SessionExerciseRowSchema,
  type SessionRow,
  SessionRowSchema,
  type SetLogRow,
  SetLogRowSchema,
} from './workouts';

/**
 * Rows of the user's own data. They are created on the phone (ids are UUID v7), live in its
 * SQLite database in exactly this shape, and reach the server through sync.
 */
const syncFields = {
  id: z.uuid(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  /** Deleting is soft, so that it syncs too. */
  deleted_at: z.iso.datetime().nullable(),
};

const position = z.number().int().nonnegative();
const weightStep = z.number().positive().max(100).nullable();

export const LOCATION_TYPES = ['gym', 'home', 'home_no_equipment', 'outdoor'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const GymProfileRowSchema = z.object({
  ...syncFields,
  name: z.string().trim().min(1).max(80),
  location_type: z.enum(LOCATION_TYPES),
  is_default: z.boolean(),
});
export type GymProfileRow = z.infer<typeof GymProfileRowSchema>;

/** A piece of equipment a gym has. */
export const GymEquipmentRowSchema = z.object({
  ...syncFields,
  gym_profile_id: z.uuid(),
  equipment_id: z.uuid(),
  /** The weight step in this gym; `null` – the default of the equipment. */
  increment_kg: weightStep,
});
export type GymEquipmentRow = z.infer<typeof GymEquipmentRowSchema>;

export const GOALS = ['mass', 'strength', 'cut', 'maintenance', 'endurance', 'fitness'] as const;
export type Goal = (typeof GOALS)[number];

export const PROGRAM_VISIBILITIES = ['private', 'code', 'public'] as const;

export const ProgramRowSchema = z.object({
  ...syncFields,
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000),
  goal: z.enum(GOALS).nullable(),
  level: LevelSchema.nullable(),
  days_per_week: z.number().int().min(1).max(7).nullable(),
  visibility: z.enum(PROGRAM_VISIBILITIES),
  /** The program this one was copied from ("take it" by code). */
  forked_from_id: z.uuid().nullable(),
});
export type ProgramRow = z.infer<typeof ProgramRowSchema>;

/** `every_session` – the block appended to every workout (e.g. abs). */
export const PROGRAM_DAY_KINDS = ['regular', 'every_session'] as const;
export type ProgramDayKind = (typeof PROGRAM_DAY_KINDS)[number];

export const ProgramDayRowSchema = z.object({
  ...syncFields,
  program_id: z.uuid(),
  position,
  title: z.string().trim().min(1).max(80),
  kind: z.enum(PROGRAM_DAY_KINDS),
});
export type ProgramDayRow = z.infer<typeof ProgramDayRowSchema>;

export const ProgramItemRowSchema = z
  .object({
    ...syncFields,
    program_day_id: z.uuid(),
    position,
    exercise_id: z.uuid(),
    sets: z.number().int().min(1).max(20),
    /**
     * The range is always two numbers, never a string. Reps for exercises counted in reps,
     * seconds for timed ones, minutes for cardio.
     */
    rep_min: z.number().int().min(1).max(999),
    rep_max: z.number().int().min(1).max(999),
    rest_sec: z.number().int().min(0).max(3600),
    target_rir: z.number().int().min(0).max(10).nullable(),
    /** Items of a day with the same number are done as a superset. */
    superset_group: z.number().int().positive().nullable(),
    /** The weight step of this item; `null` – the step of the equipment. */
    increment_kg: weightStep,
    notes: z.string().max(1000),
  })
  .refine((item) => item.rep_min <= item.rep_max, {
    path: ['rep_max'],
    message: 'rep_max must not be less than rep_min',
  });
export type ProgramItemRow = z.infer<typeof ProgramItemRowSchema>;

/** A program with everything inside it, as flat lists. */
export const ProgramTreeSchema = z.object({
  program: ProgramRowSchema,
  days: z.array(ProgramDayRowSchema),
  items: z.array(ProgramItemRowSchema),
});
export type ProgramTree = z.infer<typeof ProgramTreeSchema>;

// --- Sync ---

/** Tables the server accepts through sync, parents before children. */
export const SYNC_TABLES = [
  'gym_profiles',
  'gym_equipment',
  'programs',
  'program_days',
  'program_items',
  'program_state',
  'progression_state',
  'sessions',
  'session_exercises',
  'set_logs',
  'body_logs',
  'interval_presets',
  'activity_logs',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export interface SyncRows {
  gym_profiles: GymProfileRow;
  gym_equipment: GymEquipmentRow;
  programs: ProgramRow;
  program_days: ProgramDayRow;
  program_items: ProgramItemRow;
  program_state: ProgramStateRow;
  progression_state: ProgressionStateRow;
  sessions: SessionRow;
  session_exercises: SessionExerciseRow;
  set_logs: SetLogRow;
  body_logs: BodyLogRow;
  interval_presets: IntervalPresetRow;
  activity_logs: ActivityLogRow;
}

export const SYNC_ROW_SCHEMAS = {
  gym_profiles: GymProfileRowSchema,
  gym_equipment: GymEquipmentRowSchema,
  programs: ProgramRowSchema,
  program_days: ProgramDayRowSchema,
  program_items: ProgramItemRowSchema,
  program_state: ProgramStateRowSchema,
  progression_state: ProgressionStateRowSchema,
  sessions: SessionRowSchema,
  session_exercises: SessionExerciseRowSchema,
  set_logs: SetLogRowSchema,
  body_logs: BodyLogRowSchema,
  interval_presets: IntervalPresetRowSchema,
  activity_logs: ActivityLogRowSchema,
} satisfies { [T in SyncTable]: z.ZodType<SyncRows[T]> };

/**
 * One change. Rows are checked one by one on the server (a bad row is rejected, the rest of
 * the batch still goes through), so here a row is only required to carry an id.
 */
export const SyncChangeSchema = z.discriminatedUnion('op', [
  z.object({
    table: z.string(),
    op: z.literal('upsert'),
    row: z.looseObject({ id: z.uuid() }),
  }),
  z.object({
    table: z.string(),
    op: z.literal('delete'),
    id: z.uuid(),
    updated_at: z.iso.datetime(),
  }),
]);
export type SyncChange = z.infer<typeof SyncChangeSchema>;

// POST /v1/sync/push
export const SyncPushRequestSchema = z.object({
  device_id: z.uuid(),
  changes: z.array(SyncChangeSchema).max(1000),
});
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;

export const SYNC_REJECT_CODES = [
  'unknown_table',
  'validation_error',
  /** The row, or the row it belongs to, is someone else's. */
  'forbidden',
  /** The row this one belongs to (or the exercise, the equipment) is not on the server. */
  'missing_parent',
] as const;

export const SyncPushResponseSchema = z.object({
  accepted: z.array(z.uuid()),
  rejected: z.array(z.object({ id: z.uuid(), code: z.enum(SYNC_REJECT_CODES) })),
  cursor: z.string(),
});
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;

// GET /v1/sync/pull?cursor=<cursor>
export const SyncPullQuerySchema = z.object({
  /** The cursor of the previous pull; absent on the first one. */
  cursor: z.string().regex(/^\d+$/).optional(),
});

export const SyncPullResponseSchema = z.object({
  /** Rows that changed on the server since the cursor, oldest change first. */
  changes: z.array(
    z.object({ table: z.enum(SYNC_TABLES), row: z.looseObject({ id: z.uuid() }) }),
  ),
  cursor: z.string(),
  has_more: z.boolean(),
});
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;

// --- Program codes ---

// POST /v1/programs/{id}/share-codes
export const ShareCodeCreateRequestSchema = z.object({
  /** `null` – the code never expires. */
  expires_in_days: z.union([z.literal(7), z.literal(30)]).nullable(),
});
export type ShareCodeCreateRequest = z.infer<typeof ShareCodeCreateRequestSchema>;

export const ShareCodeSchema = z.object({
  /** 8 symbols without the dash. */
  code: z.string(),
  program_id: z.uuid(),
  expires_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
  /** How many times the program was taken by this code. */
  uses_count: z.number().int().nonnegative(),
});
export type ShareCode = z.infer<typeof ShareCodeSchema>;

// GET /v1/programs/{id}/share-codes
export const ShareCodeListResponseSchema = z.object({ codes: z.array(ShareCodeSchema) });
export type ShareCodeListResponse = z.infer<typeof ShareCodeListResponseSchema>;

// GET /v1/share-codes/{code}
export const ShareCodePreviewResponseSchema = z.object({
  tree: ProgramTreeSchema,
  expires_at: z.iso.datetime().nullable(),
});
export type ShareCodePreviewResponse = z.infer<typeof ShareCodePreviewResponseSchema>;

// POST /v1/share-codes/{code}/adopt
export const AdoptRequestSchema = z.object({ gym_profile_id: z.uuid() });
export type AdoptRequest = z.infer<typeof AdoptRequestSchema>;

export const SubstitutionSchema = z.object({
  item_id: z.uuid(),
  from_exercise_id: z.uuid(),
  /** `null` – the gym has no replacement: the exercise stays in the program. */
  to_exercise_id: z.uuid().nullable(),
});
export type Substitution = z.infer<typeof SubstitutionSchema>;

export const AdoptResponseSchema = z.object({
  /** The copy that now belongs to the user. */
  tree: ProgramTreeSchema,
  /** Exercises replaced because the user's gym lacks the equipment. */
  substitutions: z.array(SubstitutionSchema),
});
export type AdoptResponse = z.infer<typeof AdoptResponseSchema>;

// --- A program from the questionnaire ---

/** What the questionnaire asks (spec 4.2). */
export const GenerationAnswersSchema = z.object({
  goal: z.enum(GOALS),
  level: LevelSchema,
  /** Workouts a week; `'2-3'` – it varies. */
  frequency: z.union([
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal('2-3'),
  ]),
  duration_min: z.union([
    z.literal(30),
    z.literal(45),
    z.literal(60),
    z.literal(75),
    z.literal(90),
  ]),
  /** Only matters for 3 workouts a week past the beginner level. */
  split: z.enum(['auto', 'full_body', 'chest_back_legs']),
});
export type GenerationAnswers = z.infer<typeof GenerationAnswersSchema>;

// POST /v1/programs/generate
export const GenerateRequestSchema = z.object({
  answers: GenerationAnswersSchema,
  /** Equipment codes of the gym the program is for. */
  equipment: z.array(z.string()).max(200),
});
