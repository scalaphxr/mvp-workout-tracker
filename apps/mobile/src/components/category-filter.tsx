import { categoryOfMuscles, MUSCLE_CATEGORIES, MUSCLE_CATEGORY_KEYS } from '@mvp/domain';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useCatalog } from '@/lib/catalog';
import { useLibraryFilters } from '@/lib/library-filters';

import { Chip } from './chip';

/**
 * Categories above the exercise list: a tap shows all the muscles of a group, a second row
 * narrows it down to one. It only sets the muscle filter, so it follows the filter screen too.
 */
export function CategoryFilter() {
  const { t } = useTranslation();
  const locale = useLocale();
  const { muscleByCode } = useCatalog();
  const muscles = useLibraryFilters((state) => state.muscles);
  const setMuscles = useLibraryFilters((state) => state.setMuscles);

  const active = categoryOfMuscles(muscles);
  const members: readonly string[] = active ? MUSCLE_CATEGORIES[active] : [];
  const narrowed = muscles.length < members.length;

  return (
    <View style={styles.rows}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.row}
        contentContainerStyle={styles.chips}>
        {MUSCLE_CATEGORY_KEYS.map((category) => (
          <Chip
            key={category}
            label={t(`muscleCategories.${category}`)}
            selected={active === category}
            onPress={() =>
              setMuscles(active === category ? [] : [...MUSCLE_CATEGORIES[category]])
            }
          />
        ))}
      </ScrollView>

      {members.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.row}
          contentContainerStyle={styles.chips}>
          {members.map((code) => {
            const selected = narrowed && muscles.includes(code);
            return (
              <Chip
                key={code}
                label={muscleByCode.get(code)?.name[locale] ?? code}
                selected={selected}
                onPress={() => setMuscles(selected ? [...members] : [code])}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  row: {
    flexGrow: 0,
  },
  chips: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
