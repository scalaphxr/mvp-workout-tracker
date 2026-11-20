import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { workoutTotalsSince } from '@/data/history';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { formatNumber, formatTotalTime } from '@/lib/format';
import { useLocal } from '@/lib/local';
import { toUnits, useUnits } from '@/lib/units';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { CardLabel, Metric, Section } from './ui';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The weight lifted over the last 7 days next to the 7 days before, in a sentence and two bars.
 * Nothing to compare – nothing shown, the heading included.
 */
export function VolumeHighlight({ onShowAll }: { onShowAll: () => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const theme = useTheme();
  const units = useUnits();
  const [recentWeek, beforeWeek] = useLocal((ctx) => {
    const now = new Date().getTime();
    const weekAgo = new Date(now - 7 * DAY_MS).toISOString();
    const twoWeeksAgo = new Date(now - 14 * DAY_MS).toISOString();
    const workouts = workoutTotalsSince(ctx, twoWeeksAgo);
    const week = (list: typeof workouts) => ({
      kg: list.reduce((total, workout) => total + workout.volumeKg, 0),
      count: list.length,
      durationSec: list.reduce((total, workout) => total + workout.durationSec, 0),
      // Calories only of the workouts they could be counted for.
      kcal: list.some((workout) => workout.kcal !== null)
        ? list.reduce((total, workout) => total + (workout.kcal ?? 0), 0)
        : null,
    });
    return [
      week(workouts.filter((workout) => workout.session.started_at > weekAgo)),
      week(workouts.filter((workout) => workout.session.started_at <= weekAgo)),
    ];
  });
  const recent = recentWeek.kg;
  const before = beforeWeek.kg;

  if (recent === 0 && before === 0) return null;

  /** "2 workouts · 2 h 4 min · ≈ 640 kcal" – what a week took and burned. */
  const spent = (week: typeof recentWeek) =>
    [
      t('highlights.workouts', { count: week.count }),
      week.durationSec > 0 ? formatTotalTime(t, week.durationSec) : null,
      week.kcal !== null ? t('summary.kcalValue', { kcal: formatNumber(week.kcal, locale) }) : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const high = Math.max(recent, before);
  const unit = t(units === 'lb' ? 'units.lb' : 'units.kg', {
    value: '',
  }).trim();
  const text =
    recent > before
      ? t('highlights.volumeMore')
      : recent < before
        ? t('highlights.volumeLess')
        : t('highlights.volumeSame');
  const rows = [
    { key: 'recent', kg: recent, label: t('highlights.last7'), current: true, spent: spent(recentWeek) },
    {
      key: 'before',
      kg: before,
      label: t('highlights.previous7'),
      current: false,
      spent: spent(beforeWeek),
    },
  ];

  return (
    <Section title={t('highlights.title')} action={{ title: t('highlights.all'), onPress: onShowAll }}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <CardLabel icon="barbell" title={t('highlights.volumeTitle')} />
        <ThemedText style={styles.text}>{text}</ThemedText>
        <View style={[styles.separator, { backgroundColor: theme.separator }]} />
        {rows.map((row) => (
          <View key={row.key} style={styles.row}>
            <Metric value={formatNumber(Math.round(toUnits(row.kg, units)), locale)} unit={unit} />
            <View
              style={[
                styles.bar,
                {
                  // A week with nothing lifted still gets a bar wide enough for its label.
                  width: `${Math.max(55, (row.kg / high) * 100)}%`,
                  backgroundColor: row.current ? theme.highlight : theme.backgroundSelected,
                },
              ]}>
              <ThemedText
                type="smallBold"
                numberOfLines={1}
                style={{ color: row.current ? theme.onHighlight : theme.text }}>
                {row.label}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {row.spent}
            </ThemedText>
          </View>
        ))}
      </ThemedView>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    gap: Spacing.three,
  },
  text: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: 600,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  row: {
    gap: Spacing.one,
  },
  bar: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two + Spacing.one,
    borderRadius: Spacing.two,
  },
});
