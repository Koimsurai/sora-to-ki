import { createFileRoute } from '@tanstack/react-router';
import { localeGuardedPage } from '../../../localePage';
import ThinkingDetail from '../../../components/ThinkingDetail';
export const Route = createFileRoute('/$locale/thinking/$id')(localeGuardedPage(ThinkingDetail));
