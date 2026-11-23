import { Pressable, StyleSheet } from 'react-native';

import { Spacing, Typeface } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

/** A filter option that is either on or off. */
export function Chip({
  label,
  selected,
  onPress,
  onCard,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** On a card of the element colour: an unselected chip takes a darker one to stay visible. */
  onCard?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      aria-checked={selected}
      aria-disabled={!!disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: theme.accentSoft, borderColor: theme.accent }
          : {
              backgroundColor: onCard ? theme.backgroundSelected : theme.backgroundElement,
              borderColor: onCard ? theme.backgroundSelected : theme.separator,
            },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <ThemedText
        type={selected ? 'smallBold' : 'small'}
        style={!selected && styles.label}
        themeColor={selected ? 'accent' : 'text'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: Typeface.displayMedium },
  chip: {
    minHeight: 44,
    paddingHorizontal: Spacing.three + Spacing.one,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});
