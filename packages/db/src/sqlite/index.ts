import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import { journal, migrations } from './migrations.generated';
import * as schema from './schema';

export { schema };
export * from './schema';

// Query helpers for the phone database: see the note in `../index.ts`.
export { and, asc, desc, eq, gt, inArray, isNull, lt, max, ne, or, sql } from 'drizzle-orm';

/**
 * The database on the phone, whatever driver is behind it: expo-sqlite in the app
 * (`./expo`), better-sqlite3 in tests (`./testing`).
 */
export type LocalDb = BaseSQLiteDatabase<'sync', unknown, typeof schema>;

/** What drizzle's `migrate` for expo-sqlite takes. */
export const localMigrations = { journal, migrations };
