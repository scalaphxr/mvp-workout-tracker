import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { bodyFace, Fonts, ThemeColor, Typeface } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'heading'
    | 'largeTitle'
    | 'section'
    | 'metric'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

const DISPLAY = new Set<ThemedTextProps['type']>([
  'title', 'heading', 'largeTitle', 'section', 'metric', 'subtitle', 'smallBold',
]);

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  // A screen may set its own weight: the body face follows it, since every weight is a file.
  const own = StyleSheet.flatten(style);
  const face =
    own?.fontFamily ??
    (DISPLAY.has(type) ? Typeface.display : bodyFace(own?.fontWeight ?? WEIGHTS[type]));

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'heading' && styles.heading,
        type === 'largeTitle' && styles.largeTitle,
        type === 'section' && styles.section,
        type === 'metric' && styles.metric,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && [styles.linkPrimary, { color: theme.accent }],
        type === 'code' && styles.code,
        style,
        { fontFamily: face },
        // The weight lives in the face; a weight on top of it would make Android fall back.
        type !== 'code' && { fontWeight: 'normal' },
      ]}
      {...rest}
    />
  );
}

/** The weight each body type is set in. */
const WEIGHTS: Partial<Record<NonNullable<ThemedTextProps['type']>, number>> = {
  default: 500,
  small: 500,
  link: 500,
  linkPrimary: 600,
};

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  title: {
    fontSize: 48,
    lineHeight: 54,
    textTransform: 'uppercase',
  },
  heading: {
    fontSize: 24,
    lineHeight: 30,
  },
  /** The name of a tab screen, above everything on it: a poster heading in capitals. */
  largeTitle: {
    fontSize: 38,
    lineHeight: 46,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  /** The heading of a group of cards. */
  section: {
    fontSize: 26,
    lineHeight: 32,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  /** A measured number, the largest thing on a card: condensed, so long numbers still fit. */
  metric: {
    fontSize: 38,
    lineHeight: 44,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 40,
    textTransform: 'uppercase',
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
