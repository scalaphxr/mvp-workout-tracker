import { create } from 'zustand';

import { settingsStorage } from './storage';

const STORAGE_KEY = 'preferences';

/** A reminder at a time of day, as "HH:MM" in the user's own time zone. */
export interface TimedReminder {
  enabled: boolean;
  time: string;
}

/** What the user set up on this phone: the onboarding, goals, reminders. */
export interface Preferences {
  /** The first-launch slides were seen and a way to start was picked. */
  onboarded: boolean;
  /** Workouts a week that make a week of the series; `null` – taken from the active program. */
  weeklyGoal: number | null;
  /** Units of weight; `null` – by the region of the phone. */
  units: 'kg' | 'lb' | null;
  /** Rest between sets of a new exercise; `null` – by the goal and the kind of exercise. */
  defaultRestSec: number | null;
  /** Off by default (spec 6.11): with it off there is not a single AI button. */
  aiEnabled: boolean;
  reminders: {
    /** Days of the week, 1 – Monday … 7 – Sunday. */
    workout: TimedReminder & { days: number[] };
    weight: TimedReminder;
    /** "It has been a while": after 7 days without a workout. */
    inactive: { enabled: boolean };
  };
}

export const DEFAULT_PREFERENCES: Preferences = {
  onboarded: false,
  weeklyGoal: null,
  units: null,
  defaultRestSec: null,
  aiEnabled: false,
  reminders: {
    workout: { enabled: false, time: '18:00', days: [1, 3, 5] },
    weight: { enabled: false, time: '08:00' },
    inactive: { enabled: true },
  },
};

function read(): Preferences {
  try {
    const raw = settingsStorage.get(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const stored = JSON.parse(raw) as Partial<Preferences>;
    // A field added in a later version takes its default.
    return {
      ...DEFAULT_PREFERENCES,
      ...stored,
      reminders: { ...DEFAULT_PREFERENCES.reminders, ...stored.reminders },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export const usePreferences = create<Preferences & { set(patch: Partial<Preferences>): void }>(
  (set, get) => ({
    ...read(),
    set(patch) {
      set(patch);
      const { set: _set, ...preferences } = { ...get(), ...patch };
      settingsStorage.set(STORAGE_KEY, JSON.stringify(preferences));
    },
  }),
);
