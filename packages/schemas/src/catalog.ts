import { z } from 'zod';

import { LocaleSchema } from './auth';

const CodeSchema = z.string().regex(/^[a-z0-9_]+$/);
const SlugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const TextSchema = z.string().trim().min(1);
const localized = <T extends z.ZodType>(schema: T) => z.object({ ru: schema, en: schema });

export const EQUIPMENT_CATEGORIES = [
  'barbells',
  'dumbbells',
  'machines',
  'cables',
  'bodyweight',
  'cardio',
  'other',
] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

export const EquipmentSchema = z.object({
  id: z.uuid(),
  code: CodeSchema,
  category: z.enum(EQUIPMENT_CATEGORIES),
  name: localized(TextSchema),
  /** Default weight step; `null` for equipment that carries no load (a bench, a rack). */
  default_increment_kg: z.number().positive().nullable(),
  default_increment_lb: z.number().positive().nullable(),
});
export type Equipment = z.infer<typeof EquipmentSchema>;

/** Regions of the body map a muscle can be drawn on. */
export const MUSCLE_REGIONS = [
  'abs',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'deltoids',
  'forearm',
  'gluteal',
  'hamstring',
  'lower-back',
  'obliques',
  'quadriceps',
  'trapezius',
  'triceps',
  'upper-back',
] as const;
export type MuscleRegion = (typeof MUSCLE_REGIONS)[number];

export const MuscleSchema = z.object({
  id: z.uuid(),
  code: CodeSchema,
  name: localized(TextSchema),
  svg_region: z.enum(MUSCLE_REGIONS),
  /** Which view of the body map shows the muscle. */
  svg_side: z.enum(['front', 'back', 'both']),
});
export type Muscle = z.infer<typeof MuscleSchema>;

export const EXERCISE_KINDS = ['strength', 'bodyweight', 'cardio', 'timed', 'stretch'] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

export const TRACKING_TYPES = ['weight_reps', 'reps', 'time', 'distance_time'] as const;
export type TrackingType = (typeof TRACKING_TYPES)[number];

export const MOVEMENT_PATTERNS = [
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'squat',
  'hinge',
  'lunge',
  'knee_extension',
  'knee_flexion',
  'hip_extension',
  'hip_abduction',
  'hip_adduction',
  'calf_raise',
  'elbow_flexion',
  'elbow_extension',
  'lateral_raise',
  'rear_delt',
  'shrug',
  'chest_fly',
  'core_flexion',
  'core_stability',
  'core_rotation',
  'spinal_extension',
  'cardio',
  'mobility',
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const MECHANICS = ['compound', 'isolation'] as const;
export type Mechanics = (typeof MECHANICS)[number];

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const LevelSchema = z.enum(LEVELS);
export type Level = (typeof LEVELS)[number];

export const ExerciseTextSchema = z.object({
  name: TextSchema,
  /** Other names people use: for search and for import from text. */
  aliases: z.array(TextSchema),
  description: TextSchema,
  technique_steps: z.array(TextSchema).min(1),
  common_mistakes: z.array(TextSchema),
  warnings: z.array(TextSchema),
});
export type ExerciseText = z.infer<typeof ExerciseTextSchema>;

export const ExerciseMediaSchema = z.object({
  provider: z.literal('youtube'),
  video_id: z.string().regex(/^[\w-]{11}$/),
  start_sec: z.number().int().nonnegative(),
  lang: LocaleSchema,
});
export type ExerciseMedia = z.infer<typeof ExerciseMediaSchema>;

export const ExerciseAlternativeSchema = z.object({
  slug: SlugSchema,
  /** Weight of the alternative = weight of this exercise × ratio; `null` – find the weight anew. */
  weight_ratio: z.number().positive().nullable(),
  /** Points added to the alternative when replacements are ranked. */
  priority: z.number().int().nonnegative(),
});
export type ExerciseAlternative = z.infer<typeof ExerciseAlternativeSchema>;

export const ExerciseSchema = z.object({
  id: z.uuid(),
  slug: SlugSchema,
  kind: z.enum(EXERCISE_KINDS),
  tracking: z.enum(TRACKING_TYPES),
  movement_pattern: z.enum(MOVEMENT_PATTERNS),
  mechanics: z.enum(MECHANICS),
  level: LevelSchema,
  is_unilateral: z.boolean(),
  /** Muscle codes. */
  primary_muscles: z.array(CodeSchema).min(1),
  secondary_muscles: z.array(CodeSchema),
  /** Equipment codes; the exercise needs all of them. */
  equipment: z.array(CodeSchema),
  translations: localized(ExerciseTextSchema),
  media: z.array(ExerciseMediaSchema),
  alternatives: z.array(ExerciseAlternativeSchema),
});
export type Exercise = z.infer<typeof ExerciseSchema>;

/** The seed file of the catalog (`packages/content`) and the body of the admin import. */
export const CatalogSeedSchema = z.object({
  equipment: z.array(EquipmentSchema).min(1),
  muscles: z.array(MuscleSchema).min(1),
  exercises: z.array(ExerciseSchema).min(1),
});
export type CatalogSeed = z.infer<typeof CatalogSeedSchema>;

/** The catalog as the server hands it out and the phone caches it. */
export const CatalogSchema = CatalogSeedSchema.extend({ version: z.number().int().nonnegative() });
export type Catalog = z.infer<typeof CatalogSchema>;

// GET /v1/catalog/version
export const CatalogVersionResponseSchema = z.object({ version: z.number().int().nonnegative() });
export type CatalogVersionResponse = z.infer<typeof CatalogVersionResponseSchema>;

// GET /v1/catalog?since=<version>
export const CatalogQuerySchema = z.object({
  /** The version the client already has. */
  since: z.coerce.number().int().nonnegative().optional(),
});

export const CatalogResponseSchema = z.object({
  version: z.number().int().nonnegative(),
  /** `null` when the client already has this version (or nothing was imported yet). */
  catalog: CatalogSchema.nullable(),
});
export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;

const codeList = z
  .string()
  .transform((value) => value.split(',').filter(Boolean))
  .pipe(z.array(CodeSchema));

// GET /v1/exercises
export const ExerciseSearchQuerySchema = z.object({
  q: z.string().optional(),
  /** Muscle codes, comma separated: the exercise trains any of them as a primary muscle. */
  muscle: codeList.optional(),
  /** Equipment codes, comma separated: the exercise uses any of them. */
  equipment: codeList.optional(),
  level: LevelSchema.optional(),
  /** Language the results are sorted in. */
  locale: LocaleSchema.default('en'),
  cursor: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const ExerciseListResponseSchema = z.object({
  items: z.array(ExerciseSchema),
  next_cursor: z.string().nullable(),
});
export type ExerciseListResponse = z.infer<typeof ExerciseListResponseSchema>;

// GET /v1/exercises/{id}
export const ExerciseResponseSchema = z.object({ exercise: ExerciseSchema });
export type ExerciseResponse = z.infer<typeof ExerciseResponseSchema>;

// POST /v1/admin/catalog/import
export const CatalogImportResponseSchema = z.object({
  version: z.number().int().positive(),
  /** `false` when the same seed was already imported: the version stays. */
  changed: z.boolean(),
});
export type CatalogImportResponse = z.infer<typeof CatalogImportResponseSchema>;
