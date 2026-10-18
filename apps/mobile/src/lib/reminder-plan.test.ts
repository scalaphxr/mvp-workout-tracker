import { describe, expect, it } from 'vitest';

import type { Preferences } from './preferences';
import { planReminders } from './reminder-plan';

// Wednesday 14 October 2026, 10:00 on the phone's clock.
const NOW = new Date(2026, 9, 14, 10, 0);
const day = (date: number, hours = 9) => new Date(2026, 9, date, hours, 0);
const stamp = (moment: Date) =>
  `${moment.getDate()}.${moment.getMonth() + 1} ${String(moment.getHours()).padStart(2, '0')}:${String(moment.getMinutes()).padStart(2, '0')}`;

const reminders = (patch: Partial<Preferences['reminders']>): Preferences['reminders'] => ({
  workout: { enabled: false, time: '18:00', days: [1, 3, 5] },
  weight: { enabled: false, time: '08:00' },
  inactive: { enabled: false },
  ...patch,
});

const plan = (patch: Partial<Preferences['reminders']>, facts: Partial<Parameters<typeof planReminders>[1]> = {}) =>
  planReminders(reminders(patch), {
    now: NOW,
    workouts: [],
    weightToday: false,
    weeklyGoal: 3,
    ...facts,
  }).map((reminder) => `${reminder.kind} ${stamp(reminder.at)}`);

describe('reminders', () => {
  it('of a workout come on the chosen days at the chosen time', () => {
    // Mondays, Wednesdays and Fridays at 18:00.
    expect(plan({ workout: { enabled: true, time: '18:00', days: [1, 3, 5] } })).toEqual([
      'workout 14.10 18:00',
      'workout 16.10 18:00',
      'workout 19.10 18:00',
    ]);
  });

  it('of a workout keep quiet once the week is done and on a day already trained', () => {
    const workout = { enabled: true, time: '18:00', days: [1, 3, 5] };
    // Monday, Tuesday and Wednesday morning: the goal of 3 is met, this week is free.
    expect(plan({ workout }, { workouts: [day(12), day(13), day(14)] })).toEqual(['workout 19.10 18:00']);
    // One workout this morning: not tonight, but Friday still.
    expect(plan({ workout }, { workouts: [day(14)] })).toEqual(['workout 16.10 18:00', 'workout 19.10 18:00']);
  });

  it('of the weight come every morning, but not today once it is in or the time has passed', () => {
    const weight = { enabled: true, time: '11:00' };
    expect(plan({ weight })).toHaveLength(7);
    expect(plan({ weight }, { weightToday: true })[0]).toBe('weight 15.10 11:00');
    expect(plan({ weight: { enabled: true, time: '08:00' } })[0]).toBe('weight 15.10 08:00');
  });

  it('"it has been a while" comes a week after the last workout, weekly, three times', () => {
    const inactive = { enabled: true };
    expect(plan({ inactive }, { workouts: [day(10)] })).toEqual([
      'inactive 17.10 18:00',
      'inactive 24.10 18:00',
      'inactive 31.10 18:00',
    ]);
    // Three weeks without a workout: the reminders have had their say and wait.
    expect(plan({ inactive }, { workouts: [new Date(2026, 8, 1, 9)] })).toEqual([]);
    // Nothing to remind of before the first workout.
    expect(plan({ inactive })).toEqual([]);
  });

  it('are none when all are off', () => {
    expect(plan({}, { workouts: [day(10)] })).toEqual([]);
  });
});
