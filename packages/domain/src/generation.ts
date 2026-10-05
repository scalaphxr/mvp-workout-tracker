import type { Exercise, GenerationAnswers, Level } from '@mvp/schemas';

import { defaultItemParams, type ItemParams } from './program';
import { isAvailable } from './substitution';

/** What the questionnaire asks; the shape is checked by `GenerationAnswersSchema`. */
export type Answers = GenerationAnswers;

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'quads',
  'hamstrings',
  'biceps',
  'triceps',
  'calves',
  'core',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/**
 * A place in a day for one exercise: what it trains and which exercises can fill it, best
 * first. The first one the gym has equipment for is taken.
 */
export interface Slot {
  group: MuscleGroup;
  /** Exercise slugs. */
  candidates: readonly string[];
}

/** Day templates: for each day, its slots in order of importance. */
export interface Templates {
  slots: Readonly<Record<string, Slot>>;
  days: Readonly<Record<string, readonly string[]>>;
}

export type SplitKey =
  | 'full_body_ab'
  | 'full_body_abc'
  | 'chest_back_legs'
  | 'upper_lower'
  | 'upper_lower_cbl'
  | 'push_pull_legs';

const SPLIT_DAYS: Record<SplitKey, readonly string[]> = {
  full_body_ab: ['full_body_a', 'full_body_b'],
  full_body_abc: ['full_body_a', 'full_body_b', 'full_body_c'],
  chest_back_legs: ['chest', 'back', 'legs'],
  upper_lower: ['upper_a', 'lower_a', 'upper_b', 'lower_b'],
  upper_lower_cbl: ['upper_a', 'lower_a', 'chest', 'back', 'legs'],
  push_pull_legs: ['push_a', 'pull_a', 'legs', 'push_b', 'pull_b', 'lower_b'],
};

/** The split for a frequency and a level (the table of spec 6.1). */
export function chooseSplit(answers: Pick<Answers, 'frequency' | 'level' | 'split'>): SplitKey {
  switch (answers.frequency) {
    case 2:
      return 'full_body_ab';
    case '2-3':
      return 'full_body_abc';
    case 3:
      if (answers.level === 'beginner' || answers.split === 'full_body') return 'full_body_abc';
      return 'chest_back_legs';
    case 4:
      return 'upper_lower';
    case 5:
      return 'upper_lower_cbl';
    case 6:
      return 'push_pull_legs';
  }
}

/** Work sets per muscle group a week by level: the range, and the number aimed at. */
export const WEEKLY_SETS: Record<Level, { min: number; max: number; target: number }> = {
  beginner: { min: 8, max: 10, target: 9 },
  intermediate: { min: 10, max: 14, target: 12 },
  advanced: { min: 14, max: 18, target: 16 },
};

/** How many work sets fit a workout: its length less a 10-minute warm-up, 3 minutes a set. */
export const sessionSetCap = (durationMin: number) => Math.floor((durationMin - 10) / 3);

export interface DraftItem extends ItemParams {
  exercise_id: string;
  group: MuscleGroup;
}

export interface DraftProgram {
  split: SplitKey;
  /** Workouts a week the program is meant for. */
  days_per_week: number;
  /** Days in order; `key` names the day template (the phone turns it into a title). */
  days: { key: string; items: DraftItem[] }[];
  /** The limit of work sets per workout the days were fitted to. */
  set_cap: number;
  /** Work sets a week each muscle group ends up with. */
  weekly_sets: Partial<Record<MuscleGroup, number>>;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * A program from the questionnaire (spec 6.1): the split by frequency and level, exercises
 * the gym has equipment for, sets aimed at the weekly volume of the level and cut down to
 * what fits the workout. Nothing is saved: the result is a draft to look at.
 */
export function generateProgram(
  answers: Answers,
  templates: Templates,
  exercises: readonly Exercise[],
  equipment: ReadonlySet<string>,
): DraftProgram {
  const split = chooseSplit(answers);
  const bySlug = new Map(exercises.map((exercise) => [exercise.slug, exercise]));
  const cap = sessionSetCap(answers.duration_min);

  // 1. Fill the slots of every day with the first exercise the gym allows.
  const days = SPLIT_DAYS[split].map((key) => {
    const taken = new Set<string>();
    const picked: { exercise: Exercise; group: MuscleGroup }[] = [];
    for (const slotKey of templates.days[key] ?? []) {
      const slot = templates.slots[slotKey];
      const exercise = slot?.candidates
        .map((slug) => bySlug.get(slug))
        .find(
          (candidate): candidate is Exercise =>
            candidate !== undefined && !taken.has(candidate.id) && isAvailable(candidate, equipment),
        );
      // A slot nothing in the gym can fill is left out.
      if (!slot || !exercise) continue;
      taken.add(exercise.id);
      picked.push({ exercise, group: slot.group });
    }
    // 2. A short workout keeps the most important exercises: about 3 sets has to fit for each.
    return { key, picked: picked.slice(0, Math.max(2, Math.floor(cap / 3))) };
  });

  // 3. Sets per exercise, so that a muscle group gets about the weekly volume of the level.
  // Only the exercises that stayed count, so the volume of a dropped one goes to the others.
  const slotsPerGroup = new Map<MuscleGroup, number>();
  for (const { picked } of days) {
    for (const { group } of picked) slotsPerGroup.set(group, (slotsPerGroup.get(group) ?? 0) + 1);
  }
  const { target } = WEEKLY_SETS[answers.level];

  const drafted = days.map(({ key, picked }) => {
    const items: DraftItem[] = picked.map(({ exercise, group }) => {
      const params = defaultItemParams(exercise, answers.goal);
      // Timed holds and cardio keep their own number of sets.
      const counted = exercise.tracking === 'weight_reps' || exercise.tracking === 'reps';
      const sets = counted
        ? clamp(Math.round(target / (slotsPerGroup.get(group) ?? 1)), 2, 5)
        : params.sets;
      return { ...params, sets, exercise_id: exercise.id, group };
    });

    // 4. Fit the day into the workout: a set at a time off the exercise that has the most,
    // the less important one first.
    const total = () => items.reduce((sum, item) => sum + item.sets, 0);
    while (total() > cap) {
      const largest = items.reduce((top, item) => (item.sets >= top.sets ? item : top));
      if (largest.sets <= 1) break;
      largest.sets--;
    }
    return { key, items };
  });

  const weekly_sets: Partial<Record<MuscleGroup, number>> = {};
  for (const { items } of drafted) {
    for (const item of items) weekly_sets[item.group] = (weekly_sets[item.group] ?? 0) + item.sets;
  }

  return {
    split,
    days_per_week: answers.frequency === '2-3' ? 3 : answers.frequency,
    days: drafted,
    set_cap: cap,
    weekly_sets,
  };
}
