import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../localePage';
import Activity from '../components/Activity';

export const Route = createFileRoute('/activity')(localePage('activity', Activity));
