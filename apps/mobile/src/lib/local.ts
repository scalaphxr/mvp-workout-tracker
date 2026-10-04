import type { SyncChange } from '@mvp/schemas';
import { create } from 'zustand';

import type { DataContext } from '@/data/context';

import { api } from './api';
import { data } from './db';
import { settingsStorage } from './storage';

/** Grows with every write to the phone database: screens that read from it follow it. */
const useVersion = create(() => ({ version: 0 }));

/**
 * Reads from the phone database during render and reads again after any `mutate`. SQLite on
 * the phone answers synchronously, so there is no loading state.
 */
export function useLocal<T>(read: (ctx: DataContext) => T): T {
  // The result depends on the database, which the compiler cannot see: never cache it.
  'use no memo';
  useVersion((state) => state.version);
  return read(data());
}

/** Writes to the phone database and refreshes every screen that reads from it. */
export function mutate<T>(write: (ctx: DataContext) => T): T {
  const result = write(data());
  useVersion.setState((state) => ({ version: state.version + 1 }));
  return result;
}

// --- The active program ---

const ACTIVE_PROGRAM_KEY = 'programs.active';

/** The program workouts are taken from. Lives in settings until workouts need more. */
export const useActiveProgram = create<{ id: string | null; set(id: string | null): void }>(
  (set) => ({
    id: settingsStorage.get(ACTIVE_PROGRAM_KEY),
    set(id) {
      if (id === null) settingsStorage.remove(ACTIVE_PROGRAM_KEY);
      else settingsStorage.set(ACTIVE_PROGRAM_KEY, id);
      set({ id });
    },
  }),
);

// --- Sending rows to the server ---

const DEVICE_ID_KEY = 'device.id';

function deviceId(): string {
  let id = settingsStorage.get(DEVICE_ID_KEY);
  if (!id) {
    id = data().newId();
    settingsStorage.set(DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * Sends rows to the server before something there needs them (a program before it is shared,
 * a gym profile before a program is fitted to it). Throws if the server refuses any row.
 */
export async function pushChanges(changes: SyncChange[]): Promise<void> {
  if (changes.length === 0) return;
  const { rejected } = await api.syncPush(deviceId(), changes);
  if (rejected.length > 0) {
    throw new Error(`The server rejected ${rejected.length} rows: ${rejected[0]?.code}`);
  }
}
