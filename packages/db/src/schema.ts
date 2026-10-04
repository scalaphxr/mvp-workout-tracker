import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
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
