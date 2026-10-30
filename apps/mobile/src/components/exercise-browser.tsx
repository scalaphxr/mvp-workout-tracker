import Ionicons from '@expo/vector-icons/Ionicons';
import type { Exercise } from '@mvp/schemas';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingTabBarSpace, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { useCatalog } from '@/lib/catalog';
import { activeFilterCount, useFoundExercises, useLibraryFilters } from '@/lib/library-filters';

import { Button } from './button';
import { ThemedText } from './themed-text';

/**
 * The exercise library: search, filters and the list. `onSelect` decides what a tap does.
 * With a `title` it is a tab screen: a large title under the status bar, room for the tab bar.
 */
export function ExerciseBrowser({
  onSelect,
  title,
}: {
  onSelect: (exercise: Exercise) => void;
  title?: string;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const router = useRouter();
  const { muscleByCode } = useCatalog();
  const filters = useLibraryFilters();
  const found = useFoundExercises();
  const filterCount = activeFilterCount(filters);

  const renderExercise = ({ item }: { item: Exercise }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => onSelect(item)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.rowText}>
        <ThemedText>{item.translations[locale].name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {item.primary_muscles.map((code) => muscleByCode.get(code)?.name[locale]).join(', ')}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
    </Pressable>
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {title !== undefined && (
        <ThemedText
          type="largeTitle"
          accessibilityRole="header"
          style={[styles.title, { paddingTop: insets.top + Spacing.three }]}>
          {title}
        </ThemedText>
      )}
      <View style={styles.header}>
        <View style={[styles.search, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="search" size={20} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            value={filters.query}
            onChangeText={filters.setQuery}
            placeholder={t('exercises.searchPlaceholder')}
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel={t('exercises.searchPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/exercise-filters')}
          style={({ pressed }) => [
            styles.filterButton,
            { backgroundColor: filterCount > 0 ? theme.accent : theme.backgroundElement },
            pressed && styles.pressed,
          ]}>
          <Ionicons
            name="options-outline"
            size={20}
            color={filterCount > 0 ? theme.onAccent : theme.text}
          />
          <ThemedText type="small" style={{ color: filterCount > 0 ? theme.onAccent : theme.text }}>
            {filterCount > 0
              ? t('exercises.filtersActive', { count: filterCount })
              : t('exercises.filters')}
          </ThemedText>
        </Pressable>
      </View>

      <FlatList
        data={found}
        keyExtractor={(exercise) => exercise.id}
        renderItem={renderExercise}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.list,
          title !== undefined && { paddingBottom: insets.bottom + FloatingTabBarSpace },
        ]}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: theme.backgroundElement }]} />
        )}
        ListHeaderComponent={
          found.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.count}>
              {t('exercises.found', { count: found.length })}
            </ThemedText>
          ) : undefined
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText style={styles.emptyTitle}>{t('exercises.nothingTitle')}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              {t('exercises.nothingText')}
            </ThemedText>
            {filterCount > 0 && (
              <Button variant="secondary" title={t('exercises.resetFilters')} onPress={filters.reset} />
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  title: {
    paddingHorizontal: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    fontSize: 16,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  pressed: {
    opacity: 0.7,
  },
  list: {
    paddingBottom: Spacing.four,
  },
  count: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowText: {
    flex: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    paddingTop: Spacing.six,
  },
  emptyTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: 600,
  },
  emptyText: {
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
});
