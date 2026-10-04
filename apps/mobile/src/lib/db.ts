import { openLocalDb } from '@mvp/db/sqlite/expo';
import { uuidv7 } from '@mvp/domain';
import { getRandomBytes } from 'expo-crypto';
import { openDatabaseAsync, openDatabaseSync } from 'expo-sqlite';
import { Platform } from 'react-native';

import type { DataContext } from '@/data/context';

const DATABASE_NAME = 'mvp.db';

let context: DataContext | null = null;

async function open(): Promise<DataContext> {
  // The development web build only: SQLite in a browser needs a cross-origin isolated page, and
  // the dev server sends the headers for that (metro.config.js) on every path except "/".
  if (Platform.OS === 'web' && typeof SharedArrayBuffer === 'undefined') {
    if (location.pathname === '/') location.replace('/(tabs)');
    return new Promise(() => {});
  }
  // Also web only: the first synchronous call gives up before the SQLite worker has loaded,
  // so the worker is woken up with an asynchronous open first.
  if (Platform.OS === 'web') await (await openDatabaseAsync(DATABASE_NAME)).closeAsync();

  const db = await openLocalDb(openDatabaseSync(DATABASE_NAME));
  context = {
    db,
    now: () => new Date().toISOString(),
    newId: () => uuidv7(Date.now(), getRandomBytes(10)),
  };
  return context;
}

/** Opens the phone database and applies pending migrations; resolves once it can be used. */
export const dataReady: Promise<DataContext> = open();

/** The data context; screens are only rendered after `dataReady`, so it is always there. */
export function data(): DataContext {
  if (!context) throw new Error('The database is not open yet');
  return context;
}
