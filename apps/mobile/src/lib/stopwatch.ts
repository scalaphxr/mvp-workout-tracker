import { create } from 'zustand';

interface Watch {
  /** When it was started last, ms since epoch; `null` – stopped. */
  startedAt: number | null;
  /** Milliseconds run before the last start. */
  runMs: number;
}

interface Stopwatches {
  /** By the exercise of a workout: going to another exercise and back keeps the time. */
  watches: Record<string, Watch>;
  start(key: string): void;
  /** Stops the watch and returns the seconds it has run. */
  stop(key: string): number;
  reset(key: string): void;
}

const STOPPED: Watch = { startedAt: null, runMs: 0 };

/** Seconds a watch has run. Kept as moments, not as a count, so a locked screen does not matter. */
export const watchSeconds = (watch: Watch | undefined, now = Date.now()) =>
  watch ? Math.floor((watch.runMs + (watch.startedAt === null ? 0 : now - watch.startedAt)) / 1000) : 0;

/** The stopwatch of a cardio set. */
export const useStopwatch = create<Stopwatches>((set, get) => ({
  watches: {},
  start(key) {
    const watch = get().watches[key] ?? STOPPED;
    if (watch.startedAt !== null) return;
    set({ watches: { ...get().watches, [key]: { ...watch, startedAt: Date.now() } } });
  },
  stop(key) {
    const watch = get().watches[key] ?? STOPPED;
    const now = Date.now();
    const stopped = {
      startedAt: null,
      runMs: watch.runMs + (watch.startedAt === null ? 0 : now - watch.startedAt),
    };
    set({ watches: { ...get().watches, [key]: stopped } });
    return watchSeconds(stopped, now);
  },
  reset(key) {
    const { [key]: _gone, ...rest } = get().watches;
    set({ watches: rest });
  },
}));
