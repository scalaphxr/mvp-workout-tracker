import type { Equipment, Exercise } from '@mvp/schemas';

/** Points for a candidate replacement (spec 6.2). */
const SAME_PATTERN = 50;
const SAME_PRIMARY_MUSCLE = 30;
const SAME_MECHANICS = 10;
const HAS_HISTORY = 5;

/** The exercise can be done in a gym that has this equipment (codes): it needs all of its own. */
export function isAvailable(exercise: Exercise, equipment: ReadonlySet<string>): boolean {
  return exercise.equipment.every((code) => equipment.has(code));
}

export interface Alternative {
  exercise: Exercise;
  score: number;
  /** From a hand-made link: weight of the alternative = weight × ratio. `null` – no ratio. */
  weightRatio: number | null;
}

export interface AlternativeOptions {
  /** Equipment codes of the gym. */
  equipment: ReadonlySet<string>;
  /** Ids of exercises the user has already logged. */
  withHistory?: ReadonlySet<string>;
  /** Equipment that cannot be used right now ("the machine is taken"). */
  busy?: ReadonlySet<string>;
}

/**
 * Replacements for an exercise, best first. A candidate must be doable with the gym's equipment
 * and be related to the original: the same movement, a shared primary muscle or a hand-made link.
 */
export function rankAlternatives(
  exercise: Exercise,
  exercises: readonly Exercise[],
  options: AlternativeOptions,
): Alternative[] {
  const links = new Map(exercise.alternatives.map((link) => [link.slug, link]));
  const alternatives: Alternative[] = [];

  for (const candidate of exercises) {
    if (candidate.id === exercise.id) continue;
    if (!isAvailable(candidate, options.equipment)) continue;
    if (candidate.equipment.some((code) => options.busy?.has(code))) continue;

    const link = links.get(candidate.slug);
    const samePattern = candidate.movement_pattern === exercise.movement_pattern;
    const sameMuscle = candidate.primary_muscles.some((code) =>
      exercise.primary_muscles.includes(code),
    );
    if (!link && !samePattern && !sameMuscle) continue;

    alternatives.push({
      exercise: candidate,
      weightRatio: link?.weight_ratio ?? null,
      score:
        (samePattern ? SAME_PATTERN : 0) +
        (sameMuscle ? SAME_PRIMARY_MUSCLE : 0) +
        (candidate.mechanics === exercise.mechanics ? SAME_MECHANICS : 0) +
        (link?.priority ?? 0) +
        (options.withHistory?.has(candidate.id) ? HAS_HISTORY : 0),
    });
  }

  return alternatives.sort(
    (a, b) => b.score - a.score || a.exercise.slug.localeCompare(b.exercise.slug),
  );
}

/** The nearest multiple of the step; never less than one step for a positive weight. */
export function roundToStep(weightKg: number, stepKg: number): number {
  if (stepKg <= 0) return weightKg;
  const rounded = Math.round(weightKg / stepKg) * stepKg;
  // Steps like 1.25 and 2.5 are exact in binary; this only trims float noise of other steps.
  const clean = Math.round(rounded * 1000) / 1000;
  return weightKg > 0 ? Math.max(clean, stepKg) : clean;
}

export type SubstitutedWeight =
  /** The user has trained the new exercise: its own plan stands. */
  | { kind: 'history'; weightKg: number }
  /** Recalculated from the weight of the replaced exercise. */
  | { kind: 'ratio'; weightKg: number }
  /** Nothing to go by: the first set is a trial, the plan starts from the next workout. */
  | { kind: 'find' };

/** The weight to start a replacement with (spec 6.2). */
export function substitutedWeight(input: {
  /** The planned weight of the new exercise, if it has history. */
  historyWeightKg: number | null;
  /** The planned weight of the exercise being replaced. */
  currentWeightKg: number | null;
  weightRatio: number | null;
  stepKg: number;
}): SubstitutedWeight {
  if (input.historyWeightKg !== null) return { kind: 'history', weightKg: input.historyWeightKg };
  if (input.weightRatio !== null && input.currentWeightKg !== null) {
    return {
      kind: 'ratio',
      weightKg: roundToStep(input.currentWeightKg * input.weightRatio, input.stepKg),
    };
  }
  return { kind: 'find' };
}

export interface PlannedSubstitution {
  item_id: string;
  from_exercise_id: string;
  /** `null` – the gym has nothing to replace the exercise with: it stays, marked as unavailable. */
  to_exercise_id: string | null;
}

/**
 * Which exercises of a program cannot be done in a gym and what replaces each (the best
 * alternative). Used when a program is taken by code and when the gym profile changes.
 */
export function planSubstitutions(
  items: readonly { id: string; exercise_id: string }[],
  exercises: readonly Exercise[],
  equipment: ReadonlySet<string>,
): PlannedSubstitution[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const substitutions: PlannedSubstitution[] = [];

  for (const item of items) {
    const exercise = byId.get(item.exercise_id);
    // An exercise the catalog does not know (e.g. removed from it) is left as it is.
    if (!exercise || isAvailable(exercise, equipment)) continue;
    const [best] = rankAlternatives(exercise, exercises, { equipment });
    substitutions.push({
      item_id: item.id,
      from_exercise_id: exercise.id,
      to_exercise_id: best?.exercise.id ?? null,
    });
  }
  return substitutions;
}

/**
 * The weight step of an exercise in a gym: the step of the equipment that carries the load,
 * as set in the gym profile, else the catalog default. `null` – nothing to load (body weight).
 */
export function weightStepKg(
  exercise: Exercise,
  catalogEquipment: readonly Equipment[],
  /** Steps set in the gym profile, by equipment code. */
  gymSteps: ReadonlyMap<string, number | null> = new Map(),
): number | null {
  for (const code of exercise.equipment) {
    const item = catalogEquipment.find((candidate) => candidate.code === code);
    if (!item || item.default_increment_kg === null) continue;
    return gymSteps.get(code) ?? item.default_increment_kg;
  }
  return null;
}
