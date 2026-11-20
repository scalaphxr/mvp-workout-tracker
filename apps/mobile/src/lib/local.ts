import { useIsFocused } from 'expo-router';
import { type DependencyList, useState } from 'react';
import { create } from 'zustand';

import type { DataContext } from '@/data/context';

import { data } from './db';
import { settingsStorage } from './storage';

/** Grows with every write to the phone database: screens that read from it follow it. */
const useVersion = create(() => ({ version: 0 }));

/**
 * Reads from the phone database during render. SQLite on the phone answers synchronously, so
 * there is no loading state.
 *
 * The read runs again only after a `mutate` or when one of `deps` changes – everything the read
 * takes from the component (an id, a filter), as with `useMemo`. Other renders (a press, a
 * timer, typing) reuse the last result instead of querying the database again.
 *
 * A screen out of sight (a tab behind another, a screen under the workout) does not follow
 * writes: it neither renders nor reads until it is shown again, then reads once.
 */
export function useLocal<T>(read: (ctx: DataContext) => T, deps: DependencyList = []): T {
  'use no memo';
  return useRead(read, deps, useIsFocused());
}

/** `useLocal` for what lives outside the screens, in the root layout: always follows writes. */
export function useLocalAlways<T>(read: (ctx: DataContext) => T, deps: DependencyList = []): T {
  'use no memo';
  return useRead(read, deps, true);
}

/** What a component last read: the version and the deps it was read at, and the result. */
interface Read<T> {
  /** The version last shown: a hidden screen keeps it, so writes elsewhere do not render it. */
  shown: number;
  at: { version: number; deps: DependencyList } | null;
  value: T | undefined;
}

function useRead<T>(read: (ctx: DataContext) => T, deps: DependencyList, live: boolean): T {
  // The result depends on the database, which the compiler cannot see: the version stands for it.
  'use no memo';
  // A box of the component's own, kept across renders. Filling it during render is safe: the
  // same version and deps always give the same result.
  const [last] = useState<Read<T>>(() => ({
    shown: useVersion.getState().version,
    at: null,
    value: undefined,
  }));
  const version = useVersion((state) => (live ? state.version : last.shown));
  /* eslint-disable react-hooks/immutability -- the box is a cache, not state: nothing renders from a change to it, and this function is left out of the compiler. */
  last.shown = version;
  if (last.at === null || last.at.version !== version || !sameDeps(last.at.deps, deps)) {
    last.value = read(data());
    last.at = { version, deps };
  }
  /* eslint-enable react-hooks/immutability */
  return last.value as T;
}

const sameDeps = (a: DependencyList, b: DependencyList) =>
  a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

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
