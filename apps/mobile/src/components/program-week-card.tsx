import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { formatNumber, toLocalDate } from '@/lib/format';
import { weekOf } from '@/lib/week';

import { GraffitiIcon } from './graffiti-icon';
import { ThemedText } from './themed-text';

export function ProgramWeekCard({ program, selectedDate, todayDate, workouts, streak, interactive }: {
  program: { id: string; title: string } | null;
  selectedDate: Date;
  todayDate: string;
  workouts: ReadonlySet<string>;
  streak: number;
  interactive: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const selected = toLocalDate(selectedDate);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const fullDate = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const label = t('today.mainProgram');
  const title = program?.title ?? t('today.chooseProgram');
  const streakColor = streak > 0 ? 'highlight' : 'textSecondary';
  const streakLabel = t('today.workoutWeekStreak', { count: streak });

  return (
    <View style={[styles.wrapper, {
      paddingLeft: insets.left + Spacing.three,
      paddingRight: insets.right + Spacing.three,
    }]}>
      <View
        testID={interactive ? 'home-program-week' : undefined}
        style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${title}, ${streakLabel}`}
          focusable={interactive}
          onPress={() => {
            if (program) router.push({ pathname: '/program/[id]', params: { id: program.id } });
            else router.navigate('/(tabs)/programs');
          }}
          style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
          <View style={[styles.icon, { backgroundColor: theme.accentSoft }]}>
            <GraffitiIcon name="programs" color={theme.accent} size={22} />
          </View>
          <View style={styles.heading}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>{label}</ThemedText>
            <ThemedText type="section" numberOfLines={2} style={styles.title}>{title}</ThemedText>
          </View>
          <View aria-hidden style={styles.streak}>
            <GraffitiIcon name="calories" color={theme[streakColor]} size={17} />
            <ThemedText type="smallBold" themeColor={streakColor}>
              {formatNumber(streak, locale)}
            </ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.accent} aria-hidden />
        </Pressable>

        <View style={styles.week}>
          {weekOf(selectedDate).map((day) => {
            const date = toLocalDate(day);
            const done = date <= todayDate && workouts.has(date);
            const past = date < todayDate;
            const focused = date === selected;
            return (
              <View
                key={date}
                accessible
                accessibilityLabel={`${fullDate.format(day)}, ${t(done ? 'today.workoutDayDone' : 'today.workoutDayEmpty')}`}
                accessibilityState={{ selected: focused }}
                style={[
                  styles.day,
                  {
                    backgroundColor: done ? theme.accentSoft : theme.background,
                    borderColor: focused ? theme.accent : 'transparent',
                  },
                ]}>
                <ThemedText type="smallBold" themeColor={done ? 'accent' : 'textSecondary'} style={styles.weekday}>
                  {weekday.format(day)}
                </ThemedText>
                {done || past ? (
                  <GraffitiIcon
                    name={done ? 'workout' : 'sleep'}
                    size={16}
                    color={done ? theme.accent : theme.textSecondary}
                  />
                ) : (
                  <Ionicons name="remove" size={16} color={theme.textSecondary} aria-hidden />
                )}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', marginTop: Spacing.two },
  card: { borderWidth: 1, borderRadius: Radius.field, padding: Spacing.two, gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: Spacing.two, borderRadius: Radius.field },
  pressed: { opacity: 0.68 },
  icon: { width: 40, height: 40, borderRadius: Radius.field, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, minWidth: 0 },
  label: { fontSize: 12, lineHeight: 16 },
  title: { fontSize: 20, lineHeight: 24 },
  week: { flexDirection: 'row', gap: Spacing.one },
  day: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: Spacing.one, borderWidth: 1, borderRadius: 10 },
  weekday: { fontSize: 11, lineHeight: 14 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half },
});
