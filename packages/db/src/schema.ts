import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/** Fields shared by every table with user data (spec, section 7). Ids are UUID v7. */
const common = {
  id: uuid('id').primaryKey(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  deletedAt: timestamptz('deleted_at'),
};

export const users = pgTable('users', {
  ...common,
  email: text('email').unique(),
  appleSub: text('apple_sub').unique(),
  googleSub: text('google_sub').unique(),
  displayName: text('display_name'),
  locale: text('locale', { enum: ['ru', 'en'] }).notNull().default('en'),
  aiEnabled: boolean('ai_enabled').notNull().default(false),
  units: text('units', { enum: ['kg', 'lb'] }).notNull().default('kg'),
  defaultRestSec: integer('default_rest_sec').notNull().default(120),
  // No foreign key yet: `programs` arrives with stage 2.
  activeProgramId: uuid('active_program_id'),
});

/** One-time login codes sent by email. Only an HMAC of the code is stored. */
export const emailCodes = pgTable(
  'email_codes',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamptz('expires_at').notNull(),
    consumedAt: timestamptz('consumed_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('email_codes_email_created_at_idx').on(t.email, t.createdAt)],
);

/**
 * Refresh tokens with rotation. Every rotation keeps the `familyId`, so reuse
 * of an already rotated token revokes the whole family.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('refresh_tokens_family_id_idx').on(t.familyId)],
);

export type UserRow = typeof users.$inferSelect;

// --- Reference data (spec, section 7 "Справочники") ---
// Loaded by the admin import from the seed files of `packages/content`.

export const equipment = pgTable('equipment', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  nameRu: text('name_ru').notNull(),
  nameEn: text('name_en').notNull(),
  category: text('category').notNull(),
  /** `null` for equipment that carries no load (a bench, a rack). */
  defaultIncrementKg: doublePrecision('default_increment_kg'),
  defaultIncrementLb: doublePrecision('default_increment_lb'),
});

export const muscles = pgTable('muscles', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  nameRu: text('name_ru').notNull(),
  nameEn: text('name_en').notNull(),
  /** Region of the body map and the view (front/back/both) it is drawn on. */
  svgRegion: text('svg_region').notNull(),
  svgSide: text('svg_side', { enum: ['front', 'back', 'both'] }).notNull(),
});

export const exercises = pgTable('exercises', {
  ...common,
  slug: text('slug').notNull().unique(),
  /** `null` – an exercise of the catalog, otherwise a user's own exercise. */
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  tracking: text('tracking').notNull(),
  movementPattern: text('movement_pattern').notNull(),
  mechanics: text('mechanics').notNull(),
  level: text('level').notNull(),
  isUnilateral: boolean('is_unilateral').notNull().default(false),
});

const exerciseId = () =>
  uuid('exercise_id')
    .notNull()
    .references(() => exercises.id, { onDelete: 'cascade' });

export const exerciseTranslations = pgTable(
  'exercise_translations',
  {
    exerciseId: exerciseId(),
    locale: text('locale', { enum: ['ru', 'en'] }).notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    techniqueSteps: jsonb('technique_steps').$type<string[]>().notNull(),
    commonMistakes: jsonb('common_mistakes').$type<string[]>().notNull(),
    warnings: jsonb('warnings').$type<string[]>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.exerciseId, t.locale] })],
);

export const exerciseMuscles = pgTable(
  'exercise_muscles',
  {
    exerciseId: exerciseId(),
    muscleId: uuid('muscle_id')
      .notNull()
      .references(() => muscles.id),
    role: text('role', { enum: ['primary', 'secondary'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.exerciseId, t.muscleId] })],
);

/** An exercise needs every piece of equipment listed for it. */
export const exerciseEquipment = pgTable(
  'exercise_equipment',
  {
    exerciseId: exerciseId(),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id),
  },
  (t) => [primaryKey({ columns: [t.exerciseId, t.equipmentId] })],
);

export const exerciseMedia = pgTable(
  'exercise_media',
  {
    exerciseId: exerciseId(),
    provider: text('provider', { enum: ['youtube'] }).notNull(),
    videoId: text('video_id').notNull(),
    startSec: integer('start_sec').notNull().default(0),
    lang: text('lang', { enum: ['ru', 'en'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.exerciseId, t.provider, t.videoId] })],
);

/** Hand-made links for replacements: weight of the alternative = weight × `weightRatio`. */
export const exerciseAlternatives = pgTable(
  'exercise_alternatives',
  {
    exerciseId: exerciseId(),
    altExerciseId: uuid('alt_exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    weightRatio: doublePrecision('weight_ratio'),
    priority: integer('priority').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.exerciseId, t.altExerciseId] })],
);

/** Other names of an exercise, for search and import from text. */
export const exerciseAliases = pgTable(
  'exercise_aliases',
  {
    exerciseId: exerciseId(),
    locale: text('locale', { enum: ['ru', 'en'] }).notNull(),
    alias: text('alias').notNull(),
  },
  (t) => [primaryKey({ columns: [t.exerciseId, t.locale, t.alias] })],
);

/**
 * Every import that changed the catalog. `snapshot` is the whole catalog exactly as clients
 * receive it; the tables above hold the same data in relational form.
 */
export const catalogVersions = pgTable('catalog_versions', {
  version: integer('version').primaryKey(),
  contentHash: text('content_hash').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

// --- User data (spec, section 7): created on the phone, arrives here through sync ---

/** A trainer and a client. The trainer's cabinet comes later; access checks use it already. */
export const coachClients = pgTable('coach_clients', {
  ...common,
  coachId: uuid('coach_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['invited', 'active', 'ended'] }).notNull(),
});

/** Numbers every write of a synced row; a phone pulls what is above the number it has seen. */
export const syncSequence = pgSequence('sync_seq');

/**
 * Fields of every synced table. The owner is stored on each row, children included, so
 * that access checks and sync pull need no joins.
 */
const synced = (ownerColumn: 'user_id' | 'owner_id') => ({
  ...common,
  ownerId: uuid(ownerColumn)
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  syncSeq: bigint('sync_seq', { mode: 'number' })
    .notNull()
    .default(sql`nextval('sync_seq')`),
});

export const gymProfiles = pgTable(
  'gym_profiles',
  {
    ...synced('user_id'),
    name: text('name').notNull(),
    locationType: text('location_type', {
      enum: ['gym', 'home', 'home_no_equipment', 'outdoor'],
    }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
  },
  (t) => [index('gym_profiles_sync_idx').on(t.ownerId, t.syncSeq)],
);

export const gymEquipment = pgTable(
  'gym_equipment',
  {
    ...synced('owner_id'),
    gymProfileId: uuid('gym_profile_id')
      .notNull()
      .references(() => gymProfiles.id, { onDelete: 'cascade' }),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id),
    /** The weight step in this gym; `null` – the default of the equipment. */
    incrementKg: doublePrecision('increment_kg'),
  },
  (t) => [index('gym_equipment_sync_idx').on(t.ownerId, t.syncSeq)],
);

export const programs = pgTable(
  'programs',
  {
    ...synced('owner_id'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    goal: text('goal', {
      enum: ['mass', 'strength', 'cut', 'maintenance', 'endurance', 'fitness'],
    }),
    level: text('level', { enum: ['beginner', 'intermediate', 'advanced'] }),
    daysPerWeek: integer('days_per_week'),
    visibility: text('visibility', { enum: ['private', 'code', 'public'] })
      .notNull()
      .default('private'),
    // Not a foreign key: the copy outlives the original.
    forkedFromId: uuid('forked_from_id'),
    /** The trainer who assigned the program; such a program gets no auto-progression. */
    assignedById: uuid('assigned_by_id').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [index('programs_sync_idx').on(t.ownerId, t.syncSeq)],
);

export const programDays = pgTable(
  'program_days',
  {
    ...synced('owner_id'),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    kind: text('kind', { enum: ['regular', 'every_session'] }).notNull(),
  },
  (t) => [
    index('program_days_program_id_idx').on(t.programId),
    index('program_days_sync_idx').on(t.ownerId, t.syncSeq),
  ],
);

export const programItems = pgTable(
  'program_items',
  {
    ...synced('owner_id'),
    programDayId: uuid('program_day_id')
      .notNull()
      .references(() => programDays.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id),
    sets: integer('sets').notNull(),
    // The range is two numbers, never a string.
    repMin: integer('rep_min').notNull(),
    repMax: integer('rep_max').notNull(),
    restSec: integer('rest_sec').notNull(),
    targetRir: integer('target_rir'),
    supersetGroup: integer('superset_group'),
    incrementKg: doublePrecision('increment_kg'),
    notes: text('notes').notNull().default(''),
  },
  (t) => [
    index('program_items_program_day_id_idx').on(t.programDayId),
    index('program_items_sync_idx').on(t.ownerId, t.syncSeq),
  ],
);

/** Where the user is in a program: the next day of the round and the number of the round. */
export const programState = pgTable(
  'program_state',
  {
    ...synced('user_id'),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    nextDayPosition: integer('next_day_position').notNull(),
    cycleNumber: integer('cycle_number').notNull(),
    deloadCycle: integer('deload_cycle'),
  },
  (t) => [index('program_state_sync_idx').on(t.ownerId, t.syncSeq)],
);

/** The plan of a program item for the next workout and why it is what it is. */
export const progressionState = pgTable(
  'progression_state',
  {
    ...synced('user_id'),
    programItemId: uuid('program_item_id')
      .notNull()
      .references(() => programItems.id, { onDelete: 'cascade' }),
    nextWeightKg: doublePrecision('next_weight_kg'),
    nextTargetReps: integer('next_target_reps').notNull(),
    failStreak: integer('fail_streak').notNull().default(0),
    reasonCode: text('reason_code').notNull(),
    reasonParams: jsonb('reason_params').$type<Record<string, number>>().notNull(),
  },
  (t) => [index('progression_state_sync_idx').on(t.ownerId, t.syncSeq)],
);

export const sessions = pgTable(
  'sessions',
  {
    ...synced('user_id'),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    programDayId: uuid('program_day_id')
      .notNull()
      .references(() => programDays.id, { onDelete: 'cascade' }),
    cycleNumber: integer('cycle_number').notNull(),
    status: text('status', { enum: ['active', 'finished', 'abandoned'] }).notNull(),
    startedAt: timestamptz('started_at').notNull(),
    finishedAt: timestamptz('finished_at'),
    wellbeing: integer('wellbeing'),
    notes: text('notes').notNull().default(''),
  },
  (t) => [index('sessions_sync_idx').on(t.ownerId, t.syncSeq)],
);

/** An exercise of a workout; `substitutedFromId` records a replacement made for that workout. */
export const sessionExercises = pgTable(
  'session_exercises',
  {
    ...synced('owner_id'),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    // Not a foreign key: the workout outlives the item of the program.
    programItemId: uuid('program_item_id'),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id),
    substitutedFromId: uuid('substituted_from_id').references(() => exercises.id),
  },
  (t) => [index('session_exercises_sync_idx').on(t.ownerId, t.syncSeq)],
);

/** One set. Sets are only added and softly deleted. */
export const setLogs = pgTable(
  'set_logs',
  {
    ...synced('owner_id'),
    sessionExerciseId: uuid('session_exercise_id')
      .notNull()
      .references(() => sessionExercises.id, { onDelete: 'cascade' }),
    setNumber: integer('set_number').notNull(),
    isWarmup: boolean('is_warmup').notNull().default(false),
    plannedWeightKg: doublePrecision('planned_weight_kg'),
    plannedRepMin: integer('planned_rep_min'),
    plannedRepMax: integer('planned_rep_max'),
    weightKg: doublePrecision('weight_kg'),
    reps: integer('reps'),
    rir: integer('rir'),
    durationSec: integer('duration_sec'),
    distanceM: doublePrecision('distance_m'),
    speedKmh: doublePrecision('speed_kmh'),
    inclinePct: doublePrecision('incline_pct'),
    resistanceLevel: doublePrecision('resistance_level'),
    avgHr: integer('avg_hr'),
    calories: integer('calories'),
    completedAt: timestamptz('completed_at').notNull(),
  },
  (t) => [index('set_logs_sync_idx').on(t.ownerId, t.syncSeq)],
);

/** A morning weight, one row per entry; the phone keeps one per calendar day. */
export const bodyLogs = pgTable(
  'body_logs',
  {
    ...synced('user_id'),
    date: date('date', { mode: 'string' }).notNull(),
    weightKg: doublePrecision('weight_kg').notNull(),
    measuredAt: timestamptz('measured_at').notNull(),
  },
  (t) => [index('body_logs_sync_idx').on(t.ownerId, t.syncSeq)],
);

/** The user's own presets of the interval timer. */
export const intervalPresets = pgTable(
  'interval_presets',
  {
    ...synced('user_id'),
    title: text('title').notNull(),
    workSec: integer('work_sec').notNull(),
    restSec: integer('rest_sec').notNull(),
    rounds: integer('rounds').notNull(),
    cycles: integer('cycles').notNull(),
    cycleRestSec: integer('cycle_rest_sec').notNull(),
  },
  (t) => [index('interval_presets_sync_idx').on(t.ownerId, t.syncSeq)],
);

/** Free records of any activity outside the program. */
export const activityLogs = pgTable(
  'activity_logs',
  {
    ...synced('user_id'),
    activityType: text('activity_type').notNull(),
    startedAt: timestamptz('started_at').notNull(),
    durationSec: integer('duration_sec').notNull(),
    intensity: integer('intensity'),
    distanceM: doublePrecision('distance_m'),
    avgHr: integer('avg_hr'),
    calories: integer('calories'),
    notes: text('notes').notNull().default(''),
  },
  (t) => [index('activity_logs_sync_idx').on(t.ownerId, t.syncSeq)],
);

/** Codes a program is shared by. The code is stored without the dash. */
export const programShares = pgTable(
  'program_shares',
  {
    code: text('code').primaryKey(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamptz('expires_at'),
    revokedAt: timestamptz('revoked_at'),
    usesCount: integer('uses_count').notNull().default(0),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('program_shares_program_id_idx').on(t.programId)],
);

/** Every attempt to enter a code: what the limits against guessing count. */
export const shareCodeAttempts = pgTable(
  'share_code_attempts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ip: text('ip').notNull(),
    succeeded: boolean('succeeded').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('share_code_attempts_user_id_idx').on(t.userId, t.createdAt),
    index('share_code_attempts_ip_idx').on(t.ip, t.createdAt),
  ],
);
/** Messages from the support form of the app, with what helps to answer them. */
export const supportMessages = pgTable(
  'support_messages',
  {
    id: uuid('id').primaryKey(),
    /** `null` – sent by a guest. The message goes with the account when it is deleted. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    email: text('email'),
    message: text('message').notNull(),
    appVersion: text('app_version').notNull(),
    device: text('device').notNull(),
    lastSyncAt: timestamptz('last_sync_at'),
    locale: text('locale', { enum: ['ru', 'en'] }).notNull(),
    ip: text('ip').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('support_messages_ip_idx').on(t.ip, t.createdAt)],
);
