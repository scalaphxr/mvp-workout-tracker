import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { type LocalDb, localMigrations, schema } from './index';

/**
 * An in-memory copy of the phone database for tests in Node, built from the same bundled
 * migrations the app runs.
 */
export async function createTestDb(): Promise<LocalDb> {
  const db = drizzle(new Database(':memory:'), { schema });
  // The expo migrator only needs a synchronous SQLite session, which this one is.
  await migrate(db as never, localMigrations);
  return db;
}
