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

const REST_CHANNEL = 'rest';
let prepared: Promise<boolean> | null = null;

/** Asks for permission to notify once, and sets up the Android channel. */
function prepare(channelName: string): Promise<boolean> {
  prepared ??= (async () => {
    // While the app is open the timer on the screen does the job; no banner on top of it.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(REST_CHANNEL, {
        name: channelName,
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 400, 200, 400],
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    return (await Notifications.requestPermissionsAsync()).granted;
  })().catch(() => false);
  return prepared;
}

/**
 * Schedules the "rest is over" notification, so it arrives with the screen locked too.
 * Returns what `cancelRestEnd` needs, or `null` if notifications are not allowed.
 */
export async function scheduleRestEnd(
  seconds: number,
  text: { title: string; body: string; channel: string },
): Promise<string | null> {
  if (!native || seconds <= 0 || !(await prepare(text.channel))) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title: text.title, body: text.body, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        channelId: REST_CHANNEL,
      },
    });
  } catch {
    return null;
  }
}

export function cancelRestEnd(id: string | null): void {
  if (id) Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}
