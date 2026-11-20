import { MUSCLE_CATEGORIES, MUSCLE_CATEGORY_KEYS } from '@mvp/domain';
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
  const { catalog, muscleByCode } = useCatalog();
  const filters = useLibraryFilters();

  const found = useFoundExercises().length;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title={t('filters.sort')}>
          <Chip
            label={t('filters.sortPopularity')}
            selected={filters.sort === 'popularity'}
            onPress={() => filters.setSort('popularity')}
          />
          <Chip
            label={t('filters.sortAlphabet')}
            selected={filters.sort === 'alphabet'}
            onPress={() => filters.setSort('alphabet')}
          />
        </Section>

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

        {MUSCLE_CATEGORY_KEYS.map((category) => (
          <Section key={category} title={t(`muscleCategories.${category}`)}>
            {MUSCLE_CATEGORIES[category].map((code) => (
              <Chip
                key={code}
                label={muscleByCode.get(code)?.name[locale] ?? code}
                selected={filters.muscles.includes(code)}
                onPress={() => filters.toggleMuscle(code)}
              />
            ))}
          </Section>
        ))}

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
