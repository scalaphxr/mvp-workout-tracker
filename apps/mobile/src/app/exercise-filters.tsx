import { LEVELS } from '@mvp/schemas';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { useCatalog } from '@/lib/catalog';
import { activeFilterCount, useFoundExercises, useLibraryFilters } from '@/lib/library-filters';

export default function ExerciseFiltersScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { catalog } = useCatalog();
  const filters = useLibraryFilters();

  const found = useFoundExercises().length;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title={t('filters.availability')}>
          <Chip
            label={t('filters.onlyMyGym')}
            selected={filters.onlyMyGym}
            onPress={filters.toggleOnlyMyGym}
          />
        </Section>

        <Section title={t('filters.level')}>
          {LEVELS.map((level) => (
            <Chip
              key={level}
              label={t(`level.${level}`)}
              selected={filters.level === level}
              onPress={() => filters.setLevel(filters.level === level ? null : level)}
            />
          ))}
        </Section>

        <Section title={t('filters.muscles')}>
          {catalog.muscles.map((muscle) => (
            <Chip
              key={muscle.code}
              label={muscle.name[locale]}
              selected={filters.muscles.includes(muscle.code)}
              onPress={() => filters.toggleMuscle(muscle.code)}
            />
          ))}
        </Section>

        <Section title={t('filters.equipment')}>
          {catalog.equipment.map((item) => (
            <Chip
              key={item.code}
              label={item.name[locale]}
              selected={filters.equipment.includes(item.code)}
              onPress={() => filters.toggleEquipment(item.code)}
            />
          ))}
        </Section>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { borderTopColor: theme.backgroundElement, paddingBottom: insets.bottom + Spacing.three },
        ]}>
        <Button
          variant="secondary"
          title={t('filters.reset')}
          disabled={activeFilterCount(filters) === 0}
          onPress={filters.reset}
        />
        <View style={styles.footerMain}>
          <Button title={t('filters.show', { count: found })} onPress={() => router.back()} />
        </View>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title}
      </ThemedText>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  section: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  footerMain: {
    flex: 1,
  },
});
