import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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
  const foreground = variant === 'primary' ? theme.onAccent : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      aria-disabled={!!inactive}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: variant === 'primary' ? theme.accent : theme.backgroundSelected },
        pressed && styles.pressed,
        inactive && styles.inactive,
      ]}
      {...rest}>
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
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: 600,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  inactive: {
    opacity: 0.5,
  },
});
