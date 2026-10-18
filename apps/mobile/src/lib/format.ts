import { isKnownActivity, LB_KG } from '@mvp/domain';
import type { ActivityLogRow, Exercise, ProgramItemRow, SetLogRow, Units } from '@mvp/schemas';
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

/** The calendar day of a moment where the user is, as YYYY-MM-DD. */
export function toLocalDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `4,2 км`: a distance in kilometres, to two decimals at most. */
export const formatDistance = (t: TFunction, locale: string, meters: number) =>
  t('units.km', { value: formatNumber(Math.round(meters / 10) / 100, locale) });

type CardioValues = Partial<
  Pick<
    SetLogRow,
    'duration_sec' | 'distance_m' | 'speed_kmh' | 'incline_pct' | 'resistance_level' | 'avg_hr' | 'calories'
  >
>;

/**
 * What a cardio set or a set on time came to, only what was entered:
 * `25 мин, 4,2 км, 10 км/ч, наклон 2 %, пульс 145, 310 ккал`; a plank is just `60 с`.
 */
export function formatCardio(t: TFunction, locale: string, set: CardioValues): string {
  const number = (value: number) => formatNumber(value, locale);
  return [
    set.duration_sec ? formatDuration(t, set.duration_sec) : null,
    set.distance_m ? formatDistance(t, locale, set.distance_m) : null,
    set.speed_kmh ? t('units.kmh', { value: number(set.speed_kmh) }) : null,
    set.incline_pct != null && set.incline_pct !== 0
      ? t('cardio.inclineValue', { value: number(set.incline_pct) })
      : null,
    set.resistance_level ? t('cardio.resistanceValue', { value: number(set.resistance_level) }) : null,
    set.avg_hr ? t('cardio.hrValue', { value: set.avg_hr }) : null,
    set.calories ? t('units.kcal', { value: set.calories }) : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/** The name of a kind of activity: from the list in the user's language, or as typed. */
export function activityName(t: TFunction, type: string): string {
  return isKnownActivity(type) ? t(`activity.types.${type}`) : type;
}

/** `Футбол: 1 ч 30 мин, 8,2 км, пульс 151, интенсивность 7/10`. */
export function formatActivity(
  t: TFunction,
  locale: string,
  activity: Pick<
    ActivityLogRow,
    'activity_type' | 'duration_sec' | 'distance_m' | 'avg_hr' | 'calories' | 'intensity'
  >,
): string {
  const details = [
    formatCardio(t, locale, activity),
    activity.intensity !== null ? t('activity.intensityValue', { value: activity.intensity }) : null,
  ]
    .filter(Boolean)
    .join(', ');
  return `${activityName(t, activity.activity_type)}: ${details}`;
}

/** A weight in kilograms as a number in the user's units. */
export const toUnits = (kg: number, units: Units) => (units === 'lb' ? kg / LB_KG : kg);
/** A number typed in the user's units, in kilograms. */
export const fromUnits = (value: number, units: Units) => (units === 'lb' ? value * LB_KG : value);

/**
 * `84,6 кг` or `186.5 lb`. Weights are stored in kilograms; pounds are kept to a tenth, so a
 * weight made of pound steps comes out whole.
 */
export function formatWeight(t: TFunction, locale: string, kg: number, units: Units): string {
  const value = units === 'lb' ? Math.round(toUnits(kg, units) * 10) / 10 : kg;
  return t(units === 'lb' ? 'units.lb' : 'units.kg', { value: formatNumber(value, locale) });
}
