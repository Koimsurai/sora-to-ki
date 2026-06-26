import { createFileRoute } from '@tanstack/react-router';
import { localeWrap } from '../../localePage';
import ThinkingDetail from '../../components/ThinkingDetail';
export const Route = createFileRoute('/thinking/$id')({ component: localeWrap(ThinkingDetail) });
