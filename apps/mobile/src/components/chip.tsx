import { Pressable, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

/** A filter option that is either on or off. */
export function Chip({
  label,
  selected,
  onPress,
  onCard,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** On a card of the element colour: an unselected chip takes a darker one to stay visible. */
  onCard?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      aria-checked={selected}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected
            ? theme.accent
            : onCard
              ? theme.backgroundSelected
              : theme.backgroundElement,
        },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="small" style={{ color: selected ? theme.onAccent : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: 22,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
