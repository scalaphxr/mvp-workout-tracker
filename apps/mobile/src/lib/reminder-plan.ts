import { weekStart } from '@mvp/domain';

import { toLocalDate } from './format';
import type { Preferences } from './preferences';

export type ReminderKind = 'workout' | 'weight' | 'inactive';

export interface PlannedReminder {
  kind: ReminderKind;
  at: Date;
}

export interface ReminderFacts {
  now: Date;
  /** Start times of finished workouts. */
  workouts: readonly Date[];
  /** The weight of today is already in. */
  weightToday: boolean;
  weeklyGoal: number | null;
}

/** How far ahead reminders are put on the phone; they are planned again on every change. */
export const REMINDER_DAYS = 7;
/** "It has been a while" comes a week after the last workout, at most 3 times, then waits. */
const INACTIVE_AFTER_DAYS = 7;
const INACTIVE_TIMES = 3;

/** A moment of a day at "HH:MM" in the phone's own time zone. */
function at(day: Date, time: string): Date {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
}

const addDays = (day: Date, days: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);

/** 1 – Monday … 7 – Sunday. */
const weekday = (day: Date) => ((day.getDay() + 6) % 7) + 1;

/**
 * The reminders of the coming days (spec 6.13): a workout on the chosen days unless the goal of
 * that week is already met or there was a workout that day; the morning weight unless it is in;
 * "it has been a while" a week after the last workout, weekly, three times at most.
 */
export function planReminders(
  reminders: Preferences['reminders'],
  facts: ReminderFacts,
): PlannedReminder[] {
  const { now } = facts;
  const planned: PlannedReminder[] = [];
  const today = toLocalDate(now);
  const days = facts.workouts.map((workout) => toLocalDate(workout));

  for (let offset = 0; offset < REMINDER_DAYS; offset++) {
    const day = addDays(now, offset);
    const date = toLocalDate(day);

    const workout = at(day, reminders.workout.time);
    if (reminders.workout.enabled && workout > now && reminders.workout.days.includes(weekday(day))) {
      const monday = weekStart(date);
      const doneThatWeek = days.filter((d) => weekStart(d) === monday).length;
      const goalMet = facts.weeklyGoal !== null && doneThatWeek >= facts.weeklyGoal;
      if (!goalMet && !days.includes(date)) planned.push({ kind: 'workout', at: workout });
    }

    const weight = at(day, reminders.weight.time);
    if (reminders.weight.enabled && weight > now && !(date === today && facts.weightToday)) {
      planned.push({ kind: 'weight', at: weight });
    }
  }

  const last = facts.workouts.reduce<Date | null>((top, w) => (!top || w > top ? w : top), null);
  if (reminders.inactive.enabled && last) {
    for (let time = 1; time <= INACTIVE_TIMES; time++) {
      const moment = at(addDays(last, INACTIVE_AFTER_DAYS * time), reminders.workout.time);
      if (moment > now) planned.push({ kind: 'inactive', at: moment });
    }
  }

  return planned.sort((a, b) => a.at.getTime() - b.at.getTime());
}
