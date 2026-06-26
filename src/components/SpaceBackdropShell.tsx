import { lazy, Suspense, useState, useRef, useEffect, useCallback } from 'react';
import { useMediaQuery } from 'usehooks-ts';
import { useRouterState } from '@tanstack/react-router';
import IntroAnimation from './IntroAnimation';
import { stripLocalePrefix } from '../start-i18n';

// Three.js 太空背景(星空/土星/特效)→ lazy chunk:vendor-three 不進主 bundle。
const LazySpaceBackdrop = lazy(() => import('./SpaceBackdrop'));

// 桌面 WebGL 背景 + 首訪首頁開場動畫(Saturn explosion)的編排殼。
// 整包只在 client 跑(由 __root 以 ClientOnly + lazy 掛載)→ three.js / IntroAnimation 永不進 SSR。
// 對齊舊 App.tsx 的 intro 狀態機,但「不再 gate 內容」:SSR 內容已先繪出,intro 純粹疊在上層淡出。
export default function SpaceBackdropShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isOnHomePage = stripLocalePrefix(pathname) === '';
  const isMobile = useMediaQuery('(max-width: 768px)');

  const introCompleted = (() => {
    try { return sessionStorage.getItem('introCompleted') === 'true'; } catch { return false; }
  })();
  // intro 只在「首次造訪 + 桌面 + 首頁」播
  const shouldSkipIntro = introCompleted || !isOnHomePage || isMobile;

  const [animateSaturn, setAnimateSaturn] = useState(shouldSkipIntro);
  const [saturnZIndex, setSaturnZIndex] = useState(1);
  const [introVisible, setIntroVisible] = useState(!shouldSkipIntro);
  const [backdropReady, setBackdropReady] = useState(shouldSkipIntro && !isMobile);
  const introCompleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleExplosionStart = () => {
    setSaturnZIndex(10000);
    setTimeout(() => { setAnimateSaturn(true); }, 200);
  };
  // intro 加速期已過 → 現在才掛 3D 背景(土星在 explosion 前約 1.1s 就緒)
  const handlePreReveal = useCallback(() => {
    setBackdropReady(true);
    document.documentElement.classList.remove('intro-pending'); // 內容在 intro bloom 下淡入(配合 __root pre-paint gate)
  }, []);
  const handleAnimationComplete = () => {
    try { sessionStorage.setItem('introCompleted', 'true'); } catch { /* sessionStorage 不可用就略過 */ }
    clearTimeout(introCompleteTimeoutRef.current ?? undefined);
    introCompleteTimeoutRef.current = setTimeout(() => {
      setIntroVisible(false);
      setSaturnZIndex(1);
    }, 300);
  };

  useEffect(() => () => { clearTimeout(introCompleteTimeoutRef.current ?? undefined); }, []);

  // intro 不會播(重訪/非首頁/手機 → introVisible 一開始就 false)→ 立即放行內容,別讓 pre-paint gate 卡住。
  useEffect(() => {
    if (!introVisible) document.documentElement.classList.remove('intro-pending');
  }, [introVisible]);

  if (isMobile) return null; // 手機完全不載 vendor-three

  return (
    <>
      {introVisible && (
        <IntroAnimation
          onAnimationComplete={handleAnimationComplete}
          onExplosionStart={handleExplosionStart}
          onPreReveal={handlePreReveal}
        />
      )}
      {backdropReady && (
        <Suspense fallback={null}>
          <LazySpaceBackdrop
            isMobile={isMobile}
            isOnHomePage={isOnHomePage}
            animateSaturn={animateSaturn}
            saturnZIndex={saturnZIndex}
          />
        </Suspense>
      )}
    </>
  );
}
