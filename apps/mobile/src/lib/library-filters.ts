import { type ExerciseSort, isAvailable, searchExercises } from '@mvp/domain';
import type { Exercise, Level } from '@mvp/schemas';
import { create } from 'zustand';

import { useLocale } from '@/hooks/use-locale';

import { useCatalog } from './catalog';
import { useGym } from './gym';

interface LibraryFilters {
  query: string;
  /** Muscle codes. */
  muscles: string[];
  /** Equipment codes. */
  equipment: string[];
  level: Level | null;
  /** Hide exercises the main gym has no equipment for. */
  onlyMyGym: boolean;
  sort: ExerciseSort;
  setQuery(query: string): void;
  toggleMuscle(code: string): void;
  toggleEquipment(code: string): void;
  setLevel(level: Level | null): void;
  toggleOnlyMyGym(): void;
  setSort(sort: ExerciseSort): void;
  reset(): void;
}

const toggle = (list: string[], code: string) =>
  list.includes(code) ? list.filter((item) => item !== code) : [...list, code];

/** Search and filters of the exercise library: shared by the list and the filter screen. */
export const useLibraryFilters = create<LibraryFilters>((set) => ({
  query: '',
  muscles: [],
  equipment: [],
  level: null,
  onlyMyGym: true,
  sort: 'popularity',
  setQuery: (query) => set({ query }),
  toggleMuscle: (code) => set((state) => ({ muscles: toggle(state.muscles, code) })),
  toggleEquipment: (code) => set((state) => ({ equipment: toggle(state.equipment, code) })),
  setLevel: (level) => set({ level }),
  toggleOnlyMyGym: () => set((state) => ({ onlyMyGym: !state.onlyMyGym })),
  setSort: (sort) => set({ sort }),
  reset: () => set({ muscles: [], equipment: [], level: null }),
}));

/** How many filters are on. The search text, the "my gym" switch and the order are not counted. */
export const activeFilterCount = (filters: Pick<LibraryFilters, 'muscles' | 'equipment' | 'level'>) =>
  filters.muscles.length + filters.equipment.length + (filters.level ? 1 : 0);

/** The exercises the library shows for the current search and filters. */
export function useFoundExercises(): Exercise[] {
  const { catalog } = useCatalog();
  const filters = useLibraryFilters();
  const locale = useLocale();
  const gym = useGym();

  const found = searchExercises(catalog.exercises, filters, locale);
  return filters.onlyMyGym && gym
    ? found.filter((exercise) => isAvailable(exercise, gym.equipment))
    : found;
}
