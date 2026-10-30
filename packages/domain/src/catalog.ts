import type { CatalogSeed, Exercise, ExerciseMedia, Level, Locale } from '@mvp/schemas';

import { popularityPlace } from './popularity';

const LOCALES: readonly Locale[] = ['ru', 'en'];

/** Lower case, «ё» as «е», punctuation as spaces: how names are compared in search and import. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-я]+/g, ' ')
    .trim();
}

/**
 * What the schema cannot express: unique keys and references between records.
 * Returns human-readable problems; an empty list means the seed is consistent.
 */
export function findCatalogProblems(seed: CatalogSeed): string[] {
  const problems: string[] = [];

  const unique = (what: string, values: string[]) => {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) problems.push(`Duplicate ${what}: ${value}`);
      seen.add(value);
    }
    return seen;
  };

  unique('id', [...seed.equipment, ...seed.muscles, ...seed.exercises].map((row) => row.id));
  const equipmentCodes = unique('equipment code', seed.equipment.map((row) => row.code));
  const muscleCodes = unique('muscle code', seed.muscles.map((row) => row.code));
  const slugs = unique('exercise slug', seed.exercises.map((row) => row.slug));

  for (const locale of LOCALES) {
    // A name or alias must point to one exercise, or import from text cannot tell them apart.
    const owners = new Map<string, string>();
    for (const exercise of seed.exercises) {
      const text = exercise.translations[locale];
      for (const name of new Set([text.name, ...text.aliases].map(normalizeText))) {
        const owner = owners.get(name);
        if (owner) problems.push(`"${name}" (${locale}) names both ${owner} and ${exercise.slug}`);
        owners.set(name, exercise.slug);
      }
    }
  }

  for (const exercise of seed.exercises) {
    const at = `${exercise.slug}:`;
    for (const code of [...exercise.primary_muscles, ...exercise.secondary_muscles]) {
      if (!muscleCodes.has(code)) problems.push(`${at} unknown muscle ${code}`);
    }
    for (const code of exercise.primary_muscles) {
      if (exercise.secondary_muscles.includes(code)) {
        problems.push(`${at} muscle ${code} is both primary and secondary`);
      }
    }
    for (const code of exercise.equipment) {
      if (!equipmentCodes.has(code)) problems.push(`${at} unknown equipment ${code}`);
    }
    const alternatives = new Set<string>();
    for (const { slug } of exercise.alternatives) {
      if (slug === exercise.slug) problems.push(`${at} lists itself as an alternative`);
      else if (!slugs.has(slug)) problems.push(`${at} unknown alternative ${slug}`);
      if (alternatives.has(slug)) problems.push(`${at} duplicate alternative ${slug}`);
      alternatives.add(slug);
    }
  }

  return problems;
}

export interface ExerciseFilters {
  /** Free text: matched against names and aliases in both languages. */
  query?: string;
  /** Muscle codes: the exercise trains any of them as a primary muscle. */
  muscles?: readonly string[];
  /** Equipment codes: the exercise uses any of them. */
  equipment?: readonly string[];
  level?: Level | null;
  /** The order of the list; alphabetical unless it says otherwise. */
  sort?: ExerciseSort;
}

export type ExerciseSort = 'popularity' | 'alphabet';

/** Every query word starts some word of the text: «жим лёж» finds «Жим штанги лёжа». */
function matches(text: string, queryWords: readonly string[]): boolean {
  const words = normalizeText(text).split(' ');
  return queryWords.every((queryWord) => words.some((word) => word.startsWith(queryWord)));
}

/** 0 – the name in the user's language, 1 – the name in the other language, 2 – an alias. */
function matchRank(exercise: Exercise, queryWords: readonly string[], locale: Locale) {
  if (matches(exercise.translations[locale].name, queryWords)) return 0;
  const other = locale === 'ru' ? 'en' : 'ru';
  if (matches(exercise.translations[other].name, queryWords)) return 1;
  const aliases = [...exercise.translations.ru.aliases, ...exercise.translations.en.aliases];
  return aliases.some((alias) => matches(alias, queryWords)) ? 2 : null;
}

/**
 * The library search, the same on the phone and on the server. Results are ordered by how well
 * the name matches; for a query the shorter name comes first – the plain exercise before its
 * variants («Жим штанги лёжа» before «Жим штанги лёжа узким хватом») – then alphabetically.
 * Sorted by popularity, the place in `POPULAR_EXERCISES` comes right after the match.
 */
export function searchExercises(
  exercises: readonly Exercise[],
  filters: ExerciseFilters,
  locale: Locale,
): Exercise[] {
  const queryWords = normalizeText(filters.query ?? '')
    .split(' ')
    .filter(Boolean);
  const found: { exercise: Exercise; rank: number }[] = [];

  for (const exercise of exercises) {
    if (filters.level && exercise.level !== filters.level) continue;
    if (
      filters.muscles?.length &&
      !exercise.primary_muscles.some((code) => filters.muscles?.includes(code))
    ) {
      continue;
    }
    if (
      filters.equipment?.length &&
      !exercise.equipment.some((code) => filters.equipment?.includes(code))
    ) {
      continue;
    }
    const rank = queryWords.length > 0 ? matchRank(exercise, queryWords, locale) : 0;
    if (rank !== null) found.push({ exercise, rank });
  }

  return found
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (filters.sort === 'popularity'
          ? popularityPlace(a.exercise.slug) - popularityPlace(b.exercise.slug)
          : 0) ||
        // Without a query the library is simply alphabetical.
        (queryWords.length > 0
          ? a.exercise.translations[locale].name.length - b.exercise.translations[locale].name.length
          : 0) ||
        a.exercise.translations[locale].name.localeCompare(
          b.exercise.translations[locale].name,
          locale,
        ),
    )
    .map(({ exercise }) => exercise);
}

/** The video in the user's language, or in the other language when there is none. */
export function pickMedia(exercise: Exercise, locale: Locale): ExerciseMedia | null {
  return exercise.media.find((media) => media.lang === locale) ?? exercise.media[0] ?? null;
}
