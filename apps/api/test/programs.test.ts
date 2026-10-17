import { catalogSeed } from '@mvp/content';
import {
  coachClients,
  createDb,
  type DbHandle,
  gymProfiles,
  programDays,
  programItems,
  programs,
  emailCodes,
  programShares,
  shareCodeAttempts,
  users,
} from '@mvp/db';
import { formatShareCode } from '@mvp/domain';
import type {
  AdoptResponse,
  GymEquipmentRow,
  GymProfileRow,
  ProgramDayRow,
  ProgramItemRow,
  ProgramRow,
  ProgramTree,
  ShareCode,
  SyncChange,
  SyncPushResponse,
} from '@mvp/schemas';
import { eq } from '@mvp/db';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import type { LoginCodeMail } from '../src/mailer';
import { MAX_ATTEMPTS_PER_MINUTE, MAX_FAILURES_PER_HOUR } from '../src/share';
import { pullChanges } from '../src/sync';

const ADMIN_TOKEN = 'test-admin-token-123';

let database: DbHandle;
let app: ReturnType<typeof createApp>;
let sent: LoginCodeMail[];
let now: Date;

const advance = (ms: number) => {
  now = new Date(now.getTime() + ms);
};

interface User {
  id: string;
  token: string;
}

const request = (user: User | null, method: string, path: string, body?: unknown, ip?: string) =>
  app.request(path, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(user && { Authorization: `Bearer ${user.token}` }),
      ...(ip && { 'X-Forwarded-For': ip }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const errorCode = async (response: Response) =>
  ((await response.json()) as { error: { code: string } }).error.code;

async function signIn(email: string): Promise<User> {
  await request(null, 'POST', '/v1/auth/email/start', { email });
  const response = await request(null, 'POST', '/v1/auth/email/verify', {
    email,
    code: sent.at(-1)!.code,
  });
  const session = (await response.json()) as { access_token: string; user: { id: string } };
  return { id: session.user.id, token: session.access_token };
}

const exerciseId = (slug: string) => catalogSeed.exercises.find((e) => e.slug === slug)!.id;
const equipmentId = (code: string) => catalogSeed.equipment.find((e) => e.code === code)!.id;

const stamps = () => ({
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
  deleted_at: null,
});

const gymProfile = (overrides: Partial<GymProfileRow> = {}): GymProfileRow => ({
  id: uuidv7(),
  ...stamps(),
  name: 'My gym',
  location_type: 'gym',
  is_default: true,
  ...overrides,
});

const gymEquipment = (profile: GymProfileRow, codes: string[]): GymEquipmentRow[] =>
  codes.map((code) => ({
    id: uuidv7(),
    ...stamps(),
    gym_profile_id: profile.id,
    equipment_id: equipmentId(code),
    increment_kg: null,
  }));

const program = (overrides: Partial<ProgramRow> = {}): ProgramRow => ({
  id: uuidv7(),
  ...stamps(),
  title: 'Back day',
  description: '',
  goal: 'mass',
  level: null,
  days_per_week: 3,
  visibility: 'private',
  forked_from_id: null,
  ...overrides,
});

const day = (parent: ProgramRow, overrides: Partial<ProgramDayRow> = {}): ProgramDayRow => ({
  id: uuidv7(),
  ...stamps(),
  program_id: parent.id,
  position: 0,
  title: 'Day A',
  kind: 'regular',
  ...overrides,
});

const item = (
  parent: ProgramDayRow,
  slug: string,
  overrides: Partial<ProgramItemRow> = {},
): ProgramItemRow => ({
  id: uuidv7(),
  ...stamps(),
  program_day_id: parent.id,
  position: 0,
  exercise_id: exerciseId(slug),
  sets: 3,
  rep_min: 8,
  rep_max: 10,
  rest_sec: 120,
  target_rir: 1,
  superset_group: null,
  increment_kg: null,
  notes: '',
  ...overrides,
});

const upsert = (table: string, row: { id: string; [key: string]: unknown }): SyncChange => ({
  table,
  op: 'upsert',
  row,
});

async function push(user: User, changes: SyncChange[]) {
  const response = await request(user, 'POST', '/v1/sync/push', {
    device_id: '01a10818-0000-7000-8000-00000000d001',
    changes,
  });
  expect(response.status).toBe(200);
  return (await response.json()) as SyncPushResponse;
}

/** A program "Back day" with a T-bar row and a pull-up, already on the server. */
async function pushedProgram(owner: User) {
  const root = program();
  const first = day(root);
  const row = item(first, 't-bar-row', { increment_kg: 5 });
  const pullUp = item(first, 'pull-up', { position: 1, rep_min: 6, rep_max: 12 });
  const result = await push(owner, [
    upsert('programs', root),
    upsert('program_days', first),
    upsert('program_items', row),
    upsert('program_items', pullUp),
  ]);
  expect(result.rejected).toEqual([]);
  return { root, first, row, pullUp };
}

async function pushedGym(owner: User, codes: string[]) {
  const profile = gymProfile();
  const result = await push(owner, [
    upsert('gym_profiles', profile),
    ...gymEquipment(profile, codes).map((row) => upsert('gym_equipment', row)),
  ]);
  expect(result.rejected).toEqual([]);
  return profile;
}

async function createCode(owner: User, programId: string, expiresInDays: 7 | 30 | null = null) {
  const response = await request(owner, 'POST', `/v1/programs/${programId}/share-codes`, {
    expires_in_days: expiresInDays,
  });
  expect(response.status).toBe(200);
  return (await response.json()) as ShareCode;
}

const ALL_EQUIPMENT = catalogSeed.equipment.map((e) => e.code);

beforeAll(async () => {
  database = await createDb('pglite://memory');
  await database.migrate();
  app = createApp({
    db: database.db,
    mailer: { sendLoginCode: async (mail) => void sent.push(mail) },
    jwtSecret: 'test-secret-test-secret-test-secret',
    adminToken: ADMIN_TOKEN,
    now: () => now,
  });
  sent = [];
  now = new Date('2026-10-04T10:00:00Z');
  const imported = await app.request('/v1/admin/catalog/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify(catalogSeed),
  });
  expect(imported.status).toBe(200);
});

afterAll(async () => {
  await database.close();
});

let anna: User;
let boris: User;

beforeEach(async () => {
  // Everything a user owns goes with the user (cascade); the catalog stays.
  await database.db.delete(users);
  await database.db.delete(emailCodes);
  sent = [];
  now = new Date('2026-10-04T10:00:00Z');
  anna = await signIn('anna@example.com');
  boris = await signIn('boris@example.com');
});

describe('sync push', () => {
  it('needs a signed-in user', async () => {
    const response = await request(null, 'POST', '/v1/sync/push', { device_id: uuidv7(), changes: [] });
    expect(response.status).toBe(401);
  });

  it('stores a gym profile and a program with days and items, owned by the user', async () => {
    const profile = gymProfile();
    const root = program();
    const first = day(root);
    const bench = item(first, 'barbell-bench-press');
    const changes = [
      upsert('gym_profiles', profile),
      ...gymEquipment(profile, ['barbell', 'rack']).map((row) => upsert('gym_equipment', row)),
      upsert('programs', root),
      upsert('program_days', first),
      upsert('program_items', bench),
    ];

    const result = await push(anna, changes);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(changes.length);

    const [storedProgram] = await database.db.select().from(programs);
    expect(storedProgram).toMatchObject({ id: root.id, ownerId: anna.id, title: 'Back day' });
    const [storedItem] = await database.db.select().from(programItems);
    expect(storedItem).toMatchObject({ repMin: 8, repMax: 10, restSec: 120, targetRir: 1 });
    const [storedProfile] = await database.db.select().from(gymProfiles);
    expect(storedProfile).toMatchObject({ ownerId: anna.id, locationType: 'gym', isDefault: true });
  });

  it('changes nothing when the same batch is pushed again', async () => {
    const { root, first } = await pushedProgram(anna);
    const again = await push(anna, [upsert('programs', root), upsert('program_days', first)]);

    expect(again.rejected).toEqual([]);
    expect(await database.db.select().from(programs)).toHaveLength(1);
    expect(await database.db.select().from(programDays)).toHaveLength(1);
  });

  it('lets the later updated_at win and ignores an older copy of a row', async () => {
    const { root } = await pushedProgram(anna);

    advance(60_000);
    await push(anna, [upsert('programs', { ...root, title: 'Newer', updated_at: now.toISOString() })]);
    const stale = await push(anna, [upsert('programs', { ...root, title: 'Older' })]);

    expect(stale.accepted).toEqual([root.id]);
    const [stored] = await database.db.select().from(programs);
    expect(stored!.title).toBe('Newer');
  });

  it('deletes softly, and takes a delete of an unknown row as done', async () => {
    const { row } = await pushedProgram(anna);
    advance(60_000);
    const unknown = uuidv7();

    const result = await push(anna, [
      { table: 'program_items', op: 'delete', id: row.id, updated_at: now.toISOString() },
      { table: 'program_items', op: 'delete', id: unknown, updated_at: now.toISOString() },
    ]);

    expect(result.accepted).toEqual([row.id, unknown]);
    const [stored] = await database.db.select().from(programItems).where(eq(programItems.id, row.id));
    expect(stored!.deletedAt).toEqual(now);
  });

  it('rejects a range of reps that is not two numbers, and keeps the rest of the batch', async () => {
    const { first } = await pushedProgram(anna);
    const asText = { ...item(first, 'pull-up'), rep_min: '8-9' };
    const reversed = item(first, 'pull-up', { rep_min: 12, rep_max: 8 });
    const fine = item(first, 'lat-pulldown', { rep_min: 8, rep_max: 9 });

    const result = await push(anna, [
      upsert('program_items', asText),
      upsert('program_items', reversed),
      upsert('program_items', fine),
    ]);

    expect(result.rejected).toEqual([
      { id: asText.id, code: 'validation_error' },
      { id: reversed.id, code: 'validation_error' },
    ]);
    expect(result.accepted).toEqual([fine.id]);
    const [stored] = await database.db.select().from(programItems).where(eq(programItems.id, fine.id));
    expect([stored!.repMin, stored!.repMax]).toEqual([8, 9]);
  });

  it('rejects a row whose parent, exercise or equipment is not on the server', async () => {
    const { first } = await pushedProgram(anna);
    const orphanDay = day(program());
    const orphanItem = item(day(program()), 'pull-up');
    const unknownExercise = item(first, 'pull-up', { exercise_id: uuidv7() });
    const profile = gymProfile();
    const unknownEquipment = { ...gymEquipment(profile, ['barbell'])[0]!, equipment_id: uuidv7() };

    const result = await push(anna, [
      upsert('program_days', orphanDay),
      upsert('program_items', orphanItem),
      upsert('program_items', unknownExercise),
      upsert('gym_profiles', profile),
      upsert('gym_equipment', unknownEquipment),
    ]);

    expect(result.rejected.map((r) => r.code)).toEqual([
      'missing_parent',
      'missing_parent',
      'missing_parent',
      'missing_parent',
    ]);
    expect(result.accepted).toEqual([profile.id]);
  });

  it('rejects an unknown table', async () => {
    const row = { id: uuidv7() };
    expect((await push(anna, [upsert('users', row)])).rejected).toEqual([
      { id: row.id, code: 'unknown_table' },
    ]);
  });

  it("does not let a user touch another user's data", async () => {
    const { root, first, row } = await pushedProgram(anna);
    advance(60_000);
    const later = now.toISOString();

    const result = await push(boris, [
      upsert('programs', { ...root, title: 'Stolen', updated_at: later }),
      upsert('program_days', day(root, { position: 1 })),
      upsert('program_items', item(first, 'pull-up', { position: 2 })),
      // Moving his own day into her program is the same intrusion.
      { table: 'program_items', op: 'delete', id: row.id, updated_at: later },
    ]);

    expect(result.accepted).toEqual([]);
    expect(result.rejected.map((r) => r.code)).toEqual([
      'forbidden',
      'forbidden',
      'forbidden',
      'forbidden',
    ]);
    const [stored] = await database.db.select().from(programs);
    expect(stored).toMatchObject({ title: 'Back day', ownerId: anna.id });
    expect(await database.db.select().from(programDays)).toHaveLength(1);
  });

  it('does not let a user move their own day into a program of another user', async () => {
    const { root } = await pushedProgram(anna);
    const own = program();
    const ownDay = day(own);
    await push(boris, [upsert('programs', own), upsert('program_days', ownDay)]);
    advance(60_000);

    const result = await push(boris, [
      upsert('program_days', { ...ownDay, program_id: root.id, updated_at: now.toISOString() }),
    ]);

    expect(result.rejected).toEqual([{ id: ownDay.id, code: 'forbidden' }]);
  });

  it('lets a trainer with an active link edit the program of a client, and nobody else', async () => {
    const { root } = await pushedProgram(anna);
    const link = {
      id: uuidv7(),
      coachId: boris.id,
      clientId: anna.id,
      status: 'invited' as const,
    };
    await database.db.insert(coachClients).values(link);

    const invited = await push(boris, [upsert('program_days', day(root, { position: 1 }))]);
    expect(invited.rejected.map((r) => r.code)).toEqual(['forbidden']);

    await database.db.update(coachClients).set({ status: 'active' });
    const active = await push(boris, [upsert('program_days', day(root, { position: 1 }))]);
    expect(active.rejected).toEqual([]);
    // The program stays the client's.
    const [stored] = await database.db.select().from(programs);
    expect(stored!.ownerId).toBe(anna.id);
  });
});

describe('program codes', () => {
  it('creates a code of 8 symbols for an own program, with or without an expiry', async () => {
    const { root } = await pushedProgram(anna);

    const forever = await createCode(anna, root.id);
    expect(forever.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(forever).toMatchObject({ program_id: root.id, expires_at: null, uses_count: 0 });

    const week = await createCode(anna, root.id, 7);
    expect(week.expires_at).toBe('2026-10-11T10:00:00.000Z');
    expect(week.code).not.toBe(forever.code);

    const list = await request(anna, 'GET', `/v1/programs/${root.id}/share-codes`);
    const { codes } = (await list.json()) as { codes: ShareCode[] };
    expect(codes.map((c) => c.code).sort()).toEqual([forever.code, week.code].sort());
  });

  it("does not create or list codes for someone else's or an unknown program", async () => {
    const { root } = await pushedProgram(anna);

    for (const programId of [root.id, uuidv7()]) {
      const create = await request(boris, 'POST', `/v1/programs/${programId}/share-codes`, {
        expires_in_days: null,
      });
      expect(create.status).toBe(404);
      expect((await request(boris, 'GET', `/v1/programs/${programId}/share-codes`)).status).toBe(404);
    }
    expect(await database.db.select().from(programShares)).toHaveLength(0);
  });

  it('rejects an expiry other than 7 or 30 days', async () => {
    const { root } = await pushedProgram(anna);
    const response = await request(anna, 'POST', `/v1/programs/${root.id}/share-codes`, {
      expires_in_days: 5,
    });
    expect(response.status).toBe(400);
  });

  it('shows the program to whoever enters the code, however it is typed', async () => {
    const { root, row, pullUp } = await pushedProgram(anna);
    const { code } = await createCode(anna, root.id);

    for (const typed of [code, formatShareCode(code), ` ${formatShareCode(code).toLowerCase()} `]) {
      const response = await request(boris, 'GET', `/v1/share-codes/${encodeURIComponent(typed)}`);
      expect(response.status, typed).toBe(200);
      const { tree } = (await response.json()) as { tree: ProgramTree };
      expect(tree.program.title).toBe('Back day');
      expect(tree.days).toHaveLength(1);
      expect(tree.items.map((i) => i.id)).toEqual([row.id, pullUp.id]);
    }
  });

  it('copies the program for the taker and replaces what their gym cannot do', async () => {
    const { root, row } = await pushedProgram(anna);
    const { code } = await createCode(anna, root.id);
    const gym = await pushedGym(
      boris,
      ALL_EQUIPMENT.filter((equipment) => equipment !== 't_bar'),
    );

    const response = await request(boris, 'POST', `/v1/share-codes/${code}/adopt`, {
      gym_profile_id: gym.id,
    });
    expect(response.status).toBe(200);
    const { tree, substitutions } = (await response.json()) as AdoptResponse;

    // A copy: new ids, a link to the original, owned by the taker.
    expect(tree.program.id).not.toBe(root.id);
    expect(tree.program).toMatchObject({ forked_from_id: root.id, visibility: 'private' });
    const [stored] = await database.db.select().from(programs).where(eq(programs.id, tree.program.id));
    expect(stored!.ownerId).toBe(boris.id);

    // No T-bar in the gym: a row of the same movement instead, and the step is reset.
    const replaced = tree.items.find((i) => i.position === 0)!;
    expect(replaced.exercise_id).toBe(exerciseId('barbell-bent-over-row'));
    expect(replaced.increment_kg).toBeNull();
    expect(replaced.id).not.toBe(row.id);
    expect(substitutions).toEqual([
      {
        item_id: replaced.id,
        from_exercise_id: exerciseId('t-bar-row'),
        to_exercise_id: exerciseId('barbell-bent-over-row'),
      },
    ]);
    // The rest is carried over as it was.
    expect(tree.items.find((i) => i.position === 1)).toMatchObject({
      exercise_id: exerciseId('pull-up'),
      rep_min: 6,
      rep_max: 12,
    });

    const [share] = await database.db.select().from(programShares);
    expect(share!.usesCount).toBe(1);
  });

  it('copies the program unchanged into a gym that has everything', async () => {
    const { root } = await pushedProgram(anna);
    const { code } = await createCode(anna, root.id);
    const gym = await pushedGym(boris, ALL_EQUIPMENT);

    const response = await request(boris, 'POST', `/v1/share-codes/${code}/adopt`, {
      gym_profile_id: gym.id,
    });
    const { tree, substitutions } = (await response.json()) as AdoptResponse;

    expect(substitutions).toEqual([]);
    expect(tree.items.map((i) => i.exercise_id)).toEqual([exerciseId('t-bar-row'), exerciseId('pull-up')]);
    expect(tree.items[0]!.increment_kg).toBe(5);
  });

  it('keeps an exercise nothing can replace, and says so', async () => {
    const { root } = await pushedProgram(anna);
    const { code } = await createCode(anna, root.id);
    const gym = await pushedGym(boris, ['mat']);

    const response = await request(boris, 'POST', `/v1/share-codes/${code}/adopt`, {
      gym_profile_id: gym.id,
    });
    const { tree, substitutions } = (await response.json()) as AdoptResponse;

    expect(substitutions.every((s) => s.to_exercise_id === null)).toBe(true);
    expect(substitutions).toHaveLength(2);
    expect(tree.items.map((i) => i.exercise_id)).toEqual([exerciseId('t-bar-row'), exerciseId('pull-up')]);
  });

  it("leaves the copy alone when the author edits the original afterwards", async () => {
    const { root } = await pushedProgram(anna);
    const { code } = await createCode(anna, root.id);
    const gym = await pushedGym(boris, ALL_EQUIPMENT);
    const adopted = (await (
      await request(boris, 'POST', `/v1/share-codes/${code}/adopt`, { gym_profile_id: gym.id })
    ).json()) as AdoptResponse;

    advance(60_000);
    await push(anna, [upsert('programs', { ...root, title: 'Renamed', updated_at: now.toISOString() })]);

    const [copy] = await database.db.select().from(programs).where(eq(programs.id, adopted.tree.program.id));
    expect(copy!.title).toBe('Back day');
  });

  it("does not take a program into someone else's gym profile", async () => {
    const { root } = await pushedProgram(anna);
    const { code } = await createCode(anna, root.id);
    const annasGym = await pushedGym(anna, ALL_EQUIPMENT);

    const response = await request(boris, 'POST', `/v1/share-codes/${code}/adopt`, {
      gym_profile_id: annasGym.id,
    });
    expect(response.status).toBe(404);
    expect(await database.db.select().from(programs)).toHaveLength(1);
  });

  it('stops working once revoked, and only the author can revoke', async () => {
    const { root } = await pushedProgram(anna);
    const { code } = await createCode(anna, root.id);
    const gym = await pushedGym(boris, ALL_EQUIPMENT);

    expect((await request(boris, 'DELETE', `/v1/share-codes/${code}`)).status).toBe(404);
    expect((await request(boris, 'GET', `/v1/share-codes/${code}`)).status).toBe(200);

    expect((await request(anna, 'DELETE', `/v1/share-codes/${formatShareCode(code)}`)).status).toBe(204);

    const preview = await request(boris, 'GET', `/v1/share-codes/${code}`);
    expect(preview.status).toBe(404);
    expect(await errorCode(preview)).toBe('invalid_share_code');
    const adopt = await request(boris, 'POST', `/v1/share-codes/${code}/adopt`, { gym_profile_id: gym.id });
    expect(adopt.status).toBe(404);
    expect((await request(anna, 'DELETE', `/v1/share-codes/${code}`)).status).toBe(404);
  });

  it('stops working once expired', async () => {
    const { root } = await pushedProgram(anna);
    const { code } = await createCode(anna, root.id, 7);

    // Access tokens live 15 minutes, so the users sign in again after the wait.
    advance(7 * 24 * 60 * 60 * 1000 - 1000);
    boris = await signIn('boris@example.com');
    anna = await signIn('anna@example.com');
    expect((await request(boris, 'GET', `/v1/share-codes/${code}`)).status).toBe(200);

    advance(1000);
    const expired = await request(boris, 'GET', `/v1/share-codes/${code}`);
    expect(expired.status).toBe(404);
    expect(await errorCode(expired)).toBe('invalid_share_code');
    const list = await request(anna, 'GET', `/v1/programs/${root.id}/share-codes`);
    expect(((await list.json()) as { codes: ShareCode[] }).codes).toEqual([]);
  });

  it('stops working when the program is deleted', async () => {
    const { root } = await pushedProgram(anna);
    const { code } = await createCode(anna, root.id);
    advance(60_000);
    await push(anna, [{ table: 'programs', op: 'delete', id: root.id, updated_at: now.toISOString() }]);

    expect((await request(boris, 'GET', `/v1/share-codes/${code}`)).status).toBe(404);
  });

  it.each(['KX7P-2QM', 'not a code', 'KX7P-2QMU'])('answers 404 for a malformed code: %s', async (typed) => {
    const response = await request(boris, 'GET', `/v1/share-codes/${encodeURIComponent(typed)}`);
    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe('invalid_share_code');
  });
});

describe('limits on entering codes', () => {
  it(`allows ${MAX_ATTEMPTS_PER_MINUTE} attempts a minute for a user`, async () => {
    const { root } = await pushedProgram(anna);
    const { code } = await createCode(anna, root.id);

    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MINUTE; attempt++) {
      advance(1000);
      expect((await request(boris, 'GET', `/v1/share-codes/${code}`)).status).toBe(200);
    }
    const limited = await request(boris, 'GET', `/v1/share-codes/${code}`);
    expect(limited.status).toBe(429);
    expect(await errorCode(limited)).toBe('rate_limited');
    expect(limited.headers.get('Retry-After')).toBe('51');

    // Another user is not affected, and the limit lifts as the minute passes.
    expect((await request(anna, 'GET', `/v1/share-codes/${code}`)).status).toBe(200);
    advance(51_000);
    expect((await request(boris, 'GET', `/v1/share-codes/${code}`)).status).toBe(200);
  });

  it(`blocks entering after ${MAX_FAILURES_PER_HOUR} wrong codes in an hour, even for a right code`, async () => {
    const { root } = await pushedProgram(anna);
    const { code } = await createCode(anna, root.id);

    for (let attempt = 0; attempt < MAX_FAILURES_PER_HOUR; attempt++) {
      advance(61_000 / MAX_ATTEMPTS_PER_MINUTE);
      expect((await request(boris, 'GET', '/v1/share-codes/00000000')).status).toBe(404);
    }

    advance(5 * 60_000);
    const blocked = await request(boris, 'GET', `/v1/share-codes/${code}`);
    expect(blocked.status).toBe(429);
    // A blocked attempt is not counted, or the block would never end.
    expect(await database.db.select().from(shareCodeAttempts)).toHaveLength(MAX_FAILURES_PER_HOUR);

    advance(60 * 60_000);
    boris = await signIn('boris@example.com');
    expect((await request(boris, 'GET', `/v1/share-codes/${code}`)).status).toBe(200);
  });

  it('counts attempts from one address together, whoever makes them', async () => {
    const { root } = await pushedProgram(anna);
    const { code } = await createCode(anna, root.id);
    const ip = '203.0.113.7';

    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MINUTE; attempt++) {
      const user = attempt % 2 === 0 ? anna : boris;
      expect((await request(user, 'GET', `/v1/share-codes/${code}`, undefined, ip)).status).toBe(200);
    }
    expect((await request(boris, 'GET', `/v1/share-codes/${code}`, undefined, ip)).status).toBe(429);
    // The same user from another address has only their own attempts counted.
    expect((await request(boris, 'GET', `/v1/share-codes/${code}`, undefined, '198.51.100.9')).status).toBe(200);
  });

  it('needs a signed-in user', async () => {
    expect((await request(null, 'GET', '/v1/share-codes/KX7P2QMD')).status).toBe(401);
    expect((await request(null, 'POST', `/v1/programs/${uuidv7()}/share-codes`, {})).status).toBe(401);
  });
});

describe('workouts in sync, and pull', () => {
  type Pull = { changes: { table: string; row: { id: string } }[]; cursor: string; has_more: boolean };

  const pull = async (user: User, cursor?: string) => {
    const response = await request(user, 'GET', `/v1/sync/pull${cursor ? `?cursor=${cursor}` : ''}`);
    expect(response.status).toBe(200);
    return (await response.json()) as Pull;
  };

  /** A finished workout of the pushed program: one exercise, two sets, the plan for next time. */
  function workout(root: ProgramRow, first: ProgramDayRow, row: ProgramItemRow) {
    const session = {
      id: uuidv7(),
      ...stamps(),
      program_id: root.id,
      program_day_id: first.id,
      cycle_number: 1,
      status: 'finished',
      started_at: now.toISOString(),
      finished_at: now.toISOString(),
      wellbeing: 4,
      notes: '',
    };
    const exercise = {
      id: uuidv7(),
      ...stamps(),
      session_id: session.id,
      position: 0,
      program_item_id: row.id,
      exercise_id: row.exercise_id,
      substituted_from_id: null,
    };
    const sets = [10, 9].map((reps, index) => ({
      id: uuidv7(),
      ...stamps(),
      session_exercise_id: exercise.id,
      set_number: index + 1,
      is_warmup: false,
      planned_weight_kg: 60,
      planned_rep_min: 8,
      planned_rep_max: 10,
      weight_kg: 60,
      reps,
      rir: 1,
      duration_sec: null,
      distance_m: null,
      speed_kmh: null,
      incline_pct: null,
      resistance_level: null,
      avg_hr: null,
      calories: null,
      completed_at: now.toISOString(),
    }));
    const progression = {
      id: row.id,
      ...stamps(),
      program_item_id: row.id,
      next_weight_kg: 60,
      next_target_reps: 10,
      fail_streak: 0,
      reason_code: 'same',
      reason_params: { set_number: 2, target_reps: 10 },
    };
    const pointer = {
      id: root.id,
      ...stamps(),
      program_id: root.id,
      next_day_position: 0,
      cycle_number: 2,
      deload_cycle: null,
    };
    return {
      session,
      exercise,
      sets,
      progression,
      pointer,
      changes: [
        upsert('program_state', pointer),
        upsert('progression_state', progression),
        upsert('sessions', session),
        upsert('session_exercises', exercise),
        ...sets.map((row) => upsert('set_logs', row)),
      ],
    };
  }

  it('stores a workout with its sets and the plan for the next one', async () => {
    const { root, first, row } = await pushedProgram(anna);
    const { changes, sets, progression } = workout(root, first, row);

    const result = await push(anna, changes);
    expect(result.rejected).toEqual([]);

    const pulled = await pull(anna);
    const logged = pulled.changes.filter((change) => change.table === 'set_logs');
    expect(logged.map((change) => change.row)).toEqual(sets);
    const plan = pulled.changes.find((change) => change.table === 'progression_state');
    expect(plan?.row).toEqual(progression);
  });

  it('hands a device everything of the user in the order it changed, then only what is new', async () => {
    const { root, first, row, pullUp } = await pushedProgram(anna);

    const everything = await pull(anna);
    expect(everything.changes.map((change) => change.row.id)).toEqual([
      root.id,
      first.id,
      row.id,
      pullUp.id,
    ]);
    expect(everything.has_more).toBe(false);
    expect((await pull(anna, everything.cursor)).changes).toEqual([]);

    advance(60_000);
    await push(anna, [upsert('programs', { ...root, title: 'Renamed', updated_at: now.toISOString() })]);
    const later = await pull(anna, everything.cursor);
    expect(later.changes).toHaveLength(1);
    expect(later.changes[0]).toMatchObject({ table: 'programs', row: { id: root.id, title: 'Renamed' } });
    expect(Number(later.cursor)).toBeGreaterThan(Number(everything.cursor));
  });

  it('does not count a row sent back unchanged as a new change', async () => {
    const { root, first } = await pushedProgram(anna);
    const { cursor } = await pull(anna);

    // A phone that has just pulled these rows queues and sends them again.
    await push(anna, [upsert('programs', root), upsert('program_days', first)]);
    expect((await pull(anna, cursor)).changes).toEqual([]);
  });

  it('includes deletions, as rows marked deleted', async () => {
    const { row } = await pushedProgram(anna);
    const { cursor } = await pull(anna);
    advance(60_000);
    await push(anna, [
      { table: 'program_items', op: 'delete', id: row.id, updated_at: now.toISOString() },
    ]);

    const { changes } = await pull(anna, cursor);
    expect(changes).toEqual([
      { table: 'program_items', row: expect.objectContaining({ id: row.id, deleted_at: now.toISOString() }) },
    ]);
  });

  it("never hands out another user's rows", async () => {
    const { root, first, row } = await pushedProgram(anna);
    await push(anna, workout(root, first, row).changes);

    expect((await pull(boris)).changes).toEqual([]);
  });

  it('delivers a program taken by code to the other devices of the taker', async () => {
    const { root } = await pushedProgram(anna);
    const { code } = await createCode(anna, root.id);
    const gym = await pushedGym(boris, ALL_EQUIPMENT);
    const { cursor } = await pull(boris);

    const adopted = (await (
      await request(boris, 'POST', `/v1/share-codes/${code}/adopt`, { gym_profile_id: gym.id })
    ).json()) as AdoptResponse;

    const { changes } = await pull(boris, cursor);
    expect(changes.map((change) => change.table).sort()).toEqual([
      'program_days',
      'program_items',
      'program_items',
      'programs',
    ]);
    expect(changes.find((change) => change.table === 'programs')?.row).toEqual(adopted.tree.program);
  });

  it("rejects sets logged into another user's workout, and sets of an unknown workout", async () => {
    const { root, first, row } = await pushedProgram(anna);
    const { exercise, sets, changes } = workout(root, first, row);
    await push(anna, changes);

    const intruder = { ...sets[0]!, id: uuidv7() };
    const orphan = { ...sets[0]!, id: uuidv7(), session_exercise_id: uuidv7() };
    const result = await push(boris, [upsert('set_logs', intruder), upsert('set_logs', orphan)]);

    expect(result.rejected).toEqual([
      { id: intruder.id, code: 'forbidden' },
      { id: orphan.id, code: 'missing_parent' },
    ]);
    expect(exercise.session_id).toBeDefined();
  });

  it('pages through a long history without gaps or repeats', async () => {
    const { root, first, row } = await pushedProgram(anna);
    await push(anna, workout(root, first, row).changes);

    const seen: string[] = [];
    let cursor = 0;
    for (let page = 0; page < 20; page++) {
      const result = await pullChanges({ db: database.db }, anna.id, cursor, 3);
      expect(result.changes.length).toBeLessThanOrEqual(3);
      // The plan of an item and the pointer of a program share the id of what they describe.
      seen.push(...result.changes.map((change) => `${change.table}:${change.row.id}`));
      cursor = Number(result.cursor);
      if (!result.has_more) break;
    }
    // The program (4 rows) and the workout (6 rows).
    expect(seen).toHaveLength(10);
    expect(new Set(seen).size).toBe(10);
  });

  it('needs a signed-in user and a well-formed cursor', async () => {
    expect((await request(null, 'GET', '/v1/sync/pull')).status).toBe(401);
    expect((await request(anna, 'GET', '/v1/sync/pull?cursor=abc')).status).toBe(400);
  });
});

describe('body weight and generation', () => {
  it('syncs a morning weight to the other devices of the user', async () => {
    const entry = {
      id: uuidv7(),
      ...stamps(),
      date: '2026-10-04',
      weight_kg: 84.6,
      measured_at: now.toISOString(),
    };
    const result = await push(anna, [upsert('body_logs', entry)]);
    expect(result.rejected).toEqual([]);

    const response = await request(anna, 'GET', '/v1/sync/pull');
    const { changes } = (await response.json()) as { changes: { table: string; row: unknown }[] };
    expect(changes).toEqual([{ table: 'body_logs', row: entry }]);
  });

  it.each([
    ['a date that is not a calendar day', { date: '04.10.2026' }],
    ['a weight no person has', { weight_kg: 846 }],
  ])('rejects %s', async (_name, broken) => {
    const entry = {
      id: uuidv7(),
      ...stamps(),
      date: '2026-10-04',
      weight_kg: 84.6,
      measured_at: now.toISOString(),
      ...broken,
    };
    expect((await push(anna, [upsert('body_logs', entry)])).rejected).toEqual([
      { id: entry.id, code: 'validation_error' },
    ]);
  });

  it('syncs an interval preset of the user and keeps it from other users', async () => {
    const preset = {
      id: uuidv7(),
      ...stamps(),
      title: 'Hill sprints',
      work_sec: 30,
      rest_sec: 90,
      rounds: 6,
      cycles: 1,
      cycle_rest_sec: 0,
    };
    expect((await push(anna, [upsert('interval_presets', preset)])).rejected).toEqual([]);
    expect((await push(anna, [upsert('interval_presets', { ...preset, rounds: 0 })])).rejected).toEqual([
      { id: preset.id, code: 'validation_error' },
    ]);

    const response = await request(anna, 'GET', '/v1/sync/pull');
    const { changes } = (await response.json()) as { changes: { table: string; row: unknown }[] };
    expect(changes).toEqual([{ table: 'interval_presets', row: preset }]);

    advance(1000);
    const stolen = { ...preset, title: 'Mine now', updated_at: now.toISOString() };
    expect((await push(boris, [upsert('interval_presets', stolen)])).rejected).toEqual([
      { id: preset.id, code: 'forbidden' },
    ]);
  });

  it('syncs a free activity and refuses one that does not add up', async () => {
    const activity = {
      id: uuidv7(),
      ...stamps(),
      activity_type: 'football',
      started_at: '2026-10-04T08:00:00.000Z',
      duration_sec: 90 * 60,
      intensity: 7,
      distance_m: 8200,
      avg_hr: 151,
      calories: null,
      notes: 'Sunday match',
    };
    expect((await push(anna, [upsert('activity_logs', activity)])).rejected).toEqual([]);
    for (const broken of [{ intensity: 11 }, { duration_sec: 0 }, { activity_type: ' ' }]) {
      const row = { ...activity, id: uuidv7(), ...broken };
      expect((await push(anna, [upsert('activity_logs', row)])).rejected).toEqual([
        { id: row.id, code: 'validation_error' },
      ]);
    }

    const response = await request(anna, 'GET', '/v1/sync/pull');
    const { changes } = (await response.json()) as { changes: { table: string; row: unknown }[] };
    expect(changes).toEqual([{ table: 'activity_logs', row: activity }]);
  });

  it('drafts a program from the questionnaire for the equipment of a gym, saving nothing', async () => {
    const answers = { goal: 'mass', level: 'beginner', frequency: 3, duration_min: 60, split: 'auto' };
    const response = await request(anna, 'POST', '/v1/programs/generate', {
      answers,
      equipment: ALL_EQUIPMENT.filter((code) => code !== 't_bar'),
    });
    expect(response.status).toBe(200);
    const draft = (await response.json()) as {
      split: string;
      days: { key: string; items: { exercise_id: string; sets: number }[] }[];
    };

    expect(draft.split).toBe('full_body_abc');
    expect(draft.days.map((day) => day.key)).toEqual(['full_body_a', 'full_body_b', 'full_body_c']);
    const used = draft.days.flatMap((day) => day.items.map((item) => item.exercise_id));
    expect(used).not.toContain(exerciseId('t-bar-row'));
    expect(used).toContain(exerciseId('barbell-bent-over-row'));
    expect(await database.db.select().from(programs)).toHaveLength(0);
  });

  it('answers 400 for a questionnaire that is not filled in properly', async () => {
    const response = await request(anna, 'POST', '/v1/programs/generate', {
      answers: { goal: 'mass', level: 'beginner', frequency: 7, duration_min: 60, split: 'auto' },
      equipment: [],
    });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('validation_error');
  });
});

describe('account deletion', () => {
  it('deletes the user with everything the user owns, and nothing of anyone else', async () => {
    const { root } = await pushedProgram(anna);
    await pushedGym(anna, ALL_EQUIPMENT);
    const weight = { id: uuidv7(), ...stamps(), date: '2026-10-04', weight_kg: 80, measured_at: now.toISOString() };
    expect((await push(anna, [upsert('body_logs', weight)])).rejected).toEqual([]);
    const { code } = await createCode(anna, root.id);
    const borisGym = await pushedGym(boris, ALL_EQUIPMENT);
    const adopted = await request(boris, 'POST', `/v1/share-codes/${code}/adopt`, {
      gym_profile_id: borisGym.id,
    });
    expect(adopted.status).toBe(200);

    const response = await request(anna, 'DELETE', '/v1/me');
    expect(response.status).toBe(204);

    expect(await database.db.select().from(users).where(eq(users.id, anna.id))).toEqual([]);
    for (const table of [programs, programDays, programItems, gymProfiles]) {
      expect(await database.db.select().from(table).where(eq(table.ownerId, anna.id))).toEqual([]);
    }
    expect(await pullChanges({ db: database.db }, anna.id, 0)).toMatchObject({ changes: [] });
    expect(await database.db.select().from(programShares)).toEqual([]);
    expect(
      await database.db.select().from(emailCodes).where(eq(emailCodes.email, 'anna@example.com')),
    ).toEqual([]);

    // The copy Boris took is his: it stays, and so does his account.
    const left = await database.db.select().from(programs).where(eq(programs.ownerId, boris.id));
    expect(left).toHaveLength(1);
    expect((await request(boris, 'GET', '/v1/me')).status).toBe(200);
  });

  it('ends the sessions: the profile is gone and a second delete is refused', async () => {
    expect((await request(anna, 'DELETE', '/v1/me')).status).toBe(204);

    const me = await request(anna, 'GET', '/v1/me');
    expect(me.status).toBe(401);
    const again = await request(anna, 'DELETE', '/v1/me');
    expect(again.status).toBe(401);
    expect(await errorCode(again)).toBe('unauthorized');
  });

  it('signing in with the same email afterwards starts a new, empty account', async () => {
    const { root } = await pushedProgram(anna);
    expect((await request(anna, 'DELETE', '/v1/me')).status).toBe(204);

    advance(2 * 60 * 1000);
    const again = await signIn('anna@example.com');
    expect(again.id).not.toBe(anna.id);
    const pulled = await request(again, 'GET', '/v1/sync/pull');
    expect(((await pulled.json()) as { changes: unknown[] }).changes).toEqual([]);
    expect(await database.db.select().from(programs).where(eq(programs.id, root.id))).toEqual([]);
  });

  it('needs a signed-in user', async () => {
    expect((await request(null, 'DELETE', '/v1/me')).status).toBe(401);
  });
});
