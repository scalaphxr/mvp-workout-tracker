import type { Exercise, ProgramItemRow } from '@mvp/schemas';
import type { TFunction } from 'i18next';

/** `8–10`, or `8` when both ends are the same. A range is always shown with an en dash. */
export const formatRange = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);

/** `90 с`, `2 мин`, `1 мин 30 с`. */
export function formatDuration(t: TFunction, seconds: number): string {
  if (seconds < 60) return t('units.sec', { value: seconds });
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec === 0 ? t('units.min', { value: min }) : t('units.minSec', { min, sec });
}

/** Numbers print in the user's language: `1,25` in Russian, `1.25` in English. */
export const formatNumber = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);

/**
 * What an item of a program asks for: `3 × 8–10` for reps, `3 × 30–60 с` for timed exercises,
 * `20–30 мин` for cardio.
 */
export function formatItemPlan(
  t: TFunction,
  item: Pick<ProgramItemRow, 'sets' | 'rep_min' | 'rep_max'>,
  exercise: Exercise | undefined,
): string {
  const range = formatRange(item.rep_min, item.rep_max);
  if (exercise?.tracking === 'distance_time') return t('units.min', { value: range });
  return t('program.sets', {
    sets: item.sets,
    range: exercise?.tracking === 'time' ? t('units.sec', { value: range }) : range,
  });
}
