import { create } from 'zustand';

import { cancelAlert, scheduleRestEnd } from './feedback';

interface RestText {
  title: string;
  body: string;
  channel: string;
}

interface RestTimer {
  /** When the rest ends (ms since epoch); `null` – no rest is running. */
  endsAt: number | null;
  /** The scheduled "rest is over" notification. */
  notification: string | null;
  text: RestText | null;
  start(seconds: number, text: RestText): void;
  /** Makes the rest longer or shorter. */
  add(seconds: number): void;
  stop(): void;
}

/**
 * The rest between sets. It is kept as the moment the rest ends, not as a count-down, so
 * the app can be in the background or the screen locked and the timer is still right.
 */
export const useRestTimer = create<RestTimer>((set, get) => {
  /** Moves the notification to the new end of the rest. */
  const reschedule = (endsAt: number, text: RestText) => {
    cancelAlert(get().notification);
    set({ endsAt, text, notification: null });
    void scheduleRestEnd(Math.round((endsAt - Date.now()) / 1000), text).then((notification) => {
      // The rest may have been changed or stopped while the notification was being scheduled.
      if (get().endsAt === endsAt) set({ notification });
      else cancelAlert(notification);
    });
  };

  return {
    endsAt: null,
    notification: null,
    text: null,
    start(seconds, text) {
      if (seconds > 0) reschedule(Date.now() + seconds * 1000, text);
    },
    add(seconds) {
      const { endsAt, text } = get();
      if (endsAt === null || text === null) return;
      const next = endsAt + seconds * 1000;
      if (next <= Date.now()) get().stop();
      else reschedule(next, text);
    },
    stop() {
      cancelAlert(get().notification);
      set({ endsAt: null, notification: null, text: null });
    },
  };
});
