import { createDb, type DbHandle, emailCodes, supportMessages, users } from '@mvp/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import type { LoginCodeMail, SupportMail } from '../src/mailer';
import { MAX_SUPPORT_PER_HOUR } from '../src/support';

let database: DbHandle;
let app: ReturnType<typeof createApp>;
let codes: LoginCodeMail[];
let forwarded: SupportMail[];
let now: Date;

const message = {
  message: 'The rest timer did not ring with the screen locked.',
  app_version: '1.0.0 (12)',
  device: 'ios 18.2, iPhone15,2',
  last_sync_at: '2026-10-04T09:58:00.000Z',
  locale: 'ru',
};

const send = (body: unknown, headers: Record<string, string> = {}, ip = '203.0.113.7') =>
  app.request('/v1/support', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...headers },
    body: JSON.stringify(body),
  });

async function signIn(email: string) {
  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  await post('/v1/auth/email/start', { email });
  const response = await post('/v1/auth/email/verify', { email, code: codes.at(-1)!.code });
  return ((await response.json()) as { access_token: string }).access_token;
}

beforeAll(async () => {
  database = await createDb('pglite://memory');
  await database.migrate();
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.db.delete(supportMessages);
  await database.db.delete(users);
  await database.db.delete(emailCodes);
  codes = [];
  forwarded = [];
  now = new Date('2026-10-04T10:00:00Z');
  app = createApp({
    db: database.db,
    mailer: {
      sendLoginCode: async (mail) => void codes.push(mail),
      sendSupportMessage: async (mail) => void forwarded.push(mail),
    },
    jwtSecret: 'test-secret-test-secret-test-secret',
    now: () => now,
  });
});

describe('the support form', () => {
  it('takes a message from a guest with the details that help to answer it', async () => {
    const response = await send({ ...message, email: 'Guest@Example.com' });
    expect(response.status).toBe(204);

    const [row] = await database.db.select().from(supportMessages);
    expect(row).toMatchObject({
      userId: null,
      email: 'guest@example.com',
      appVersion: '1.0.0 (12)',
      device: 'ios 18.2, iPhone15,2',
      locale: 'ru',
    });
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]).toMatchObject({ email: 'guest@example.com', message: message.message });
    expect(forwarded[0]!.details).toContain('Last sync: 2026-10-04T09:58:00.000Z');
  });

  it('answers a signed-in user at the email of the account', async () => {
    const token = await signIn('lifter@example.com');
    expect((await send(message, { Authorization: `Bearer ${token}` })).status).toBe(204);
    const [row] = await database.db.select().from(supportMessages);
    expect(row?.userId).not.toBeNull();
    expect(row?.email).toBe('lifter@example.com');
  });

  it('keeps the message when the email cannot be sent', async () => {
    app = createApp({
      db: database.db,
      mailer: {
        sendLoginCode: async () => {},
        sendSupportMessage: async () => {
          throw new Error('SMTP is down');
        },
      },
      jwtSecret: 'test-secret-test-secret-test-secret',
      now: () => now,
    });
    expect((await send(message)).status).toBe(204);
    expect(await database.db.select().from(supportMessages)).toHaveLength(1);
  });

  it('refuses an empty message and limits how many one address sends in an hour', async () => {
    expect((await send({ ...message, message: '  ' })).status).toBe(400);

    for (let i = 0; i < MAX_SUPPORT_PER_HOUR; i++) expect((await send(message)).status).toBe(204);
    expect((await send(message)).status).toBe(429);
    expect((await send(message, {}, '198.51.100.1')).status).toBe(204);

    now = new Date(now.getTime() + 61 * 60 * 1000);
    expect((await send(message)).status).toBe(204);
  });

  it('a message goes with the account when it is deleted', async () => {
    const token = await signIn('lifter@example.com');
    await send(message, { Authorization: `Bearer ${token}` });
    const deleted = await app.request('/v1/me', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(deleted.status).toBe(204);
    expect(await database.db.select().from(supportMessages)).toEqual([]);
  });
});
