import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { type Db, emailCodes, refreshTokens, type UserRow, users } from '@mvp/db';
import type { AuthResponse, Locale, Tokens, User } from '@mvp/schemas';
import { and, desc, eq, gt, isNull, lt, sql } from '@mvp/db';
import { jwtVerify, SignJWT } from 'jose';
import { v7 as uuidv7 } from 'uuid';

import { ApiError, rateLimited } from './errors';
import type { Mailer } from './mailer';

export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_SEC = 60;
export const MAX_CODES_PER_HOUR = 5;
export const MAX_CODE_ATTEMPTS = 5;

const HOUR_MS = 60 * 60 * 1000;

export interface AuthDeps {
  db: Db;
  mailer: Mailer;
  jwtSecret: string;
  now: () => Date;
}

const invalidCode = () => new ApiError(400, 'invalid_code', 'The code is wrong or has expired');
const invalidRefreshToken = () =>
  new ApiError(401, 'invalid_refresh_token', 'The refresh token is invalid, expired or revoked');

const secretKey = (secret: string) => new TextEncoder().encode(secret);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** The code is short, so it is stored as an HMAC bound to the email, never in plain text. */
const hashCode = (secret: string, email: string, code: string) =>
  createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export function toUserDto(user: UserRow): User {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    locale: user.locale,
    units: user.units,
    ai_enabled: user.aiEnabled,
    default_rest_sec: user.defaultRestSec,
    created_at: user.createdAt.toISOString(),
  };
}

export async function startEmailLogin(
  deps: AuthDeps,
  input: { email: string; locale?: Locale },
): Promise<{ resend_after_sec: number }> {
  const { db } = deps;
  const now = deps.now();

  const recent = await db
    .select({ createdAt: emailCodes.createdAt })
    .from(emailCodes)
    .where(
      and(
        eq(emailCodes.email, input.email),
        gt(emailCodes.createdAt, new Date(now.getTime() - HOUR_MS)),
      ),
    )
    .orderBy(desc(emailCodes.createdAt));

  const secondsUntil = (date: Date) => Math.ceil((date.getTime() - now.getTime()) / 1000);

  const latest = recent[0];
  if (latest) {
    const cooldown = secondsUntil(new Date(latest.createdAt.getTime() + RESEND_COOLDOWN_SEC * 1000));
    if (cooldown > 0) throw rateLimited(cooldown);
  }
  const oldest = recent[MAX_CODES_PER_HOUR - 1];
  if (oldest) {
    throw rateLimited(secondsUntil(new Date(oldest.createdAt.getTime() + HOUR_MS)));
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const id = uuidv7();
  await db.insert(emailCodes).values({
    id,
    email: input.email,
    codeHash: hashCode(deps.jwtSecret, input.email, code),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    createdAt: now,
  });

  try {
    await deps.mailer.sendLoginCode({ email: input.email, code, locale: input.locale ?? 'en' });
  } catch (error) {
    // The user never got this code: do not let it count towards the limits.
    await db.delete(emailCodes).where(eq(emailCodes.id, id));
    throw error;
  }

  return { resend_after_sec: RESEND_COOLDOWN_SEC };
}

export async function verifyEmailCode(
  deps: AuthDeps,
  input: { email: string; code: string },
): Promise<AuthResponse> {
  const { db } = deps;
  const now = deps.now();

  const [latest] = await db
    .select()
    .from(emailCodes)
    .where(
      and(
        eq(emailCodes.email, input.email),
        isNull(emailCodes.consumedAt),
        gt(emailCodes.expiresAt, now),
      ),
    )
    .orderBy(desc(emailCodes.createdAt))
    .limit(1);
  if (!latest) throw invalidCode();

  // Count the attempt before comparing, atomically, so parallel guesses cannot exceed the limit.
  const [counted] = await db
    .update(emailCodes)
    .set({ attempts: sql`${emailCodes.attempts} + 1` })
    .where(and(eq(emailCodes.id, latest.id), lt(emailCodes.attempts, MAX_CODE_ATTEMPTS)))
    .returning({ id: emailCodes.id });
  if (!counted) {
    throw new ApiError(429, 'too_many_attempts', 'Too many wrong attempts, request a new code');
  }

  if (!safeEqual(latest.codeHash, hashCode(deps.jwtSecret, input.email, input.code))) {
    throw invalidCode();
  }

  const [consumed] = await db
    .update(emailCodes)
    .set({ consumedAt: now })
    .where(and(eq(emailCodes.id, latest.id), isNull(emailCodes.consumedAt)))
    .returning({ id: emailCodes.id });
  if (!consumed) throw invalidCode();

  const [user] = await db
    .insert(users)
    .values({ id: uuidv7(), email: input.email, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: users.email, set: { email: input.email } })
    .returning();
  if (!user) throw new Error('Failed to create the user');

  const tokens = await issueTokens(deps, user.id, uuidv7());
  return { ...tokens, user: toUserDto(user) };
}

async function issueTokens(deps: AuthDeps, userId: string, familyId: string): Promise<Tokens> {
  const now = deps.now();
  const issuedAt = Math.floor(now.getTime() / 1000);

  const accessToken = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SEC)
    .sign(secretKey(deps.jwtSecret));

  const refreshToken = randomBytes(32).toString('base64url');
  await deps.db.insert(refreshTokens).values({
    id: uuidv7(),
    userId,
    familyId,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    createdAt: now,
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: ACCESS_TOKEN_TTL_SEC,
  };
}

/** Rotation: the presented token is revoked and a new one of the same family is issued. */
export async function refreshSession(deps: AuthDeps, refreshToken: string): Promise<Tokens> {
  const { db } = deps;
  const now = deps.now();
  const tokenHash = sha256(refreshToken);

  const [rotated] = await db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, now),
      ),
    )
    .returning();

  if (!rotated) {
    // An already rotated token came back: it may be stolen, so the whole family is revoked.
    const [known] = await db
      .select({ familyId: refreshTokens.familyId, revokedAt: refreshTokens.revokedAt })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));
    if (known?.revokedAt) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.familyId, known.familyId), isNull(refreshTokens.revokedAt)));
    }
    throw invalidRefreshToken();
  }

  return issueTokens(deps, rotated.userId, rotated.familyId);
}

export async function logout(deps: AuthDeps, refreshToken: string): Promise<void> {
  await deps.db
    .update(refreshTokens)
    .set({ revokedAt: deps.now() })
    .where(and(eq(refreshTokens.tokenHash, sha256(refreshToken)), isNull(refreshTokens.revokedAt)));
}

/** Returns the user id from a valid access token. */
export async function verifyAccessToken(deps: AuthDeps, token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secretKey(deps.jwtSecret), {
      algorithms: ['HS256'],
      currentDate: deps.now(),
    });
    if (!payload.sub) throw new Error('No subject');
    return payload.sub;
  } catch {
    throw new ApiError(401, 'unauthorized', 'The access token is missing, invalid or expired');
  }
}
