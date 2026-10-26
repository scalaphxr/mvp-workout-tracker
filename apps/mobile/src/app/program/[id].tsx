import Ionicons from '@expo/vector-icons/Ionicons';
import { isAvailable } from '@mvp/domain';
import type { ProgramDayRow, ProgramItemRow } from '@mvp/schemas';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ConfirmButton, Group, Screen, TextField } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import {
  addDay,
  deleteDay,
  deleteProgram,
  getProgramTree,
  moveDay,
  moveItem,
  renameDay,
  updateProgram,
} from '@/data/programs';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { useCatalog } from '@/lib/catalog';
import { formatDuration, formatItemPlan } from '@/lib/format';
import { useGym } from '@/lib/gym';
import { mutate, useActiveProgram, useLocal } from '@/lib/local';

export default function ProgramScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const tree = useLocal((ctx) => getProgramTree(ctx, id));
  const activeId = useActiveProgram((state) => state.id);
  const setActive = useActiveProgram((state) => state.set);
  // Saved as it is typed; an empty title is not saved and the last good one stays.
  const [title, setTitle] = useState(tree?.program.title ?? '');

  if (!tree) {
    return <EmptyState title={t('program.notFoundTitle')} text={t('program.notFoundText')} />;
  }
  const { program } = tree;
  const regular = tree.days.filter((day) => day.kind === 'regular');
  const block = tree.days.find((day) => day.kind === 'every_session');
  const itemsOf = (day: ProgramDayRow) => tree.items.filter((item) => item.program_day_id === day.id);

  const rename = (text: string) => {
    setTitle(text);
    if (text.trim()) mutate((ctx) => updateProgram(ctx, program.id, { title: text }));
  };

  return (
    <Screen>
      <Group title={t('program.titleLabel')}>
        <TextField
          label={t('program.titleLabel')}
          value={title}
          onChangeText={rename}
          maxLength={120}
        />
        {program.forked_from_id !== null && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('program.forked')}
          </ThemedText>
        )}
      </Group>

      {regular.map((day, index) => (
        <Day
          key={day.id}
          programId={program.id}
          day={day}
          items={itemsOf(day)}
          canMoveUp={index > 0}
          canMoveDown={index < regular.length - 1}
          canDelete={regular.length > 1}
        />
      ))}
      <Button
        variant="secondary"
        title={t('program.addDay')}
        onPress={() =>
          mutate((ctx) =>
            addDay(ctx, program.id, t('programs.dayTitle', { number: regular.length + 1 }), 'regular'),
          )
        }
      />

      {block ? (
        <Day programId={program.id} day={block} items={itemsOf(block)} canDelete />
      ) : (
        <Button
          variant="secondary"
          title={t('program.addEverySession')}
          onPress={() =>
            mutate((ctx) => addDay(ctx, program.id, t('program.everySessionTitle'), 'every_session'))
          }
        />
      )}

      <View style={styles.actions}>
        {program.id === activeId ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('program.isActive')}
          </ThemedText>
        ) : (
          <Button title={t('program.makeActive')} onPress={() => setActive(program.id)} />
        )}
        <Button
          variant="secondary"
          title={t('program.share')}
          onPress={() => router.push({ pathname: '/program/share/[id]', params: { id: program.id } })}
        />
        <ConfirmButton
          title={t('program.delete')}
          onConfirm={() => {
            mutate((ctx) => deleteProgram(ctx, program.id));
            if (program.id === activeId) setActive(null);
            router.back();
          }}
        />
      </View>
    </Screen>
  );
}

function Day({
  programId,
  day,
  items,
  canMoveUp = false,
  canMoveDown = false,
  canDelete,
}: {
  programId: string;
  day: ProgramDayRow;
  items: ProgramItemRow[];
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  canDelete: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState(day.title);
  const isBlock = day.kind === 'every_session';

  const rename = (text: string) => {
    setTitle(text);
    if (text.trim()) mutate((ctx) => renameDay(ctx, day.id, text));
  };

  return (
    <ThemedView type="backgroundElement" style={styles.day}>
      <View style={styles.dayHeader}>
        <TextField
          label={t('program.dayTitleLabel')}
          value={title}
          onChangeText={rename}
          maxLength={80}
          style={styles.dayTitle}
        />
        {!isBlock && (
          <>
            <IconButton
              icon="arrow-up"
              label={t('program.moveUp')}
              disabled={!canMoveUp}
              onPress={() => mutate((ctx) => moveDay(ctx, day.id, -1))}
            />
            <IconButton
              icon="arrow-down"
              label={t('program.moveDown')}
              disabled={!canMoveDown}
              onPress={() => mutate((ctx) => moveDay(ctx, day.id, 1))}
            />
          </>
        )}
      </View>
      {isBlock && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('program.everySessionHint')}
        </ThemedText>
      )}

      {items.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('program.emptyDay')}
        </ThemedText>
      ) : (
        items.map((item, index) => (
          <Item
            key={item.id}
            item={item}
            // A superset is drawn as one block: its items are tied with a line on the left.
            joinsPrevious={
              item.superset_group !== null && items[index - 1]?.superset_group === item.superset_group
            }
            canMoveUp={index > 0}
            canMoveDown={index < items.length - 1}
          />
        ))
      )}

      <Button
        variant="secondary"
        title={t('program.addExercise')}
        onPress={() =>
          router.push({ pathname: '/exercise-picker', params: { programId, dayId: day.id } })
        }
      />
      {canDelete && (
        <ConfirmButton
          title={t('program.deleteDay')}
          onConfirm={() => mutate((ctx) => deleteDay(ctx, day.id))}
        />
      )}
    </ThemedView>
  );
}

function Item({
  item,
  joinsPrevious,
  canMoveUp,
  canMoveDown,
}: {
  item: ProgramItemRow;
  joinsPrevious: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const { exerciseById } = useCatalog();
  const gym = useGym();

  const exercise = exerciseById.get(item.exercise_id);
  const inSuperset = item.superset_group !== null;
  const unavailable = exercise && gym && !isAvailable(exercise, gym.equipment);
  const plan = [
    formatItemPlan(t, item, exercise),
    // Inside a superset there is no rest between exercises, only after the last one.
    item.rest_sec > 0 ? t('program.rest', { rest: formatDuration(t, item.rest_sec) }) : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      style={[
        styles.item,
        inSuperset && { borderLeftWidth: 3, borderLeftColor: theme.accent, paddingLeft: Spacing.two },
        joinsPrevious && styles.joined,
      ]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/program/item/[id]', params: { id: item.id } })}
        style={({ pressed }) => [styles.itemText, pressed && styles.pressed]}>
        {inSuperset && !joinsPrevious && (
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            {t('program.superset')}
          </ThemedText>
        )}
        <ThemedText>
          {exercise ? exercise.translations[locale].name : t('program.unknownExercise')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {plan}
        </ThemedText>
        {unavailable && (
          <ThemedText type="small" themeColor="danger">
            {t('program.unavailable')}
          </ThemedText>
        )}
      </Pressable>
      <IconButton
        icon="arrow-up"
        label={t('program.moveUp')}
        disabled={!canMoveUp}
        onPress={() => mutate((ctx) => moveItem(ctx, item.id, -1))}
      />
      <IconButton
        icon="arrow-down"
        label={t('program.moveDown')}
        disabled={!canMoveDown}
        onPress={() => mutate((ctx) => moveItem(ctx, item.id, 1))}
      />
    </View>
  );
}

function IconButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'arrow-up' | 'arrow-down';
  label: string;
  disabled: boolean;
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
        styles.iconButton,
        { backgroundColor: theme.backgroundSelected },
        (pressed || disabled) && styles.disabled,
      ]}>
      <Ionicons name={icon} size={20} color={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  day: {
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dayTitle: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 0,
    fontWeight: 600,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  joined: {
    // Pulls the item up against the one above it: the line on the left runs unbroken.
    marginTop: -Spacing.three,
    paddingTop: Spacing.three,
  },
  itemText: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.5,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.3,
  },
  actions: {
    gap: Spacing.two,
  },
});
