import { catalogSeed } from '@mvp/content';
import {
  catalogVersions,
  createDb,
  type DbHandle,
  equipment,
  exerciseAliases,
  exerciseAlternatives,
  exerciseEquipment,
  exerciseMuscles,
  exercises,
  exerciseTranslations,
  muscles,
} from '@mvp/db';
import type { Catalog, CatalogSeed, Exercise } from '@mvp/schemas';
import { eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';

const ADMIN_TOKEN = 'test-admin-token-123';

let database: DbHandle;
let app: ReturnType<typeof createApp>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const seed = () => clone(catalogSeed);

const importSeed = (body: unknown, token: string | null = ADMIN_TOKEN) =>
  app.request('/v1/admin/catalog/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token !== null && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });

const get = async <T>(path: string) => {
  const response = await app.request(path);
  return { status: response.status, body: (await response.json()) as T };
};

const errorCode = async (response: Response) =>
  ((await response.json()) as { error: { code: string } }).error.code;

const newApp = (adminToken: string | undefined) =>
  createApp({
    db: database.db,
    mailer: { async sendLoginCode() {} },
    jwtSecret: 'test-secret-test-secret-test-secret',
    adminToken,
    now: () => new Date('2026-10-04T10:00:00Z'),
  });

beforeAll(async () => {
  database = await createDb('pglite://memory');
  await database.migrate();
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  // Child tables go with their exercises (cascade).
  await database.db.delete(catalogVersions);
  await database.db.delete(exercises);
  await database.db.delete(equipment);
  await database.db.delete(muscles);
  app = newApp(ADMIN_TOKEN);
});

describe('catalog import', () => {
  it('is closed without the admin token, with a wrong one, and when no token is configured', async () => {
    for (const token of [null, 'wrong-token', '']) {
      const response = await importSeed(seed(), token);
      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe('forbidden');
    }

    app = newApp(undefined);
    expect((await importSeed(seed(), 'undefined')).status).toBe(403);
    expect((await importSeed(seed(), '')).status).toBe(403);

    expect(await database.db.select().from(catalogVersions)).toHaveLength(0);
  });

  it('loads the seed of packages/content into the tables and makes it version 1', async () => {
    const response = await importSeed(seed());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: 1, changed: true });

    const count = async (table: PgTable) => (await database.db.select().from(table)).length;
    expect(await count(equipment)).toBe(catalogSeed.equipment.length);
    expect(await count(muscles)).toBe(catalogSeed.muscles.length);
    expect(await count(exercises)).toBe(catalogSeed.exercises.length);
    expect(await count(exerciseTranslations)).toBe(catalogSeed.exercises.length * 2);

    const bench = catalogSeed.exercises.find((e) => e.slug === 'barbell-bench-press')!;
    const requirements = await database.db
      .select({ code: equipment.code })
      .from(exerciseEquipment)
      .innerJoin(equipment, eq(equipment.id, exerciseEquipment.equipmentId))
      .where(eq(exerciseEquipment.exerciseId, bench.id));
    expect(requirements.map((row) => row.code).sort()).toEqual(['barbell', 'flat_bench', 'rack']);

    const worked = await database.db
      .select({ code: muscles.code, role: exerciseMuscles.role })
      .from(exerciseMuscles)
      .innerJoin(muscles, eq(muscles.id, exerciseMuscles.muscleId))
      .where(eq(exerciseMuscles.exerciseId, bench.id));
    expect(worked).toContainEqual({ code: 'chest', role: 'primary' });
    expect(worked).toContainEqual({ code: 'triceps', role: 'secondary' });

    const alternatives = await database.db
      .select({ slug: exercises.slug, ratio: exerciseAlternatives.weightRatio })
      .from(exerciseAlternatives)
      .innerJoin(exercises, eq(exercises.id, exerciseAlternatives.altExerciseId))
      .where(eq(exerciseAlternatives.exerciseId, bench.id));
    expect(alternatives).toContainEqual({ slug: 'dumbbell-bench-press', ratio: 0.4 });

    const aliases = await database.db
      .select({ alias: exerciseAliases.alias })
      .from(exerciseAliases)
      .where(eq(exerciseAliases.exerciseId, bench.id));
    expect(aliases.map((row) => row.alias)).toContain('жим лёжа');
  });

  it('does not raise the version when the same seed is imported again', async () => {
    await importSeed(seed());
    const again = await importSeed(seed());

    expect(await again.json()).toEqual({ version: 1, changed: false });
    expect(await database.db.select().from(catalogVersions)).toHaveLength(1);
  });

  it('raises the version and updates the data when the seed changes', async () => {
    await importSeed(seed());

    const changed = seed();
    const bench = changed.exercises.find((e) => e.slug === 'barbell-bench-press')!;
    bench.translations.en.name = 'Bench press with a barbell';
    bench.equipment = ['barbell', 'flat_bench'];
    const response = await importSeed(changed);
    expect(await response.json()).toEqual({ version: 2, changed: true });

    const { body } = await get<{ exercise: Exercise }>(`/v1/exercises/${bench.id}`);
    expect(body.exercise.translations.en.name).toBe('Bench press with a barbell');
    expect(
      await database.db.select().from(exerciseEquipment).where(eq(exerciseEquipment.exerciseId, bench.id)),
    ).toHaveLength(2);
    expect(await database.db.select().from(exercises)).toHaveLength(catalogSeed.exercises.length);
  });

  it('hides an exercise removed from the seed but keeps its row, and restores it on return', async () => {
    await importSeed(seed());

    const without = seed();
    const removed = without.exercises.find((e) => e.slug === 'plank')!;
    without.exercises = without.exercises.filter((e) => e !== removed);
    await importSeed(without);

    expect((await get(`/v1/exercises/${removed.id}`)).status).toBe(404);
    const [row] = await database.db.select().from(exercises).where(eq(exercises.id, removed.id));
    expect(row?.deletedAt).not.toBeNull();

    await importSeed(seed());
    expect((await get(`/v1/exercises/${removed.id}`)).status).toBe(200);
    const [restored] = await database.db.select().from(exercises).where(eq(exercises.id, removed.id));
    expect(restored?.deletedAt).toBeNull();
  });

  it('rejects a seed with a broken reference and leaves the catalog untouched', async () => {
    await importSeed(seed());

    const broken = seed();
    broken.exercises[0]!.primary_muscles = ['no_such_muscle'];
    const response = await importSeed(broken);

    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe('validation_error');
    expect(json.error.message).toContain('unknown muscle no_such_muscle');
    expect((await get<{ version: number }>('/v1/catalog/version')).body.version).toBe(1);
  });

  it.each([
    ['an unknown level', (s: CatalogSeed) => Object.assign(s.exercises[0]!, { level: 'pro' })],
    ['a missing translation', (s: CatalogSeed) => delete (s.exercises[0]!.translations as Partial<Exercise['translations']>).ru],
    ['an empty exercise list', (s: CatalogSeed) => (s.exercises = [])],
    ['a malformed id', (s: CatalogSeed) => (s.muscles[0]!.id = 'not-a-uuid')],
  ])('rejects a seed that does not match the schema: %s', async (_name, breakIt) => {
    const broken = seed();
    breakIt(broken);
    const response = await importSeed(broken);

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('validation_error');
    expect(await database.db.select().from(catalogVersions)).toHaveLength(0);
  });
});

describe('catalog for clients', () => {
  it('reports version 0 and no catalog before the first import', async () => {
    expect((await get('/v1/catalog/version')).body).toEqual({ version: 0 });
    expect((await get('/v1/catalog')).body).toEqual({ version: 0, catalog: null });
    expect((await get('/v1/exercises')).body).toEqual({ items: [], next_cursor: null });
  });

  it('hands out the whole catalog, and nothing to a client that is up to date', async () => {
    await importSeed(seed());

    const full = await get<{ version: number; catalog: Catalog }>('/v1/catalog');
    expect(full.body.version).toBe(1);
    expect(full.body.catalog).toEqual({ ...catalogSeed, version: 1 });

    expect((await get('/v1/catalog?since=1')).body).toEqual({ version: 1, catalog: null });
    const stale = await get<{ catalog: Catalog | null }>('/v1/catalog?since=0');
    expect(stale.body.catalog?.version).toBe(1);
  });

  it('answers 400 for a malformed since', async () => {
    const response = await app.request('/v1/catalog?since=abc');
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('validation_error');
  });
});

describe('exercise search', () => {
  type List = { items: Exercise[]; next_cursor: string | null };
  const slugs = (list: List) => list.items.map((exercise) => exercise.slug);

  beforeEach(async () => {
    await importSeed(seed());
  });

  it('finds exercises by text in either language', async () => {
    const ru = await get<List>(`/v1/exercises?locale=ru&q=${encodeURIComponent('жим лежа')}`);
    // Two names match; the leg press only has the alias «жим ногами лёжа», so it comes last.
    expect(slugs(ru.body)).toEqual(['dumbbell-bench-press', 'barbell-bench-press', 'leg-press']);

    const en = await get<List>('/v1/exercises?q=bench%20press');
    expect(slugs(en.body)).toContain('barbell-bench-press');
  });

  it('filters by muscle, equipment and level', async () => {
    const calves = await get<List>('/v1/exercises?muscle=calves&limit=100');
    expect(slugs(calves.body)).toContain('standing-calf-raise-machine');
    expect(calves.body.items.every((e) => e.primary_muscles.includes('calves'))).toBe(true);

    const tBar = await get<List>('/v1/exercises?equipment=t_bar');
    expect(slugs(tBar.body)).toEqual(['t-bar-row']);

    const both = await get<List>('/v1/exercises?equipment=t_bar,calf_raise_machine&level=beginner');
    expect(slugs(both.body)).toEqual(['standing-calf-raise-machine']);
  });

  it('pages through the results with a cursor, without gaps or repeats', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { body: List } = await get<List>(
        `/v1/exercises?limit=7${cursor ? `&cursor=${cursor}` : ''}`,
      );
      expect(page.body.items.length).toBeLessThanOrEqual(7);
      seen.push(...slugs(page.body));
      cursor = page.body.next_cursor;
    } while (cursor);

    expect(seen).toHaveLength(catalogSeed.exercises.length);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('answers 400 for an unknown level or a limit out of range', async () => {
    for (const query of ['level=pro', 'limit=0', 'limit=1000', 'cursor=-1']) {
      const response = await app.request(`/v1/exercises?${query}`);
      expect(response.status, query).toBe(400);
    }
  });

  it('returns one exercise by id and 404 for an unknown id', async () => {
    const bench = catalogSeed.exercises.find((e) => e.slug === 'barbell-bench-press')!;
    const found = await get<{ exercise: Exercise }>(`/v1/exercises/${bench.id}`);
    expect(found.body.exercise).toEqual(bench);

    const missing = await app.request('/v1/exercises/01a10818-0000-7000-8000-000000000000');
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe('not_found');
  });
});
