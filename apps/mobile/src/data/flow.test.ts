import { describe, expect, it } from 'vitest';

import { afterSet, type FlowExercise } from './flow';

const exercise = (id: string, done: number, group: string | null = null): FlowExercise => ({
  id,
  group,
  done,
  planned: 3,
  rest_sec: id === 'curl' ? 60 : 120,
});

describe('afterSet', () => {
  it('stays on the exercise and rests while it has sets left', () => {
    expect(afterSet([exercise('bench', 1), exercise('row', 0)], 'bench')).toEqual({
      nextId: 'bench',
      rest_sec: 120,
    });
  });

  it('moves to the next exercise after the last set, resting first', () => {
    expect(afterSet([exercise('bench', 3), exercise('row', 0)], 'bench')).toEqual({
      nextId: 'row',
      rest_sec: 120,
    });
  });

  it('comes back to an exercise that was skipped earlier', () => {
    expect(afterSet([exercise('bench', 0), exercise('row', 3)], 'row')).toEqual({
      nextId: 'bench',
      rest_sec: 120,
    });
  });

  it('ends without a rest when everything is done', () => {
    expect(afterSet([exercise('bench', 3), exercise('row', 3)], 'row')).toEqual({
      nextId: null,
      rest_sec: 0,
    });
  });

  it('alternates the exercises of a superset without rest and rests after the last one', () => {
    const superset = (curl: number, pushdown: number) => [
      exercise('bench', 3),
      exercise('curl', curl, 'a'),
      exercise('pushdown', pushdown, 'a'),
      exercise('plank', 0),
    ];

    // Curl done: straight to the pushdown.
    expect(afterSet(superset(1, 0), 'curl')).toEqual({ nextId: 'pushdown', rest_sec: 0 });
    // Pushdown done: the round is over, rest and start the round again.
    expect(afterSet(superset(1, 1), 'pushdown')).toEqual({ nextId: 'curl', rest_sec: 120 });
    // The last round: rest, then on to the next exercise.
    expect(afterSet(superset(3, 3), 'pushdown')).toEqual({ nextId: 'plank', rest_sec: 120 });
  });

  it('finishes the other exercise of a superset when one of them is already done', () => {
    const uneven = [exercise('curl', 3, 'a'), exercise('pushdown', 2, 'a')];
    expect(afterSet(uneven, 'curl')).toEqual({ nextId: 'pushdown', rest_sec: 0 });
    expect(afterSet([exercise('curl', 3, 'a'), exercise('pushdown', 3, 'a')], 'pushdown')).toEqual({
      nextId: null,
      rest_sec: 0,
    });
  });

  it('copes with an exercise that is not in the workout', () => {
    expect(afterSet([exercise('bench', 0)], 'nope')).toEqual({ nextId: null, rest_sec: 0 });
  });
});
