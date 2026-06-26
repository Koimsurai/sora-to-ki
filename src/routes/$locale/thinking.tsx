import { createFileRoute } from '@tanstack/react-router';
import { localePagePrefixed } from '../../localePage';
import Thinking from '../../components/Thinking';

export const Route = createFileRoute('/$locale/thinking')(localePagePrefixed('thinking', Thinking));
