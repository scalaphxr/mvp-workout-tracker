import { createHash, timingSafeEqual } from 'node:crypto';

import {
  catalogVersions,
  type Db,
  equipment,
  exerciseAliases,
  exerciseAlternatives,
  exerciseEquipment,
  exerciseMedia,
  exerciseMuscles,
  exercises,
  exerciseTranslations,
  muscles,
} from '@mvp/db';
import { type ExerciseFilters, findCatalogProblems, searchExercises } from '@mvp/domain';
import type { Catalog, CatalogSeed, Exercise, Locale } from '@mvp/schemas';
import { and, desc, eq, inArray, isNull, notInArray, sql } from '@mvp/db';

import { ApiError } from './errors';

export interface CatalogDeps {
  db: Db;
  now: () => Date;
  /** Secret of the admin endpoints; without it they are closed. */
  adminToken?: string;
}

const LOCALES: readonly Locale[] = ['ru', 'en'];

export function requireAdmin(deps: CatalogDeps, authorization: string | undefined) {
  const expected = Buffer.from(`Bearer ${deps.adminToken ?? ''}`);
  const given = Buffer.from(authorization ?? '');
  const allowed =
    deps.adminToken !== undefined &&
    given.length === expected.length &&
    timingSafeEqual(given, expected);
  if (!allowed) throw new ApiError(403, 'forbidden', 'An admin token is required');
}

export function createCatalogService(deps: CatalogDeps) {
  const { db } = deps;
  // The catalog changes only on import, so the parsed snapshot is kept between requests.
  let cached: { hash: string; catalog: Catalog } | undefined;

  async function latest(): Promise<Catalog | null> {
    const [head] = await db
      .select({ version: catalogVersions.version, contentHash: catalogVersions.contentHash })
      .from(catalogVersions)
      .orderBy(desc(catalogVersions.version))
      .limit(1);
    if (!head) return null;

    if (cached?.hash !== head.contentHash || cached.catalog.version !== head.version) {
      const [row] = await db
        .select({ snapshot: catalogVersions.snapshot })
        .from(catalogVersions)
        .where(eq(catalogVersions.version, head.version));
      if (!row) return null;
      cached = { hash: head.contentHash, catalog: row.snapshot as Catalog };
    }
    return cached.catalog;
  }

  return {
    /** Exercises of the current catalog. */
    async exercises(): Promise<readonly Exercise[]> {
      return (await latest())?.exercises ?? [];
    },

    async version(): Promise<number> {
      return (await latest())?.version ?? 0;
    },

    /** The whole catalog, or `null` when the client is already at the current version. */
    async since(clientVersion: number | undefined) {
      const catalog = await latest();
      const version = catalog?.version ?? 0;
      return { version, catalog: clientVersion === version ? null : catalog };
    },

    async search(filters: ExerciseFilters, locale: Locale, offset: number, limit: number) {
      const found = searchExercises((await latest())?.exercises ?? [], filters, locale);
      const next = offset + limit;
      return {
        items: found.slice(offset, next),
        next_cursor: next < found.length ? String(next) : null,
      };
    },

    async exercise(id: string): Promise<Exercise> {
      const exercise = (await latest())?.exercises.find((item) => item.id === id);
      if (!exercise) throw new ApiError(404, 'not_found', 'No such exercise');
      return exercise;
    },

    /**
     * Replaces the catalog with the seed and raises the catalog version. Importing the same
     * seed twice changes nothing.
     */
    async import(seed: CatalogSeed): Promise<{ version: number; changed: boolean }> {
      const problems = findCatalogProblems(seed);
      if (problems.length > 0) {
        throw new ApiError(400, 'validation_error', problems.join('\n'));
      }
      const contentHash = createHash('sha256').update(JSON.stringify(seed)).digest('hex');
      const now = deps.now();

      return db.transaction(async (tx) => {
        const [head] = await tx
          .select({ version: catalogVersions.version, contentHash: catalogVersions.contentHash })
          .from(catalogVersions)
          .orderBy(desc(catalogVersions.version))
          .limit(1);
        if (head?.contentHash === contentHash) return { version: head.version, changed: false };

        const excluded = (column: { name: string }) => sql.raw(`excluded."${column.name}"`);

        await tx
          .insert(equipment)
          .values(
            seed.equipment.map((item) => ({
              id: item.id,
              code: item.code,
              nameRu: item.name.ru,
              nameEn: item.name.en,
              category: item.category,
              defaultIncrementKg: item.default_increment_kg,
              defaultIncrementLb: item.default_increment_lb,
            })),
          )
          .onConflictDoUpdate({
            target: equipment.id,
            set: {
              code: excluded(equipment.code),
              nameRu: excluded(equipment.nameRu),
              nameEn: excluded(equipment.nameEn),
              category: excluded(equipment.category),
              defaultIncrementKg: excluded(equipment.defaultIncrementKg),
              defaultIncrementLb: excluded(equipment.defaultIncrementLb),
            },
          });

        await tx
          .insert(muscles)
          .values(
            seed.muscles.map((muscle) => ({
              id: muscle.id,
              code: muscle.code,
              nameRu: muscle.name.ru,
              nameEn: muscle.name.en,
              svgRegion: muscle.svg_region,
              svgSide: muscle.svg_side,
            })),
          )
          .onConflictDoUpdate({
            target: muscles.id,
            set: {
              code: excluded(muscles.code),
              nameRu: excluded(muscles.nameRu),
              nameEn: excluded(muscles.nameEn),
              svgRegion: excluded(muscles.svgRegion),
              svgSide: excluded(muscles.svgSide),
            },
          });

        await tx
          .insert(exercises)
          .values(
            seed.exercises.map((exercise) => ({
              id: exercise.id,
              slug: exercise.slug,
              kind: exercise.kind,
              tracking: exercise.tracking,
              movementPattern: exercise.movement_pattern,
              mechanics: exercise.mechanics,
              level: exercise.level,
              isUnilateral: exercise.is_unilateral,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .onConflictDoUpdate({
            target: exercises.id,
            set: {
              slug: excluded(exercises.slug),
              kind: excluded(exercises.kind),
              tracking: excluded(exercises.tracking),
              movementPattern: excluded(exercises.movementPattern),
              mechanics: excluded(exercises.mechanics),
              level: excluded(exercises.level),
              isUnilateral: excluded(exercises.isUnilateral),
              updatedAt: now,
              deletedAt: null,
            },
          });

        // Programs may still point at an exercise that left the catalog: hide it, keep the row.
        const seedIds = seed.exercises.map((exercise) => exercise.id);
        await tx
          .update(exercises)
          .set({ deletedAt: now, updatedAt: now })
          .where(
            and(
              isNull(exercises.ownerId),
              isNull(exercises.deletedAt),
              notInArray(exercises.id, seedIds),
            ),
          );

        // Everything that hangs off a catalog exercise is rewritten from the seed.
        const catalogExercises = tx
          .select({ id: exercises.id })
          .from(exercises)
          .where(isNull(exercises.ownerId));
        for (const table of [
          exerciseTranslations,
          exerciseMuscles,
          exerciseEquipment,
          exerciseMedia,
          exerciseAlternatives,
          exerciseAliases,
        ]) {
          await tx.delete(table).where(inArray(table.exerciseId, catalogExercises));
        }

        const muscleIds = new Map(seed.muscles.map((muscle) => [muscle.code, muscle.id]));
        const equipmentIds = new Map(seed.equipment.map((item) => [item.code, item.id]));
        const exerciseIds = new Map(seed.exercises.map((exercise) => [exercise.slug, exercise.id]));
        // `findCatalogProblems` has already proved that every reference resolves.
        const idOf = (ids: Map<string, string>, key: string) => ids.get(key) as string;

        await tx.insert(exerciseTranslations).values(
          seed.exercises.flatMap((exercise) =>
            LOCALES.map((locale) => ({
              exerciseId: exercise.id,
              locale,
              name: exercise.translations[locale].name,
              description: exercise.translations[locale].description,
              techniqueSteps: exercise.translations[locale].technique_steps,
              commonMistakes: exercise.translations[locale].common_mistakes,
              warnings: exercise.translations[locale].warnings,
            })),
          ),
        );
        await tx.insert(exerciseMuscles).values(
          seed.exercises.flatMap((exercise) => [
            ...exercise.primary_muscles.map((code) => ({
              exerciseId: exercise.id,
              muscleId: idOf(muscleIds, code),
              role: 'primary' as const,
            })),
            ...exercise.secondary_muscles.map((code) => ({
              exerciseId: exercise.id,
              muscleId: idOf(muscleIds, code),
              role: 'secondary' as const,
            })),
          ]),
        );

        // The lists below may be empty, and an insert of zero rows is an error.
        const aliases = seed.exercises.flatMap((exercise) =>
          LOCALES.flatMap((locale) =>
            [...new Set(exercise.translations[locale].aliases)].map((alias) => ({
              exerciseId: exercise.id,
              locale,
              alias,
            })),
          ),
        );
        if (aliases.length > 0) await tx.insert(exerciseAliases).values(aliases);

        const requirements = seed.exercises.flatMap((exercise) =>
          [...new Set(exercise.equipment)].map((code) => ({
            exerciseId: exercise.id,
            equipmentId: idOf(equipmentIds, code),
          })),
        );
        if (requirements.length > 0) await tx.insert(exerciseEquipment).values(requirements);

        const media = seed.exercises.flatMap((exercise) =>
          exercise.media.map((item) => ({
            exerciseId: exercise.id,
            provider: item.provider,
            videoId: item.video_id,
            startSec: item.start_sec,
            lang: item.lang,
          })),
        );
        if (media.length > 0) await tx.insert(exerciseMedia).values(media);

        const alternatives = seed.exercises.flatMap((exercise) =>
          exercise.alternatives.map((alternative) => ({
            exerciseId: exercise.id,
            altExerciseId: idOf(exerciseIds, alternative.slug),
            weightRatio: alternative.weight_ratio,
            priority: alternative.priority,
          })),
        );
        if (alternatives.length > 0) await tx.insert(exerciseAlternatives).values(alternatives);

        const version = (head?.version ?? 0) + 1;
        const snapshot: Catalog = { ...seed, version };
        await tx.insert(catalogVersions).values({ version, contentHash, snapshot, createdAt: now });
        return { version, changed: true };
      });
    },
  };
}
