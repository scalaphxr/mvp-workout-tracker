import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_INTERVAL_PRESETS,
  type IntervalPlan,
  intervalAt,
  intervalPhases,
  intervalTotalSec,
} from './interval';

const preset = (key: string): IntervalPlan =>
  BUILT_IN_INTERVAL_PRESETS.find((candidate) => candidate.key === key)!;

const shape = (plan: IntervalPlan, prepareSec?: number) =>
  intervalPhases(plan, prepareSec).map(
    (phase) => `${phase.kind}:${phase.cycle}.${phase.round}:${phase.duration_sec}`,
  );

describe('the phases of an interval timer', () => {
  it('Tabata: 8 rounds of 20 s work and 10 s rest take 4 minutes, with no rest at the end', () => {
    const phases = intervalPhases(preset('tabata'), 0);

    expect(phases).toHaveLength(15);
    expect(phases.filter((phase) => phase.kind === 'work')).toHaveLength(8);
    expect(phases.at(-1)).toMatchObject({ kind: 'work', round: 8, duration_sec: 20 });
    expect(intervalTotalSec(phases)).toBe(8 * 20 + 7 * 10);
  });

  it('starts with the count-down to get ready', () => {
    const phases = intervalPhases(preset('tabata'));
    expect(phases[0]).toEqual({ kind: 'prepare', round: 1, cycle: 1, start_sec: 0, duration_sec: 10 });
    expect(phases[1]).toMatchObject({ kind: 'work', start_sec: 10 });
  });

  it('EMOM has no rest phases: the next minute starts right away', () => {
    expect(shape(preset('emom'), 0)).toEqual(Array.from({ length: 10 }, (_, i) => `work:1.${i + 1}:60`));
  });

  it('puts the rest between cycles after the last round of every cycle but the last', () => {
    const plan = { work_sec: 30, rest_sec: 10, rounds: 2, cycles: 2, cycle_rest_sec: 60 };
    expect(shape(plan, 5)).toEqual([
      'prepare:1.1:5',
      'work:1.1:30',
      'rest:1.1:10',
      'work:1.2:30',
      'cycle_rest:1.2:60',
      'work:2.1:30',
      'rest:2.1:10',
      'work:2.2:30',
    ]);
  });

  it('without a rest between cycles keeps the usual rest there', () => {
    const plan = { work_sec: 30, rest_sec: 10, rounds: 1, cycles: 3, cycle_rest_sec: 0 };
    expect(shape(plan, 0)).toEqual([
      'work:1.1:30',
      'rest:1.1:10',
      'work:2.1:30',
      'rest:2.1:10',
      'work:3.1:30',
    ]);
  });

  it('phases follow each other without gaps', () => {
    const phases = intervalPhases(preset('circuit'));
    phases.slice(1).forEach((phase, i) => {
      const previous = phases[i]!;
      expect(phase.start_sec).toBe(previous.start_sec + previous.duration_sec);
    });
  });
});

describe('where the timer is', () => {
  const phases = intervalPhases(preset('tabata'));

  it('counts down the current phase', () => {
    expect(intervalAt(phases, 0)).toMatchObject({ index: 0, phase: { kind: 'prepare' }, left_sec: 10 });
    expect(intervalAt(phases, 10)).toMatchObject({ index: 1, phase: { kind: 'work', round: 1 }, left_sec: 20 });
    expect(intervalAt(phases, 29.5)).toMatchObject({ index: 1, left_sec: 0.5 });
    expect(intervalAt(phases, 30)).toMatchObject({ phase: { kind: 'rest', round: 1 }, left_sec: 10 });
  });

  it('jumps straight to the right phase after a long time away, as with a locked screen', () => {
    expect(intervalAt(phases, 10 + 3 * 30 + 5)).toMatchObject({
      phase: { kind: 'work', round: 4 },
      left_sec: 15,
    });
  });

  it('is over after the last work', () => {
    expect(intervalAt(phases, intervalTotalSec(phases) - 0.1)).not.toBeNull();
    expect(intervalAt(phases, intervalTotalSec(phases))).toBeNull();
  });
});
