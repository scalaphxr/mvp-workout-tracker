import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/** Fields shared by every table with user data (spec, section 7). Ids are UUID v7. */
const common = {
  id: uuid('id').primaryKey(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  deletedAt: timestamptz('deleted_at'),
};

export const users = pgTable('users', {
  ...common,
  email: text('email').unique(),
  appleSub: text('apple_sub').unique(),
  googleSub: text('google_sub').unique(),
  displayName: text('display_name'),
  locale: text('locale', { enum: ['ru', 'en'] }).notNull().default('en'),
  aiEnabled: boolean('ai_enabled').notNull().default(false),
  units: text('units', { enum: ['kg', 'lb'] }).notNull().default('kg'),
  defaultRestSec: integer('default_rest_sec').notNull().default(120),
  // No foreign key yet: `programs` arrives with stage 2.
  activeProgramId: uuid('active_program_id'),
});

/** One-time login codes sent by email. Only an HMAC of the code is stored. */
export const emailCodes = pgTable(
  'email_codes',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamptz('expires_at').notNull(),
    consumedAt: timestamptz('consumed_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('email_codes_email_created_at_idx').on(t.email, t.createdAt)],
);

/**
 * Refresh tokens with rotation. Every rotation keeps the `familyId`, so reuse
 * of an already rotated token revokes the whole family.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('refresh_tokens_family_id_idx').on(t.familyId)],
);

export type UserRow = typeof users.$inferSelect;
