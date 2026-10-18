import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Switch, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { allowReminders } from '@/lib/feedback';
import { formatDuration } from '@/lib/format';
import { type Preferences, usePreferences } from '@/lib/preferences';
import { useUnits } from '@/lib/units';
import { useWeeklyGoal } from '@/lib/weekly-goal';

import { Chip } from './chip';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Stepper } from './ui';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const DAY_MINUTES = 24 * 60;

const toMinutes = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
};
const toTime = (minutes: number) => {
  const wrapped = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};

/** A setting turned on and off, with a line that explains it. */
function Toggle({
  title,
  hint,
  value,
  onChange,
}: {
  title: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.toggle}>
      <View style={styles.grow}>
        <ThemedText>{title}</ThemedText>
        {hint !== undefined && (
          <ThemedText type="small" themeColor="textSecondary">
            {hint}
          </ThemedText>
        )}
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.accent }}
      />
    </View>
  );
}

/** Settings the account keeps on the server too; a failure is not worth bothering the user. */
function saveOnServer(update: Parameters<typeof api.updateMe>[0]) {
  if (useAuthStore.getState().session) api.updateMe(update).catch(() => {});
}

/** Units of weight, the goal of a week for the series and the rest of new exercises. */
export function TrainingSettings() {
  const { t } = useTranslation();
  const goal = useWeeklyGoal();
  const units = useUnits();
  const own = usePreferences((state) => state.weeklyGoal);
  const rest = usePreferences((state) => state.defaultRestSec);
  const set = usePreferences((state) => state.set);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.toggle}>
        <ThemedText style={styles.grow}>{t('settings.units')}</ThemedText>
        <View style={styles.chips}>
          {(['kg', 'lb'] as const).map((value) => (
            <Chip
              key={value}
              label={t(`settings.${value}`)}
              selected={units === value}
              onCard
              onPress={() => {
                set({ units: value });
                saveOnServer({ units: value });
              }}
            />
          ))}
        </View>
      </View>

      <Stepper
        label={t('streak.goal')}
        value={goal ?? 3}
        min={1}
        max={7}
        onChange={(weeklyGoal) => set({ weeklyGoal })}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {t('streak.goalHint')}
      </ThemedText>
      {own !== null && (
        <View style={styles.chips}>
          <Chip
            label={t('streak.goalAuto')}
            selected={false}
            onCard
            onPress={() => set({ weeklyGoal: null })}
          />
        </View>
      )}

      <Stepper
        label={t('settings.defaultRest')}
        value={rest ?? 0}
        text={rest === null ? t('settings.restAuto') : formatDuration(t, rest)}
        min={0}
        max={600}
        step={15}
        onChange={(value) => {
          set({ defaultRestSec: value === 0 ? null : value });
          if (value > 0) saveOnServer({ default_rest_sec: value });
        }}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {t('settings.defaultRestHint')}
      </ThemedText>
    </ThemedView>
  );
}

/** The reminders of spec 6.13, each one turned off on its own. */
export function ReminderSettings() {
  const { t } = useTranslation();
  const reminders = usePreferences((state) => state.reminders);
  const set = usePreferences((state) => state.set);
  const [denied, setDenied] = useState(false);

  const change = async (patch: Partial<Preferences['reminders']>, turnedOn: boolean) => {
    // Permission is asked for when a reminder is turned on, never out of the blue. The web build
    // (for development only) has no notifications at all.
    const refused = turnedOn && Platform.OS !== 'web' && !(await allowReminders(t('reminders.channel')));
    if (refused) setDenied(true);
    set({ reminders: { ...usePreferences.getState().reminders, ...patch } });
  };

  const { workout, weight, inactive } = reminders;
  const time = (value: string, onChange: (time: string) => void) => (
    <Stepper
      label={t('reminders.time')}
      value={toMinutes(value)}
      text={value}
      min={-30}
      max={DAY_MINUTES}
      step={30}
      onChange={(minutes) => onChange(toTime(minutes))}
    />
  );

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Toggle
        title={t('reminders.workout')}
        value={workout.enabled}
        onChange={(enabled) => void change({ workout: { ...workout, enabled } }, enabled)}
      />
      {workout.enabled && (
        <>
          <View style={styles.chips} accessibilityLabel={t('reminders.days')}>
            {WEEKDAYS.map((day) => (
              <Chip
                key={day}
                label={t(`reminders.weekdays.${day}`)}
                selected={workout.days.includes(day)}
                onCard
                onPress={() => {
                  const days = workout.days.includes(day)
                    ? workout.days.filter((other) => other !== day)
                    : [...workout.days, day].sort();
                  void change({ workout: { ...workout, days } }, false);
                }}
              />
            ))}
          </View>
          {time(workout.time, (value) => void change({ workout: { ...workout, time: value } }, false))}
        </>
      )}

      <Toggle
        title={t('reminders.weight')}
        value={weight.enabled}
        onChange={(enabled) => void change({ weight: { ...weight, enabled } }, enabled)}
      />
      {weight.enabled &&
        time(weight.time, (value) => void change({ weight: { ...weight, time: value } }, false))}

      <Toggle
        title={t('reminders.inactive')}
        hint={t('reminders.inactiveHint')}
        value={inactive.enabled}
        onChange={(enabled) => void change({ inactive: { enabled } }, enabled)}
      />

      {denied && (
        <ThemedText type="small" themeColor="danger">
          {t('reminders.denied')}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
  },
  grow: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
