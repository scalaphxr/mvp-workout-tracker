import { Image, type ImageSourcePropType, StyleSheet } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/** A screen that has nothing to show yet, with an optional illustration. */
export function EmptyState({
  title,
  text,
  picture,
}: {
  title: string;
  text: string;
  picture?: ImageSourcePropType;
}) {
  return (
    <ThemedView style={styles.container}>
      {picture && <Image source={picture} style={styles.picture} accessibilityIgnoresInvertColors />}
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
  picture: {
    width: 128,
    height: 128,
    marginBottom: Spacing.two,
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
