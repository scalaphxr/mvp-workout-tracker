import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/empty-state';

export default function ProgramsScreen() {
  const { t } = useTranslation();
  return <EmptyState title={t('programs.emptyTitle')} text={t('programs.emptyText')} />;
}
