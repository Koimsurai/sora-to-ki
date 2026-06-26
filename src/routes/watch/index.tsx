import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../../localePage';
import Watch from '../../components/Watch';
export const Route = createFileRoute('/watch/')(localePage('watch', Watch));
