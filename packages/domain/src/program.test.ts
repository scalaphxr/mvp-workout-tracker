import type { Equipment, Exercise } from '@mvp/schemas';
import { describe, expect, it } from 'vitest';

import {
  defaultItemParams,
  linkWithNext,
  normalizeSupersets,
  stepGroup,
  unlink,
} from './program';

const _ = null;

describe('normalizeSupersets', () => {
  it('numbers supersets from the top', () => {
    expect(normalizeSupersets([7, 7, _, 3, 3, 3])).toEqual([1, 1, _, 2, 2, 2]);
  });

  it('drops a group of one item', () => {
    expect(normalizeSupersets([4, _, _])).toEqual([_, _, _]);
  });

  it('splits a group whose items are not neighbours', () => {
    expect(normalizeSupersets([1, _, 1, 1])).toEqual([_, _, 1, 1]);
    expect(normalizeSupersets([1, 2, 1])).toEqual([_, _, _]);
  });

  it('keeps two different supersets that touch apart', () => {
    expect(normalizeSupersets([1, 1, 2, 2])).toEqual([1, 1, 2, 2]);
  });

  it('handles an empty day', () => {
    expect(normalizeSupersets([])).toEqual([]);
  });
});

describe('linkWithNext', () => {
  it('makes a superset of two plain items', () => {
    expect(linkWithNext([_, _, _], 1)).toEqual([_, 1, 1]);
  });

  it('adds an item to the superset below or above it', () => {
    expect(linkWithNext([_, 1, 1], 0)).toEqual([1, 1, 1]);
    expect(linkWithNext([1, 1, _], 1)).toEqual([1, 1, 1]);
  });

  it('merges two supersets', () => {
    expect(linkWithNext([1, 1, 2, 2, _], 1)).toEqual([1, 1, 1, 1, _]);
  });

  it('does not disturb another superset of the day', () => {
    expect(linkWithNext([1, 1, _, _], 2)).toEqual([1, 1, 2, 2]);
  });

  it('does nothing for the last item', () => {
    expect(linkWithNext([_, _], 1)).toEqual([_, _]);
  });
});

describe('unlink', () => {
  it('dissolves a superset of two', () => {
    expect(unlink([1, 1, _], 0)).toEqual([_, _, _]);
  });

  it('takes the first or the last item out of a superset of three', () => {
    expect(unlink([1, 1, 1], 0)).toEqual([_, 1, 1]);
    expect(unlink([1, 1, 1], 2)).toEqual([1, 1, _]);
  });

  it('breaks a superset of three when the middle item leaves', () => {
    expect(unlink([1, 1, 1], 1)).toEqual([_, _, _]);
  });

  it('keeps both halves when the middle of a long superset leaves', () => {
    expect(unlink([1, 1, 1, 1, 1], 2)).toEqual([1, 1, _, 2, 2]);
  });

  it('does nothing for an item outside a superset', () => {
    expect(unlink([1, 1, _], 2)).toEqual([1, 1, _]);
  });
});

describe('defaultItemParams', () => {
  const exercise = (overrides: Partial<Exercise>) =>
    ({ tracking: 'weight_reps', mechanics: 'compound', ...overrides }) as Exercise;

  it('takes the rep range, rest and RIR of the goal for compound and isolation exercises', () => {
    expect(defaultItemParams(exercise({}), 'strength')).toEqual({
      sets: 3,
      rep_min: 4,
      rep_max: 6,
      rest_sec: 180,
      target_rir: 2,
    });
    expect(defaultItemParams(exercise({ mechanics: 'isolation' }), 'mass')).toEqual({
      sets: 3,
      rep_min: 10,
      rep_max: 15,
      rest_sec: 75,
      target_rir: 1,
    });
    expect(defaultItemParams(exercise({ mechanics: 'isolation' }), 'cut').rest_sec).toBe(60);
  });

  it('falls back to the maintenance plan when the goal is not in the table or not set', () => {
    const maintenance = defaultItemParams(exercise({}), 'maintenance');
    expect(maintenance).toMatchObject({ rep_min: 8, rep_max: 12, rest_sec: 90 });
    expect(defaultItemParams(exercise({}), null)).toEqual(maintenance);
    expect(defaultItemParams(exercise({}), 'endurance')).toEqual(maintenance);
  });

  it('plans timed exercises in seconds and cardio in minutes, without RIR', () => {
    expect(defaultItemParams(exercise({ tracking: 'time' }), 'mass')).toEqual({
      sets: 3,
      rep_min: 30,
      rep_max: 60,
      rest_sec: 60,
      target_rir: null,
    });
    expect(defaultItemParams(exercise({ tracking: 'distance_time' }), 'mass')).toEqual({
      sets: 1,
      rep_min: 20,
      rep_max: 30,
      rest_sec: 0,
      target_rir: null,
    });
  });
});

describe('stepGroup', () => {
  const item = (code: string, category: Equipment['category'], step: number | null) =>
    ({ code, category, default_increment_kg: step }) as Equipment;

  it('sorts loaded equipment into the three steps a gym profile asks about', () => {
    expect(stepGroup(item('dumbbells', 'dumbbells', 2))).toBe('dumbbells');
    expect(stepGroup(item('barbell', 'barbells', 2.5))).toBe('plates');
    expect(stepGroup(item('smith_machine', 'machines', 2.5))).toBe('plates');
    expect(stepGroup(item('leg_curl_machine', 'machines', 5))).toBe('stack');
    expect(stepGroup(item('lat_pulldown_machine', 'cables', 5))).toBe('stack');
  });

  it('has no step for equipment that carries no load', () => {
    expect(stepGroup(item('rack', 'barbells', null))).toBeNull();
    expect(stepGroup(item('flat_bench', 'other', null))).toBeNull();
  });
});
