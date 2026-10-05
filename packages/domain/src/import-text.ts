import type { Exercise } from '@mvp/schemas';

import { normalizeText } from './catalog';

/** An exercise line of a pasted program. */
export interface ParsedItem {
  /** The name as it was written. */
  name: string;
  sets: number;
  // The range is two numbers from the very start: "8-9" never becomes anything else.
  rep_min: number;
  rep_max: number;
  /** What the range counts: reps, or seconds for holds. */
  unit: 'reps' | 'sec';
  rest_sec: number | null;
  /** Done as a superset with the item before it. */
  superset: boolean;
}

export interface ParsedDay {
  /** The heading of the day as it was written; `null` when the text had none. */
  title: string | null;
  items: ParsedItem[];
}

export interface ParsedProgram {
  days: ParsedDay[];
  /** Lines that are neither an exercise nor a heading. */
  skipped: string[];
}

// "3x8-10", "3 х 8–10", "3×10": sets, then reps or a range.
const SETS_X_REPS = /(\d{1,2})\s*x\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?/;
// "3 подхода по 8-10", "3 sets of 10", "3 сета на 12".
const SETS_WORD_REPS =
  /(\d{1,2})\s*(?:подход[а-я]*|сет[а-я]*|sets?)\s*(?:по|на|of|x)?\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?/;
// "8-10 повторений, 3 подхода", "10 reps x 3 sets".
const REPS_WORD_SETS =
  /(\d{1,3})(?:\s*-\s*(\d{1,3}))?\s*(?:повтор[а-я]*|раз[а]?|reps?)\s*[,x]?\s*(\d{1,2})\s*(?:подход[а-я]*|сет[а-я]*|sets?)/;
// A row of a spreadsheet: name, sets, reps, and maybe the rest in the next cell.
const TABLE_ROW = /,\s*(\d{1,2})\s*,\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?(?:\s*,\s*(\d{1,4}))?/;
const REST = /(?:отдых[а-я]*|пауз[а-я]*|rest)\D{0,12}?(\d+(?:[.,]\d+)?)\s*(мин[а-я]*|min[a-z]*|м|m|сек[а-я]*|sec[a-z]*|с|s)?/i;
const SECONDS = /^\s*(?:сек[а-я]*|sec[a-z]*|с|s)(?![a-zа-я])/;
const MINUTES = /^\s*(?:мин[а-я]*|min[a-z]*)(?![a-zа-я])/;
const SUPERSET = /^\s*(?:суперсет|superset)\s*[:\-]?\s*/;
// How the heading of a day begins: "День 2", "Тренировка A", "Понедельник", "Workout 1".
const DAY_WORD =
  /^(?:день|тренировка|понедельник|вторник|сред[аы]|четверг|пятниц[аы]|суббот[аы]|воскресенье|day|workout|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?![a-zа-яё])/i;

/**
 * One spelling for the signs people type: × х * → x, any dash → -, tabs and | → a comma.
 * Every replacement is one character for one, so positions in the result are positions in
 * the line as it was written.
 */
function tidy(line: string): string {
  return line
    .toLowerCase()
    .replace(/[×х*]/g, (sign, offset: number, whole: string) =>
      // The Cyrillic «х» is a multiplication sign only between numbers.
      sign === 'х' && !/\d\s*$/.test(whole.slice(0, offset)) ? sign : 'x',
    )
    .replace(/[–—−]/g, '-')
    .replace(/[\t|;]/g, ',');
}

function parseRest(text: string): number | null {
  const match = REST.exec(text);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(',', '.'));
  const unit = match[2] ?? '';
  // Without a unit, a small number is minutes and a large one seconds.
  const minutes = unit ? /^(мин|min|м$|m$)/.test(unit) : value <= 10;
  return Math.round(minutes ? value * 60 : value);
}

/** An exercise from a piece of a line, or `null` if it has no sets and reps in it. */
function parseItem(original: string, superset: boolean): ParsedItem | null {
  const text = tidy(original);
  const found =
    [SETS_X_REPS, SETS_WORD_REPS, TABLE_ROW].map((pattern) => pattern.exec(text)).find(Boolean) ??
    null;
  const reversed = found ? null : REPS_WORD_SETS.exec(text);
  const match = found ?? reversed;
  if (!match) return null;

  const [sets, min, max] = found
    ? [Number(found[1]), Number(found[2]), Number(found[3] ?? found[2])]
    : [Number(match[3]), Number(match[1]), Number(match[2] ?? match[1])];
  if (sets < 1 || sets > 20 || min < 1 || max < min) return null;

  // The name is what stands before the numbers, or after them ("3x10 жим лёжа").
  const clean = (part: string) =>
    part
      .replace(REST, '')
      .replace(/^\s*(?:\d+[.)]|[-•–—·])\s*/, '')
      .replace(/[\s:,.\-–—()]+$/, '')
      .replace(/^[\s:,.\-–—()]+/, '')
      .trim();
  const after = text.slice(match.index + match[0].length);
  const name = clean(original.slice(0, match.index)) || clean(original.slice(match.index + match[0].length));
  if (!name || !/[a-zа-яё]/i.test(name)) return null;

  const seconds = SECONDS.test(after);
  const scale = MINUTES.test(after) ? 60 : 1;
  return {
    name,
    sets,
    rep_min: min * scale,
    rep_max: max * scale,
    unit: seconds || scale === 60 ? 'sec' : 'reps',
    // In a spreadsheet row the rest is a bare number in the cell after the reps.
    rest_sec: parseRest(text) ?? (found?.[4] ? parseRest(`rest ${found[4]}`) : null),
    superset,
  };
}

/**
 * Reads a program pasted as text – from a chat, a note or a spreadsheet – into days and
 * exercises. This is the parser of simple formats ("Жим лёжа 3×8-10, отдых 2 мин"); it works
 * on the phone with no network and no AI.
 */
export function parseProgramText(text: string): ParsedProgram {
  const days: ParsedDay[] = [];
  const skipped: string[] = [];
  let current: ParsedDay | null = null;
  // The first line and a line after an empty one start a block.
  let opensBlock = true;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      opensBlock = true;
      continue;
    }
    const first = opensBlock;
    opensBlock = false;

    // "Superset: curls 3x12 + pushdowns 3x15" is several exercises on one line, with the word
    // or without it. If a part is not an exercise, the plus meant something else.
    const body = line.replace(new RegExp(SUPERSET.source, 'i'), '');
    const parts = body.split(/\s+\+\s+/).map((part, index) => parseItem(part, index > 0));
    const items = parts.every((item) => item !== null) ? parts : [parseItem(body, false)];

    if (items.every((item): item is ParsedItem => item !== null)) {
      current ??= pushDay(days, null);
      current.items.push(...items);
    } else if (
      line.length <= 60 &&
      line.split(/\s+/).length <= 7 &&
      /[a-zа-яё]/i.test(line) &&
      (first || DAY_WORD.test(line) || line.endsWith(':'))
    ) {
      // A short line without sets and reps is the heading of a day, if it stands where a
      // heading does or says so; a remark between two exercises does not split the day.
      current = pushDay(days, line.replace(/[\s:.\-–—]+$/, ''));
    } else {
      skipped.push(line);
    }
  }

  return { days: days.filter((day) => day.items.length > 0), skipped };
}

function pushDay(days: ParsedDay[], title: string | null): ParsedDay {
  const day = { title, items: [] };
  days.push(day);
  return day;
}

// --- Finding the exercise a name means ---

function trigrams(text: string): Set<string> {
  const padded = `  ${text} `;
  const grams = new Set<string>();
  for (let index = 0; index < padded.length - 2; index++) grams.add(padded.slice(index, index + 3));
  return grams;
}

/** How alike two names are, 0…1: the share of three-letter pieces they have in common. */
export function similarity(a: string, b: string): number {
  const left = trigrams(normalizeText(a));
  const right = trigrams(normalizeText(b));
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared++;
  return (2 * shared) / (left.size + right.size);
}

/** Below this a fuzzy match is more likely a different exercise than a misspelt one. */
export const MATCH_THRESHOLD = 0.55;

/**
 * The exercise of the catalog a written name means (spec 6.7): the exact name, then a known
 * alias, then the closest name if it is close enough. `null` – the user has to pick.
 */
export function matchExercise(name: string, exercises: readonly Exercise[]): Exercise | null {
  const wanted = normalizeText(name);
  const namesOf = (exercise: Exercise) => [
    exercise.translations.ru.name,
    exercise.translations.en.name,
    ...exercise.translations.ru.aliases,
    ...exercise.translations.en.aliases,
  ];

  const exact = exercises.find((exercise) =>
    namesOf(exercise).some((known) => normalizeText(known) === wanted),
  );
  if (exact) return exact;

  let best: { exercise: Exercise; score: number } | null = null;
  for (const exercise of exercises) {
    const score = Math.max(...namesOf(exercise).map((known) => similarity(known, name)));
    if (score >= MATCH_THRESHOLD && score > (best?.score ?? 0)) best = { exercise, score };
  }
  return best?.exercise ?? null;
}
