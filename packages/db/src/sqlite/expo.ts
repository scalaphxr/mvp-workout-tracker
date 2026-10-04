// Deep imports on purpose: the package root also loads the live-query hooks, which need
// `expo-sqlite` itself to be installed next to drizzle-orm.
import { drizzle } from 'drizzle-orm/expo-sqlite/driver';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { type LocalDb, localMigrations, schema } from './index';

/**
 * Wraps an opened expo-sqlite database (`openDatabaseSync`) and brings its tables up to date.
 */
export async function openLocalDb(database: Parameters<typeof drizzle>[0]): Promise<LocalDb> {
  const db = drizzle(database, { schema });
  await migrate(db, localMigrations);
  return db;
}
