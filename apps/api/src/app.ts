import { users } from '@mvp/db';
import {
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
  type MeResponse,
  RefreshRequestSchema,
  type Tokens,
} from '@mvp/schemas';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import {
  type AuthDeps,
  logout,
  refreshSession,
  startEmailLogin,
  toUserDto,
  verifyAccessToken,
  verifyEmailCode,
} from './auth';
import { type CatalogDeps, createCatalogService, requireAdmin } from './catalog';
import { ApiError, parseBody, parseQuery } from './errors';

export type AppDeps = AuthDeps & CatalogDeps;

export function createApp(deps: AppDeps) {
  const app = new Hono<{ Variables: { userId: string } }>();
  const catalog = createCatalogService(deps);

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

  app.use('/v1/me', async (c, next) => {
    const [scheme, token] = (c.req.header('Authorization') ?? '').split(' ');
    c.set('userId', await verifyAccessToken(deps, scheme === 'Bearer' && token ? token : ''));
    await next();
  });

  app.get('/v1/me', async (c) => {
    const [user] = await deps.db.select().from(users).where(eq(users.id, c.get('userId')));
    if (!user) throw new ApiError(401, 'unauthorized', 'The account no longer exists');
    return c.json<MeResponse>({ user: toUserDto(user) });
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
