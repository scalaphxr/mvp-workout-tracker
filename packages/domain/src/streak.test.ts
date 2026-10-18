import { describe, expect, it } from 'vitest';

import { weekStart, weeklyStreak } from './streak';

/** Days of workouts: `n` workouts in the week that starts on a Monday. */
const week = (monday: string, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const date = new Date(`${monday}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    return date.toISOString().slice(0, 10);
  });

// Mondays of September and October 2026.
const [SEP7, SEP14, SEP21, SEP28, OCT5, OCT12] = [
  '2026-09-07',
  '2026-09-14',
  '2026-09-21',
  '2026-09-28',
  '2026-10-05',
  '2026-10-12',
];

describe('weeks', () => {
  it('start on Monday', () => {
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
    expect(weekStart('2026-10-18')).toBe('2026-10-12');
    expect(weekStart('2026-10-01')).toBe('2026-09-28');
  });
});

describe('the series of weeks', () => {
  it('counts the weeks in a row with the goal met', () => {
    const days = [...week(SEP14, 3), ...week(SEP21, 3), ...week(SEP28, 3)];
    expect(weeklyStreak(days, 3, '2026-10-05')).toMatchObject({ current: 3, best: 3 });
  });

  it('lets the week under way add to the series once met, and never break it', () => {
    const days = [...week(SEP28, 2), ...week(OCT5, 1)];
    expect(weeklyStreak(days, 2, '2026-10-06')).toMatchObject({
      current: 1,
      thisWeek: { done: 1, goal: 2 },
    });
    expect(weeklyStreak([...days, '2026-10-07'], 2, '2026-10-07')).toMatchObject({ current: 2 });
  });

  it('a missed week is saved by the freeze of its month, a second one in the month is not', () => {
    const days = [...week(SEP7, 2), ...week(SEP21, 2), ...week(OCT12, 2)];
    // 14.09 is missed and frozen; 28.09 and 05.10 are missed: September has no freeze left,
    // October's saves 05.10 only after a break – the series starts over.
    const streak = weeklyStreak(days, 2, '2026-10-14');
    expect(streak.frozen).toEqual([SEP14]);
    expect(streak).toMatchObject({ current: 1, best: 2, freezeLeft: true });
  });

  it('keeps going over a frozen week and says the month has no freeze left', () => {
    const days = [...week(SEP28, 2), ...week(OCT12, 2)];
    const streak = weeklyStreak(days, 2, '2026-10-14');
    expect(streak.frozen).toEqual([OCT5]);
    expect(streak).toMatchObject({ current: 2, best: 2, freezeLeft: false });
  });

  it('a week short of the goal is a missed week', () => {
    const days = [...week(SEP21, 3), ...week(SEP28, 1), ...week(OCT5, 1), ...week(OCT12, 3)];
    // 28.09 is frozen by September, 05.10 by October.
    expect(weeklyStreak(days, 3, '2026-10-18')).toMatchObject({ current: 2, frozen: [SEP28, OCT5] });
    // With the goal of 1 every week counts.
    expect(weeklyStreak(days, 1, '2026-10-18')).toMatchObject({ current: 4, frozen: [] });
  });

  it('is empty before the first workout', () => {
    expect(weeklyStreak([], 3, '2026-10-14')).toEqual({
      current: 0,
      best: 0,
      thisWeek: { done: 0, goal: 3 },
      frozen: [],
      freezeLeft: true,
    });
  });
});
