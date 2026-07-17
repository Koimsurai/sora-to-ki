import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../../localePage';
import Watch from '../../components/Watch';
import { loadWatch } from '../../watchData';

export const Route = createFileRoute('/watch/')({
  ...localePage('watch', Watch),
  loader: () => loadWatch(),
});
