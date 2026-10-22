import { lazy, Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { isBotUserAgent } from '@/lib/bot';
import type { IntroPhase } from '@/lib/introTimeline';
import IntroSkip from './IntroSkip';
import BackdropErrorBoundary from './BackdropErrorBoundary';
import DomSpaceEffects from './DomSpaceEffects';
import { useHardwareGpu } from '@/hooks/useHardwareGpu';
import { stripLocalePrefix } from '@/i18n/start-i18n';

// WebGPU 太空背景（星空+土星單 canvas，three/webgpu 獨立 lazy chunk，不進主 bundle）。
// 2026-07-19 翻預設：取代舊 pmndrs 雙 canvas 棧（strangler 完成）。
const LazyStarfieldGpu = lazy(() => import('./StarfieldGpu'));

/**
 * 開場最多等 3D 初始化多久。__root 的 pre-paint gate 在 4 秒時無條件放出內容，
 * 這裡要比它早放棄，否則會變成「內容先出現、開場才蓋上來」。
 */
const INTRO_WAIT_LIMIT_MS = 3000;

// 桌面 WebGL 背景 + 首訪首頁開場動畫的編排殼。
// 整包只在 client 跑(由 __root 以 ClientOnly + lazy 掛載)→ three.js 永不進 SSR。
// 「不 gate 內容」:SSR 內容已先繪出,開場純粹疊在上層淡出。
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
  // 降級純 DOM 特效。
  //
  // 另一種必須擋掉的情況：使用者在瀏覽器設定關掉硬體加速。此時 WebGL context 建得起來（跑
  // SwiftShader）、navigator.gpu 也還在，結果 3D 用 CPU 光柵化整站卡死——降低星星數量救不了，
  // 得完全不掛 3D。偵測到軟體渲染就直接走 DOM 特效（WebGPU 的 Dawn 在這種機器上同樣只會拿到
  // SwiftShader/WARP，所以一個檢查擋兩條路）。
  //
  // 探測是非同步的（在 worker 裡做，理由見 lib/webglSupport.ts）。3D 不等它（見下面掛載處），
  // DOM 特效等它；說是軟體渲染就兩個都收掉。
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
  // 兩個 JS 迴圈（StarfieldGpu 的 worker、CursorTrail 的 rAF）各自也讀這個狀態暫停，
  // 因為 `display:none` 擋得住合成、擋不住它們繼續送 GPU 指令。
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

  const introCompleted = (() => {
    try {
      return sessionStorage.getItem('introCompleted') === 'true';
    } catch {
      return false;
    }
  })();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  // 開場只在「首次造訪 + 桌面 + 首頁」播；要求減少動態的就不播
  const shouldSkipIntro = introCompleted || !isOnHomePage || isMobile || reducedMotion;

  // 開場畫在 3D 背景同一張 canvas 上（lib/hyperspace.ts），時間軸由那邊的渲染迴圈推進，
  // 這裡只照它送來的階段切 DOM：
  //   waiting：等 GPU 探測與 3D 初始化（管線全部編譯完才開始，開場進行中不會有初始化）
  //   playing：第一幀已經畫出來 → ending：開場層淡出中 → done
  const [intro, setIntro] = useState<'waiting' | 'playing' | 'ending' | 'done'>(shouldSkipIntro ? 'done' : 'waiting');
  const [skip, setSkip] = useState(false);
  // 探測說沒有硬體加速 → 不播：開場跟 3D 背景是同一條管線，沒有 3D 就沒有開場
  const introActive = intro !== 'done' && !softwareGpu;

  const markIntroSeen = () => {
    try {
      sessionStorage.setItem('introCompleted', 'true');
    } catch {
      /* sessionStorage 不可用就略過 */
    }
  };
  const endIntro = useCallback(() => {
    markIntroSeen();
    setIntro('done');
  }, []);
  const handleIntroPhase = useCallback((phase: IntroPhase) => {
    if (phase === 'started') setIntro('playing');
    // 內容在開場層底下解開（開場前已先畫好，見 index.css 的 html.intro-pending）
    else if (phase === 'preReveal') document.documentElement.classList.remove('intro-pending');
    else if (phase === 'ending') {
      markIntroSeen();
      setIntro('ending');
    } else if (phase === 'done') setIntro('done');
  }, []);

  // 3D 一直沒就緒（網路很慢、驅動卡住）就不等了：內容放出來，runner 之後就算好了也不播
  useEffect(() => {
    if (intro !== 'waiting') return;
    const timer = setTimeout(() => {
      setSkip(true);
      endIntro();
    }, INTRO_WAIT_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [intro, endIntro]);

  // 開場不會播或已經結束 → 放行內容，別讓 pre-paint gate 卡住
  useEffect(() => {
    if (!introActive) document.documentElement.classList.remove('intro-pending');
  }, [introActive]);

  // 開場期間鎖捲動、星雲壓暗層延後（NebulaBackground.css）；開始淡出就拿掉，讓兩邊交叉淡入
  useEffect(() => {
    if (intro !== 'playing') return;
    document.body.classList.add('intro-animation-active');
    return () => document.body.classList.remove('intro-animation-active');
  }, [intro]);

  if (isMobile || isBot) return null; // 手機 / 爬蟲：完全不載 three

  return (
    <>
      {introActive && (intro === 'playing' || intro === 'ending') && (
        <IntroSkip ending={intro === 'ending'} onSkip={() => setSkip(true)} />
      )}
      {/* 3D 背景（WebGPU/WebGL2 自動選 backend）。runtime 才炸由 ErrorBoundary 接；
          worker 內失敗則 StarfieldGpu 自行歸 null——兩種情況 DOM 特效都還在（下方獨立掛載）。
          開場期間整張 canvas 在開場層的高度（蓋住內容），結束後回到內容底下。
          探測還沒出結果就先掛，跟探測同時建 3D：開場要等 3D 整個就緒（管線全部編譯完）才開始，
          兩段重疊起來才不會讓開場晚太多。探測說沒有硬體加速就卸載——那種機器上多花的只是
          探測那零點幾秒的 CPU。 */}
      {!softwareGpu && (
        <BackdropErrorBoundary fallback={null} onError={endIntro}>
          <Suspense fallback={null}>
            <LazyStarfieldGpu
              isOnHomePage={isOnHomePage}
              zIndex={introActive ? 'calc(var(--z-intro) + 1)' : 1}
              intro={introActive}
              onIntroPhase={handleIntroPhase}
              onIntroAbort={endIntro}
              skipIntro={skip}
            />
          </Suspense>
        </BackdropErrorBoundary>
      )}
      {/* DOM 特效（流星/UFO/游標尾跡，非 WebGL）：無論 3D 成敗都掛，頁面永遠有生命感。
          例外是「使用者關掉硬體加速」：整站合成、backdrop-filter、上百個 infinite 動畫全落在
          CPU，連純 DOM 特效都會拖垮捲動——這種機器只留靜態背景。 */}
      {/* 開場期間它們被開場層整個蓋住，但第一次掛上要光柵化四十幾個圖層——掛在開場第一幀
          （星芒還幾乎沒動），不要等到 pre-reveal 全速那時才掛，那會頓一幀。 */}
      {(intro !== 'waiting' || !introActive) && hardwareGpu === true && (
        <DomSpaceEffects isMobile={isMobile} isOnHomePage={isOnHomePage} />
      )}
    </>
  );
}
