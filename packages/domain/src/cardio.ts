/** What a cardio set may record besides its time, in the order the screen asks for it. */
export const CARDIO_FIELDS = [
  'distance_m',
  'speed_kmh',
  'incline_pct',
  'resistance_level',
  'avg_hr',
  'calories',
] as const;
export type CardioField = (typeof CARDIO_FIELDS)[number];

/** The numbers each machine shows on its display; a machine not listed shows the default. */
const FIELDS_BY_EQUIPMENT: Record<string, readonly CardioField[]> = {
  treadmill: ['distance_m', 'speed_kmh', 'incline_pct', 'avg_hr', 'calories'],
  stationary_bike: ['distance_m', 'resistance_level', 'avg_hr', 'calories'],
  elliptical: ['distance_m', 'resistance_level', 'avg_hr', 'calories'],
  rowing_machine: ['distance_m', 'resistance_level', 'avg_hr', 'calories'],
  jump_rope: ['avg_hr', 'calories'],
};
const DEFAULT_FIELDS: readonly CardioField[] = ['distance_m', 'avg_hr', 'calories'];

/** The fields of a cardio exercise, by the equipment it is done on. */
export function cardioFields(equipment: readonly string[]): readonly CardioField[] {
  for (const code of equipment) {
    const fields = FIELDS_BY_EQUIPMENT[code];
    if (fields) return fields;
  }
  return DEFAULT_FIELDS;
}

/** What a value may be; a number outside is a typo, not a workout. */
export const CARDIO_LIMITS: Record<CardioField, { min: number; max: number }> = {
  distance_m: { min: 0, max: 500_000 },
  speed_kmh: { min: 0, max: 60 },
  incline_pct: { min: -10, max: 40 },
  resistance_level: { min: 0, max: 100 },
  avg_hr: { min: 30, max: 250 },
  calories: { min: 0, max: 10_000 },
};

/** The longest single cardio set or activity: a day. */
export const MAX_DURATION_SEC = 24 * 60 * 60;

/** A number typed by hand: a comma or a point for decimals; `null` for nothing or garbage. */
export function parseNumber(text: string): number | null {
  const clean = text.trim().replace(',', '.');
  if (clean === '' || !/^-?\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}

/**
 * A time typed by hand, in seconds: "25" and "25,5" are minutes, "25:30" minutes and seconds,
 * "1:05:00" hours, minutes and seconds. `null` for nothing, garbage or zero.
 */
export function parseDuration(text: string): number | null {
  const clean = text.trim();
  let seconds: number | null = null;
  if (clean.includes(':')) {
    const parts = clean.split(':');
    if (parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
    const numbers = parts.map(Number);
    // Every part after the first is under 60.
    if (numbers.slice(1).some((part) => part >= 60)) return null;
    seconds = numbers.reduce((total, part) => total * 60 + part, 0);
  } else {
    const minutes = parseNumber(clean);
    if (minutes === null || minutes < 0) return null;
    seconds = Math.round(minutes * 60);
  }
  return seconds > 0 && seconds <= MAX_DURATION_SEC ? seconds : null;
}

/** "25:30", "1:05:00": how a time is written back into the field. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const pad = (value: number) => String(value).padStart(2, '0');
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Kinds of free activity the screen offers; the user may also name one of their own. */
export const ACTIVITY_TYPES = [
  'walking',
  'running',
  'cycling',
  'swimming',
  'hiking',
  'yoga',
  'pilates',
  'stretching',
  'dancing',
  'football',
  'basketball',
  'volleyball',
  'tennis',
  'martial_arts',
  'climbing',
  'skiing',
  'skating',
  'rowing',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const isKnownActivity = (type: string): type is ActivityType =>
  (ACTIVITY_TYPES as readonly string[]).includes(type);

/** A record of a set on time: the longest distance (metres) or the longest time (seconds). */
export type CardioRecordKind = 'distance' | 'duration';
export interface CardioRecord {
  kind: CardioRecordKind;
  value: number;
}

interface TimedSet {
  reps: number | null;
  duration_sec: number | null;
  distance_m: number | null;
}

/**
 * The records sets on time (cardio, holds) set against everything done before (spec: "for
 * cardio – distance and time"). Like the records of weights, the first time sets none: there
 * is nothing to beat yet.
 */
export function findCardioRecords(
  sets: readonly TimedSet[],
  earlier: readonly TimedSet[],
): CardioRecord[] {
  const timed = (list: readonly TimedSet[]) => list.filter((set) => set.reps === null);
  const top = (list: readonly TimedSet[], value: (set: TimedSet) => number | null) =>
    Math.max(0, ...timed(list).map((set) => value(set) ?? 0));

  const records: CardioRecord[] = [];
  const fields = [
    ['distance', (set: TimedSet) => set.distance_m],
    ['duration', (set: TimedSet) => set.duration_sec],
  ] as const;
  for (const [kind, value] of fields) {
    const before = top(earlier, value);
    const now = top(sets, value);
    if (before > 0 && now > before) records.push({ kind, value: now });
  }
  return records;
}
