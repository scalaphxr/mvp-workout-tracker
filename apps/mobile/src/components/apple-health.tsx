import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import {
  APPLE_HEALTH_QUERY, requestAppleHealthAccess, supportsAppleHealth, useAppleHealthAccess, type useAppleHealthDay,
} from '@/lib/apple-health';
import { formatDistance, formatDuration, formatNumber } from '@/lib/format';

import { Button } from './button';
import { ThemedText } from './themed-text';
import { Card, Group, Section } from './ui';

export function AppleHealthSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const enabled = useAppleHealthAccess((state) => state.enabled);
  const setEnabled = useAppleHealthAccess((state) => state.setEnabled);
  const [requesting, setRequesting] = useState(false);
  const [failed, setFailed] = useState(false);

  if (Platform.OS !== 'ios') return null;

  const connect = async () => {
    setFailed(false);
    setRequesting(true);
    try {
      if (!(await requestAppleHealthAccess())) throw new Error('HealthKit authorization request failed');
      setEnabled(true);
    } catch {
      setFailed(true);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Group title={t('appleHealth.title')}>
      <Card>
        <View style={styles.content}>
          <ThemedText type="small" themeColor="textSecondary">
            {t(supportsAppleHealth ? 'appleHealth.description' : 'appleHealth.requiresBuild')}
          </ThemedText>
          {supportsAppleHealth && (
            <>
              {enabled && (
                <ThemedText type="small" themeColor="textSecondary">{t('appleHealth.manageAccess')}</ThemedText>
              )}
              {failed && (
                <ThemedText type="small" themeColor="danger">{t('appleHealth.accessError')}</ThemedText>
              )}
              <Button
                variant="secondary"
                title={t(enabled ? 'appleHealth.disable' : 'appleHealth.connect')}
                loading={requesting}
                onPress={() => {
                  if (!enabled) {
                    void connect();
                    return;
                  }
                  setEnabled(false);
                  queryClient.removeQueries({ queryKey: APPLE_HEALTH_QUERY });
                }}
              />
            </>
          )}
        </View>
      </Card>
    </Group>
  );
}

export function AppleHealthDay({ health }: { health: ReturnType<typeof useAppleHealthDay> }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const theme = useTheme();
  if (!health.enabled) return null;

  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
  const number = (value: number) => formatNumber(Math.round(value), locale);
  const energy = (value: number) => t('units.kcal', { value: number(value) });
  const distance = (value: number) => formatDistance(t, locale, value);
  const formatMetric = (unit: string, value: number) => {
    switch (unit) {
      case 'm': return distance(value);
      case 'min': return t('units.min', { value: number(value) });
      case 'kcal': return energy(value);
      default: return number(value);
    }
  };
  const data = health.data;

  return (
    <Section title={t('appleHealth.title')}>
      <Card>
        <View style={styles.content}>
          {health.isFetching && !data && <ActivityIndicator color={theme.accent} />}
          {health.isError && (
            <>
              <ThemedText type="small" themeColor="danger">{t('appleHealth.readError')}</ThemedText>
              <Button variant="secondary" title={t('profile.retry')} onPress={() => void health.refetch()} />
            </>
          )}
          {data && data.metrics.length === 0 && data.workouts.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">{t('appleHealth.empty')}</ThemedText>
          )}
          {data?.metrics.map(({ key, unit, value }) => (
            <View key={key} style={styles.metric}>
              <ThemedText style={styles.label}>{t(`appleHealth.metrics.${key}`)}</ThemedText>
              <ThemedText type="smallBold">{formatMetric(unit, value)}</ThemedText>
            </View>
          ))}
          {data?.workouts.map((workout) => {
            const fallback = workout.activity.replace(/([a-z])([A-Z])/g, '$1 $2');
            const name = t(`appleHealth.workouts.${workout.activity}`, {
              defaultValue: fallback.charAt(0).toLocaleUpperCase(locale) + fallback.slice(1),
            });
            const summary = [
              time.format(new Date(workout.startedAt)),
              formatDuration(t, Math.round(workout.seconds)),
              workout.meters === undefined ? null : distance(workout.meters),
              workout.kcal === undefined ? null : energy(workout.kcal),
            ].filter(Boolean).join(' · ');
            return (
              <View key={workout.id} style={[styles.workout, { borderTopColor: theme.separator }]}>
                <ThemedText type="smallBold">{name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{summary}</ThemedText>
              </View>
            );
          })}
          {data?.partial && (
            <ThemedText type="small" themeColor="textSecondary">{t('appleHealth.partial')}</ThemedText>
          )}
        </View>
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two },
  metric: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  label: { flex: 1 },
  workout: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, gap: Spacing.half },
});
