import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { Radius, Spacing, Typeface } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { AccentGradient } from './gradients';
import { ThemedText } from './themed-text';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  /** `primary` – the main action of the screen, `secondary` – everything else. */
  variant?: 'primary' | 'secondary';
  loading?: boolean;
};

export function Button({ title, variant = 'primary', loading, disabled, ...rest }: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;
  const foreground = variant === 'primary' ? theme.onAction : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      // The title is the name; a screen may still give a longer one through `rest`.
      accessibilityLabel={title}
      aria-disabled={!!inactive}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: variant === 'primary' ? theme.action : theme.backgroundSelected },
        pressed && styles.pressed,
        inactive && styles.inactive,
      ]}
      {...rest}>
      {variant === 'primary' && <AccentGradient />}
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <ThemedText style={[styles.title, { color: foreground }]}>{title}</ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    lineHeight: 24,
    fontFamily: Typeface.displayMedium,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  inactive: {
    opacity: 0.5,
  },
});
