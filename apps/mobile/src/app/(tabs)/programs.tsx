import type { ProgramRow } from '@mvp/schemas';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Card, CardLabel, LinkRow, PictureNote, Screen, Section, Tile, TileGrid } from '@/components/ui';
import { Pictures } from '@/constants/pictures';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createProgram, getProgramTree, listPrograms } from '@/data/programs';
import { mutate, useActiveProgram, useLocal } from '@/lib/local';

export default function ProgramsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
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

  const describe = ({ days, exercises }: (typeof programs)[number]) =>
    `${t('programs.days', { count: days })}, ${t('programs.exercises', { count: exercises })}`;
  const row = (entry: (typeof programs)[number]) => (
    <LinkRow
      key={entry.program.id}
      icon="list"
      title={entry.program.title}
      subtitle={describe(entry)}
      onPress={() => open(entry.program.id)}
    />
  );

  const active = programs.find(({ program }: { program: ProgramRow }) => program.id === activeId);
  const others = programs.filter((entry) => entry !== active);

  return (
    <Screen title={t('tabs.programs')}>
      {programs.length === 0 && (
        <PictureNote picture={Pictures.calendar} title={t('programs.emptyTitle')} text={t('programs.emptyText')} />
      )}

      {/* The program trained by, large: the one the Today tab takes its next workout from. */}
      {active && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('programs.active')}: ${active.program.title}, ${describe(active)}`}
          onPress={() => open(active.program.id)}
          style={({ pressed }) => [
            styles.hero,
            { backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
          ]}>
          <View style={styles.heroText}>
            <CardLabel icon="checkmark-circle" title={t('programs.active')} color={theme.accent} />
            <ThemedText type="section" numberOfLines={3}>
              {active.program.title}
            </ThemedText>
            <ThemedText themeColor="textSecondary">{describe(active)}</ThemedText>
            <View style={styles.heroOpen}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                {t('programs.open')}
              </ThemedText>
              <Ionicons name="chevron-forward" size={16} color={theme.accent} />
            </View>
          </View>
          <Image source={Pictures.calendar} style={styles.heroPicture} accessibilityIgnoresInvertColors />
        </Pressable>
      )}
      {others.length > 0 && (
        <Section title={active ? t('programs.others') : t('tabs.programs')}>
          <Card>{others.map(row)}</Card>
        </Section>
      )}

      <Button title={t('programs.create')} onPress={create} />

      <Section title={t('programs.ways')}>
        <TileGrid>
          <Tile
            icon="sparkles"
            color={theme.accent}
            picture={Pictures.clipboard}
            title={t('questionnaire.open')}
            onPress={() => router.push('/questionnaire')}
          />
          <Tile
            icon="body"
            color={theme.accent}
            picture={Pictures.arm}
            title={t('focus.open')}
            onPress={() => router.push('/focus')}
          />
        </TileGrid>
        <Card>
          <LinkRow
            icon="document-text"
            title={t('importText.open')}
            onPress={() => router.push('/import-text')}
          />
          <LinkRow icon="qr-code" title={t('programs.enterCode')} onPress={() => router.push('/code')} />
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three + Spacing.one,
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  heroText: {
    flex: 1,
    gap: Spacing.one,
  },
  heroOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    marginTop: Spacing.one,
  },
  heroPicture: {
    width: 104,
    height: 104,
  },
  pressed: {
    opacity: 0.75,
  },
});
