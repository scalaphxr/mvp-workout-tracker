/** A morning weight: one per calendar day, `date` as YYYY-MM-DD in the user's own time zone. */
export interface WeightEntry {
  date: string;
  weight_kg: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** The average of a week is shown once it has this many entries. */
export const MIN_ENTRIES_FOR_AVERAGE = 4;

/** `date` moved by a number of days; plain calendar arithmetic, no time zones involved. */
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function average(entries: readonly WeightEntry[], from: string, to: string): number | null {
  const week = entries.filter((entry) => entry.date >= from && entry.date <= to);
  if (week.length < MIN_ENTRIES_FOR_AVERAGE) return null;
  return week.reduce((sum, entry) => sum + entry.weight_kg, 0) / week.length;
}

export interface WeightStats {
  /** The weight entered for `today`. */
  today: number | null;
  /** Average of the last 7 calendar days, today included; `null` with fewer than 4 entries. */
  average7: number | null;
  /** This week's average minus the previous week's, in kg and in percent of body weight. */
  change_kg: number | null;
  change_pct: number | null;
}

/** The numbers of the weight card (spec 6.5). */
export function weightStats(entries: readonly WeightEntry[], today: string): WeightStats {
  const average7 = average(entries, shiftDate(today, -6), today);
  const previous = average(entries, shiftDate(today, -13), shiftDate(today, -7));
  const change_kg = average7 !== null && previous !== null ? average7 - previous : null;
  return {
    today: entries.find((entry) => entry.date === today)?.weight_kg ?? null,
    average7,
    change_kg,
    change_pct: change_kg !== null && previous ? (change_kg / previous) * 100 : null,
  };
}

/**
 * How fast the weight goes down on a cut: 0.5–1% of body weight a week is fine, more than 1%
 * risks losing muscle. `null` – not losing, or nothing to judge by.
 */
export function cutPace(changePct: number | null): 'ok' | 'too_fast' | 'slow' | null {
  if (changePct === null || changePct >= 0) return null;
  const loss = -changePct;
  if (loss > 1) return 'too_fast';
  return loss >= 0.5 ? 'ok' : 'slow';
}
