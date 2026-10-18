import { programTemplates } from '@mvp/content';
import { users } from '@mvp/db';
import { generateProgram } from '@mvp/domain';
import {
  AdoptRequestSchema,
  type AdoptResponse,
  type ApiErrorBody,
  type AuthResponse,
  type CatalogImportResponse,
  CatalogQuerySchema,
  type CatalogResponse,
  CatalogSeedSchema,
  type CatalogVersionResponse,
  EmailStartRequestSchema,
  type EmailStartResponse,
  EmailVerifyRequestSchema,
  type ExerciseListResponse,
  type ExerciseResponse,
  ExerciseSearchQuerySchema,
  GenerateRequestSchema,
  type MeResponse,
  MeUpdateSchema,
  RefreshRequestSchema,
  type ShareCode,
  ShareCodeCreateRequestSchema,
  type ShareCodeListResponse,
  type ShareCodePreviewResponse,
  SyncPullQuerySchema,
  type SyncPullResponse,
  SupportRequestSchema,
  SyncPushRequestSchema,
  type SyncPushResponse,
  type Tokens,
} from '@mvp/schemas';
import { eq } from '@mvp/db';
import { getConnInfo } from '@hono/node-server/conninfo';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';

import {
  type AuthDeps,
  deleteAccount,
  logout,
  refreshSession,
  startEmailLogin,
  toUserDto,
  verifyAccessToken,
  verifyEmailCode,
} from './auth';
import { type CatalogDeps, createCatalogService, requireAdmin } from './catalog';
import { ApiError, parseBody, parseQuery } from './errors';
import { type Caller, createShareService } from './share';
import { sendSupportMessage } from './support';
import { pullChanges, pushChanges } from './sync';

export type AppDeps = AuthDeps & CatalogDeps;

type Env = { Variables: { userId: string } };

export function createApp(deps: AppDeps) {
  const app = new Hono<Env>();
  const catalog = createCatalogService(deps);
  const share = createShareService({ ...deps, exercises: catalog.exercises });

  /**
   * The reverse proxy puts the client address into X-Forwarded-For; without a proxy
   * (development) it is taken from the connection.
   */
  const caller = (c: Context<Env>): Caller => {
    let ip = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || null;
    if (!ip) {
      try {
        ip = getConnInfo(c).remote.address ?? null;
      } catch {
        // No connection behind the request (tests).
      }
    }
    return { userId: c.get('userId'), ip };
  };

  // Auth is a Bearer token, not a cookie, so any origin may call the API.
  app.use('/v1/*', cors());

  app.get('/health', (c) => c.json({ ok: true }));

  app.post('/v1/auth/email/start', async (c) => {
    const body = await parseBody(c, EmailStartRequestSchema);
    return c.json<EmailStartResponse>(await startEmailLogin(deps, body));
  });

  app.post('/v1/auth/email/verify', async (c) => {
    const body = await parseBody(c, EmailVerifyRequestSchema);
    return c.json<AuthResponse>(await verifyEmailCode(deps, body));
  });

  app.post('/v1/auth/refresh', async (c) => {
    const body = await parseBody(c, RefreshRequestSchema);
    return c.json<Tokens>(await refreshSession(deps, body.refresh_token));
  });

  app.post('/v1/auth/logout', async (c) => {
    const body = await parseBody(c, RefreshRequestSchema);
    await logout(deps, body.refresh_token);
    return c.body(null, 204);
  });

  // Everything below needs a signed-in user.
  for (const path of ['/v1/me', '/v1/sync/*', '/v1/programs/*', '/v1/share-codes/*']) {
    app.use(path, async (c, next) => {
      const [scheme, token] = (c.req.header('Authorization') ?? '').split(' ');
      c.set('userId', await verifyAccessToken(deps, scheme === 'Bearer' && token ? token : ''));
      await next();
    });
  }

  app.post('/v1/sync/push', async (c) => {
    const body = await parseBody(c, SyncPushRequestSchema);
    return c.json<SyncPushResponse>(await pushChanges(deps, c.get('userId'), body.changes));
  });

  app.get('/v1/sync/pull', async (c) => {
    const { cursor } = parseQuery(c, SyncPullQuerySchema);
    return c.json<SyncPullResponse>(
      await pullChanges(deps, c.get('userId'), Number(cursor ?? 0)),
    );
  });

  // The same generation the phone runs offline, for clients that would rather ask.
  app.post('/v1/programs/generate', async (c) => {
    const body = await parseBody(c, GenerateRequestSchema);
    return c.json(
      generateProgram(
        body.answers,
        programTemplates,
        await catalog.exercises(),
        new Set(body.equipment),
      ),
    );
  });

  app.post('/v1/programs/:id/share-codes', async (c) => {
    const body = await parseBody(c, ShareCodeCreateRequestSchema);
    return c.json<ShareCode>(
      await share.create(c.get('userId'), c.req.param('id'), body.expires_in_days),
    );
  });

  app.get('/v1/programs/:id/share-codes', async (c) =>
    c.json<ShareCodeListResponse>({
      codes: await share.list(c.get('userId'), c.req.param('id')),
    }),
  );

  app.delete('/v1/share-codes/:code', async (c) => {
    await share.revoke(c.get('userId'), c.req.param('code'));
    return c.body(null, 204);
  });

  app.get('/v1/share-codes/:code', async (c) =>
    c.json<ShareCodePreviewResponse>(await share.preview(caller(c), c.req.param('code'))),
  );

  app.post('/v1/share-codes/:code/adopt', async (c) => {
    const body = await parseBody(c, AdoptRequestSchema);
    return c.json<AdoptResponse>(
      await share.adopt(caller(c), c.req.param('code'), body.gym_profile_id),
    );
  });

  app.get('/v1/me', async (c) => {
    const [user] = await deps.db.select().from(users).where(eq(users.id, c.get('userId')));
    if (!user) throw new ApiError(401, 'unauthorized', 'The account no longer exists');
    return c.json<MeResponse>({ user: toUserDto(user) });
  });

  app.patch('/v1/me', async (c) => {
    const body = await parseBody(c, MeUpdateSchema);
    const [user] = await deps.db
      .update(users)
      .set({
        ...(body.display_name !== undefined && { displayName: body.display_name }),
        ...(body.locale && { locale: body.locale }),
        ...(body.units && { units: body.units }),
        ...(body.default_rest_sec !== undefined && { defaultRestSec: body.default_rest_sec }),
        ...(body.ai_enabled !== undefined && { aiEnabled: body.ai_enabled }),
        updatedAt: deps.now(),
      })
      .where(eq(users.id, c.get('userId')))
      .returning();
    if (!user) throw new ApiError(401, 'unauthorized', 'The account no longer exists');
    return c.json<MeResponse>({ user: toUserDto(user) });
  });

  app.delete('/v1/me', async (c) => {
    await deleteAccount(deps, c.get('userId'));
    return c.body(null, 204);
  });

  // Guests write to support too: the token is used when there is one, never required.
  app.post('/v1/support', async (c) => {
    const body = await parseBody(c, SupportRequestSchema);
    const [scheme, token] = (c.req.header('Authorization') ?? '').split(' ');
    const userId =
      scheme === 'Bearer' && token ? await verifyAccessToken(deps, token).catch(() => null) : null;
    await sendSupportMessage(deps, body, { userId, ip: caller(c).ip });
    return c.body(null, 204);
  });

  app.get('/v1/catalog/version', async (c) =>
    c.json<CatalogVersionResponse>({ version: await catalog.version() }),
  );

  app.get('/v1/catalog', async (c) => {
    const { since } = parseQuery(c, CatalogQuerySchema);
    return c.json<CatalogResponse>(await catalog.since(since));
  });

  app.get('/v1/exercises', async (c) => {
    const query = parseQuery(c, ExerciseSearchQuerySchema);
    const filters = {
      query: query.q,
      muscles: query.muscle,
      equipment: query.equipment,
      level: query.level,
    };
    return c.json<ExerciseListResponse>(
      await catalog.search(filters, query.locale, Number(query.cursor ?? 0), query.limit),
    );
  });

  app.get('/v1/exercises/:id', async (c) =>
    c.json<ExerciseResponse>({ exercise: await catalog.exercise(c.req.param('id')) }),
  );

  app.post('/v1/admin/catalog/import', async (c) => {
    requireAdmin(deps, c.req.header('Authorization'));
    const seed = await parseBody(c, CatalogSeedSchema);
    return c.json<CatalogImportResponse>(await catalog.import(seed));
  });

  app.notFound((c) =>
    c.json<ApiErrorBody>({ error: { code: 'not_found', message: 'Not found' } }, 404),
  );

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json<ApiErrorBody>(
        { error: { code: error.code, message: error.message } },
        error.status,
        error.headers,
      );
    }
    console.error(error);
    return c.json<ApiErrorBody>(
      { error: { code: 'internal', message: 'Internal server error' } },
      500,
    );
  });

  return app;
}
