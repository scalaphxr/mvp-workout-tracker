import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// A browser has neither a vibration motor worth the name nor local notifications.
const native = Platform.OS !== 'web';

/** A short vibration: `tap` on every +/−, `done` on a logged set, `alarm` when rest is over. */
export function haptic(kind: 'tap' | 'done' | 'alarm'): void {
  if (!native) return;
  const done =
    kind === 'tap'
      ? Haptics.selectionAsync()
      : Haptics.notificationAsync(
          kind === 'done'
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        );
  // A phone without a vibration motor is not an error.
  done.catch(() => {});
}

let player: AudioPlayer | null = null;

/**
 * The beep of the interval timer while the app is on the screen; with the screen locked the
 * notifications sound instead. It mixes with the user's music rather than stopping it.
 */
export function beep(): void {
  try {
    if (!player) {
      void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(
        () => {},
      );
      player = createAudioPlayer(require('@/assets/sounds/beep.wav'));
    }
    void player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // No sound is no reason to stop the timer.
  }
}

/** Android channels: each kind of alert can be muted on its own in the system settings. */
export type AlertChannel = 'rest' | 'interval';

let permitted: Promise<boolean> | null = null;
const channels = new Map<AlertChannel, Promise<unknown>>();

/** Asks for permission to notify once, and sets up the Android channel of the alert. */
function prepare(channel: AlertChannel, channelName: string): Promise<boolean> {
  permitted ??= (async () => {
    // While the app is open the timer on the screen does the job; no banner on top of it.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    return (await Notifications.requestPermissionsAsync()).granted;
  })().catch(() => false);

  if (Platform.OS === 'android' && !channels.has(channel)) {
    channels.set(
      channel,
      Notifications.setNotificationChannelAsync(channel, {
        name: channelName,
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 400, 200, 400],
      }).catch(() => {}),
    );
  }
  return Promise.all([permitted, channels.get(channel)]).then(([granted]) => granted);
}

export interface AlertText {
  title: string;
  body: string;
  /** The name of the Android channel, as the system settings show it. */
  channel: string;
}

/**
 * Schedules a notification with sound and vibration at `date`, so it arrives with the screen
 * locked too. Returns what `cancelAlert` needs, or `null` if notifications are not allowed.
 */
async function scheduleAlert(
  channel: AlertChannel,
  date: Date,
  text: AlertText,
): Promise<string | null> {
  if (!native || date.getTime() <= Date.now() || !(await prepare(channel, text.channel))) {
    return null;
  }
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title: text.title, body: text.body, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: channel },
    });
  } catch {
    return null;
  }
}

/** The "rest is over" notification. */
export function scheduleRestEnd(seconds: number, text: AlertText): Promise<string | null> {
  return scheduleAlert('rest', new Date(Date.now() + seconds * 1000), text);
}

/** iOS keeps at most 64 pending notifications of an app; the rest are scheduled later. */
export const MAX_SCHEDULED_ALERTS = 60;

/** A notification for every change of phase of the interval timer. */
export async function scheduleIntervalAlerts(
  alerts: readonly ({ at: number } & Omit<AlertText, 'channel'>)[],
  channelName: string,
): Promise<string[]> {
  const ids = await Promise.all(
    alerts
      .slice(0, MAX_SCHEDULED_ALERTS)
      .map(({ at, ...text }) =>
        scheduleAlert('interval', new Date(at), { ...text, channel: channelName }),
      ),
  );
  return ids.filter((id): id is string => id !== null);
}

export function cancelAlert(id: string | null): void {
  if (id) Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}
