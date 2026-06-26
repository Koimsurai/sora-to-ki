import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import Portfolio from '../../components/Portfolio';
export const Route = createFileRoute('/$locale/portfolio')(localePagePrefixed('portfolio', Portfolio));
