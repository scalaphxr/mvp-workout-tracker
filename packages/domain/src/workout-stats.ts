import type { Exercise } from '@mvp/schemas';

import { MUSCLE_CATEGORIES, MUSCLE_CATEGORY_KEYS, type MuscleCategory } from './focus';

// --- Calories ---

/**
 * Metabolic equivalent of a resistance training session with its rests: "resistance (weight)
 * training, multiple exercises, 8–15 repetitions at varied resistance" in the Compendium of
 * Physical Activities (code 02050).
 */
export const STRENGTH_MET = 3.5;

export interface WorkoutKcalInput {
  /** From the start of the workout to its end. */
  durationSec: number;
  /** The morning weight nearest to the workout; `null` – the user never entered one. */
  bodyWeightKg: number | null;
  /** Sets with the calories a cardio machine showed, and how long they took. */
  logged: readonly { duration_sec: number | null; calories: number | null }[];
}

/**
 * Calories a workout burned, an estimate: MET × body weight × hours (kcal), the time of cardio
 * with calories from the machine counted by those calories instead. `null` – nothing to go by:
 * no body weight and no calories from a machine.
 */
export function workoutKcal({ durationSec, bodyWeightKg, logged }: WorkoutKcalInput): number | null {
  const measured = logged.filter((set) => set.calories !== null && set.calories > 0);
  const measuredKcal = measured.reduce((sum, set) => sum + (set.calories ?? 0), 0);
  const measuredSec = measured.reduce((sum, set) => sum + (set.duration_sec ?? 0), 0);
  if (bodyWeightKg === null || bodyWeightKg <= 0) {
    return measuredKcal > 0 ? Math.round(measuredKcal) : null;
  }
  const restSec = Math.max(0, durationSec - measuredSec);
  return Math.round(measuredKcal + (STRENGTH_MET * bodyWeightKg * restSec) / 3600);
}

// --- Sets per muscle group ---

export interface MuscleGroupSets {
  category: MuscleCategory;
  /** Work sets of exercises with a muscle of this group among their main ones. */
  sets: number;
  /** The same per muscle, the most worked first. */
  muscles: { code: string; sets: number }[];
}

const CATEGORY_OF: ReadonlyMap<string, MuscleCategory> = new Map(
  MUSCLE_CATEGORY_KEYS.flatMap((category) =>
    MUSCLE_CATEGORIES[category].map((code): [string, MuscleCategory] => [code, category]),
  ),
);

/** Exercises that load muscles; cardio and stretching only move them. */
const LOADS: ReadonlySet<Exercise['kind']> = new Set(['strength', 'bodyweight', 'timed']);

/**
 * How many work sets a workout gave each muscle group: "chest 12, shoulders 9". A set counts
 * for the main muscles of its exercise, once per group even when it works two muscles of it
 * (a bench press is one set of chest, not one per head). Groups with the most sets first.
 */
export function setsByMuscleGroup(
  entries: readonly { exercise: Pick<Exercise, 'kind' | 'primary_muscles'>; sets: number }[],
): MuscleGroupSets[] {
  const groups = new Map<MuscleCategory, { sets: number; muscles: Map<string, number> }>();
  for (const { exercise, sets } of entries) {
    if (sets <= 0 || !LOADS.has(exercise.kind)) continue;
    const touched = new Set<MuscleCategory>();
    for (const code of new Set(exercise.primary_muscles)) {
      const category = CATEGORY_OF.get(code);
      if (!category) continue;
      const group = groups.get(category) ?? { sets: 0, muscles: new Map<string, number>() };
      groups.set(category, group);
      group.muscles.set(code, (group.muscles.get(code) ?? 0) + sets);
      touched.add(category);
    }
    for (const category of touched) groups.get(category)!.sets += sets;
  }

  const order = (category: MuscleCategory) => MUSCLE_CATEGORY_KEYS.indexOf(category);
  return [...groups.entries()]
    .map(([category, group]) => ({
      category,
      sets: group.sets,
      muscles: [...group.muscles.entries()]
        .map(([code, sets]) => ({ code, sets }))
        .sort((a, b) => b.sets - a.sets),
    }))
    .sort((a, b) => b.sets - a.sets || order(a.category) - order(b.category));
}
