import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenGlow } from '@/components/gradients';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';
import { TextField } from './ui';

export function ProgressExercisePicker({
  options,
  selected,
  onSelect,
  onClose,
}: {
  options: readonly { id: string; name: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase(locale);
  const matches = options.filter(({ name }) => name.toLocaleLowerCase(locale).includes(needle));

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onClose}>
      <SafeAreaView style={[styles.fill, { backgroundColor: theme.background }]}>
        <ScreenGlow />
        <View style={styles.content}>
          <View style={styles.header}>
            <ThemedText type="section" style={styles.fill} accessibilityRole="header">
              {t('progress.chooseExercise')}
            </ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel={t('summary.close')} onPress={onClose}
              style={styles.close}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>
          <TextField label={t('progress.searchExercise')} placeholder={t('progress.searchExercise')} value={query}
            onChangeText={setQuery} autoCorrect={false} returnKeyType="search" />
          <FlatList
            data={matches}
            keyExtractor={({ id }) => id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<ThemedText themeColor="textSecondary">{t('progress.noExerciseMatches')}</ThemedText>}
            renderItem={({ item }) => (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: item.id === selected }}
                onPress={() => onSelect(item.id)}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: theme.separator },
                  pressed && { opacity: 0.65 },
                ]}>
                <ThemedText style={styles.fill}>{item.name}</ThemedText>
                {item.id === selected && <Ionicons name="checkmark" size={20} color={theme.accent} />}
              </Pressable>
            )}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.three,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
