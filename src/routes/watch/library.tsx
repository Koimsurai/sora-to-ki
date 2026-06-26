import { createFileRoute } from '@tanstack/react-router';
import { localePage } from '../../localePage';
import WatchLibrary from '../../components/WatchLibrary';
export const Route = createFileRoute('/watch/library')(localePage('watch/library', WatchLibrary));
