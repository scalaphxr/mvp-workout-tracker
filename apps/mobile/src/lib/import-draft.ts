import { matchExercise, type ParsedItem, parseProgramText } from '@mvp/domain';
import type { Exercise } from '@mvp/schemas';
import { create } from 'zustand';

export interface ImportItem {
  parsed: ParsedItem;
  /** The exercise of the catalog the line means; `null` – the user has to pick. */
  exerciseId: string | null;
}

interface ImportDraft {
  /** `null` until a text is read. */
  days: { title: string | null; items: ImportItem[] }[] | null;
  skipped: string[];
  /** Reads a pasted text and looks every exercise up in the catalog. */
  read(text: string, exercises: readonly Exercise[]): void;
  /** The user's pick for a line that was not recognised (or was recognised wrongly). */
  choose(day: number, item: number, exerciseId: string): void;
  clear(): void;
}

/**
 * A program being imported from text: a draft that lives in memory until the user saves it.
 * Shared by the import screen and the exercise picker it opens.
 */
export const useImportDraft = create<ImportDraft>((set) => ({
  days: null,
  skipped: [],
  read(text, exercises) {
    const program = parseProgramText(text);
    set({
      skipped: program.skipped,
      days: program.days.map((day) => ({
        title: day.title,
        items: day.items.map((parsed) => ({
          parsed,
          exerciseId: matchExercise(parsed.name, exercises)?.id ?? null,
        })),
      })),
    });
  },
  choose(dayIndex, itemIndex, exerciseId) {
    set((state) => ({
      days:
        state.days?.map((day, d) =>
          d !== dayIndex
            ? day
            : {
                ...day,
                items: day.items.map((item, i) => (i === itemIndex ? { ...item, exerciseId } : item)),
              },
        ) ?? null,
    }));
  },
  clear: () => set({ days: null, skipped: [] }),
}));
