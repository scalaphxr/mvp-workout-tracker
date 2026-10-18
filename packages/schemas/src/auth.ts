import { z } from 'zod';

export const LocaleSchema = z.enum(['ru', 'en']);
export type Locale = z.infer<typeof LocaleSchema>;

export const UnitsSchema = z.enum(['kg', 'lb']);
export type Units = z.infer<typeof UnitsSchema>;

/** Emails are compared case-insensitively: normalised before validation. */
export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const LOGIN_CODE_LENGTH = 6;
export const LoginCodeSchema = z.string().trim().regex(/^\d{6}$/);

export const UserSchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  locale: LocaleSchema,
  units: UnitsSchema,
  ai_enabled: z.boolean(),
  default_rest_sec: z.number().int(),
  created_at: z.iso.datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const TokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  /** Lifetime of the access token, seconds. */
  expires_in: z.number().int(),
});
export type Tokens = z.infer<typeof TokensSchema>;

// POST /v1/auth/email/start
export const EmailStartRequestSchema = z.object({
  email: EmailSchema,
  /** Language of the email with the code. */
  locale: LocaleSchema.optional(),
});
export type EmailStartRequest = z.input<typeof EmailStartRequestSchema>;

export const EmailStartResponseSchema = z.object({
  /** How long the client must wait before asking for another code, seconds. */
  resend_after_sec: z.number().int(),
});
export type EmailStartResponse = z.infer<typeof EmailStartResponseSchema>;

// POST /v1/auth/email/verify
export const EmailVerifyRequestSchema = z.object({
  email: EmailSchema,
  code: LoginCodeSchema,
});
export type EmailVerifyRequest = z.input<typeof EmailVerifyRequestSchema>;

export const AuthResponseSchema = TokensSchema.extend({ user: UserSchema });
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// POST /v1/auth/refresh, POST /v1/auth/logout
export const RefreshRequestSchema = z.object({
  refresh_token: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

// GET /v1/me
export const MeResponseSchema = z.object({ user: UserSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;

// POST /v1/support
export const SupportRequestSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  /** Where to answer; a signed-in user's own email is used when this is left out. */
  email: EmailSchema.optional(),
  app_version: z.string().max(40),
  device: z.string().max(200),
  last_sync_at: z.iso.datetime().nullable(),
  locale: LocaleSchema,
});
export type SupportRequest = z.input<typeof SupportRequestSchema>;

// PATCH /v1/me – only the fields that change.
export const MeUpdateSchema = z
  .object({
    display_name: z.string().trim().max(80).nullable(),
    locale: LocaleSchema,
    units: UnitsSchema,
    default_rest_sec: z.number().int().min(0).max(600),
    ai_enabled: z.boolean(),
  })
  .partial();
export type MeUpdate = z.infer<typeof MeUpdateSchema>;
