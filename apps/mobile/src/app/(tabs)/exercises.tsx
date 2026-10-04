import { useRouter } from 'expo-router';

import { ExerciseBrowser } from '@/components/exercise-browser';

export default function ExercisesScreen() {
  const router = useRouter();
  return (
    <ExerciseBrowser
      onSelect={(exercise) =>
        router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } })
      }
    />
  );
}
