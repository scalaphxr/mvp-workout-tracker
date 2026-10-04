import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/empty-state';

export default function ProgressScreen() {
  const { t } = useTranslation();
  return <EmptyState title={t('progress.emptyTitle')} text={t('progress.emptyText')} />;
}
