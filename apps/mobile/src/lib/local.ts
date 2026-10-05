import { create } from 'zustand';

import type { DataContext } from '@/data/context';

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
