import { createDb, type DbHandle, emailCodes, refreshTokens, users } from '@mvp/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { ACCESS_TOKEN_TTL_SEC, CODE_TTL_MS, MAX_CODE_ATTEMPTS, REFRESH_TOKEN_TTL_MS } from '../src/auth';
import type { LoginCodeMail } from '../src/mailer';

const EMAIL = 'lifter@example.com';

let database: DbHandle;
let app: ReturnType<typeof createApp>;
let sent: LoginCodeMail[];
let now: Date;
let mailerFails: boolean;

const advance = (ms: number) => {
  now = new Date(now.getTime() + ms);
};

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const getMe = (accessToken?: string) =>
  app.request('/v1/me', {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

const errorCode = async (response: Response) =>
  ((await response.json()) as { error: { code: string } }).error.code;

/** Requests a code and returns the one that was "emailed". */
async function requestCode(email = EMAIL): Promise<string> {
  const response = await post('/v1/auth/email/start', { email });
  expect(response.status).toBe(200);
  return sent.at(-1)!.code;
}

async function signIn(email = EMAIL) {
  const code = await requestCode(email);
  const response = await post('/v1/auth/email/verify', { email, code });
  expect(response.status).toBe(200);
  return (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: { id: string; email: string };
  };
}

beforeAll(async () => {
  database = await createDb('pglite://memory');
  await database.migrate();
});

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.db.delete(refreshTokens);
  await database.db.delete(emailCodes);
  await database.db.delete(users);

  sent = [];
  now = new Date('2026-10-04T10:00:00Z');
  mailerFails = false;
  app = createApp({
    db: database.db,
    mailer: {
      async sendLoginCode(mail) {
        if (mailerFails) throw new Error('SMTP is down');
        sent.push(mail);
      },
    },
    jwtSecret: 'test-secret-test-secret-test-secret',
    now: () => now,
  });
});

describe('email sign-in', () => {
  it('signs in with the emailed code and returns the profile', async () => {
    const session = await signIn();

    expect(sent).toHaveLength(1);
    expect(sent[0]!.code).toMatch(/^\d{6}$/);
    expect(session.expires_in).toBe(ACCESS_TOKEN_TTL_SEC);
    expect(session.user.email).toBe(EMAIL);

    const me = await getMe(session.access_token);
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({
      user: {
        id: session.user.id,
        email: EMAIL,
        display_name: null,
        locale: 'en',
        units: 'kg',
        ai_enabled: false,
        default_rest_sec: 120,
        created_at: '2026-10-04T10:00:00.000Z',
      },
    });
  });

  it('sends the email in the requested language', async () => {
    await post('/v1/auth/email/start', { email: EMAIL, locale: 'ru' });
    expect(sent[0]!.locale).toBe('ru');
  });

  it('treats the email case-insensitively: a second sign-in is the same account', async () => {
    const first = await signIn('Lifter@Example.com ');
    advance(2 * 60 * 1000);
    const second = await signIn('lifter@example.com');

    expect(second.user.id).toBe(first.user.id);
    expect(await database.db.select().from(users)).toHaveLength(1);
  });

  it('does not store the code in plain text', async () => {
    const code = await requestCode();
    const [row] = await database.db.select().from(emailCodes);
    expect(row!.codeHash).not.toContain(code);
  });

  it('rejects a wrong code and accepts the right one afterwards', async () => {
    const code = await requestCode();
    const wrong = code === '000000' ? '000001' : '000000';

    const rejected = await post('/v1/auth/email/verify', { email: EMAIL, code: wrong });
    expect(rejected.status).toBe(400);
    expect(await errorCode(rejected)).toBe('invalid_code');

    const accepted = await post('/v1/auth/email/verify', { email: EMAIL, code });
    expect(accepted.status).toBe(200);
  });

  it('rejects a code for an email that never asked for one', async () => {
    const response = await post('/v1/auth/email/verify', { email: EMAIL, code: '123456' });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('invalid_code');
  });

  it('a code works only once', async () => {
    const code = await requestCode();
    expect((await post('/v1/auth/email/verify', { email: EMAIL, code })).status).toBe(200);

    const reused = await post('/v1/auth/email/verify', { email: EMAIL, code });
    expect(reused.status).toBe(400);
    expect(await errorCode(reused)).toBe('invalid_code');
  });

  it('rejects an expired code', async () => {
    const code = await requestCode();
    advance(CODE_TTL_MS);

    const response = await post('/v1/auth/email/verify', { email: EMAIL, code });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('invalid_code');
  });

  it('blocks the code after too many wrong attempts, even for the right code', async () => {
    const code = await requestCode();
    const wrong = code === '000000' ? '000001' : '000000';

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const response = await post('/v1/auth/email/verify', { email: EMAIL, code: wrong });
      expect(await errorCode(response)).toBe('invalid_code');
    }

    const blocked = await post('/v1/auth/email/verify', { email: EMAIL, code });
    expect(blocked.status).toBe(429);
    expect(await errorCode(blocked)).toBe('too_many_attempts');
  });

  it('only the latest code is valid', async () => {
    const first = await requestCode();
    advance(61 * 1000);
    const second = await requestCode();

    if (first !== second) {
      const stale = await post('/v1/auth/email/verify', { email: EMAIL, code: first });
      expect(await errorCode(stale)).toBe('invalid_code');
    }
    expect((await post('/v1/auth/email/verify', { email: EMAIL, code: second })).status).toBe(200);
  });
});

describe('limits on requesting codes', () => {
  it('makes the client wait a minute between codes', async () => {
    await requestCode();
    advance(20 * 1000);

    const tooSoon = await post('/v1/auth/email/start', { email: EMAIL });
    expect(tooSoon.status).toBe(429);
    expect(await errorCode(tooSoon)).toBe('rate_limited');
    expect(tooSoon.headers.get('Retry-After')).toBe('40');
    expect(sent).toHaveLength(1);

    advance(40 * 1000);
    expect((await post('/v1/auth/email/start', { email: EMAIL })).status).toBe(200);
  });

  it('allows 5 codes per hour for one email and does not limit other emails', async () => {
    for (let i = 0; i < 5; i++) {
      await requestCode();
      advance(61 * 1000);
    }

    const sixth = await post('/v1/auth/email/start', { email: EMAIL });
    expect(sixth.status).toBe(429);
    expect(await errorCode(sixth)).toBe('rate_limited');

    expect((await post('/v1/auth/email/start', { email: 'other@example.com' })).status).toBe(200);

    advance(60 * 60 * 1000);
    expect((await post('/v1/auth/email/start', { email: EMAIL })).status).toBe(200);
  });

  it('does not count a code that could not be emailed', async () => {
    mailerFails = true;
    const failed = await post('/v1/auth/email/start', { email: EMAIL });
    expect(failed.status).toBe(500);
    expect(await errorCode(failed)).toBe('internal');

    mailerFails = false;
    expect((await post('/v1/auth/email/start', { email: EMAIL })).status).toBe(200);
  });
});

describe('tokens', () => {
  it('rejects requests without a token, with garbage and with an expired token', async () => {
    const session = await signIn();

    for (const response of [await getMe(), await getMe('garbage')]) {
      expect(response.status).toBe(401);
      expect(await errorCode(response)).toBe('unauthorized');
    }

    advance(ACCESS_TOKEN_TTL_SEC * 1000 + 1000);
    const expired = await getMe(session.access_token);
    expect(expired.status).toBe(401);
    expect(await errorCode(expired)).toBe('unauthorized');
  });

  it('rejects an access token signed with another secret', async () => {
    const session = await signIn();
    const foreignApp = createApp({
      db: database.db,
      mailer: { async sendLoginCode() {} },
      jwtSecret: 'another-secret-another-secret-another',
      now: () => now,
    });

    const response = await foreignApp.request('/v1/me', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    expect(response.status).toBe(401);
  });

  it('refresh rotates the pair: the new tokens work', async () => {
    const session = await signIn();
    advance(ACCESS_TOKEN_TTL_SEC * 1000 + 1000);

    const response = await post('/v1/auth/refresh', { refresh_token: session.refresh_token });
    expect(response.status).toBe(200);
    const tokens = (await response.json()) as { access_token: string; refresh_token: string };

    expect(tokens.refresh_token).not.toBe(session.refresh_token);
    expect((await getMe(tokens.access_token)).status).toBe(200);
  });

  it('reusing a rotated refresh token revokes the whole chain', async () => {
    const session = await signIn();
    const rotated = (await (
      await post('/v1/auth/refresh', { refresh_token: session.refresh_token })
    ).json()) as { refresh_token: string };

    const reuse = await post('/v1/auth/refresh', { refresh_token: session.refresh_token });
    expect(reuse.status).toBe(401);
    expect(await errorCode(reuse)).toBe('invalid_refresh_token');

    const afterReuse = await post('/v1/auth/refresh', { refresh_token: rotated.refresh_token });
    expect(afterReuse.status).toBe(401);
  });

  it('a second device keeps working when the first one is compromised', async () => {
    const phone = await signIn();
    advance(2 * 60 * 1000);
    const tablet = await signIn();

    await post('/v1/auth/refresh', { refresh_token: phone.refresh_token });
    await post('/v1/auth/refresh', { refresh_token: phone.refresh_token });

    expect((await post('/v1/auth/refresh', { refresh_token: tablet.refresh_token })).status).toBe(
      200,
    );
  });

  it('rejects an unknown and an expired refresh token', async () => {
    const unknown = await post('/v1/auth/refresh', { refresh_token: 'nope' });
    expect(unknown.status).toBe(401);
    expect(await errorCode(unknown)).toBe('invalid_refresh_token');

    const session = await signIn();
    advance(REFRESH_TOKEN_TTL_MS);
    const expired = await post('/v1/auth/refresh', { refresh_token: session.refresh_token });
    expect(expired.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const session = await signIn();

    const response = await post('/v1/auth/logout', { refresh_token: session.refresh_token });
    expect(response.status).toBe(204);

    const afterLogout = await post('/v1/auth/refresh', { refresh_token: session.refresh_token });
    expect(afterLogout.status).toBe(401);
  });
});

describe('error envelope', () => {
  it.each([
    ['a malformed email', { email: 'not-an-email' }],
    ['a missing body field', {}],
    ['an unsupported locale', { email: EMAIL, locale: 'de' }],
  ])('answers 400 validation_error for %s', async (_name, body) => {
    const response = await post('/v1/auth/email/start', body);
    expect(response.status).toBe(400);
    const json = (await response.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe('validation_error');
    expect(json.error.message).not.toBe('');
    expect(sent).toHaveLength(0);
  });

  it('answers 400 for a body that is not JSON', async () => {
    const response = await app.request('/v1/auth/email/start', { method: 'POST', body: '{oops' });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('validation_error');
  });

  it('answers 400 for a code that is not 6 digits', async () => {
    await requestCode();
    const response = await post('/v1/auth/email/verify', { email: EMAIL, code: '12345' });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('validation_error');
  });

  it('answers 404 in the same envelope for an unknown route', async () => {
    const response = await app.request('/v1/nope');
    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe('not_found');
  });

  it('reports health', async () => {
    const response = await app.request('/health');
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe('profile settings', () => {
  const patchMe = (token: string, body: unknown) =>
    app.request('/v1/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  it('changes only the fields sent and returns the profile', async () => {
    const { access_token } = await signIn();
    const response = await patchMe(access_token, { units: 'lb', default_rest_sec: 90 });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { user: unknown }).user).toMatchObject({
      units: 'lb',
      default_rest_sec: 90,
      locale: 'en',
    });

    await patchMe(access_token, { locale: 'ru' });
    const me = (await (await getMe(access_token)).json()) as { user: unknown };
    expect(me.user).toMatchObject({ units: 'lb', default_rest_sec: 90, locale: 'ru' });
  });

  it('refuses values out of range and needs a signed-in user', async () => {
    const { access_token } = await signIn();
    expect((await patchMe(access_token, { units: 'stone' })).status).toBe(400);
    expect((await patchMe(access_token, { default_rest_sec: 5000 })).status).toBe(400);
    const anonymous = await app.request('/v1/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units: 'lb' }),
    });
    expect(anonymous.status).toBe(401);
  });
});
