import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../localePage';
import Friends from '../components/Friends';
export const Route = createFileRoute('/friends')(localePage('friends', Friends));
