import { describe, expect, it } from 'vitest';

import {
  acceptReduction,
  advancePointer,
  deloadSets,
  epley,
  findRecords,
  hasStalled,
  planNext,
  type ProgressionInput,
  reducedWeight,
  shouldOfferDeload,
  volumeKg,
  type WorkSet,
} from './progression';

const set = (reps: number | null, weight_kg: number | null = 80, rir: number | null = 1): WorkSet => ({
  reps,
  weight_kg,
  rir,
});

/** 3 sets of 10–12 with a 2.5 kg step, done with 80 kg unless said otherwise. */
const plan = (reps: (number | null)[], overrides: Partial<ProgressionInput> = {}) =>
  planNext({
    sets: 3,
    rep_min: 10,
    rep_max: 12,
    step_kg: 2.5,
    work_sets: reps.map((value) => set(value)),
    fail_streak: 0,
    smart: false,
    ...overrides,
  });

describe('planNext: the weight goes up', () => {
  it('adds a step when every set reached the top of the range, and aims for the bottom', () => {
    expect(plan([12, 12, 12])).toEqual({
      next_weight_kg: 82.5,
      next_target_reps: 10,
      fail_streak: 0,
      reason_code: 'increase',
      reason_params: { step_kg: 2.5, sets: 3, reps: 12 },
    });
  });

  it('counts sets above the top and a last set done to failure (RIR 0)', () => {
    const result = plan([13, 12, 12], { work_sets: [set(13), set(12), set(12, 80, 0)] });
    expect(result?.next_weight_kg).toBe(82.5);
  });

  it('does not add weight when one set is a rep short, or was skipped, or not done', () => {
    expect(plan([12, 12, 11])?.reason_code).toBe('same');
    expect(plan([12, 12, null])?.reason_code).toBe('same');
    expect(plan([12, 12])?.reason_code).toBe('same');
  });

  it('clears the count of failed workouts', () => {
    expect(plan([12, 12, 12], { fail_streak: 1 })?.fail_streak).toBe(0);
  });

  it('adds two steps with smart progression when 3 or more reps were left in every set', () => {
    const spare = [set(12, 80, 3), set(12, 80, 3), set(12, 80, 4)];
    expect(plan([], { work_sets: spare, smart: true })).toMatchObject({
      next_weight_kg: 85,
      reason_code: 'increase_fast',
      reason_params: { step_kg: 5 },
    });
    // Without the feature, with less to spare, or with RIR not marked: one step.
    expect(plan([], { work_sets: spare })?.next_weight_kg).toBe(82.5);
    const some = [set(12, 80, 3), set(12, 80, 3), set(12, 80, 2)];
    expect(plan([], { work_sets: some, smart: true })?.next_weight_kg).toBe(82.5);
    const unmarked = [set(12, 80, 4), set(12, 80, null), set(12, 80, 4)];
    expect(plan([], { work_sets: unmarked, smart: true })?.next_weight_kg).toBe(82.5);
  });
});

describe('planNext: the weight stays', () => {
  it('asks for one more rep in the weakest set, the later one of equals', () => {
    expect(plan([12, 11, 10])).toEqual({
      next_weight_kg: 80,
      next_target_reps: 11,
      fail_streak: 0,
      reason_code: 'same',
      reason_params: { set_number: 3, target_reps: 11 },
    });
    expect(plan([11, 12, 11])?.reason_params).toEqual({ set_number: 3, target_reps: 12 });
  });

  it('points at a skipped set and asks for the bottom of the range in it', () => {
    expect(plan([12, null, 12])?.reason_params).toEqual({ set_number: 2, target_reps: 10 });
  });

  it('is not a failure while fewer than half of the sets are below the range', () => {
    const result = plan([12, 11, 9]);
    expect(result).toMatchObject({ reason_code: 'same', fail_streak: 0, next_weight_kg: 80 });
    expect(result?.reason_params).toEqual({ set_number: 3, target_reps: 10 });
  });
});

describe('planNext: the workout failed', () => {
  it('first time: keeps the weight and says which set fell below the range', () => {
    expect(plan([10, 9, 8])).toEqual({
      next_weight_kg: 80,
      next_target_reps: 10,
      fail_streak: 1,
      reason_code: 'retry',
      reason_params: { set_number: 2, reps: 9, rep_min: 10 },
    });
  });

  it('counts half of the planned sets as enough: 2 of 4, and 2 of 3', () => {
    expect(plan([10, 10, 9, 9], { sets: 4 })?.reason_code).toBe('retry');
    expect(plan([10, 9, 9])?.reason_code).toBe('retry');
    expect(plan([10, 10, 10, 9], { sets: 4 })?.reason_code).toBe('same');
  });

  it('second time in a row: offers 10% off, rounded down to the step, but keeps the weight', () => {
    expect(plan([9, 8, 8], { fail_streak: 1 })).toEqual({
      next_weight_kg: 80,
      next_target_reps: 10,
      fail_streak: 2,
      reason_code: 'reduce_offer',
      reason_params: { set_number: 1, reps: 9, rep_min: 10, reduced_weight_kg: 70 },
    });
  });

  it('keeps offering on every further failure while the user declines', () => {
    expect(plan([9, 8, 8], { fail_streak: 2 })).toMatchObject({
      reason_code: 'reduce_offer',
      fail_streak: 3,
    });
  });

  it('drops the weight and starts the count over once the user accepts', () => {
    const offer = plan([9, 8, 8], { fail_streak: 1 })!;
    expect(acceptReduction(offer)).toEqual({
      next_weight_kg: 70,
      next_target_reps: 10,
      fail_streak: 0,
      reason_code: 'reduced',
      reason_params: { set_number: 1, reps: 9, rep_min: 10 },
    });
    // Nothing to accept in a plan that offers nothing.
    const same = plan([12, 11, 10])!;
    expect(acceptReduction(same)).toBe(same);
  });
});

describe('planNext: the weight to go by', () => {
  it('follows the weight the sets were actually done with', () => {
    const lighter = [set(12, 77.5), set(12, 77.5), set(12, 77.5)];
    expect(plan([], { work_sets: lighter })?.next_weight_kg).toBe(80);
  });

  it('takes the most common weight when it changed mid-way, the later of two equally common', () => {
    expect(plan([], { work_sets: [set(11, 80), set(11, 77.5), set(11, 77.5)] })?.next_weight_kg).toBe(77.5);
    expect(plan([], { sets: 2, work_sets: [set(11, 80), set(11, 77.5)] })?.next_weight_kg).toBe(77.5);
  });

  it('leaves the previous plan alone when no set was done', () => {
    expect(plan([null, null, null])).toBeNull();
    expect(plan([])).toBeNull();
  });

  it('progresses a body-weight exercise in reps, past the top of the range too', () => {
    const bodyweight = (reps: number[]) =>
      plan([], { step_kg: null, work_sets: reps.map((value) => set(value, null, null)) });

    expect(bodyweight([12, 10, 9])).toEqual({
      next_weight_kg: null,
      next_target_reps: 10,
      fail_streak: 0,
      reason_code: 'reps_only',
      reason_params: { set_number: 3, target_reps: 10 },
    });
    expect(bodyweight([12, 12, 12])?.next_target_reps).toBe(13);
    expect(bodyweight([5, 5, 4])?.next_target_reps).toBe(10);
  });
});

describe('reducedWeight', () => {
  it('takes 10% off and rounds down to the step', () => {
    expect(reducedWeight(80, 2.5)).toBe(70);
    expect(reducedWeight(82.5, 2.5)).toBe(72.5);
    expect(reducedWeight(26, 2)).toBe(22);
    expect(reducedWeight(100, 5)).toBe(90);
  });

  it('never goes below one step', () => {
    expect(reducedWeight(2.5, 2.5)).toBe(2.5);
    expect(reducedWeight(5, 5)).toBe(5);
  });
});

describe('deload', () => {
  const result = (weight_kg: number | null, total_reps: number) => ({ weight_kg, total_reps });

  it('sees a stall when neither the weight nor the reps grew over the last 3 workouts', () => {
    expect(hasStalled([result(80, 33), result(80, 33), result(80, 32)])).toBe(true);
    expect(hasStalled([result(60, 30), result(80, 33), result(80, 33), result(80, 33)])).toBe(true);
  });

  it('sees no stall when the reps or the weight grew, or there are fewer than 3 workouts', () => {
    expect(hasStalled([result(80, 33), result(80, 34), result(80, 34)])).toBe(false);
    expect(hasStalled([result(80, 36), result(82.5, 30), result(82.5, 30)])).toBe(false);
    expect(hasStalled([result(80, 33), result(80, 33)])).toBe(false);
  });

  it('offers a deload when half of the exercises or more have stalled', () => {
    const stalled = [result(80, 33), result(80, 33), result(80, 33)];
    const growing = [result(80, 33), result(80, 34), result(80, 35)];

    expect(shouldOfferDeload([stalled, growing])).toBe(true);
    expect(shouldOfferDeload([stalled, growing, growing])).toBe(false);
    expect(shouldOfferDeload([])).toBe(false);
  });

  it('halves the sets, rounding up, and never to zero', () => {
    expect([1, 2, 3, 4, 5].map(deloadSets)).toEqual([1, 1, 2, 2, 3]);
  });
});

describe('records', () => {
  const lifted = (weight_kg: number, reps: number) => ({ weight_kg, reps });
  const earlier = [lifted(80, 10), lifted(80, 8), lifted(75, 12)];

  it('estimates the one-rep maximum by Epley', () => {
    expect(epley(80, 12)).toBeCloseTo(112);
    expect(epley(100, 0)).toBe(100);
  });

  it('finds a new top weight', () => {
    expect(findRecords([lifted(82.5, 5)], earlier)).toEqual([
      { kind: 'weight', weight_kg: 82.5, reps: 5 },
    ]);
  });

  it('finds more reps with a weight lifted before, once per weight', () => {
    expect(findRecords([lifted(80, 11), lifted(80, 12), lifted(75, 12)], earlier)).toEqual([
      { kind: 'reps_at_weight', weight_kg: 80, reps: 12 },
      { kind: 'e1rm', weight_kg: 80, reps: 12 },
    ]);
  });

  it('finds a new estimated maximum along with a new top weight', () => {
    expect(findRecords([lifted(85, 10)], earlier).map((record) => record.kind)).toEqual([
      'weight',
      'e1rm',
    ]);
  });

  it('finds nothing in a workout that repeats the past, or in the very first one', () => {
    expect(findRecords([lifted(80, 10), lifted(75, 12)], earlier)).toEqual([]);
    expect(findRecords([lifted(80, 10)], [])).toEqual([]);
    expect(findRecords([{ weight_kg: null, reps: 20 }], [{ weight_kg: null, reps: 10 }])).toEqual([]);
  });

  it('adds up the volume of a workout', () => {
    expect(volumeKg([lifted(80, 12), lifted(80, 11), { weight_kg: null, reps: 15 }])).toBe(1840);
  });
});

describe('advancePointer', () => {
  it('moves to the next day and starts a new cycle after the last one', () => {
    expect(advancePointer(0, 3, 1)).toEqual({ next_day_position: 1, cycle_number: 1 });
    expect(advancePointer(2, 3, 1)).toEqual({ next_day_position: 0, cycle_number: 2 });
    expect(advancePointer(0, 1, 4)).toEqual({ next_day_position: 0, cycle_number: 5 });
  });
});
