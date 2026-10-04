import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Button } from './button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/** A scrolling screen with the usual padding, centred on wide windows. */
export function Screen({ children, ...rest }: ScrollViewProps) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      {...rest}>
      {children}
    </ScrollView>
  );
}

/** A quiet title above a group of controls. */
export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      {title !== undefined && (
        <ThemedText type="smallBold" themeColor="textSecondary">
          {title}
        </ThemedText>
      )}
      {children}
    </View>
  );
}

/** A rounded block that holds rows. */
export function Card({ children }: { children: ReactNode }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {children}
    </ThemedView>
  );
}

/** A row that leads somewhere. */
export function LinkRow({
  title,
  subtitle,
  badge,
  onPress,
}: {
  title: string;
  subtitle?: string;
  /** A short mark next to the title, e.g. "Main". */
  badge?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowText}>
        <View style={styles.rowTitle}>
          <ThemedText style={styles.shrink}>{title}</ThemedText>
          {badge !== undefined && (
            <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small">{badge}</ThemedText>
            </View>
          )}
        </View>
        {subtitle !== undefined && (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

/** A text field with a label a screen reader announces. */
export function TextField({ label, style, ...rest }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={theme.textSecondary}
      style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }, style]}
      {...rest}
    />
  );
}

/** A number changed with − and + buttons: reps, sets, rest. */
export function Stepper({
  label,
  value,
  text,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  /** How the value is shown, when not as the bare number. */
  text?: string;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  const button = (delta: number, icon: 'remove' | 'add', hint: string) => {
    const next = value + delta;
    const disabled = next < min || next > max;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${hint}`}
        disabled={disabled}
        onPress={() => onChange(next)}
        style={({ pressed }) => [
          styles.stepButton,
          { backgroundColor: theme.backgroundSelected },
          (pressed || disabled) && styles.pressed,
        ]}>
        <Ionicons name={icon} size={24} color={theme.text} />
      </Pressable>
    );
  };

  return (
    <View style={styles.stepper}>
      <ThemedText style={styles.shrink}>{label}</ThemedText>
      <View style={styles.stepControls}>
        {button(-step, 'remove', t('item.decrease'))}
        <ThemedText style={styles.stepValue} accessibilityLabel={`${label}: ${text ?? value}`}>
          {text ?? value}
        </ThemedText>
        {button(step, 'add', t('item.increase'))}
      </View>
    </View>
  );
}

/** A destructive action that asks once more before it happens. */
export function ConfirmButton({ title, onConfirm }: { title: string; onConfirm: () => void }) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);

  if (!asking) return <Button variant="secondary" title={title} onPress={() => setAsking(true)} />;
  return (
    <View style={styles.confirm}>
      <ThemedText themeColor="danger" style={styles.shrink}>
        {t('common.confirm')}
      </ThemedText>
      <Button variant="secondary" title={t('common.cancel')} onPress={() => setAsking(false)} />
      <Button title={t('common.yes')} onPress={onConfirm} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  group: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 56,
    paddingVertical: Spacing.two,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  shrink: {
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
  },
  pressed: {
    opacity: 0.5,
  },
  input: {
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    fontSize: 18,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    minHeight: 64,
  },
  stepControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    minWidth: 72,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 600,
  },
  confirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
