import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/feedback';
import { useRestTimer } from '@/lib/rest-timer';

import { Button } from './button';
import { ThemedText } from './themed-text';

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * The rest count-down shown over the workout; nothing when no rest is running. `aside` sits to
 * the left of the count-down: what the next exercise works.
 */
export function RestTimer({ aside }: { aside?: ReactNode }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const endsAt = useRestTimer((state) => state.endsAt);
  const add = useRestTimer((state) => state.add);
  const stop = useRestTimer((state) => state.stop);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    const tick = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= endsAt) {
        // The notification covers a locked screen; this is for a phone in the hand.
        haptic('alarm');
        stop();
      }
    }, 250);
    return () => clearInterval(tick);
  }, [endsAt, stop]);

  if (endsAt === null) return null;
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));

  return (
    <View
      style={[styles.panel, { backgroundColor: theme.backgroundElement }]}
      accessibilityRole="timer"
      accessibilityLabel={`${t('rest.title')}: ${clock(left)}`}>
      <View style={styles.top}>
        {aside}
        <View style={styles.count}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('rest.title')}
          </ThemedText>
          <ThemedText style={styles.time}>{clock(left)}</ThemedText>
        </View>
      </View>
      <View style={styles.actions}>
        <Button variant="secondary" title={t('rest.less')} onPress={() => add(-15)} />
        <Button variant="secondary" title={t('rest.more')} onPress={() => add(15)} />
        <Button title={t('rest.skip')} onPress={stop} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  count: {
    flex: 1,
    alignItems: 'center',
  },
  time: {
    fontSize: 56,
    lineHeight: 64,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
