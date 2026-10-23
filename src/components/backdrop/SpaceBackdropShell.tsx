import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { isBotUserAgent } from '@/lib/bot';
import BackdropErrorBoundary from './BackdropErrorBoundary';
import { useHardwareGpu } from '@/hooks/useHardwareGpu';
import { stripLocalePrefix } from '@/i18n/start-i18n';

// WebGPU 太空背景（星空+土星單 canvas，three/webgpu 獨立 lazy chunk，不進主 bundle）。
// 2026-07-19 翻預設：取代舊 pmndrs 雙 canvas 棧（strangler 完成）。
const LazyStarfieldGpu = lazy(() => import('./StarfieldGpu'));

// 3D 背景（星空＋首頁的土星與衛星）的掛載殼。
// 整包只在 client 跑（AppShell 以 ClientOnly + lazy 掛載）→ three.js 永不進 SSR。
// 2026-10 翻新拿掉了首訪的高速穿越開場：第一次進首頁時，土星就是從一個點撐開（換頁的「長」）。
export default function SpaceBackdropShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isOnHomePage = stripLocalePrefix(pathname) === '';
  const isMobile = useMediaQuery('(max-width: 768px)');
  // 爬蟲 / 稽核工具（Googlebot/Bingbot/Lighthouse…）：跟手機一樣完全不載 three。
  // 純裝飾背景、無內容 → 不算 cloaking；手機版本來就跳過故對 Google 一致；真人 UA 不含這些關鍵字，
  // 體驗不變。好處：桌機爬蟲/Rich Results/社群卡片抓取器不再卡在重的 WebGL render。
  // 清單跟語系導向、Web Vitals 用同一份（lib/bot），以前這裡另寫了一條、兩邊認得的 bot 不一樣。
  const isBot = useMemo(() => typeof navigator !== 'undefined' && isBotUserAgent(navigator.userAgent), []);
  // 3D pre-flight：有硬體加速的 WebGL 才掛 3D（renderer 首選 WebGPU，WebGL2 是它的 fallback
  // backend）。拿不到 context（Chromium 137 移除 SwiftShader 後加速全壞的機器）→ 不下載 three chunk，
  // 只留 CSS 星空。
  //
  // 另一種必須擋掉的情況：使用者在瀏覽器設定關掉硬體加速。此時 WebGL context 建得起來（跑
  // SwiftShader）、navigator.gpu 也還在，結果 3D 用 CPU 光柵化整站卡死——降低星星數量救不了，
  // 得完全不掛 3D。偵測到軟體渲染就只留 CSS 星空（WebGPU 的 Dawn 在這種機器上同樣只會拿到
  // SwiftShader/WARP，所以一個檢查擋兩條路）。
  //
  // 探測是非同步的（在 worker 裡做，理由見 lib/webglSupport.ts），3D 不等它（見下面掛載處）。
  // runtime 才炸的殘餘情況由 ErrorBoundary + worker error 通道接。
  const hardwareGpu = useHardwareGpu();
  const softwareGpu = hardwareGpu === false;

  // 軟體渲染 → 在 <html> 掛 .no-gpu，讓 CSS 一次關掉整站最貴的那些效果（見 index.css）
  useEffect(() => {
    if (!softwareGpu) return;
    document.documentElement.classList.add('no-gpu');
    return () => document.documentElement.classList.remove('no-gpu');
  }, [softwareGpu]);

  // 有元素進入全螢幕時，整包背景卸載。
  //
  // 這不是效能潔癖，是修一個真的 bug：文章頁的影片在全螢幕下連續 seek，第 8~15 次就會把
  // 媒體管線卡死——`seeking` 發出去、`seeked` 永遠不回來、readyState 掉到 1、解碼格數 +0、
  // `paused` 仍是 false，而且 `load()` 都救不回來，只有退出全螢幕才恢復。
  //
  // 逐項排除後（換全螢幕元素、換編碼、換解析度、關控制列毛玻璃、Blob 播、裸 DOM 播都照卡），
  // 唯一有效的變因是「把頁面動畫停掉」：同一台機器、同一個 profile、同一次載入，
  // 有動畫時第 10 次卡死，停掉動畫後 40/40 全過。搶 GPU 的是這幾層——StarfieldGpu 的
  // WebGPU/WebGL context、CursorTrail 那張全視窗 2D canvas（滑鼠一動就每幀重畫，而
  // 「點時間軸」正好一直在動滑鼠）、外加流星/UFO 那些 infinite 動畫。
  //
  // Chrome/Brave 撐得住、Edge 撐不住，但壓力是我們給的，所以這是我們該修的。
  // 全螢幕時這些特效本來就被 top layer 蓋住、一個像素都看不到，卸載純賺。
  //
  // ⚠️ `fullscreenchange` 只由 Fullscreen API 觸發，F11 的瀏覽器全螢幕**不會**進到這裡
  //   —— 一般閱讀（含 F11 全螢幕閱讀）的背景完全不受影響。
  //
  // 用 class 而不是卸載元件：卸載就得重掛，WebGPU context 重建是另一個會壞的地方，
  // 而且退出全螢幕時會看到星空重新淡入。掛 class 只是讓它們停下來，元件狀態原封不動。
  // StarfieldGpu 的 worker 也讀這個狀態暫停，因為 `display:none` 擋得住合成、擋不住它繼續送 GPU 指令。
  // （當時一起搶 GPU 的游標尾巴與流星、UFO 已在 2026-10 翻新時拿掉。）
  useEffect(() => {
    const onFs = () => {
      document.documentElement.classList.toggle('fs-active', document.fullscreenElement !== null);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.documentElement.classList.remove('fs-active');
    };
  }, []);

  // 爬蟲完全不載 three。手機只在首頁載：首頁的五顆衛星在 3D 裡，其他頁用不到，離開首頁就收掉
  if (isBot || (isMobile && !isOnHomePage)) return null;

  return (
    <>
      {/* 3D 背景（WebGPU/WebGL2 自動選 backend）。runtime 才炸由 ErrorBoundary 接；
          worker 內失敗則 StarfieldGpu 自行歸 null，頁面留下黑紙與 CSS 星空。
          等 GPU 探測有結果才掛：沒有 GPU 的機器上多下載、解析一次 three.js 是白花的 CPU——
          CI 的 e2e 每頁都付這筆，實際因此逾時過。 */}
      {hardwareGpu === true && (
        <BackdropErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <LazyStarfieldGpu isOnHomePage={isOnHomePage} lite={isMobile} />
          </Suspense>
        </BackdropErrorBoundary>
      )}
    </>
  );
}
