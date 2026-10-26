import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ExerciseBrowser } from '@/components/exercise-browser';

export default function ExercisesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <ExerciseBrowser
      title={t('tabs.exercises')}
      onSelect={(exercise) =>
        router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } })
      }
    />
  );
}
