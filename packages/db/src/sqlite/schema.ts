import type {
  GymEquipmentRow,
  GymProfileRow,
  ProgramDayRow,
  ProgramItemRow,
  ProgramRow,
} from '@mvp/schemas';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

// A table and its sync row must have the same shape, in both directions.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const rowShapesMatch: [
  Same<typeof gym_profiles.$inferSelect, GymProfileRow>,
  Same<typeof gym_equipment.$inferSelect, GymEquipmentRow>,
  Same<typeof programs.$inferSelect, ProgramRow>,
  Same<typeof program_days.$inferSelect, ProgramDayRow>,
  Same<typeof program_items.$inferSelect, ProgramItemRow>,
] = [true, true, true, true, true];
