import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/empty-state';

export default function TodayScreen() {
  const { t } = useTranslation();
  return <EmptyState title={t('today.emptyTitle')} text={t('today.emptyText')} />;
}
