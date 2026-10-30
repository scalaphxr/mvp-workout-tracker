import { hasFeature, shiftDate } from '@mvp/domain';
import { setStringAsync } from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { shareAsync } from 'expo-sharing';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Share, StyleSheet, View, type ViewInstance } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { activitiesSince } from '@/data/activities';
import { listWeights } from '@/data/body';
import { getWorkout, workoutsOfCycle, workoutsSince } from '@/data/history';
import { useLocale } from '@/hooks/use-locale';
import { useCatalog } from '@/lib/catalog';
import { toLocalDate } from '@/lib/format';
import { useLocal } from '@/lib/local';
import { useUnits } from '@/lib/units';
import { buildReport, type ReportKind } from '@/lib/report';

/**
 * A report in one tap: for a workout, a round of a program or a week. It is shown as the text
 * that goes to a messenger and as a card that goes out as a picture.
 */
export default function ReportScreen() {
  const params = useLocalSearchParams<{ kind: string; id?: string; program?: string; cycle?: string }>();
  const { t } = useTranslation();
  const locale = useLocale();
  const { exerciseById } = useCatalog();
  const card = useRef<ViewInstance>(null);
  const [copied, setCopied] = useState(false);

  const today = toLocalDate(new Date());
  const report = useLocal((ctx): ReportKind | null => {
    if (params.kind === 'session') {
      const workout = params.id ? getWorkout(ctx, params.id) : null;
      return workout && { kind: 'session', workout };
    }
    if (params.kind === 'cycle' && params.program) {
      const workouts = workoutsOfCycle(ctx, params.program, Number(params.cycle ?? 1));
      return {
        kind: 'cycle',
        workouts,
        cycle: Number(params.cycle ?? 1),
        program: workouts[0]?.programTitle ?? '',
      };
    }
    // A week is the last 7 calendar days, today included.
    const since = new Date(`${shiftDate(today, -6)}T00:00:00`).toISOString();
    return {
      kind: 'week',
      workouts: workoutsSince(ctx, since),
      activities: activitiesSince(ctx, since),
      today,
    };
  });
  const weights = useLocal(listWeights);
  const units = useUnits();

  if (!report) return <Screen>{<ThemedText>{t('report.empty')}</ThemedText>}</Screen>;
  const text = buildReport(
    {
      t,
      locale,
      weights,
      units,
      nameOf: (id) => exerciseById.get(id)?.translations[locale].name ?? t('program.unknownExercise'),
    },
    report,
  );
  const [title, ...lines] = text.split('\n');

  const shareImage = async () => {
    const uri = await captureRef(card, { format: 'png', quality: 1 });
    await shareAsync(uri, { mimeType: 'image/png' });
  };

  return (
    <Screen>
      {/* The card is always light: it is a picture for someone else's screen. */}
      <View
        ref={card}
        collapsable={false}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('report.cardLabel')}
        style={styles.card}>
        <ThemedText style={styles.cardTitle}>{title}</ThemedText>
        {lines.map((line, index) =>
          line === '' ? (
            <View key={index} style={styles.gap} />
          ) : (
            <ThemedText key={index} style={styles.cardLine} selectable>
              {line}
            </ThemedText>
          ),
        )}
        <ThemedText style={styles.brand}>MVP</ThemedText>
      </View>

      <View style={styles.actions}>
        <Button title={t('report.share')} onPress={() => Share.share({ message: text })} />
        <Button
          variant="secondary"
          title={copied ? t('report.copied') : t('report.copy')}
          onPress={async () => {
            await setStringAsync(text);
            setCopied(true);
          }}
        />
        {/* A browser cannot turn a view into a picture; the card is a Pro feature. */}
        {Platform.OS !== 'web' && hasFeature(null, 'report_card') && (
          <Button variant="secondary" title={t('report.shareImage')} onPress={shareImage} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    borderRadius: Radius.card,
    backgroundColor: Colors.light.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.backgroundSelected,
    gap: Spacing.one,
  },
  cardTitle: {
    color: Colors.light.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 700,
    marginBottom: Spacing.one,
  },
  cardLine: {
    color: Colors.light.text,
  },
  gap: {
    height: Spacing.two,
  },
  brand: {
    color: Colors.light.textSecondary,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 2,
    marginTop: Spacing.three,
  },
  actions: {
    gap: Spacing.two,
  },
});
