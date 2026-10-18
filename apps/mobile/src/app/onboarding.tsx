import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { createProgram } from '@/data/programs';
import { useTheme } from '@/hooks/use-theme';
import { mutate, useActiveProgram } from '@/lib/local';
import { usePreferences } from '@/lib/preferences';

const SLIDES = [
  { key: 'gym', icon: 'barbell' },
  { key: 'progress', icon: 'trending-up' },
  { key: 'offline', icon: 'cloud-offline' },
] as const;

/**
 * The first launch (spec, screen "Onboarding"): three slides, then the way to start – the
 * questionnaire, a program from text, one's own, or a code. Any of them can be skipped.
 */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setActive = useActiveProgram((state) => state.set);
  const [slide, setSlide] = useState(0);

  const finish = (next: Href | null) => {
    usePreferences.getState().set({ onboarded: true });
    router.replace('/');
    if (next) router.push(next);
  };

  const ownProgram = () => {
    const program = mutate((ctx) =>
      createProgram(ctx, {
        title: t('programs.newTitle'),
        firstDayTitle: t('programs.dayTitle', { number: 1 }),
      }),
    );
    setActive(program.id);
    finish({ pathname: '/program/[id]', params: { id: program.id } });
  };

  const current = SLIDES[slide];
  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: theme.background, paddingTop: insets.top + Spacing.five },
        { paddingBottom: insets.bottom + Spacing.three },
      ]}>
      {current ? (
        <>
          <View style={styles.slide}>
            <Ionicons name={current.icon} size={72} color={theme.accent} />
            <ThemedText style={styles.title}>{t(`onboarding.${current.key}Title`)}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.text}>
              {t(`onboarding.${current.key}Text`)}
            </ThemedText>
          </View>
          <View style={styles.dots} accessibilityLabel={t('onboarding.step', { step: slide + 1, total: SLIDES.length })}>
            {SLIDES.map((item, index) => (
              <View
                key={item.key}
                style={[
                  styles.dot,
                  { backgroundColor: index === slide ? theme.accent : theme.backgroundSelected },
                ]}
              />
            ))}
          </View>
          <View style={styles.actions}>
            <Button title={t('onboarding.next')} onPress={() => setSlide(slide + 1)} />
            <Button variant="secondary" title={t('onboarding.skip')} onPress={() => setSlide(SLIDES.length)} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.slide}>
            <ThemedText style={styles.title}>{t('onboarding.startTitle')}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.text}>
              {t('onboarding.startText')}
            </ThemedText>
          </View>
          <View style={styles.actions}>
            <Button title={t('questionnaire.open')} onPress={() => finish('/questionnaire')} />
            <Button variant="secondary" title={t('importText.open')} onPress={() => finish('/import-text')} />
            <Button variant="secondary" title={t('onboarding.own')} onPress={ownProgram} />
            <Button variant="secondary" title={t('programs.enterCode')} onPress={() => finish('/code')} />
            <Button variant="secondary" title={t('onboarding.later')} onPress={() => finish(null)} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
    textAlign: 'center',
  },
  text: {
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  actions: {
    gap: Spacing.two,
  },
});
