import { intervalAt, intervalTotalSec } from '@mvp/domain';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ConfirmButton } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ThemeOverride, useTheme } from '@/hooks/use-theme';
import { beep, haptic } from '@/lib/feedback';
import { formatDuration } from '@/lib/format';
import {
  elapsedMs,
  phaseProgress,
  phaseTitle,
  useIntervalTimer,
} from '@/lib/interval-timer';
import { useScreenAwake } from '@/lib/keep-awake';

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** The seconds of a phase counted down with a tap each, before the beep of the next one. */
const COUNTDOWN_SEC = 3;

export default function IntervalRunScreen() {
  // Dark like the workout: a bright screen is the last thing wanted mid-round.
  return (
    <ThemeOverride.Provider value="dark">
      <IntervalRun />
    </ThemeOverride.Provider>
  );
}

function IntervalRun() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { run, start, pause, resume, stop, refreshAlerts } = useIntervalTimer();
  const [now, setNow] = useState(() => Date.now());
  const shown = useRef<{ index: number; second: number } | null>(null);
  useScreenAwake();

  const paused = run?.pausedAt != null;
  useEffect(() => {
    if (!run || paused) return;
    const tick = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(tick);
  }, [run, paused]);

  // Back from the background: the screen catches up by itself, the notifications are topped up.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(Date.now());
        refreshAlerts();
      }
    });
    return () => subscription.remove();
  }, [refreshAlerts]);

  const position = run ? intervalAt(run.phases, elapsedMs(run, now) / 1000) : null;
  const index = position?.index ?? -1;
  const second = position ? Math.ceil(position.left_sec) : 0;

  // Sound and vibration on every change of phase, a tap on each of the last seconds.
  useEffect(() => {
    if (!run) return;
    const before = shown.current;
    shown.current = { index, second };
    if (!before) return;
    if (before.index !== index) {
      beep();
      haptic('alarm');
    } else if (second !== before.second && second <= COUNTDOWN_SEC && second > 0) {
      haptic('tap');
    }
  }, [run, index, second]);

  if (!run) {
    return <EmptyState title={t('interval.title')} text={t('interval.mineEmpty')} />;
  }

  const close = () => {
    stop();
    router.back();
  };

  if (!position) {
    return (
      <View style={[styles.screen, styles.done, { backgroundColor: theme.background }]}>
        <ThemedText style={styles.doneTitle}>{t('interval.doneTitle')}</ThemedText>
        <ThemedText themeColor="textSecondary">{t('interval.doneText')}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {run.title}, {formatDuration(t, intervalTotalSec(run.phases))}
        </ThemedText>
        <View style={styles.doneActions}>
          <Button title={t('interval.close')} onPress={close} />
          <Button
            variant="secondary"
            title={t('interval.again')}
            onPress={() => {
              shown.current = null;
              start(run.title, run.plan);
            }}
          />
        </View>
      </View>
    );
  }

  const { phase } = position;
  const next = run.phases[index + 1];
  const working = phase.kind === 'work';
  // The work is the one bright phase: it is seen from across the room.
  const background = working
    ? theme.accent
    : phase.kind === 'prepare'
      ? theme.backgroundSelected
      : theme.backgroundElement;
  const foreground = working ? theme.onAccent : theme.text;
  const title = phaseTitle(phase);

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.three },
      ]}>
      <View
        style={[styles.phase, { backgroundColor: background }]}
        accessibilityRole="timer"
        accessibilityLiveRegion="polite"
        accessibilityLabel={t('interval.left', { phase: title, time: formatDuration(t, second) })}>
        <ThemedText style={[styles.phaseTitle, { color: foreground }]}>
          {paused ? t('interval.paused') : title}
        </ThemedText>
        <ThemedText style={[styles.time, { color: foreground }]}>{clock(second)}</ThemedText>
        {phase.kind !== 'prepare' && (
          <ThemedText style={[styles.progress, { color: foreground }]}>
            {phaseProgress(phase, run.plan)}
          </ThemedText>
        )}
      </View>

      <ThemedText themeColor="textSecondary" style={styles.next}>
        {next
          ? t('interval.next', { phase: phaseTitle(next), time: formatDuration(t, next.duration_sec) })
          : ' '}
      </ThemedText>

      {/* Everything is pressed with one hand, in the lower half of the screen. */}
      <View style={styles.actions}>
        {paused ? (
          <Button title={t('interval.resume')} onPress={resume} />
        ) : (
          <Button title={t('interval.pause')} onPress={pause} />
        )}
        <ConfirmButton title={t('interval.stop')} onConfirm={close} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  phase: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.four,
    padding: Spacing.three,
  },
  phaseTitle: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: 700,
    textAlign: 'center',
  },
  time: {
    fontSize: 112,
    lineHeight: 124,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  progress: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: 600,
    textAlign: 'center',
  },
  next: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.two,
  },
  done: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: 700,
  },
  doneActions: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
});
