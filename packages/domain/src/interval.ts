import type { IntervalPresetRow } from '@mvp/schemas';

/** What an interval workout is made of: a preset of the user's or one built into the app. */
export type IntervalPlan = Pick<
  IntervalPresetRow,
  'work_sec' | 'rest_sec' | 'rounds' | 'cycles' | 'cycle_rest_sec'
>;

/** Built-in presets; their titles are translated by `key`. */
export const BUILT_IN_INTERVAL_PRESETS = [
  { key: 'tabata', work_sec: 20, rest_sec: 10, rounds: 8, cycles: 1, cycle_rest_sec: 0 },
  // Every minute on the minute: the rest is whatever is left of the minute after the work.
  { key: 'emom', work_sec: 60, rest_sec: 0, rounds: 10, cycles: 1, cycle_rest_sec: 0 },
  { key: 'hiit', work_sec: 40, rest_sec: 20, rounds: 10, cycles: 1, cycle_rest_sec: 0 },
  { key: 'circuit', work_sec: 45, rest_sec: 15, rounds: 6, cycles: 3, cycle_rest_sec: 90 },
] as const satisfies readonly (IntervalPlan & { key: string })[];

export type BuiltInIntervalKey = (typeof BUILT_IN_INTERVAL_PRESETS)[number]['key'];

/** The count-down before the first work, to put the phone down and get ready. */
export const INTERVAL_PREPARE_SEC = 10;

export type IntervalPhaseKind = 'prepare' | 'work' | 'rest' | 'cycle_rest';

export interface IntervalPhase {
  kind: IntervalPhaseKind;
  /** 1-based; the round and the cycle the phase belongs to (the preparation – the first). */
  round: number;
  cycle: number;
  /** Seconds from the start of the timer. */
  start_sec: number;
  duration_sec: number;
}

/**
 * The phases of a plan in order. After the last round of a cycle comes the rest between
 * cycles when there is one, the usual rest otherwise; after the very last work – nothing,
 * the timer is over. Phases of zero length are left out.
 */
export function intervalPhases(
  plan: IntervalPlan,
  prepareSec: number = INTERVAL_PREPARE_SEC,
): IntervalPhase[] {
  const phases: IntervalPhase[] = [];
  let at = 0;
  const add = (kind: IntervalPhaseKind, round: number, cycle: number, duration: number) => {
    if (duration <= 0) return;
    phases.push({ kind, round, cycle, start_sec: at, duration_sec: duration });
    at += duration;
  };

  add('prepare', 1, 1, prepareSec);
  for (let cycle = 1; cycle <= plan.cycles; cycle++) {
    for (let round = 1; round <= plan.rounds; round++) {
      add('work', round, cycle, plan.work_sec);
      const lastRound = round === plan.rounds;
      if (!lastRound) add('rest', round, cycle, plan.rest_sec);
      else if (cycle < plan.cycles) {
        if (plan.cycle_rest_sec > 0) add('cycle_rest', round, cycle, plan.cycle_rest_sec);
        else add('rest', round, cycle, plan.rest_sec);
      }
    }
  }
  return phases;
}

/** How long the whole timer runs, seconds. */
export function intervalTotalSec(phases: readonly IntervalPhase[]): number {
  const last = phases.at(-1);
  return last ? last.start_sec + last.duration_sec : 0;
}

export interface IntervalPosition {
  index: number;
  phase: IntervalPhase;
  /** Seconds left in the phase, fractional. */
  left_sec: number;
}

/** Where the timer is `elapsedSec` after its start; `null` once it is over. */
export function intervalAt(
  phases: readonly IntervalPhase[],
  elapsedSec: number,
): IntervalPosition | null {
  const elapsed = Math.max(0, elapsedSec);
  const index = phases.findIndex((phase) => elapsed < phase.start_sec + phase.duration_sec);
  const phase = phases[index];
  if (!phase) return null;
  return { index, phase, left_sec: phase.start_sec + phase.duration_sec - elapsed };
}
