import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

/** "Record!" right on the set: it springs in, so it is seen at a glance between sets. */
export function RecordBanner({ text }: { text: string }) {
  const theme = useTheme();
  const [scale] = useState(() => new Animated.Value(0.6));

  useEffect(() => {
    scale.setValue(0.6);
    Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [scale, text]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: theme.accent, transform: [{ scale }] }]}>
      <Ionicons name="trophy" size={24} color={theme.onAccent} />
      <ThemedText style={[styles.text, { color: theme.onAccent }]}>{text}</ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  text: {
    flex: 1,
    fontWeight: 700,
  },
});
