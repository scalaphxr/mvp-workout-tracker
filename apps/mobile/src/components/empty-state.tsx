import { StyleSheet } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/** A screen that has nothing to show yet. */
export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>{title}</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.text}>
        {text}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: 600,
    textAlign: 'center',
  },
  text: {
    textAlign: 'center',
    maxWidth: MaxContentWidth / 2,
  },
});
