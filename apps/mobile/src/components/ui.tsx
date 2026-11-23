import Ionicons from '@expo/vector-icons/Ionicons';
import { parseNumber } from '@mvp/domain';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Image,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingTabBarSpace, MaxContentWidth, Radius, Spacing, Typeface } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { formatNumber } from '@/lib/format';

import { Button } from './button';
import { ScreenGlow } from './gradients';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** How far a large title scrolls before the compact one takes its place. */
const TITLE_SCROLL = 48;

/**
 * A scrolling screen with the usual padding, centred on wide windows.
 *
 * With a `title` it is a tab screen: it draws its own large title under the status bar, which
 * gives way to a compact one as the content scrolls, and leaves room for the floating tab bar.
 */
export function Screen({
  children,
  title,
  headerRight,
  ...rest
}: ScrollViewProps & { title?: string; headerRight?: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [scrollY] = useState(() => new Animated.Value(0));

  if (title === undefined) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.background }]}>
        <ScreenGlow />
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.screen}
          keyboardShouldPersistTaps="handled"
          {...rest}>
          {children}
        </ScrollView>
      </View>
    );
  }

  const compact = scrollY.interpolate({
    inputRange: [TITLE_SCROLL - 8, TITLE_SCROLL + 8],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <ScreenGlow />
      <Animated.ScrollView
        style={styles.fill}
        contentContainerStyle={[
          styles.screen,
          { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + FloatingTabBarSpace },
        ]}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        {...rest}>
        <View style={styles.largeTitle}>
          <ThemedText type="largeTitle" accessibilityRole="header" style={styles.shrink}>
            {title}
          </ThemedText>
          {headerRight}
        </View>
        {children}
      </Animated.ScrollView>
      <Animated.View
        style={[
          styles.compactTitle,
          {
            paddingTop: insets.top,
            height: insets.top + 48,
            backgroundColor: theme.background,
            borderBottomColor: theme.separator,
            opacity: compact,
          },
        ]}>
        <ThemedText type="smallBold" style={styles.compactText} numberOfLines={1}>
          {title}
        </ThemedText>
      </Animated.View>
    </View>
  );
}

/** A round button with a person in it, the way to the profile. */
export function Avatar({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.avatar,
        { backgroundColor: theme.accentSoft, borderColor: theme.backgroundSelected },
        pressed && styles.pressed,
      ]}>
      <Ionicons name="person" size={22} color={theme.accent} />
    </Pressable>
  );
}

/** A bold heading over a group of cards, with an optional action on the right. */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { title: string; onPress: () => void };
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText type="section" accessibilityRole="header" style={styles.shrink}>
          {title}
        </ThemedText>
        {action && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.title}
            onPress={action.onPress}
            hitSlop={8}
            style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              {action.title}
            </ThemedText>
            <Ionicons name="chevron-forward" size={18} color={theme.accent} />
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

/** A small coloured icon with a label: what a card is about. */
export function CardLabel({ icon, title, color }: { icon: IconName; title: string; color?: string }) {
  const theme = useTheme();
  const tint = color ?? theme.highlight;
  return (
    <View style={styles.cardLabel}>
      <Ionicons name={icon} size={18} color={tint} />
      <ThemedText type="smallBold" style={[styles.shrink, { color: tint }]} numberOfLines={1}>
        {title}
      </ThemedText>
    </View>
  );
}

/** A big number with its unit in small grey type after it. */
export function Metric({ value, unit }: { value: string; unit?: string }) {
  return (
    <ThemedText type="metric">
      {value}
      {unit !== undefined && (
        <ThemedText type="default" themeColor="textSecondary" style={styles.unit}>
          {` ${unit}`}
        </ThemedText>
      )}
    </ThemedText>
  );
}

/** A few bars, the last one lit: how the latest value compares with the ones before. */
export function MiniBars({ values, label }: { values: readonly number[]; label?: string }) {
  const theme = useTheme();
  const high = Math.max(...values, 0);
  return (
    <View
      style={styles.bars}
      accessible={label !== undefined}
      accessibilityRole={label !== undefined ? 'image' : undefined}
      accessibilityLabel={label}>
      {values.map((value, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            {
              // An empty bar keeps a stub, so the row of bars reads as a row.
              height: Math.max(8, high > 0 ? (value / high) * BARS_HEIGHT : 8),
              // The latest bar in the accent, the ones before it in a soft emerald.
              backgroundColor: index === values.length - 1 ? theme.accent : theme.chart,
            },
          ]}
        />
      ))}
    </View>
  );
}

const BARS_HEIGHT = 56;

/**
 * A metric on a card: a coloured label, the time it was taken, the value and a few bars.
 * Pressed, it leads to the details.
 */
export function MetricCard({
  icon,
  title,
  meta,
  value,
  unit,
  note,
  bars,
  barsLabel,
  onPress,
  children,
}: {
  icon: IconName;
  title: string;
  /** A quiet note on the right of the label, e.g. the date. */
  meta?: string;
  value?: string;
  unit?: string;
  /** A line under the value. */
  note?: string;
  bars?: readonly number[];
  barsLabel?: string;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const body = (
    <>
      <View style={styles.metricHeader}>
        <CardLabel icon={icon} title={title} />
        <View style={styles.metricMeta}>
          {meta !== undefined && (
            <ThemedText type="small" themeColor="textSecondary">
              {meta}
            </ThemedText>
          )}
          {onPress && <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />}
        </View>
      </View>
      {(value !== undefined || bars) && (
        <View style={styles.metricBody}>
          <View style={styles.shrink}>
            {value !== undefined && <Metric value={value} unit={unit} />}
            {note !== undefined && (
              <ThemedText type="small" themeColor="textSecondary">
                {note}
              </ThemedText>
            )}
          </View>
          {bars && bars.length > 1 && <MiniBars values={bars} label={barsLabel} />}
        </View>
      )}
      {children}
    </>
  );

  if (!onPress) {
    return (
      <ThemedView type="backgroundElement" style={styles.metricCard}>
        {body}
      </ThemedView>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.metricCard,
        { backgroundColor: theme.backgroundElement },
        pressed && styles.pressedCard,
      ]}>
      {body}
    </Pressable>
  );
}

/**
 * A square-ish button for a quick entry, two to a row: the picture on top, the title under it
 * across the whole width, so a long word never pushes the picture out of the tile.
 */
export function Tile({
  icon,
  color,
  title,
  picture,
  onPress,
}: {
  icon: IconName;
  color: string;
  title: string;
  /** An illustration in place of the icon. */
  picture?: ImageSourcePropType;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: theme.backgroundElement },
        pressed && styles.pressedCard,
      ]}>
      {picture ? (
        <Image source={picture} style={styles.tilePicture} accessibilityIgnoresInvertColors />
      ) : (
        <IconPlate icon={icon} color={color} />
      )}
      <ThemedText style={styles.tileTitle} numberOfLines={2}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

/** An icon on a soft rounded plate: the mark of a row or a tile. */
export function IconPlate({ icon, color, size = 48 }: { icon: IconName; color?: string; size?: number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.plate,
        { width: size, height: size, borderRadius: size * 0.32, backgroundColor: theme.accentSoft },
      ]}>
      <Ionicons name={icon} size={size * 0.5} color={color ?? theme.accent} />
    </View>
  );
}

/** Tiles two to a row. */
export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={styles.tiles}>{children}</View>;
}

/**
 * An empty-state card with an illustration, a title and a line on what to do.
 * An action, if any, goes under the text.
 */
export function PictureNote({
  picture,
  title,
  text,
  children,
}: {
  picture: ImageSourcePropType;
  title?: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.note}>
      <Image source={picture} style={styles.notePicture} accessibilityIgnoresInvertColors />
      <View style={styles.noteText}>
        {title !== undefined && <ThemedText style={styles.noteTitle}>{title}</ThemedText>}
        <ThemedText themeColor="textSecondary" style={styles.centered}>
          {text}
        </ThemedText>
      </View>
      {children}
    </ThemedView>
  );
}

/** One of a few options, side by side in a rounded track. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.segments} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={styles.segment}>
            {/* Headings side by side: the chosen one in the accent, underlined. */}
            <ThemedText
              type="section"
              numberOfLines={1}
              style={[styles.segmentText, { color: selected ? theme.highlight : theme.text }]}>
              {option.label}
            </ThemedText>
            <View
              style={[styles.segmentLine, { backgroundColor: selected ? theme.bright : 'transparent' }]}
            />
          </Pressable>
        );
      })}
    </View>
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
  icon,
  iconColor,
  onPress,
}: {
  title: string;
  subtitle?: string;
  /** A short mark next to the title, e.g. "Main". */
  badge?: string;
  icon?: IconName;
  iconColor?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {icon && <IconPlate icon={icon} color={iconColor} size={40} />}
      <View style={styles.rowText}>
        <View style={styles.rowTitle}>
          <ThemedText style={[styles.shrink, styles.linkRowTitle]}>{title}</ThemedText>
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
      style={[
        styles.input,
        { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.separator },
        style,
      ]}
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
            <ThemedText
              style={[styles.stepValue, styles.stepTappable, { borderColor: theme.backgroundSelected }]}>
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
  fill: {
    flex: 1,
  },
  screen: {
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  largeTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    minHeight: 48,
  },
  compactTitle: {
    position: 'absolute',
    pointerEvents: 'none',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compactText: {
    fontSize: 17,
    paddingHorizontal: Spacing.five,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: Spacing.two + Spacing.one,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.one,
    marginTop: Spacing.two,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    minHeight: 44,
  },
  cardLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    flexShrink: 1,
  },
  unit: {
    fontWeight: 600,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.one,
    height: BARS_HEIGHT,
  },
  bar: {
    width: 10,
    borderRadius: 5,
  },
  metricCard: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    gap: Spacing.three,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  metricMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  metricBody: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  pressedCard: {
    opacity: 0.75,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two + Spacing.one,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '40%',
    alignItems: 'flex-start',
    gap: Spacing.two + Spacing.one,
    // The same room on every side.
    padding: Spacing.three + Spacing.one,
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  tileTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontFamily: Typeface.displayMedium,
  },
  tilePicture: {
    width: 56,
    height: 56,
  },
  note: {
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    paddingTop: Spacing.three,
    borderRadius: Radius.card,
  },
  notePicture: {
    width: 112,
    height: 112,
  },
  noteText: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  noteTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: Typeface.display,
    textAlign: 'center',
  },
  centered: {
    textAlign: 'center',
  },
  plate: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  segments: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  segment: {
    minHeight: 44,
    justifyContent: 'center',
    gap: Spacing.one,
  },
  segmentText: {
    fontSize: 22,
    lineHeight: 28,
  },
  segmentLine: {
    height: 3,
    borderRadius: 2,
    marginHorizontal: Spacing.two,
  },
  group: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: Radius.card,
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
  rowIcon: {
    width: 28,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  linkRowTitle: {
    fontFamily: Typeface.displayMedium,
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
    borderRadius: Radius.field,
    borderWidth: 1,
    fontSize: 17,
    fontFamily: Typeface.medium,
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
    fontFamily: Typeface.semibold,
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
