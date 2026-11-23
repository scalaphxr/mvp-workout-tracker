import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ScreenGlow } from '@/components/gradients';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { recordedWorkoutDays } from '@/data/history';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { useAppleHealthMonth } from '@/lib/apple-health';
import { toLocalDate } from '@/lib/format';
import { useLocal } from '@/lib/local';
import { monthWeeks } from '@/lib/week';

export default function CalendarScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const locale = useLocale();
  const theme = useTheme();
  const today = toLocalDate(new Date());
  const recorded = useLocal(recordedWorkoutDays);
  const [month, setMonth] = useState(() => new Date());
  const health = useAppleHealthMonth(month);
  const weeks = monthWeeks(month);
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const full = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const shiftMonth = (step: number) => setMonth(
    (current) => new Date(current.getFullYear(), current.getMonth() + step, 1),
  );

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]}>
      <ScreenGlow />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <ThemedText type="section" accessibilityRole="header" style={styles.fill}>
            {t('week.calendarTitle')}
          </ThemedText>
          <CalendarButton icon="close" label={t('summary.close')} onPress={() => router.dismissTo('/')} />
        </View>
        <View style={[styles.grid, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.row}>
            <CalendarButton icon="chevron-back" label={t('week.previousMonth')} onPress={() => shiftMonth(-1)} />
            <ThemedText type="smallBold" accessibilityLiveRegion="polite" style={styles.month}>
              {monthLabel}
            </ThemedText>
            <CalendarButton icon="chevron-forward" label={t('week.nextMonth')} onPress={() => shiftMonth(1)} />
          </View>
          <View style={styles.row}>
            {weeks[0]!.map((date) => (
              <ThemedText key={date.getDay()} type="small" themeColor="textSecondary" style={styles.weekday}>
                {weekday.format(date)}
              </ThemedText>
            ))}
          </View>
          {weeks.map((week) => (
            <View key={toLocalDate(week[0]!)} style={styles.row}>
              {week.map((date) => {
                const key = toLocalDate(date);
                if (date.getMonth() !== month.getMonth()) return <View key={key} style={styles.day} />;
                const isToday = key === today;
                const hasRecord = recorded.has(key) || health.data?.has(key);
                const color = isToday ? theme.accent : theme.text;

                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isToday }}
                    accessibilityLabel={[
                      full.format(date), isToday && t('tabs.today'), hasRecord && t('week.trained'),
                    ].filter(Boolean).join(', ')}
                    onPress={() => router.dismissTo({ pathname: '/', params: { calendarDate: key } })}
                    style={({ pressed }) => [
                      styles.day,
                      isToday && { backgroundColor: theme.accentSoft },
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText type="smallBold" style={{ color }}>{date.getDate()}</ThemedText>
                    {hasRecord && (
                      <View style={[styles.dot, styles.marker, {
                        backgroundColor: theme.accent,
                      }]} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        <View style={[styles.row, styles.legend]}>
          <View style={[styles.dot, { backgroundColor: theme.accent }]} />
          <ThemedText type="small" themeColor="textSecondary">{t('week.recordedDays')}</ThemedText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CalendarButton({
  icon, label, onPress,
}: {
  icon: 'close' | 'chevron-back' | 'chevron-forward';
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Ionicons name={icon} size={21} color={theme.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  grid: { borderRadius: 16, padding: Spacing.two, gap: Spacing.half },
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  month: { flex: 1, textAlign: 'center' },
  weekday: { flex: 1, textAlign: 'center', paddingVertical: Spacing.two },
  day: { flex: 1, minHeight: 44, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },
  marker: { position: 'absolute', bottom: 4 },
  legend: { gap: Spacing.two, paddingHorizontal: Spacing.two },
  pressed: { opacity: 0.68 },
});
