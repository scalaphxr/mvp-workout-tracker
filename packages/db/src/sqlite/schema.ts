import type {
  GymEquipmentRow,
  GymProfileRow,
  ProgramDayRow,
  ProgramItemRow,
  ProgramRow,
  ProgramStateRow,
  ProgressionStateRow,
  SessionExerciseRow,
  SessionRow,
  SetLogRow,
} from '@mvp/schemas';
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The database on the phone: the source of truth for the user's own data. Properties are
 * named like the columns and timestamps are ISO strings, so a row here is exactly the row
 * that travels through sync (`*RowSchema` in `@mvp/schemas`). There is no owner column:
 * the database belongs to whoever uses the phone.
 */
const sync = {
  id: text('id').primaryKey(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  deleted_at: text('deleted_at'),
};

export const gym_profiles = sqliteTable('gym_profiles', {
  ...sync,
  name: text('name').notNull(),
  location_type: text('location_type', {
    enum: ['gym', 'home', 'home_no_equipment', 'outdoor'],
  }).notNull(),
  is_default: integer('is_default', { mode: 'boolean' }).notNull(),
});

export const gym_equipment = sqliteTable(
  'gym_equipment',
  {
    ...sync,
    gym_profile_id: text('gym_profile_id').notNull(),
    equipment_id: text('equipment_id').notNull(),
    increment_kg: real('increment_kg'),
  },
  (t) => [index('gym_equipment_gym_profile_id_idx').on(t.gym_profile_id)],
);

export const programs = sqliteTable('programs', {
  ...sync,
  title: text('title').notNull(),
  description: text('description').notNull(),
  goal: text('goal', { enum: ['mass', 'strength', 'cut', 'maintenance', 'endurance', 'fitness'] }),
  level: text('level', { enum: ['beginner', 'intermediate', 'advanced'] }),
  days_per_week: integer('days_per_week'),
  visibility: text('visibility', { enum: ['private', 'code', 'public'] }).notNull(),
  forked_from_id: text('forked_from_id'),
});

export const program_days = sqliteTable(
  'program_days',
  {
    ...sync,
    program_id: text('program_id').notNull(),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    kind: text('kind', { enum: ['regular', 'every_session'] }).notNull(),
  },
  (t) => [index('program_days_program_id_idx').on(t.program_id)],
);

export const program_items = sqliteTable(
  'program_items',
  {
    ...sync,
    program_day_id: text('program_day_id').notNull(),
    position: integer('position').notNull(),
    exercise_id: text('exercise_id').notNull(),
    sets: integer('sets').notNull(),
    // The range is two numbers, never a string.
    rep_min: integer('rep_min').notNull(),
    rep_max: integer('rep_max').notNull(),
    rest_sec: integer('rest_sec').notNull(),
    target_rir: integer('target_rir'),
    superset_group: integer('superset_group'),
    increment_kg: real('increment_kg'),
    notes: text('notes').notNull(),
  },
  (t) => [index('program_items_program_day_id_idx').on(t.program_day_id)],
);

export const program_state = sqliteTable('program_state', {
  ...sync,
  program_id: text('program_id').notNull().unique(),
  next_day_position: integer('next_day_position').notNull(),
  cycle_number: integer('cycle_number').notNull(),
  deload_cycle: integer('deload_cycle'),
});

export const progression_state = sqliteTable('progression_state', {
  ...sync,
  program_item_id: text('program_item_id').notNull().unique(),
  next_weight_kg: real('next_weight_kg'),
  next_target_reps: integer('next_target_reps').notNull(),
  fail_streak: integer('fail_streak').notNull(),
  reason_code: text('reason_code', {
    enum: [
      'increase',
      'increase_fast',
      'same',
      'retry',
      'reduce_offer',
      'reduced',
      'find_weight',
      'reps_only',
    ],
  }).notNull(),
  reason_params: text('reason_params', { mode: 'json' }).$type<Record<string, number>>().notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    ...sync,
    program_id: text('program_id').notNull(),
    program_day_id: text('program_day_id').notNull(),
    cycle_number: integer('cycle_number').notNull(),
    status: text('status', { enum: ['active', 'finished', 'abandoned'] }).notNull(),
    started_at: text('started_at').notNull(),
    finished_at: text('finished_at'),
    wellbeing: integer('wellbeing'),
    notes: text('notes').notNull(),
  },
  (t) => [index('sessions_status_idx').on(t.status, t.started_at)],
);

export const session_exercises = sqliteTable(
  'session_exercises',
  {
    ...sync,
    session_id: text('session_id').notNull(),
    position: integer('position').notNull(),
    program_item_id: text('program_item_id'),
    exercise_id: text('exercise_id').notNull(),
    substituted_from_id: text('substituted_from_id'),
  },
  (t) => [
    index('session_exercises_session_id_idx').on(t.session_id),
    index('session_exercises_exercise_id_idx').on(t.exercise_id),
  ],
);

export const set_logs = sqliteTable(
  'set_logs',
  {
    ...sync,
    session_exercise_id: text('session_exercise_id').notNull(),
    set_number: integer('set_number').notNull(),
    is_warmup: integer('is_warmup', { mode: 'boolean' }).notNull(),
    planned_weight_kg: real('planned_weight_kg'),
    planned_rep_min: integer('planned_rep_min'),
    planned_rep_max: integer('planned_rep_max'),
    weight_kg: real('weight_kg'),
    reps: integer('reps'),
    rir: integer('rir'),
    duration_sec: integer('duration_sec'),
    distance_m: real('distance_m'),
    speed_kmh: real('speed_kmh'),
    incline_pct: real('incline_pct'),
    resistance_level: real('resistance_level'),
    avg_hr: integer('avg_hr'),
    calories: integer('calories'),
    completed_at: text('completed_at').notNull(),
  },
  (t) => [index('set_logs_session_exercise_id_idx').on(t.session_exercise_id)],
);

// --- Sync bookkeeping: stays on the phone ---

/**
 * Rows waiting to be sent to the server. Triggers (see the migrations) add a row here on
 * every insert and update of a synced table, so no write can forget to queue itself.
 */
export const outbox = sqliteTable(
  'outbox',
  {
    table_name: text('table_name').notNull(),
    row_id: text('row_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.table_name, t.row_id] })],
);

/** Small facts about sync: the pull cursor, whose data this is, "rows from the server now". */
export const sync_state = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** The synced tables by their name in sync messages. */
export const syncedTables = {
  gym_profiles,
  gym_equipment,
  programs,
  program_days,
  program_items,
  program_state,
  progression_state,
  sessions,
  session_exercises,
  set_logs,
};

// A table and its sync row must have the same shape, in both directions.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const rowShapesMatch: [
  Same<typeof gym_profiles.$inferSelect, GymProfileRow>,
  Same<typeof gym_equipment.$inferSelect, GymEquipmentRow>,
  Same<typeof programs.$inferSelect, ProgramRow>,
  Same<typeof program_days.$inferSelect, ProgramDayRow>,
  Same<typeof program_items.$inferSelect, ProgramItemRow>,
  Same<typeof program_state.$inferSelect, ProgramStateRow>,
  Same<typeof progression_state.$inferSelect, ProgressionStateRow>,
  Same<typeof sessions.$inferSelect, SessionRow>,
  Same<typeof session_exercises.$inferSelect, SessionExerciseRow>,
  Same<typeof set_logs.$inferSelect, SetLogRow>,
] = [true, true, true, true, true, true, true, true, true, true];