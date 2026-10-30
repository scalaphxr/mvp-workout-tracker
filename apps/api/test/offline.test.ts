/**
 * The phone and the server together: the data layer of the app on an in-memory SQLite,
 * talking to the real API over an in-memory PostgreSQL. This is the "airplane mode →
 * workout → network" scenario of the spec.
 */
import { catalogSeed } from '@mvp/content';
import {
  createDb,
  type DbHandle,
  emailCodes,
  programs,
  sessionExercises,
  sessions,
  setLogs,
  users,
} from '@mvp/db';
import { createTestDb } from '@mvp/db/sqlite/testing';
import { uuidv7 } from '@mvp/domain';
import type { SyncPullResponse, SyncPushResponse } from '@mvp/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { DataContext } from '../../mobile/src/data/context';
import { createGymProfile } from '../../mobile/src/data/gym';
import { addItem, createProgram, getProgramTree, updateProgram } from '../../mobile/src/data/programs';
import {
  addFreeExercise,
  type ExerciseFacts,
  finishSession,
  getSession,
  lastFinishedSession,
  logSet,
  nextWorkout,
  sessionSummary,
  setPlannedSets,
  startFreeSession,
  startSession,
} from '../../mobile/src/data/sessions';
import { pendingCount, runSync, type SyncTransport } from '../../mobile/src/data/sync';
import { createApp } from '../src/app';

const ADMIN_TOKEN = 'test-admin-token-123';
const BENCH = catalogSeed.exercises.find((e) => e.slug === 'barbell-bench-press')!.id;
const BARBELL = catalogSeed.equipment.find((e) => e.code === 'barbell')!.id;
const facts: ExerciseFacts = () => ({ step_kg: 2.5, progresses: true });

let database: DbHandle;
let app: ReturnType<typeof createApp>;
let codes: string[];
let serverNow: Date;

/** A phone: its own database, clock and ids. */
async function phone(name: number): Promise<DataContext> {
  let clock = Date.UTC(2026, 9, 4, 10) + name * 3_600_000;
  let ids = name * 100_000;
  return {
    db: await createTestDb(),
    now: () => new Date((clock += 1000)).toISOString(),
    newId: () => uuidv7(++ids, new Uint8Array(10)),
  };
}

async function signIn(email: string): Promise<string> {
  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  await post('/v1/auth/email/start', { email });
  const response = await post('/v1/auth/email/verify', { email, code: codes.at(-1) });
  return ((await response.json()) as { access_token: string }).access_token;
}

/** The network of a signed-in phone. */
function online(token: string): SyncTransport {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  return {
    async push(changes) {
      const response = await app.request('/v1/sync/push', {
        method: 'POST',
        headers,
        body: JSON.stringify({ device_id: uuidv7(1, new Uint8Array(10)), changes }),
      });
      expect(response.status).toBe(200);
      return (await response.json()) as SyncPushResponse;
    },
    async pull(cursor) {
      const response = await app.request(`/v1/sync/pull${cursor ? `?cursor=${cursor}` : ''}`, {
        headers,
      });
      expect(response.status).toBe(200);
      return (await response.json()) as SyncPullResponse;
    },
  };
}

/** A gym, a one-day program with the bench press, and a finished workout of 3 sets. */
function trainOffline(ctx: DataContext) {
  createGymProfile(ctx, {
    name: 'My gym',
    location_type: 'gym',
    equipment: new Map([[BARBELL, null]]),
  });
  const program = createProgram(ctx, { title: 'Bench', firstDayTitle: 'Day 1' });
  const [day] = getProgramTree(ctx, program.id)!.days;
  addItem(ctx, day!.id, BENCH, { sets: 3, rep_min: 10, rep_max: 12, rest_sec: 120, target_rir: 1 });

  const session = startSession(ctx, program.id, day!.id);
  const [bench] = getSession(ctx, session.id)!.exercises;
  for (const reps of [12, 12, 12]) logSet(ctx, bench!.exercise.id, { weight_kg: 80, reps, rir: 1 });
  finishSession(ctx, session.id, facts, { smart: false });
  return { programId: program.id, dayId: day!.id, sessionId: session.id };
}

const serverCounts = async () => ({
  programs: (await database.db.select().from(programs)).length,
  sessions: (await database.db.select().from(sessions)).length,
  exercises: (await database.db.select().from(sessionExercises)).length,
  sets: (await database.db.select().from(setLogs)).length,
});

beforeAll(async () => {
  database = await createDb('pglite://memory');
  await database.migrate();
  app = createApp({
    db: database.db,
    mailer: { sendLoginCode: async (mail) => void codes.push(mail.code) },
    jwtSecret: 'test-secret-test-secret-test-secret',
    adminToken: ADMIN_TOKEN,
    now: () => serverNow,
  });
  codes = [];
  serverNow = new Date('2026-10-04T12:00:00Z');
  await app.request('/v1/admin/catalog/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify(catalogSeed),
  });
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.db.delete(users);
  await database.db.delete(emailCodes);
  codes = [];
});

describe('a workout done without a network', () => {
  it('is whole on the phone, reaches the server once the network is back, and is not duplicated', async () => {
    const ctx = await phone(1);
    const { sessionId } = trainOffline(ctx);

    // Offline: everything is on the phone and nothing is on the server.
    expect(sessionSummary(ctx, sessionId)!.exercises[0]!.sets).toHaveLength(3);
    expect(pendingCount(ctx)).toBeGreaterThan(0);
    expect(await serverCounts()).toEqual({ programs: 0, sessions: 0, exercises: 0, sets: 0 });

    const network = online(await signIn('anna@example.com'));
    const first = await runSync(ctx, network);
    expect(first.pushed).toBeGreaterThan(0);
    expect(pendingCount(ctx)).toBe(0);
    expect(await serverCounts()).toEqual({ programs: 1, sessions: 1, exercises: 1, sets: 3 });

    // Syncing again, and again, sends nothing and duplicates nothing.
    expect(await runSync(ctx, network)).toEqual({ pushed: 0, pulled: 0 });
    expect(await runSync(ctx, network)).toEqual({ pushed: 0, pulled: 0 });
    expect(await serverCounts()).toEqual({ programs: 1, sessions: 1, exercises: 1, sets: 3 });
  });

  it('survives a request that fails half-way: the queue is sent again', async () => {
    const ctx = await phone(1);
    trainOffline(ctx);
    const network = online(await signIn('anna@example.com'));
    const waiting = pendingCount(ctx);

    // The server takes the batch, but the answer never reaches the phone.
    const lossy: SyncTransport = {
      ...network,
      push: async (changes) => {
        await network.push(changes);
        throw new Error('connection lost');
      },
    };
    await expect(runSync(ctx, lossy)).rejects.toThrow('connection lost');
    expect(pendingCount(ctx)).toBe(waiting);

    await runSync(ctx, network);
    expect(pendingCount(ctx)).toBe(0);
    expect(await serverCounts()).toEqual({ programs: 1, sessions: 1, exercises: 1, sets: 3 });
  });

  it('appears on a second phone of the same account, with the plan for next time', async () => {
    const first = await phone(1);
    const { programId, sessionId } = trainOffline(first);
    const token = await signIn('anna@example.com');
    await runSync(first, online(token));

    const second = await phone(2);
    const pulled = await runSync(second, online(token));
    expect(pulled.pulled).toBeGreaterThan(0);

    expect(getSession(second, sessionId)).toEqual(getSession(first, sessionId));
    expect(lastFinishedSession(second)!.id).toBe(sessionId);
    expect(nextWorkout(second, programId)).toMatchObject({ cycle: 2 });
    expect(sessionSummary(second, sessionId)!.exercises[0]!.plan).toMatchObject({
      next_weight_kg: 82.5,
      reason_code: 'increase',
    });
    // What came from the server is not sent back to it.
    expect(pendingCount(second)).toBe(0);
    expect(await runSync(second, online(token))).toEqual({ pushed: 0, pulled: 0 });
  });

  it('carries changes both ways between two phones', async () => {
    const first = await phone(1);
    const { programId, dayId } = trainOffline(first);
    const token = await signIn('anna@example.com');
    const network = online(token);
    await runSync(first, network);
    const second = await phone(2);
    await runSync(second, network);

    // The second phone trains and renames the program; the first one is offline meanwhile.
    updateProgram(second, programId, { title: 'Bench, renamed' });
    const session = startSession(second, programId, dayId);
    const [bench] = getSession(second, session.id)!.exercises;
    expect(bench!.plan?.next_weight_kg).toBe(82.5);
    logSet(second, bench!.exercise.id, { weight_kg: 82.5, reps: 10, rir: 1 });
    finishSession(second, session.id, facts, { smart: false });
    await runSync(second, network);

    await runSync(first, network);
    expect(getProgramTree(first, programId)!.program.title).toBe('Bench, renamed');
    expect(getSession(first, session.id)!.exercises[0]!.sets.map((set) => set.weight_kg)).toEqual([82.5]);
    expect(pendingCount(first)).toBe(0);
    expect(await serverCounts()).toEqual({ programs: 1, sessions: 2, exercises: 2, sets: 4 });
  });

  it("keeps one account's data away from another account's phone", async () => {
    const annas = await phone(1);
    trainOffline(annas);
    await runSync(annas, online(await signIn('anna@example.com')));

    const boriss = await phone(2);
    expect(await runSync(boriss, online(await signIn('boris@example.com')))).toEqual({
      pushed: 0,
      pulled: 0,
    });
    expect(lastFinishedSession(boriss)).toBeNull();
  });
});

describe('a workout without a program', () => {
  /** A finished workout of 2 sets of the bench press, out of 4 meant. */
  function trainFree(ctx: DataContext) {
    const session = startFreeSession(ctx);
    const bench = addFreeExercise(ctx, session.id, BENCH);
    setPlannedSets(ctx, bench.id, 4);
    logSet(ctx, bench.id, { weight_kg: 80, reps: 10 });
    logSet(ctx, bench.id, { weight_kg: 80, reps: 9 });
    finishSession(ctx, session.id, facts, { smart: false });
    return session.id;
  }

  it('reaches another phone of the same user', async () => {
    const first = await phone(1);
    const sessionId = trainFree(first);
    const token = await signIn('anna@example.com');

    await runSync(first, online(token));
    expect(pendingCount(first)).toBe(0);
    expect(await serverCounts()).toEqual({ programs: 0, sessions: 1, exercises: 1, sets: 2 });

    const second = await phone(2);
    await runSync(second, online(token));
    expect(lastFinishedSession(second)).toMatchObject({ id: sessionId, program_id: null });
    expect(getSession(second, sessionId)!.exercises).toMatchObject([
      { plannedSets: 4, sets: [{ reps: 10 }, { reps: 9 }] },
    ]);
  });

  it('cannot be overwritten by another user', async () => {
    const ctx = await phone(1);
    const sessionId = trainFree(ctx);
    await runSync(ctx, online(await signIn('anna@example.com')));

    const { session } = getSession(ctx, sessionId)!;
    const response = await online(await signIn('boris@example.com')).push([
      {
        table: 'sessions',
        op: 'upsert',
        row: { ...session, notes: 'mine now', updated_at: '2026-10-05T10:00:00.000Z' },
      },
    ]);

    expect(response.rejected).toEqual([{ id: sessionId, code: 'forbidden' }]);
    const [stored] = await database.db.select().from(sessions);
    expect(stored?.notes).toBe('');
  });
});
