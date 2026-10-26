import Ionicons from '@expo/vector-icons/Ionicons';
import { BUILT_IN_INTERVAL_PRESETS, type IntervalPlan } from '@mvp/domain';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, Group, LinkRow, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { listIntervalPresets } from '@/data/intervals';
import { useTheme } from '@/hooks/use-theme';
import { planSummary, useIntervalTimer } from '@/lib/interval-timer';
import { useLocal } from '@/lib/local';

/** The presets of the interval timer: built-in ones and the user's own. */
export default function IntervalPresetsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const running = useIntervalTimer((state) => state.run);
  const start = useIntervalTimer((state) => state.start);
  const mine = useLocal(listIntervalPresets);

  const run = (title: string, plan: IntervalPlan) => {
    start(title, plan);
    router.push('/interval/run');
  };

  return (
    <Screen>
      {running && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">{t('interval.running')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {running.title}
          </ThemedText>
          <Button title={t('interval.toTimer')} onPress={() => router.push('/interval/run')} />
        </ThemedView>
      )}

      <Group title={t('interval.builtIn')}>
        <Card>
          {BUILT_IN_INTERVAL_PRESETS.map((preset) => {
            const title = t(`interval.presets.${preset.key}`);
            return (
              <LinkRow
                key={preset.key}
                title={title}
                subtitle={planSummary(t, preset)}
                onPress={() => run(title, preset)}
              />
            );
          })}
        </Card>
      </Group>

      <Group title={t('interval.mine')}>
        {mine.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('interval.mineEmpty')}
          </ThemedText>
        ) : (
          <Card>
            {mine.map((preset) => (
              <View key={preset.id} style={styles.row}>
                <View style={styles.grow}>
                  <LinkRow
                    title={preset.title}
                    subtitle={planSummary(t, preset)}
                    onPress={() => run(preset.title, preset)}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('interval.edit', { title: preset.title })}
                  hitSlop={Spacing.two}
                  onPress={() =>
                    router.push({ pathname: '/interval/preset', params: { id: preset.id } })
                  }
                  style={({ pressed }) => [styles.edit, pressed && styles.pressed]}>
                  <Ionicons name="create-outline" size={24} color={theme.textSecondary} />
                </Pressable>
              </View>
            ))}
          </Card>
        )}
        <Button
          variant="secondary"
          title={t('interval.create')}
          onPress={() => router.push('/interval/preset')}
        />
      </Group>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  grow: {
    flex: 1,
  },
  edit: {
    width: 48,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.5,
  },
});
