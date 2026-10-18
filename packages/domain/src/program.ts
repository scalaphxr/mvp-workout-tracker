import type { Equipment, Exercise, Goal, LocationType } from '@mvp/schemas';

// --- Supersets ---
// A superset is a run of neighbouring items of a day that share a group number.

type Groups = readonly (number | null)[];

/**
 * Makes the groups of a day's items (in order) consistent: a superset is at least two
 * neighbouring items, and groups are numbered 1, 2, 3… from the top.
 */
export function normalizeSupersets(groups: Groups): (number | null)[] {
  const result: (number | null)[] = groups.map(() => null);
  let next = 1;

  for (let start = 0; start < groups.length; ) {
    let end = start + 1;
    while (groups[start] !== null && end < groups.length && groups[end] === groups[start]) end++;
    if (groups[start] !== null && end - start >= 2) {
      result.fill(next++, start, end);
    }
    start = end;
  }
  return result;
}

/** Joins the item with the one below it; supersets either belongs to merge into one. */
export function linkWithNext(groups: Groups, index: number): (number | null)[] {
  if (index < 0 || index >= groups.length - 1) return normalizeSupersets(groups);

  const upper = groups[index] ?? null;
  const lower = groups[index + 1] ?? null;
  const joined = upper ?? lower ?? Math.max(0, ...groups.map((group) => group ?? 0)) + 1;

  return normalizeSupersets(
    groups.map((group, position) =>
      position === index ||
      position === index + 1 ||
      (group !== null && (group === upper || group === lower))
        ? joined
        : group,
    ),
  );
}

/** Takes the item out of its superset; what is left of it stays a superset only if still ≥ 2. */
export function unlink(groups: Groups, index: number): (number | null)[] {
  const group = groups[index] ?? null;
  if (group === null) return normalizeSupersets(groups);

  // Items below the removed one become a group of their own, or the two halves would rejoin.
  const split = Math.max(0, ...groups.map((value) => value ?? 0)) + 1;
  return normalizeSupersets(
    groups.map((value, position) => {
      if (position === index) return null;
      return value === group && position > index ? split : value;
    }),
  );
}

// --- Defaults for a new item of a program ---

export interface ItemParams {
  sets: number;
  /** Reps, or seconds for timed exercises, or minutes for cardio. */
  rep_min: number;
  rep_max: number;
  rest_sec: number;
  target_rir: number | null;
}

type Plan = Record<'compound' | 'isolation', Omit<ItemParams, 'sets'>>;

/** Rep ranges, rest and target RIR by goal (spec 6.1). */
const PLANS: Record<'strength' | 'mass' | 'cut' | 'maintenance', Plan> = {
  strength: {
    compound: { rep_min: 4, rep_max: 6, rest_sec: 180, target_rir: 2 },
    isolation: { rep_min: 8, rep_max: 12, rest_sec: 90, target_rir: 1 },
  },
  mass: {
    compound: { rep_min: 6, rep_max: 10, rest_sec: 120, target_rir: 2 },
    isolation: { rep_min: 10, rep_max: 15, rest_sec: 75, target_rir: 1 },
  },
  cut: {
    compound: { rep_min: 6, rep_max: 10, rest_sec: 120, target_rir: 2 },
    isolation: { rep_min: 10, rep_max: 15, rest_sec: 60, target_rir: 1 },
  },
  maintenance: {
    compound: { rep_min: 8, rep_max: 12, rest_sec: 90, target_rir: 2 },
    isolation: { rep_min: 12, rep_max: 15, rest_sec: 60, target_rir: 1 },
  },
};

/** What a new item starts with; the user changes it in the constructor. */
export function defaultItemParams(exercise: Exercise, goal: Goal | null): ItemParams {
  if (exercise.tracking === 'distance_time') {
    return { sets: 1, rep_min: 20, rep_max: 30, rest_sec: 0, target_rir: null };
  }
  if (exercise.tracking === 'time') {
    return { sets: 3, rep_min: 30, rep_max: 60, rest_sec: 60, target_rir: null };
  }
  // The spec has no table for endurance and general fitness: the gentlest plan is used.
  const plan = PLANS[goal === 'strength' || goal === 'mass' || goal === 'cut' ? goal : 'maintenance'];
  return { sets: 3, ...plan[exercise.mechanics] };
}

// --- Gym profile ---

/** Equipment codes a new gym profile of each kind starts with. `null` – everything. */
export const LOCATION_PRESETS: Record<LocationType, readonly string[] | null> = {
  gym: null,
  home: ['dumbbells', 'adjustable_bench', 'pull_up_bar', 'mat'],
  home_no_equipment: ['mat'],
  outdoor: ['pull_up_bar', 'dip_bars'],
};

/** The three weight steps a gym profile asks about (spec 6.3). */
export type StepGroup = 'dumbbells' | 'plates' | 'stack';

export const DEFAULT_STEPS_KG: Record<StepGroup, number> = { dumbbells: 2, plates: 2.5, stack: 5 };
/** The same in pounds (spec, "Локализация"): 5 lb dumbbells and barbell, 10 lb machines. */
export const DEFAULT_STEPS_LB: Record<StepGroup, number> = { dumbbells: 5, plates: 5, stack: 10 };

// Machines loaded with plates rather than a weight stack. Lives here until the catalog itself
// says how a piece of equipment is loaded.
const PLATE_LOADED_MACHINES = new Set(['smith_machine', 'hack_squat_machine', 'seated_calf_raise_machine']);

/** Which of the three steps applies to a piece of equipment; `null` – it carries no load. */
export function stepGroup(item: Equipment): StepGroup | null {
  if (item.default_increment_kg === null) return null;
  if (item.category === 'dumbbells') return 'dumbbells';
  if (item.category === 'barbells' || PLATE_LOADED_MACHINES.has(item.code)) return 'plates';
  return 'stack';
}
