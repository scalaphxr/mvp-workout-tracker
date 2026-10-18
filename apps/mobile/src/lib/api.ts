import {
  AdoptResponseSchema,
  ApiErrorSchema,
  AuthResponseSchema,
  CatalogResponseSchema,
  CatalogVersionResponseSchema,
  EmailStartResponseSchema,
  type Locale,
  MeResponseSchema,
  type MeUpdate,
  ShareCodeListResponseSchema,
  ShareCodePreviewResponseSchema,
  ShareCodeSchema,
  type SupportRequest,
  type SyncChange,
  SyncPullResponseSchema,
  SyncPushResponseSchema,
  TokensSchema,
} from '@mvp/schemas';
import type { z } from 'zod';

import { useAuthStore } from './auth-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/** `code` is an error code of the API, or `network` when the server could not be reached. */
export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryAfterSec?: number,
  ) {
    super(message);
  }
}

interface RequestOptions<S extends z.ZodType | null> {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string;
  /** Schema of the response body, `null` for responses without a body. */
  schema: S;
}

async function request<S extends z.ZodType | null>(
  path: string,
  options: RequestOptions<S>,
): Promise<S extends z.ZodType ? z.output<S> : void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(options.accessToken && { Authorization: `Bearer ${options.accessToken}` }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiRequestError('network', 'The server is unreachable');
  }

  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(await response.json().catch(() => undefined));
    const retryAfter = Number(response.headers.get('Retry-After'));
    throw new ApiRequestError(
      parsed.success ? parsed.data.error.code : 'internal',
      parsed.success ? parsed.data.error.message : `HTTP ${response.status}`,
      retryAfter > 0 ? retryAfter : undefined,
    );
  }

  type Result = S extends z.ZodType ? z.output<S> : void;
  if (options.schema === null) return undefined as Result;
  return options.schema.parse(await response.json()) as Result;
}

let refreshing: Promise<string> | null = null;

/** Several requests may hit an expired token at once: they share one refresh. */
function refreshAccessToken(refreshToken: string): Promise<string> {
  refreshing ??= request('/v1/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
    schema: TokensSchema,
  })
    .then((tokens) => {
      useAuthStore.getState().setSession(tokens);
      return tokens.access_token;
    })
    .catch((error: unknown) => {
      // The session is over for good; a network failure is not a reason to sign out.
      if (error instanceof ApiRequestError && error.code === 'invalid_refresh_token') {
        useAuthStore.getState().clearSession();
      }
      throw error;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** A request on behalf of the signed-in user; an expired access token is refreshed once. */
async function authedRequest<S extends z.ZodType | null>(
  path: string,
  options: Omit<RequestOptions<S>, 'accessToken'>,
) {
  const session = useAuthStore.getState().session;
  if (!session) throw new ApiRequestError('unauthorized', 'Not signed in');

  try {
    return await request(path, { ...options, accessToken: session.accessToken });
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.code !== 'unauthorized') throw error;
    const accessToken = await refreshAccessToken(session.refreshToken);
    return request(path, { ...options, accessToken });
  }
}

export const api = {
  startEmailLogin: (email: string, locale: Locale) =>
    request('/v1/auth/email/start', {
      method: 'POST',
      body: { email, locale },
      schema: EmailStartResponseSchema,
    }),

  verifyEmailCode: (email: string, code: string) =>
    request('/v1/auth/email/verify', {
      method: 'POST',
      body: { email, code },
      schema: AuthResponseSchema,
    }),

  logout: (refreshToken: string) =>
    request('/v1/auth/logout', {
      method: 'POST',
      body: { refresh_token: refreshToken },
      schema: null,
    }),

  me: () => authedRequest('/v1/me', { schema: MeResponseSchema }),

  /** Settings of the account kept on the server too: units, the default rest. */
  updateMe: (body: MeUpdate) =>
    authedRequest('/v1/me', { method: 'PATCH', body, schema: MeResponseSchema }),

  /** A message of the support form; a guest may send one too. */
  support: (body: SupportRequest) =>
    useAuthStore.getState().session
      ? authedRequest('/v1/support', { method: 'POST', body, schema: null })
      : request('/v1/support', { method: 'POST', body, schema: null }),

  /** Deletes the account and all its data on the server, for good. */
  deleteAccount: () => authedRequest('/v1/me', { method: 'DELETE', schema: null }),

  catalogVersion: () => request('/v1/catalog/version', { schema: CatalogVersionResponseSchema }),

  /** `since` – the version the phone already has. */
  catalog: (since: number) =>
    request(`/v1/catalog?since=${since}`, { schema: CatalogResponseSchema }),

  syncPush: (deviceId: string, changes: SyncChange[]) =>
    authedRequest('/v1/sync/push', {
      method: 'POST',
      body: { device_id: deviceId, changes },
      schema: SyncPushResponseSchema,
    }),

  syncPull: (cursor: string | null) =>
    authedRequest(`/v1/sync/pull${cursor ? `?cursor=${cursor}` : ''}`, {
      schema: SyncPullResponseSchema,
    }),

  shareCodes: (programId: string) =>
    authedRequest(`/v1/programs/${programId}/share-codes`, { schema: ShareCodeListResponseSchema }),

  createShareCode: (programId: string, expiresInDays: 7 | 30 | null) =>
    authedRequest(`/v1/programs/${programId}/share-codes`, {
      method: 'POST',
      body: { expires_in_days: expiresInDays },
      schema: ShareCodeSchema,
    }),

  revokeShareCode: (code: string) =>
    authedRequest(`/v1/share-codes/${code}`, { method: 'DELETE', schema: null }),

  /** `code` – whatever the user typed; the server normalises it. */
  previewShareCode: (code: string) =>
    authedRequest(`/v1/share-codes/${encodeURIComponent(code.trim())}`, {
      schema: ShareCodePreviewResponseSchema,
    }),

  adoptShareCode: (code: string, gymProfileId: string) =>
    authedRequest(`/v1/share-codes/${encodeURIComponent(code.trim())}/adopt`, {
      method: 'POST',
      body: { gym_profile_id: gymProfileId },
      schema: AdoptResponseSchema,
    }),
};