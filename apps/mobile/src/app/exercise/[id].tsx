import Ionicons from '@expo/vector-icons/Ionicons';
import { pickMedia } from '@mvp/domain';
import type { Muscle } from '@mvp/schemas';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ExerciseVideo } from '@/components/exercise-video';
import { MuscleMap } from '@/components/muscle-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { useCatalog } from '@/lib/catalog';

export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const { exerciseById, exerciseBySlug, muscleByCode, equipmentByCode } = useCatalog();

  const exercise = exerciseById.get(id);
  if (!exercise) {
    return <EmptyState title={t('exercise.notFoundTitle')} text={t('exercise.notFoundText')} />;
  }

  const text = exercise.translations[locale];
  const muscles = (codes: readonly string[]) =>
    codes.flatMap((code) => muscleByCode.get(code) ?? []);
  const primary = muscles(exercise.primary_muscles);
  const secondary = muscles(exercise.secondary_muscles);
  const names = (list: readonly Muscle[]) => list.map((muscle) => muscle.name[locale]).join(', ');

  const media = pickMedia(exercise, locale);
  const equipment = exercise.equipment.flatMap((code) => equipmentByCode.get(code) ?? []);
  const alternatives = [...exercise.alternatives]
    .sort((a, b) => b.priority - a.priority)
    .flatMap((alternative) => exerciseBySlug.get(alternative.slug) ?? []);
  const tags = [
    t(`level.${exercise.level}`),
    exercise.kind === 'strength' ? t(`mechanics.${exercise.mechanics}`) : t(`kind.${exercise.kind}`),
  ];

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}>
      <View style={styles.titleBlock}>
        <ThemedText style={styles.title}>{text.name}</ThemedText>
        <View style={styles.tags}>
          {tags.map((tag) => (
            <ThemedView key={tag} type="backgroundElement" style={styles.tag}>
              <ThemedText type="small">{tag}</ThemedText>
            </ThemedView>
          ))}
        </View>
      </View>

      <MuscleMap
        primary={primary}
        secondary={secondary}
        label={
          secondary.length > 0
            ? t('exercise.mapLabel', { primary: names(primary), secondary: names(secondary) })
            : t('exercise.mapLabelPrimaryOnly', { primary: names(primary) })
        }
      />
      <View style={styles.legend}>
        <LegendRow color={theme.musclePrimary} title={t('exercise.primaryMuscles')}>
          {names(primary)}
        </LegendRow>
        {secondary.length > 0 && (
          <LegendRow color={theme.muscleSecondary} title={t('exercise.secondaryMuscles')}>
            {names(secondary)}
          </LegendRow>
        )}
      </View>

      <ThemedText>{text.description}</ThemedText>

      {media && (
        <View style={styles.block}>
          <ExerciseVideo media={media} />
          {media.lang !== locale && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('exercise.videoInOtherLanguage')}
            </ThemedText>
          )}
        </View>
      )}

      <Section title={t('exercise.equipment')}>
        <ThemedText>
          {equipment.length > 0
            ? equipment.map((item) => item.name[locale]).join(', ')
            : t('exercise.noEquipment')}
        </ThemedText>
      </Section>

      <Section title={t('exercise.technique')}>
        {text.technique_steps.map((step, index) => (
          <View key={step} style={styles.listItem}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.marker}>
              {index + 1}
            </ThemedText>
            <ThemedText style={styles.listText}>{step}</ThemedText>
          </View>
        ))}
      </Section>

      {text.common_mistakes.length > 0 && (
        <Section title={t('exercise.mistakes')}>
          {text.common_mistakes.map((mistake) => (
            <View key={mistake} style={styles.listItem}>
              <ThemedText themeColor="textSecondary" style={styles.marker}>
                •
              </ThemedText>
              <ThemedText style={styles.listText}>{mistake}</ThemedText>
            </View>
          ))}
        </Section>
      )}

      {text.warnings.length > 0 && (
        <Section title={t('exercise.warnings')}>
          {text.warnings.map((warning) => (
            <ThemedText key={warning} themeColor="danger">
              {warning}
            </ThemedText>
          ))}
        </Section>
      )}

      {alternatives.length > 0 && (
        <Section title={t('exercise.alternatives')}>
          <ThemedView type="backgroundElement" style={styles.alternatives}>
            {alternatives.map((alternative) => (
              <Pressable
                key={alternative.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/exercise/[id]', params: { id: alternative.id } })
                }
                style={({ pressed }) => [styles.alternative, pressed && styles.pressed]}>
                <ThemedText style={styles.listText}>{alternative.translations[locale].name}</ThemedText>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </Pressable>
            ))}
          </ThemedView>
        </Section>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.block}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {children}
    </View>
  );
}

function LegendRow({ color, title, children }: { color: string; title: string; children: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <ThemedText type="small" style={styles.listText}>
        <ThemedText type="smallBold">{title}: </ThemedText>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  titleBlock: {
    gap: Spacing.two,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tag: {
    paddingHorizontal: Spacing.two + Spacing.one,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  legend: {
    gap: Spacing.two,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  block: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: 600,
  },
  listItem: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  marker: {
    width: 20,
    lineHeight: 24,
    textAlign: 'center',
  },
  listText: {
    flex: 1,
  },
  alternatives: {
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.three,
  },
  alternative: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 56,
  },
  pressed: {
    opacity: 0.6,
  },
});
