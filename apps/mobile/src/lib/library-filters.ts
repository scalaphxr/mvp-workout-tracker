import type { Level } from '@mvp/schemas';
import { create } from 'zustand';

interface LibraryFilters {
  query: string;
  /** Muscle codes. */
  muscles: string[];
  /** Equipment codes. */
  equipment: string[];
  level: Level | null;
  setQuery(query: string): void;
  toggleMuscle(code: string): void;
  toggleEquipment(code: string): void;
  setLevel(level: Level | null): void;
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
  setQuery: (query) => set({ query }),
  toggleMuscle: (code) => set((state) => ({ muscles: toggle(state.muscles, code) })),
  toggleEquipment: (code) => set((state) => ({ equipment: toggle(state.equipment, code) })),
  setLevel: (level) => set({ level }),
  reset: () => set({ muscles: [], equipment: [], level: null }),
}));

/** How many filters are on (the search text is not a filter). */
export const activeFilterCount = (filters: Pick<LibraryFilters, 'muscles' | 'equipment' | 'level'>) =>
  filters.muscles.length + filters.equipment.length + (filters.level ? 1 : 0);
