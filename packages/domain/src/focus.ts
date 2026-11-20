import type { Exercise, Level } from '@mvp/schemas';

import {
  type Answers,
  type DraftItem,
  type DraftProgram,
  type MuscleGroup,
  sessionSetCap,
} from './generation';
import { popularityPlace } from './popularity';
import { defaultItemParams } from './program';
import { isAvailable } from './substitution';

/** Categories of the library and of the muscle picker: every muscle is in exactly one. */
export const MUSCLE_CATEGORIES = {
  chest: ['chest'],
  back: ['lats', 'upper_back', 'traps', 'lower_back'],
  shoulders: ['front_delts', 'side_delts', 'rear_delts'],
  arms: ['biceps', 'triceps', 'forearms'],
  legs: ['quads', 'hamstrings', 'glutes', 'adductors', 'calves'],
  core: ['abs', 'obliques'],
} as const satisfies Record<string, readonly string[]>;

export type MuscleCategory = keyof typeof MUSCLE_CATEGORIES;
export const MUSCLE_CATEGORY_KEYS = Object.keys(MUSCLE_CATEGORIES) as MuscleCategory[];

/** The category all these muscles belong to; `null` for none or for several. */
export function categoryOfMuscles(muscles: readonly string[]): MuscleCategory | null {
  if (muscles.length === 0) return null;
  return (
    MUSCLE_CATEGORY_KEYS.find((category) => {
      const members: readonly string[] = MUSCLE_CATEGORIES[category];
      return muscles.every((code) => members.includes(code));
    }) ?? null
  );
}

/** How many filters a set of muscles counts for: a whole category is one. */
export function countMuscleFilters(muscles: readonly string[]): number {
  const category = categoryOfMuscles(muscles);
  const whole = category !== null && muscles.length === MUSCLE_CATEGORIES[category].length;
  return whole ? 1 : muscles.length;
}

/** What exercises are picked from: `equipment` is `null` when no gym is known. */
export interface FocusContext {
  exercises: readonly Exercise[];
  equipment: ReadonlySet<string> | null;
  level: Level;
  /** Ids of the exercises the user has done before. */
  known: ReadonlySet<string>;
}

const TIMED_MUSCLES: readonly string[] = ['abs', 'obliques'];

function suits(exercise: Exercise, muscle: string, context: FocusContext): boolean {
  if (!exercise.primary_muscles.includes(muscle)) return false;
  const counted = exercise.tracking === 'weight_reps' || exercise.tracking === 'reps';
  const hold =
    exercise.tracking === 'time' && exercise.kind === 'timed' && TIMED_MUSCLES.includes(muscle);
  if (!counted && !hold) return false;
  if (exercise.kind === 'cardio' || exercise.kind === 'stretch') return false;
  if (context.equipment && !isAvailable(exercise, context.equipment)) return false;
  return context.level !== 'beginner' || exercise.level !== 'advanced';
}

/** The exercises for a muscle, best first: compound, then known, then popular. */
export function rankForMuscle(muscle: string, context: FocusContext): Exercise[] {
  const rank = (exercise: Exercise) => [
    exercise.mechanics === 'compound' ? 0 : 1,
    context.known.has(exercise.id) ? 0 : 1,
    popularityPlace(exercise.slug),
  ];
  return context.exercises
    .filter((exercise) => suits(exercise, muscle, context))
    .map((exercise) => ({ exercise, rank: rank(exercise) }))
    .sort(
      (a, b) =>
        (a.rank[0] ?? 0) - (b.rank[0] ?? 0) ||
        (a.rank[1] ?? 0) - (b.rank[1] ?? 0) ||
        (a.rank[2] ?? 0) - (b.rank[2] ?? 0) ||
        a.exercise.slug.localeCompare(b.exercise.slug),
    )
    .map(({ exercise }) => exercise);
}

/** Up to `count` exercises in order of `ranked`, a new movement pattern before a repeated one. */
export function pickVaried(
  ranked: readonly Exercise[],
  count: number,
  taken: ReadonlySet<string>,
): Exercise[] {
  const free = ranked.filter((exercise) => !taken.has(exercise.id));
  const patterns = new Set<string>();
  const varied = free.filter((exercise) => {
    if (patterns.has(exercise.movement_pattern)) return false;
    patterns.add(exercise.movement_pattern);
    return true;
  });
  const rest = free.filter((exercise) => !varied.includes(exercise));
  return [...varied, ...rest].slice(0, count);
}

/** More sets than this in one workout do little for a muscle. */
export const MAX_SETS_PER_MUSCLE = 12;
const MIN_SETS_PER_MUSCLE = 2;
const SETS_PER_EXERCISE = 3;
const MAX_SETS_PER_EXERCISE = 4;

export interface FocusWorkoutPlan {
  items: { exercise_id: string; muscle: string; sets: number }[];
  /** Muscles that did not fit, or that the gym has nothing for. */
  dropped: string[];
  /** There were too few exercises to fill the workout. */
  short: boolean;
  set_cap: number;
}

/** `total` sets over `count` exercises, as evenly as can be, the larger numbers first. */
function spreadSets(total: number, count: number): number[] {
  const each = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => each + (index < total % count ? 1 : 0));
}

/** One workout for the picked muscles only: it fits the time and goes muscle by muscle. */
export function planFocusWorkout(
  muscles: string[],
  durationMin: number,
  context: FocusContext,
): FocusWorkoutPlan {
  const cap = sessionSetCap(durationMin);
  const options = muscles.map((muscle) => ({ muscle, ranked: rankForMuscle(muscle, context) }));
  const usable = options.filter(({ ranked }) => ranked.length > 0);
  const fitting = usable.slice(0, Math.floor(cap / MIN_SETS_PER_MUSCLE));
  const dropped = options.filter((option) => !fitting.includes(option)).map(({ muscle }) => muscle);

  const taken = new Set<string>();
  const planned: { exercise: Exercise; muscle: string; sets: number }[] = [];
  let short = false;

  fitting.forEach(({ muscle, ranked }, index) => {
    const share = Math.floor(cap / fitting.length) + (index < cap % fitting.length ? 1 : 0);
    const sets = Math.min(share, MAX_SETS_PER_MUSCLE);
    const wanted = Math.max(1, Math.round(sets / SETS_PER_EXERCISE));
    const picked = pickVaried(ranked, wanted, taken);
    if (picked.length === 0) {
      dropped.push(muscle);
      return;
    }
    const total = Math.min(sets, picked.length * MAX_SETS_PER_EXERCISE);
    if (total < sets) short = true;
    const spread = spreadSets(total, picked.length);
    picked.forEach((exercise, position) => {
      taken.add(exercise.id);
      planned.push({ exercise, muscle, sets: spread[position] ?? 0 });
    });
  });

  // The sort is stable: within compound and isolation the muscles keep their order.
  const items = planned
    .sort(
      (a, b) =>
        (a.exercise.mechanics === 'compound' ? 0 : 1) -
        (b.exercise.mechanics === 'compound' ? 0 : 1),
    )
    .map(({ exercise, muscle, sets }) => ({ exercise_id: exercise.id, muscle, sets }));
  return { items, dropped, short, set_cap: cap };
}

/** A program with a focus needs this long a workout: a shorter one cannot cover the body. */
export const FOCUS_MIN_DURATION = 45;

/** The answers of the questionnaire as a program with a focus can use them. */
export function focusAnswers(answers: Answers): Answers {
  return answers.duration_min < FOCUS_MIN_DURATION
    ? { ...answers, duration_min: FOCUS_MIN_DURATION }
    : answers;
}

/** Answers to start the questionnaire from: the last ones given, then the active program. */
export function startingAnswers(
  saved: Answers | null,
  program: {
    goal: Answers['goal'] | null;
    level: Level | null;
    days_per_week: number | null;
  } | null,
): Answers {
  if (saved) return saved;
  const days = program?.days_per_week;
  const frequency = days === 2 || days === 4 || days === 5 || days === 6 ? days : 3;
  return {
    goal: program?.goal ?? 'mass',
    level: program?.level ?? 'beginner',
    frequency,
    duration_min: 60,
    split: 'auto',
  };
}

/** Work sets a week on a picked muscle, at least. */
export const FOCUS_WEEKLY_SETS: Record<Level, number> = {
  beginner: 12,
  intermediate: 16,
  advanced: 20,
};

/** A picked muscle gets at least this many sets a week more than without a focus. */
const FOCUS_MIN_GAIN = 4;
const FOCUS_BUDGET_SHARE = 0.6;
const MAX_ADDED_SETS_A_DAY = 8;
const MIN_SETS_OF_OTHERS = 2;

export const MUSCLE_TO_GROUP: Readonly<Record<string, MuscleGroup>> = {
  chest: 'chest',
  lats: 'back',
  upper_back: 'back',
  lower_back: 'back',
  front_delts: 'shoulders',
  side_delts: 'shoulders',
  rear_delts: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  quads: 'quads',
  adductors: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'hamstrings',
  calves: 'calves',
  abs: 'core',
  obliques: 'core',
};

/** The parts of the body every program keeps, with the muscle that stands in for a lost one. */
const ZONES: readonly { muscles: readonly string[]; main: string }[] = [
  { muscles: ['chest'], main: 'chest' },
  { muscles: ['lats', 'upper_back'], main: 'lats' },
  { muscles: ['front_delts', 'side_delts', 'rear_delts'], main: 'side_delts' },
  { muscles: ['quads', 'hamstrings', 'glutes'], main: 'quads' },
];

export interface FocusedItem extends Omit<DraftItem, 'group'> {
  /** `null` for muscles outside the groups of the generator: traps and forearms. */
  group: MuscleGroup | null;
}

export interface FocusedDraft extends Omit<DraftProgram, 'days'> {
  days: { key: string; items: FocusedItem[] }[];
  /** Work sets a week on each picked muscle, by muscle code. */
  focus_weekly_sets: Record<string, number>;
  /** Muscles that got no sets at all. */
  dropped: string[];
  /** Muscles below their goal because there are too few exercises. */
  short: string[];
}

const isCounted = (exercise: Exercise | undefined) =>
  exercise?.tracking === 'weight_reps' || exercise?.tracking === 'reps';

const totalSets = (items: readonly { sets: number }[]) =>
  items.reduce((sum, item) => sum + item.sets, 0);

/**
 * A draft of the questionnaire turned into a program with a focus: the picked muscles come
 * first in every day and get more sets, the rest of the body stays on fewer. The draft itself
 * is not changed.
 */
export function applyFocus(
  draft: DraftProgram,
  muscles: string[],
  answers: Answers,
  context: FocusContext,
): FocusedDraft {
  const byId = new Map(context.exercises.map((exercise) => [exercise.id, exercise]));
  const trains = (item: { exercise_id: string }, muscle: string) =>
    byId.get(item.exercise_id)?.primary_muscles.includes(muscle) ?? false;
  const inFocus = (item: { exercise_id: string }) => muscles.some((muscle) => trains(item, muscle));
  const setsOf = (items: readonly FocusedItem[], muscle: string) =>
    totalSets(items.filter((item) => trains(item, muscle)));

  const draftItems = draft.days.flatMap((day) => day.items);
  const dayCount = draft.days.length;
  const budget = Math.floor(draft.set_cap * FOCUS_BUDGET_SHARE);
  const share = Math.floor(budget / Math.max(muscles.length, 1));
  const goals = new Map(
    muscles.map((muscle) => [
      muscle,
      Math.max(
        FOCUS_WEEKLY_SETS[answers.level],
        setsOf(draftItems, muscle) + FOCUS_MIN_GAIN,
      ),
    ]),
  );
  const ranked = new Map(muscles.map((muscle) => [muscle, rankForMuscle(muscle, context)]));
  const weekly = new Map(muscles.map((muscle) => [muscle, setsOf(draftItems, muscle)]));
  const usedBefore = new Set<string>();

  // Every part of the body the focus does not train keeps a place in the week.
  const otherZones = ZONES.filter((zone) => !zone.muscles.some((code) => muscles.includes(code)));
  const openDays = draft.days.filter((day) => day.items.some((item) => !inFocus(item))).length;
  const reserved = Math.ceil(otherZones.length / Math.max(openDays, 1)) * MIN_SETS_OF_OTHERS;
  const starved = new Set<string>();

  const days = draft.days.map((day, dayIndex) => {
    const block: FocusedItem[] = day.items.filter(inFocus).map((item) => ({ ...item }));
    const others = day.items.filter((item) => !inFocus(item));
    const taken = new Set(day.items.map((item) => item.exercise_id));
    const roomForFocus = () => draft.set_cap - totalSets(block) - reserved;

    muscles.forEach((muscle, position) => {
      const left = (goals.get(muscle) ?? 0) - (weekly.get(muscle) ?? 0);
      if (left <= 0) return;
      const daysLeft = dayCount - dayIndex;
      const fair = Math.ceil(left / daysLeft);
      // The promised gain holds even when the day alone uses up the share of the muscle.
      const gained = (weekly.get(muscle) ?? 0) - setsOf(draftItems, muscle);
      const promised = Math.ceil((FOCUS_MIN_GAIN - gained) / daysLeft);
      let added = Math.min(
        fair,
        MAX_ADDED_SETS_A_DAY,
        Math.max(share - setsOf(block, muscle), promised),
        // The muscles share what the rest of the body leaves.
        Math.floor(roomForFocus() / (muscles.length - position)),
      );

      // What the day already has for the muscle is raised first.
      for (const item of block) {
        if (added <= 0) break;
        if (!trains(item, muscle) || !isCounted(byId.get(item.exercise_id))) continue;
        const raised = Math.min(MAX_SETS_PER_EXERCISE - item.sets, added);
        if (raised <= 0) continue;
        item.sets += raised;
        added -= raised;
        weekly.set(muscle, (weekly.get(muscle) ?? 0) + raised);
      }

      // A single set left over is not worth an exercise of its own.
      if (added === 1) {
        const item = block.find(
          (entry) =>
            trains(entry, muscle) &&
            isCounted(byId.get(entry.exercise_id)) &&
            entry.sets <= MAX_SETS_PER_EXERCISE,
        );
        if (item) {
          item.sets += 1;
          added = 0;
          weekly.set(muscle, (weekly.get(muscle) ?? 0) + 1);
        }
      }

      while (added > 0) {
        const options = ranked.get(muscle) ?? [];
        const fresh = pickVaried(
          options.filter((exercise) => !usedBefore.has(exercise.id)),
          1,
          taken,
        );
        const exercise = fresh[0] ?? pickVaried(options, 1, taken)[0];
        if (!exercise) {
          starved.add(muscle);
          break;
        }
        const sets = isCounted(exercise)
          ? Math.max(added <= MAX_SETS_PER_EXERCISE ? added : SETS_PER_EXERCISE, MIN_SETS_OF_OTHERS)
          : defaultItemParams(exercise, answers.goal).sets;
        if (sets > roomForFocus()) break;
        taken.add(exercise.id);
        usedBefore.add(exercise.id);
        block.push({
          ...defaultItemParams(exercise, answers.goal),
          sets,
          exercise_id: exercise.id,
          group: MUSCLE_TO_GROUP[muscle] ?? null,
        });
        added -= sets;
        weekly.set(muscle, (weekly.get(muscle) ?? 0) + sets);
      }
    });

    const compoundFirst = (item: FocusedItem) =>
      byId.get(item.exercise_id)?.mechanics === 'compound' ? 0 : 1;
    block.sort((a, b) => compoundFirst(a) - compoundFirst(b));

    // The rest of the day takes what is left of the limit, the less important ones go first.
    let room = draft.set_cap - totalSets(block);
    const kept: FocusedItem[] = [];
    for (const item of others) {
      const least = isCounted(byId.get(item.exercise_id))
        ? Math.min(item.sets, MIN_SETS_OF_OTHERS)
        : item.sets;
      if (least > room) break;
      kept.push({ ...item, sets: least });
      room -= least;
    }
    kept.forEach((item, index) => {
      const back = Math.min(room, (others[index]?.sets ?? item.sets) - item.sets);
      item.sets += back;
      room -= back;
    });

    return { key: day.key, block, others: kept };
  });

  // A part of the body that fell out of the week comes back in place of one that has a double.
  const zoneOf = (item: { exercise_id: string }) =>
    ZONES.filter((zone) => zone.muscles.some((muscle) => trains(item, muscle)));
  const covered = (zone: (typeof ZONES)[number]) =>
    days.some(({ block, others }) => [...block, ...others].some((item) => zoneOf(item).includes(zone)));

  for (const zone of ZONES) {
    if (covered(zone)) continue;
    const fromDraft = draftItems.find((item) => zoneOf(item).includes(zone));
    const candidate = fromDraft ? byId.get(fromDraft.exercise_id) : undefined;
    const stored = fromDraft ?? null;

    const place = (day: (typeof days)[number], exercise: Exercise, slot: number | null) => {
      const params = stored ?? defaultItemParams(exercise, answers.goal);
      const sets = isCounted(exercise) ? Math.min(params.sets, MIN_SETS_OF_OTHERS) : params.sets;
      const item: FocusedItem = {
        ...params,
        sets,
        exercise_id: exercise.id,
        group: stored?.group ?? MUSCLE_TO_GROUP[zone.main] ?? null,
      };
      if (slot === null) day.others.push(item);
      else day.others[slot] = item;
    };

    const exercises = candidate ? [candidate] : rankForMuscle(zone.main, context).slice(0, 3);
    const replaced = exercises.some((exercise) => {
      for (let index = days.length - 1; index >= 0; index -= 1) {
        const day = days[index];
        if (!day) continue;
        const present = [...day.block, ...day.others].some(
          (item) => item.exercise_id === exercise.id,
        );
        if (present) continue;

        if (totalSets(day.block) + totalSets(day.others) + MIN_SETS_OF_OTHERS <= draft.set_cap) {
          place(day, exercise, null);
          return true;
        }
        for (let slot = day.others.length - 1; slot >= 0; slot -= 1) {
          const leaving = day.others[slot];
          if (!leaving) continue;
          const needed = zoneOf(leaving).filter(
            (other) =>
              !days.some(({ block, others }) =>
                [...block, ...others].some(
                  (item) => item !== leaving && zoneOf(item).includes(other),
                ),
              ),
          );
          if (needed.length > 0) continue;
          place(day, exercise, slot);
          return true;
        }
      }
      return false;
    });
    if (!replaced) continue;
  }

  const items = () => days.flatMap(({ block, others }) => [...block, ...others]);
  const focusSets = () => muscles.filter((muscle) => !starved.has(muscle)).map((muscle) => setsOf(items(), muscle));

  // No other group gets ahead of a picked muscle.
  const least = focusSets().length > 0 ? Math.min(...focusSets()) : null;
  if (least !== null) {
    const focusGroups = new Set(muscles.map((muscle) => MUSCLE_TO_GROUP[muscle]));
    const groups = new Set(items().flatMap((item) => (item.group ? [item.group] : [])));
    for (const group of groups) {
      if (focusGroups.has(group)) continue;
      const members = days.flatMap(({ others }) => others.filter((item) => item.group === group));
      while (totalSets(members) > least) {
        const largest = members
          .filter((item) => isCounted(byId.get(item.exercise_id)) && item.sets > MIN_SETS_OF_OTHERS)
          .reduce<FocusedItem | null>(
            (top, item) => (top && top.sets >= item.sets ? top : item),
            null,
          );
        if (!largest) break;
        largest.sets -= 1;
      }
    }
  }

  const weekly_sets: Partial<Record<MuscleGroup, number>> = {};
  for (const item of items()) {
    if (item.group) weekly_sets[item.group] = (weekly_sets[item.group] ?? 0) + item.sets;
  }
  const focus_weekly_sets = Object.fromEntries(
    muscles.map((muscle) => [muscle, setsOf(items(), muscle)]),
  );

  return {
    ...draft,
    days: days.map(({ key, block, others }) => ({ key, items: [...block, ...others] })),
    weekly_sets,
    focus_weekly_sets,
    dropped: muscles.filter((muscle) => focus_weekly_sets[muscle] === 0),
    short: muscles.filter(
      (muscle) =>
        starved.has(muscle) &&
        focus_weekly_sets[muscle] !== 0 &&
        (focus_weekly_sets[muscle] ?? 0) < (goals.get(muscle) ?? 0),
    ),
  };
}
