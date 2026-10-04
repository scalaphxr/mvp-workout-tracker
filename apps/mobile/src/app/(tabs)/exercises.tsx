import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/empty-state';

export default function ExercisesScreen() {
  const { t } = useTranslation();
  return <EmptyState title={t('exercises.emptyTitle')} text={t('exercises.emptyText')} />;
}
