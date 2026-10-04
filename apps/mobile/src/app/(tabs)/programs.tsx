import type { ProgramRow } from '@mvp/schemas';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Card, Group, LinkRow, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { createProgram, getProgramTree, listPrograms } from '@/data/programs';
import { mutate, useActiveProgram, useLocal } from '@/lib/local';

export default function ProgramsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const activeId = useActiveProgram((state) => state.id);
  const setActive = useActiveProgram((state) => state.set);
  const programs = useLocal((ctx) =>
    listPrograms(ctx).map((program) => {
      const tree = getProgramTree(ctx, program.id);
      return {
        program,
        days: tree?.days.filter((day) => day.kind === 'regular').length ?? 0,
        exercises: tree?.items.length ?? 0,
      };
    }),
  );

  const open = (id: string) => router.push({ pathname: '/program/[id]', params: { id } });

  const create = () => {
    const program = mutate((ctx) =>
      createProgram(ctx, {
        title: t('programs.newTitle'),
        firstDayTitle: t('programs.dayTitle', { number: 1 }),
      }),
    );
    // The first program is the one to train by.
    if (programs.length === 0) setActive(program.id);
    open(program.id);
  };

  const row = ({ program, days, exercises }: (typeof programs)[number]) => (
    <LinkRow
      key={program.id}
      title={program.title}
      subtitle={`${t('programs.days', { count: days })}, ${t('programs.exercises', { count: exercises })}`}
      onPress={() => open(program.id)}
    />
  );

  const active = programs.find(({ program }: { program: ProgramRow }) => program.id === activeId);
  const others = programs.filter((entry) => entry !== active);

  return (
    <Screen>
      {programs.length === 0 && (
        <View style={styles.empty}>
          <ThemedText style={styles.emptyTitle}>{t('programs.emptyTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.emptyText}>
            {t('programs.emptyText')}
          </ThemedText>
        </View>
      )}

      {active && (
        <Group title={t('programs.active')}>
          <Card>{row(active)}</Card>
        </Group>
      )}
      {others.length > 0 && (
        <Group title={active ? t('programs.others') : undefined}>
          <Card>{others.map(row)}</Card>
        </Group>
      )}

      <View style={styles.actions}>
        <Button title={t('programs.create')} onPress={create} />
        <Button variant="secondary" title={t('programs.enterCode')} onPress={() => router.push('/code')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  emptyTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: 600,
  },
  emptyText: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.two,
  },
});
