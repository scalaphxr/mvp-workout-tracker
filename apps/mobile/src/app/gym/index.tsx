import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Card, LinkRow, Screen } from '@/components/ui';
import { createGymProfile, getGymEquipment, listGymProfiles } from '@/data/gym';
import { useCatalog } from '@/lib/catalog';
import { presetSelection } from '@/lib/gym';
import { mutate, useLocal } from '@/lib/local';

export default function GymProfilesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { catalog } = useCatalog();
  const profiles = useLocal((ctx) =>
    listGymProfiles(ctx).map((profile) => ({
      profile,
      equipment: getGymEquipment(ctx, profile.id).length,
    })),
  );

  const open = (id: string) => router.push({ pathname: '/gym/[id]', params: { id } });

  const add = () => {
    const profile = mutate((ctx) =>
      createGymProfile(ctx, {
        name: t('gym.newName'),
        location_type: 'home',
        equipment: presetSelection(catalog, 'home'),
      }),
    );
    open(profile.id);
  };

  return (
    <Screen>
      <Card>
        {profiles.map(({ profile, equipment }) => (
          <LinkRow
            key={profile.id}
            title={profile.name}
            badge={profile.is_default ? t('gym.default') : undefined}
            subtitle={`${t(`gym.location.${profile.location_type}`)}, ${t('gym.equipment', { count: equipment })}`}
            onPress={() => open(profile.id)}
          />
        ))}
      </Card>
      <Button variant="secondary" title={t('gym.add')} onPress={add} />
    </Screen>
  );
}
