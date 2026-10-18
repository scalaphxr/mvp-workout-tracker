import { shiftDate } from './body';

/** The Monday of the week of a day (YYYY-MM-DD): weeks run Monday to Sunday. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((day + 6) % 7));
}

export interface WeeklyStreak {
  /** Weeks in a row with the goal met, this week included once it is met. */
  current: number;
  best: number;
  /** Workouts this week and the goal of a week. */
  thisWeek: { done: number; goal: number };
  /** Mondays of the missed weeks a freeze saved, oldest first. */
  frozen: string[];
  /** A freeze is left for this month. */
  freezeLeft: boolean;
}

/**
 * The series of weeks with the weekly goal met (spec 6.13). A missed week ends the series
 * unless the month of that week still has its one free freeze: then the series goes on, the
 * missed week just does not count. The week under way never ends a series: it may still be met.
 *
 * `workoutDays` are the calendar days (YYYY-MM-DD, the user's own time zone) of finished
 * workouts. The series is worked out from them each time, so it can never disagree with them.
 */
export function weeklyStreak(
  workoutDays: readonly string[],
  goal: number,
  today: string,
): WeeklyStreak {
  const thisMonday = weekStart(today);
  const perWeek = new Map<string, number>();
  for (const day of workoutDays) {
    if (day > today) continue;
    const monday = weekStart(day);
    perWeek.set(monday, (perWeek.get(monday) ?? 0) + 1);
  }
  const done = perWeek.get(thisMonday) ?? 0;
  const first = [...perWeek.keys()].sort()[0];

  let run = 0;
  let best = 0;
  const frozen: string[] = [];
  const freezeMonths = new Set<string>();
  for (let monday = first; monday && monday < thisMonday; monday = shiftDate(monday, 7)) {
    const month = monday.slice(0, 7);
    if ((perWeek.get(monday) ?? 0) >= goal) {
      run++;
      best = Math.max(best, run);
    } else if (run > 0 && !freezeMonths.has(month)) {
      freezeMonths.add(month);
      frozen.push(monday);
    } else {
      run = 0;
    }
  }

  const current = done >= goal ? run + 1 : run;
  return {
    current,
    best: Math.max(best, current),
    thisWeek: { done, goal },
    frozen,
    freezeLeft: !freezeMonths.has(thisMonday.slice(0, 7)),
  };
}
