import Ionicons from '@expo/vector-icons/Ionicons';
import { parseNumber } from '@mvp/domain';
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
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { formatNumber } from '@/lib/format';

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

/** The round − or + button of a number. */
export function StepButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: 'remove' | 'add';
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepButton,
        { backgroundColor: theme.backgroundSelected },
        (pressed || disabled) && styles.pressed,
      ]}>
      <Ionicons name={icon} size={24} color={theme.text} />
    </Pressable>
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
  typed,
}: {
  label: string;
  value: number;
  /** How the value is shown, when not as the bare number. */
  text?: string;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /**
   * The value can also be typed in: a tap on it opens a field. `value` is the number as the
   * user types it (in their units), `apply` takes a typed number back.
   */
  typed?: { value: number; apply: (typed: number) => void };
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const theme = useTheme();
  const [draft, setDraft] = useState<string | null>(null);

  const button = (delta: number, icon: 'remove' | 'add', hint: string) => {
    const next = value + delta;
    return (
      <StepButton
        label={`${label}: ${hint}`}
        icon={icon}
        disabled={next < min || next > max}
        onPress={() => onChange(next)}
      />
    );
  };

  return (
    <View style={styles.stepper}>
      <ThemedText style={styles.shrink}>{label}</ThemedText>
      <View style={styles.stepControls}>
        {button(-step, 'remove', t('item.decrease'))}
        {typed && draft !== null ? (
          <TextInput
            accessibilityLabel={label}
            value={draft}
            autoFocus
            selectTextOnFocus
            keyboardType="decimal-pad"
            returnKeyType="done"
            style={[styles.stepValue, styles.stepInput, { color: theme.text, borderColor: theme.accent }]}
            onChangeText={(next) => {
              setDraft(next);
              // Applied as it is typed: "done" pressed right after the typing gets the new value.
              const number = parseNumber(next);
              if (number !== null) typed.apply(number);
            }}
            onBlur={() => setDraft(null)}
            onSubmitEditing={() => setDraft(null)}
          />
        ) : typed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${text ?? value}`}
            accessibilityHint={t('item.typeHint')}
            onPress={() => setDraft(formatNumber(typed.value, locale))}>
            <ThemedText style={[styles.stepValue, styles.stepTappable, { borderColor: theme.backgroundSelected }]}>
              {text ?? value}
            </ThemedText>
          </Pressable>
        ) : (
          <ThemedText style={styles.stepValue} accessibilityLabel={`${label}: ${text ?? value}`}>
            {text ?? value}
          </ThemedText>
        )}
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
  /** A value that can be typed in looks like a field: underlined. */
  stepTappable: {
    paddingVertical: Spacing.one,
    borderBottomWidth: 2,
  },
  stepInput: {
    minWidth: 96,
    minHeight: 48,
    paddingHorizontal: Spacing.two,
    borderWidth: 2,
    borderRadius: Spacing.two,
  },
  confirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
