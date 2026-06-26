import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../localePage';
import Messages from '../components/Messages';

export const Route = createFileRoute('/messages')(localePage('messages', Messages));
