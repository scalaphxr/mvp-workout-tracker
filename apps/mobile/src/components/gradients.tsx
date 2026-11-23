import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

export function AccentGradient() {
  const theme = useTheme();
  const id = `action-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" aria-hidden>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={theme.action} />
            <Stop offset="100%" stopColor={theme.actionEnd} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

export function ScreenGlow() {
  const theme = useTheme();
  const id = `screen-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <View style={styles.glow} pointerEvents="none" aria-hidden>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={theme.hero} stopOpacity={0} />
            <Stop offset="24%" stopColor={theme.hero} stopOpacity={0.9} />
            <Stop offset="63%" stopColor={theme.hero} stopOpacity={0.32} />
            <Stop offset="100%" stopColor={theme.hero} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 280 },
});
