// OffscreenCanvas worker entry —— 在 worker 執行緒渲染星空，主執行緒不卡。
// 由 SpaceBackdrop 以 new Worker(new URL('./spaceWorker.tsx', import.meta.url), { type: 'module' }) 啟動。
import { render } from '@react-three/offscreen';
import StarfieldWorkerScene from '../components/StarfieldWorkerScene';

render(<StarfieldWorkerScene />);
