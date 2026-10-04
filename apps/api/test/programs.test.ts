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
    expect(storedProfile).toMatchObject({ userId: anna.id, locationType: 'gym', isDefault: true });
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
