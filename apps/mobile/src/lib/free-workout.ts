import { create } from 'zustand';

interface FreeWorkoutFocus {
  /** The exercise of the workout picked in the search: its card scrolls into view. */
  id: string | null;
  set(id: string | null): void;
}

export const useFreeWorkoutFocus = create<FreeWorkoutFocus>((set) => ({
  id: null,
  set: (id) => set({ id }),
}));
