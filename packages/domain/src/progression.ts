import type { ReasonCode } from '@mvp/schemas';

/** A work set as it was done. Warm-up sets do not take part in progression. */
export interface WorkSet {
  /** `null` – the set was skipped. */
  reps: number | null;
  weight_kg: number | null;
  rir: number | null;
}

export interface ProgressionInput {
  /** Planned number of work sets. */
  sets: number;
  rep_min: number;
  rep_max: number;
  /** The weight step; `null` – the exercise carries no load and progresses in reps. */
  step_kg: number | null;
  /** The sets done, in order. Sets not done at all count as skipped. */
  work_sets: readonly WorkSet[];
  /** Workouts in a row before this one that failed the range. */
  fail_streak: number;
  /** Smart progression by RIR (a Pro feature). */
  smart: boolean;
}

export interface Plan {
  next_weight_kg: number | null;
  /** How many reps to aim for in the set the explanation points at. */
  next_target_reps: number;
  fail_streak: number;
  reason_code: ReasonCode;
  /** Numbers the explanation is built from on the phone. */
  reason_params: Record<string, number>;
}

/** Ten percent off, rounded down to the step; never below one step. */
export function reducedWeight(weightKg: number, stepKg: number): number {
  const steps = Math.floor((weightKg * 0.9) / stepKg + 1e-9);
  return Math.round(Math.max(steps, 1) * stepKg * 1000) / 1000;
}

/** The weight most of the sets were done with; of two equally common ones, the later. */
function workingWeight(sets: readonly WorkSet[]): number | null {
  const counts = new Map<number, number>();
  let best: number | null = null;
  for (const set of sets) {
    if (set.reps === null || set.weight_kg === null) continue;
    const seen = (counts.get(set.weight_kg) ?? 0) + 1;
    counts.set(set.weight_kg, seen);
    if (best === null || seen >= (counts.get(best) ?? 0)) best = set.weight_kg;
  }
  return best;
}

/**
 * Double progression (spec 6.3): what to do next time, given how an exercise went. Returns
 * `null` when no set was done, so the previous plan stands.
 */
export function planNext(input: ProgressionInput): Plan | null {
  const { sets, rep_min, rep_max, step_kg } = input;
  // A set that was not done is a skipped set: it did not reach the top of the range.
  const reps = Array.from({ length: Math.max(sets, input.work_sets.length) }, (_, index) => {
    return input.work_sets[index]?.reps ?? null;
  });
  const done = reps.filter((value): value is number => value !== null);
  if (done.length === 0) return null;

  const weight = workingWeight(input.work_sets);
  // The weakest set, the later one of equals: the explanation points at it.
  let weakest = 0;
  reps.forEach((value, index) => {
    if ((value ?? 0) <= (reps[weakest] ?? 0)) weakest = index;
  });
  const set_number = weakest + 1;
  const weakestReps = reps[weakest] ?? 0;

  // An exercise without a load only ever adds reps.
  if (step_kg === null || weight === null) {
    return {
      next_weight_kg: null,
      next_target_reps: Math.max(weakestReps + 1, rep_min),
      fail_streak: 0,
      reason_code: 'reps_only',
      reason_params: { set_number, target_reps: Math.max(weakestReps + 1, rep_min) },
    };
  }

  // 1. Every set done, each at the top of the range (a set to failure counts too).
  if (reps.every((value) => value !== null && value >= rep_max)) {
    const rirs = input.work_sets.map((set) => set.rir);
    const spare =
      input.smart && rirs.every((rir): rir is number => rir !== null)
        ? rirs.reduce((sum, rir) => sum + rir, 0) / rirs.length
        : 0;
    const steps = spare >= 3 ? 2 : 1;
    return {
      next_weight_kg: weight + steps * step_kg,
      next_target_reps: rep_min,
      fail_streak: 0,
      reason_code: steps === 2 ? 'increase_fast' : 'increase',
      reason_params: { step_kg: steps * step_kg, sets, reps: rep_max },
    };
  }

  // 2. Half of the sets or more below the range: the workout failed for this exercise.
  const below = done.filter((value) => value < rep_min).length;
  if (below * 2 >= sets) {
    const fail_streak = input.fail_streak + 1;
    const lowest = reps.findIndex((value) => value !== null && value < rep_min);
    const params = { set_number: lowest + 1, reps: reps[lowest] ?? 0, rep_min };
    // The app only offers to drop the weight; it stays until the user agrees.
    return fail_streak >= 2
      ? {
          next_weight_kg: weight,
          next_target_reps: rep_min,
          fail_streak,
          reason_code: 'reduce_offer',
          reason_params: { ...params, reduced_weight_kg: reducedWeight(weight, step_kg) },
        }
      : {
          next_weight_kg: weight,
          next_target_reps: rep_min,
          fail_streak,
          reason_code: 'retry',
          reason_params: params,
        };
  }

  // 3. Otherwise the weight stays and the weakest set gets one more rep.
  const target_reps = Math.min(Math.max(weakestReps + 1, rep_min), rep_max);
  return {
    next_weight_kg: weight,
    next_target_reps: target_reps,
    fail_streak: 0,
    reason_code: 'same',
    reason_params: { set_number, target_reps },
  };
}

/** The user agreed to the offered reduction: the weight drops and the count starts over. */
export function acceptReduction(plan: Plan): Plan {
  const { reduced_weight_kg, ...params } = plan.reason_params;
  if (plan.reason_code !== 'reduce_offer' || reduced_weight_kg === undefined) return plan;
  return {
    next_weight_kg: reduced_weight_kg,
    next_target_reps: plan.next_target_reps,
    fail_streak: 0,
    reason_code: 'reduced',
    reason_params: params,
  };
}

// --- Deload (spec 6.4) ---

/** How an exercise went in one workout. */
export interface ExerciseResult {
  weight_kg: number | null;
  /** Reps of all work sets together. */
  total_reps: number;
}

const DELOAD_WINDOW = 3;

/** Neither the weight nor the reps grew over the last three workouts of the day. */
export function hasStalled(history: readonly ExerciseResult[]): boolean {
  if (history.length < DELOAD_WINDOW) return false;
  const recent = history.slice(-DELOAD_WINDOW);
  return recent.every((result, index) => {
    const previous = recent[index - 1];
    if (!previous) return true;
    return (
      (result.weight_kg ?? 0) <= (previous.weight_kg ?? 0) &&
      result.total_reps <= previous.total_reps
    );
  });
}

/**
 * A deload week is offered when half of the exercises of a day or more have stalled.
 * `histories` – one list per exercise, oldest workout first.
 */
export function shouldOfferDeload(histories: readonly (readonly ExerciseResult[])[]): boolean {
  if (histories.length === 0) return false;
  return histories.filter(hasStalled).length * 2 >= histories.length;
}

/** A deload week keeps the weight and halves the sets. */
export const deloadSets = (sets: number) => Math.max(1, Math.ceil(sets / 2));

// --- Records and totals (spec 6.13) ---

/** Estimated one-rep maximum by Epley. */
export const epley = (weightKg: number, reps: number) => weightKg * (1 + reps / 30);

export type RecordKind = 'weight' | 'reps_at_weight' | 'e1rm';

interface LoggedSet {
  weight_kg: number | null;
  reps: number | null;
}

/**
 * The records an exercise set in a workout, against everything done before. The first
 * workout of an exercise sets none: there is nothing to beat yet.
 */
export function findRecords(
  session: readonly LoggedSet[],
  earlier: readonly LoggedSet[],
): { kind: RecordKind; weight_kg: number; reps: number }[] {
  const lifted = (sets: readonly LoggedSet[]) =>
    sets.flatMap((set) =>
      set.weight_kg !== null && set.reps !== null && set.weight_kg > 0 && set.reps > 0
        ? [{ weight_kg: set.weight_kg, reps: set.reps }]
        : [],
    );
  const before = lifted(earlier);
  const now = lifted(session);
  if (before.length === 0 || now.length === 0) return [];

  const best = <T>(sets: T[], value: (set: T) => number) =>
    sets.reduce((top, set) => (value(set) > value(top) ? set : top));
  const records: { kind: RecordKind; weight_kg: number; reps: number }[] = [];

  const heaviest = best(now, (set) => set.weight_kg);
  if (heaviest.weight_kg > Math.max(...before.map((set) => set.weight_kg))) {
    records.push({ kind: 'weight', ...heaviest });
  } else {
    // More reps with a weight lifted before; a new top weight already says more.
    for (const set of now) {
      const same = before.filter((old) => old.weight_kg === set.weight_kg);
      if (same.length > 0 && set.reps > Math.max(...same.map((old) => old.reps))) {
        const known = records.find((r) => r.kind === 'reps_at_weight' && r.weight_kg === set.weight_kg);
        if (!known) records.push({ kind: 'reps_at_weight', ...set });
        else if (set.reps > known.reps) known.reps = set.reps;
      }
    }
  }

  const strongest = best(now, (set) => epley(set.weight_kg, set.reps));
  const previous = Math.max(...before.map((set) => epley(set.weight_kg, set.reps)));
  if (epley(strongest.weight_kg, strongest.reps) > previous) {
    records.push({ kind: 'e1rm', ...strongest });
  }
  return records;
}

/** Volume of a workout: weight × reps over the work sets. */
export const volumeKg = (sets: readonly LoggedSet[]) =>
  sets.reduce((sum, set) => sum + (set.weight_kg ?? 0) * (set.reps ?? 0), 0);

// --- The round of a program ---

/**
 * Where the pointer of a program goes after a workout of the day at `position` (among
 * `dayCount` regular days): to the next day, and into a new cycle after the last one.
 */
export function advancePointer(
  position: number,
  dayCount: number,
  cycle: number,
): { next_day_position: number; cycle_number: number } {
  const next = position + 1;
  return next >= dayCount
    ? { next_day_position: 0, cycle_number: cycle + 1 }
    : { next_day_position: next, cycle_number: cycle };
}
