import Ionicons from '@expo/vector-icons/Ionicons';
import { type StepGroup, stepGroup } from '@mvp/domain';
import {
  type Equipment,
  EQUIPMENT_CATEGORIES,
  LOCATION_TYPES,
  type LocationType,
} from '@mvp/schemas';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { Card, ConfirmButton, Group, Screen, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  deleteGymProfile,
  listGymProfiles,
  setDefaultGym,
  setGymEquipment,
  updateGymProfile,
} from '@/data/gym';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { useCatalog } from '@/lib/catalog';
import { formatNumber } from '@/lib/format';
import { presetSelection, stepsOf, useGym } from '@/lib/gym';
import { mutate, useLocal } from '@/lib/local';

/** The steps a gym can be set to, kg. For a barbell the step is two of the lightest plates. */
const STEP_OPTIONS: Record<StepGroup, readonly number[]> = {
  dumbbells: [0.5, 1, 2, 2.5],
  plates: [0.5, 1, 2.5, 5],
  stack: [2.5, 5, 10],
};

const STEP_TITLES = {
  dumbbells: 'gym.stepDumbbells',
  plates: 'gym.stepPlates',
  stack: 'gym.stepStack',
} as const;

export default function GymProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const { catalog } = useCatalog();
  const gym = useGym(id);
  const isOnly = useLocal((ctx) => listGymProfiles(ctx).length === 1);
  // The name is saved as it is typed; an empty one is not saved and the last good name stays.
  const [name, setName] = useState(gym?.profile.name ?? '');

  if (!gym) return <EmptyState title={t('gym.notFoundTitle')} text={t('gym.notFoundText')} />;
  const { profile } = gym;
  const steps = stepsOf(catalog, gym);

  /** The step stored for a piece of equipment: nothing when it is the catalog default. */
  const stored = (item: Equipment, chosen: Record<StepGroup, number>) => {
    const group = stepGroup(item);
    if (!group || chosen[group] === item.default_increment_kg) return null;
    return chosen[group];
  };

  const save = (owned: (item: Equipment) => boolean, chosen = steps) =>
    mutate((ctx) =>
      setGymEquipment(
        ctx,
        profile.id,
        new Map(catalog.equipment.filter(owned).map((item) => [item.id, stored(item, chosen)])),
      ),
    );

  const toggle = (item: Equipment) =>
    save((candidate) => gym.equipment.has(candidate.code) !== (candidate.id === item.id));

  const applyPreset = (location: LocationType | null) => {
    const preset = location ? presetSelection(catalog, location) : new Map<string, null>();
    save((item) => preset.has(item.id));
  };

  const rename = (text: string) => {
    setName(text);
    if (text.trim()) mutate((ctx) => updateGymProfile(ctx, profile.id, { name: text }));
  };

  return (
    <Screen>
      <Group title={t('gym.nameLabel')}>
        <TextField label={t('gym.nameLabel')} value={name} onChangeText={rename} maxLength={80} />
      </Group>

      <Group title={t('gym.type')}>
        <View style={styles.chips}>
          {LOCATION_TYPES.map((location) => (
            <Chip
              key={location}
              label={t(`gym.location.${location}`)}
              selected={profile.location_type === location}
              onPress={() =>
                mutate((ctx) => updateGymProfile(ctx, profile.id, { location_type: location }))
              }
            />
          ))}
        </View>
      </Group>

      {profile.is_default ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('gym.isDefault')}
        </ThemedText>
      ) : (
        <Button
          variant="secondary"
          title={t('gym.makeDefault')}
          onPress={() => mutate((ctx) => setDefaultGym(ctx, profile.id))}
        />
      )}

      <Group title={t('gym.steps')}>
        {(['dumbbells', 'plates', 'stack'] as const).map((group) => (
          <View key={group} style={styles.step}>
            <ThemedText>{t(STEP_TITLES[group])}</ThemedText>
            <View style={styles.chips}>
              {STEP_OPTIONS[group].map((value) => (
                <Chip
                  key={value}
                  label={t('units.kg', { value: formatNumber(value, locale) })}
                  selected={steps[group] === value}
                  onPress={() =>
                    save((item) => gym.equipment.has(item.code), { ...steps, [group]: value })
                  }
                />
              ))}
            </View>
            {group === 'plates' && (
              <ThemedText type="small" themeColor="textSecondary">
                {t('gym.stepPlatesHint')}
              </ThemedText>
            )}
          </View>
        ))}
      </Group>

      <Group title={t('gym.presets')}>
        <View style={styles.chips}>
          <Button variant="secondary" title={t('gym.presetFull')} onPress={() => applyPreset('gym')} />
          <Button variant="secondary" title={t('gym.presetHome')} onPress={() => applyPreset('home')} />
          <Button variant="secondary" title={t('gym.presetNone')} onPress={() => applyPreset(null)} />
        </View>
      </Group>

      {EQUIPMENT_CATEGORIES.map((category) => {
        const items = catalog.equipment.filter((item) => item.category === category);
        if (items.length === 0) return null;
        return (
          <Group key={category} title={t(`gym.category.${category}`)}>
            <Card>
              {items.map((item) => {
                const owned = gym.equipment.has(item.code);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="checkbox"
                    aria-checked={owned}
                    onPress={() => toggle(item)}
                    style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
                    <Ionicons
                      name={owned ? 'checkbox' : 'square-outline'}
                      size={26}
                      color={owned ? theme.accent : theme.textSecondary}
                    />
                    <ThemedText style={styles.optionText}>{item.name[locale]}</ThemedText>
                  </Pressable>
                );
              })}
            </Card>
          </Group>
        );
      })}

      {!isOnly && (
        <ConfirmButton
          title={t('gym.delete')}
          onConfirm={() => {
            mutate((ctx) => deleteGymProfile(ctx, profile.id));
            router.back();
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  step: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
  },
  optionText: {
    flex: 1,
  },
  pressed: {
    opacity: 0.5,
  },
});
