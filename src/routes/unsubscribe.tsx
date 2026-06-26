import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../localePage';
import Unsubscribe from '../components/Unsubscribe';
export const Route = createFileRoute('/unsubscribe')(localePage('unsubscribe', Unsubscribe));
