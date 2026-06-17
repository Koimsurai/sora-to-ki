import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react'; // Import useCallback, lazy, Suspense
import { ParallaxProvider } from 'react-scroll-parallax';
import { useInView } from 'react-intersection-observer'; // Import useInView
import Header from './components/Header';
import Hero from './components/Hero';
import IntroAnimation from './components/IntroAnimation';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useMediaQuery } from 'usehooks-ts'; // 導入 useMediaQuery
import ScrollToTop from './components/ScrollToTop'; // <--- 導入 ScrollToTop 元件
import { PageVisibilityProvider } from './contexts/PageVisibilityContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import NebulaBackground from './components/NebulaBackground'; // 首頁 + Blog 共用星雲背景
import CSSStarfield from './components/CSSStarfield'; // 秒出的 CSS 星空底（Three.js 載入前的 placeholder）
import BackToTopButton from './components/BackToTopButton'; // 導入回到頂部按鈕
import { ArticlePreviewProvider } from './components/article-preview/ArticlePreviewContext';
import ArticlePreviewCard from './components/article-preview/ArticlePreviewCard';
import { useRef } from 'react';
import './App.css';
import { useHtmlLang } from './hooks/useHtmlLang';

// Three.js 太空背景（星空/土星/intro/特效）抽成 lazy chunk：vendor-three 離開主 bundle，
// 首屏內容不必等 1.1MB three.js parse；掛載延到首次繪製之後（見 backdropReady）。
const LazySpaceBackdrop = lazy(() => import('./components/SpaceBackdrop'));

// --- Lazy Loaded Components ---
// 履歷叢集移到 /about（AboutPage 內含 AboutMe/Expertise/Work/Clubs/Journey）；作品獨立 /portfolio
const LazyAboutPage = lazy(() => import('./components/AboutPage'));
const LazyPortfolio = lazy(() => import('./components/Portfolio'));
// Contact section 改為 HomeLately（動態帶 + 今日訊號收尾）；訊號區塊內部承接 id="contact" 錨點
const LazyHomeLately = lazy(() => import('./components/HomeLately'));
const LazyFooter = lazy(() => import('./components/Footer'));
const LazyPhotoGallery = lazy(() => import('./components/PhotoGallery'));
const LazyTransitionAnimation = lazy(() => import('./components/TransitionAnimation'));
const LazyBlog = lazy(() => import('./components/Blog'));
const LazyBlogPost = lazy(() => import('./components/BlogPost'));
const LazyAdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const LazyAdminDashboard = lazy(() => import('./components/admin/AdminDashboard'));
const LazyAdvancedEditor = lazy(() => import('./components/AdvancedEditor'));
const LazyPostEditor = lazy(() => import('./components/admin/PostEditor'));
const LazyPostsList = lazy(() => import('./components/admin/PostsList'));
const LazyCategoriesManager = lazy(() => import('./components/admin/CategoriesManager'));
const LazyTagsManager = lazy(() => import('./components/admin/TagsManager'));
const LazyBooksManager = lazy(() => import('./components/admin/BooksManager'));
const LazyCollectionManager = lazy(() => import('./components/admin/CollectionManager'));
const LazyArticleGenerator = lazy(() => import('./components/admin/ArticleGenerator'));
const LazyCommentsManager = lazy(() => import('./components/admin/CommentsManager'));
const LazySubscribersManager = lazy(() => import('./components/admin/SubscribersManager'));
const LazyUsersManager = lazy(() => import('./components/admin/UsersManager'));
const LazyActivity = lazy(() => import('./components/Activity'));
const LazyMessages = lazy(() => import('./components/Messages'));
const LazyFriends = lazy(() => import('./components/Friends'));
const LazyBookshelf = lazy(() => import('./components/Bookshelf'));
const LazyMusic = lazy(() => import('./components/Music'));
const LazyCinema = lazy(() => import('./components/Cinema'));
const LazyAnime = lazy(() => import('./components/Anime'));
const LazyWatch = lazy(() => import('./components/Watch'));
const LazyWatchLibrary = lazy(() => import('./components/WatchLibrary'));
const LazyThinking = lazy(() => import('./components/Thinking'));
const LazyThinkingDetail = lazy(() => import('./components/ThinkingDetail'));
const LazySetup = lazy(() => import('./components/Setup'));
const LazyAboutSite = lazy(() => import('./components/AboutSite'));
const LazyHistory = lazy(() => import('./components/History'));
const LazyOAuthCallback = lazy(() => import('./components/OAuthCallback'));
const LazyUnsubscribe = lazy(() => import('./components/Unsubscribe'));
const LazyNotFound = lazy(() => import('./components/NotFound'));
const LazyCommandPalette = lazy(() => import('./components/CommandPalette'));

// --- Loading Fallback ---
import KoimLoader from './components/KoimLoader';
const LoadingFallback = () => <KoimLoader inline size="sm" />;

const AdminPlaceholder = ({ title }) => (
  <div style={{ padding: '2rem', color: 'white', background: '#1a202c', borderRadius: '8px', margin: '2rem' }}>
    <h2 style={{ borderBottom: '1px solid #333', paddingBottom: '1rem' }}>{title}</h2>
    <p style={{ marginTop: '1rem' }}>此頁面功能正在開發中。</p>
  </div>
);

// 路由保護：非 ADMIN/OWNER 導回首頁
function RequireAdmin({ children }) {
  const { user, isLoggedIn, loading } = useAuth();
  if (loading) return <LoadingFallback />;
  if (!isLoggedIn || !user?.role || (user.role !== 'ADMIN' && user.role !== 'OWNER')) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function LocationTracker({ onPathChange }) {
  const location = useLocation();
  useEffect(() => { onPathChange(location.pathname); }, [location.pathname, onPathChange]);
  return null;
}

// --- Section Wrapper Component ---
// This component wraps each section and uses useInView to track visibility
function SectionWrapper({ id, children, onInViewChange }) {
  const { ref, inView } = useInView({
    threshold: 0.5, // Trigger when 50% of the section is visible
    triggerOnce: false, // Keep observing
  });

  useEffect(() => {
    if (inView) {
      onInViewChange(id);
    }
  }, [inView, id, onInViewChange]);

  return (
    <section id={id} ref={ref}>
      {children}
    </section>
  );
}


// 主頁元件 - Modified to use SectionWrapper
function MainPage({ onSectionChange }) { // Accept callback prop
  return (
    <>
      <NebulaBackground />
      <main>
        {/* 首頁瘦身（Innei 式內容優先）：Hero → Lately（含軌跡與訊號收尾）。
            履歷叢集（About/Expertise/Work/Clubs/Journey）→ /about；作品 → /portfolio */}
        <SectionWrapper id="home" onInViewChange={onSectionChange}>
          <Hero />
        </SectionWrapper>
        <Suspense fallback={<LoadingFallback />}><LazyTransitionAnimation /></Suspense>
        <SectionWrapper id="lately" onInViewChange={onSectionChange}>
          <Suspense fallback={<LoadingFallback />}><LazyHomeLately /></Suspense>
        </SectionWrapper>
      </main>
    </>
  );
}


// --- Layout Component to handle conditional rendering of Header/Footer ---
function Layout({ activeSection, onSectionChange }) {
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');
  const isPhotoPage = location.pathname === '/photos';

  return (
    <div
      className="main-content-container"
      style={{
        position: 'relative',
        zIndex: 10,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {!isAdminPage && <Header activeSection={activeSection} />}
      <main style={{ flex: '1 0 auto' }}>
        <Routes>
          <Route path="/" element={<MainPage onSectionChange={onSectionChange} />} />
          <Route path="/photos" element={<Suspense fallback={<LoadingFallback />}><LazyPhotoGallery /></Suspense>} />
          <Route path="/blog" element={<Suspense fallback={<LoadingFallback />}><LazyBlog /></Suspense>} />
          <Route path="/blog/:id" element={<Suspense fallback={<LoadingFallback />}><LazyBlogPost /></Suspense>} />
          <Route path="/en/blog/:id" element={<Suspense fallback={<LoadingFallback />}><LazyBlogPost /></Suspense>} />
          <Route path="/zh-cn/blog/:id" element={<Suspense fallback={<LoadingFallback />}><LazyBlogPost /></Suspense>} />
          <Route path="/ja/blog/:id" element={<Suspense fallback={<LoadingFallback />}><LazyBlogPost /></Suspense>} />
          <Route path="/ko/blog/:id" element={<Suspense fallback={<LoadingFallback />}><LazyBlogPost /></Suspense>} />
          <Route path="/bookshelf" element={<Suspense fallback={<KoimLoader fullscreen text="載入書籍" />}><LazyBookshelf /></Suspense>} />
          <Route path="/activity" element={<Suspense fallback={<LoadingFallback />}><LazyActivity /></Suspense>} />
          <Route path="/about" element={<Suspense fallback={<LoadingFallback />}><LazyAboutPage /></Suspense>} />
          <Route path="/portfolio" element={<Suspense fallback={<LoadingFallback />}><LazyPortfolio /></Suspense>} />
          {/* 舊 /journey 已併入 /about（成長軌跡 section） */}
          <Route path="/journey" element={<Navigate to="/about#journey" replace />} />
          <Route path="/messages" element={<Suspense fallback={<LoadingFallback />}><LazyMessages /></Suspense>} />
          <Route path="/friends" element={<Suspense fallback={<LoadingFallback />}><LazyFriends /></Suspense>} />
          <Route path="/music" element={<Suspense fallback={<LoadingFallback />}><LazyMusic /></Suspense>} />
          <Route path="/cinema" element={<Suspense fallback={<LoadingFallback />}><LazyCinema /></Suspense>} />
          <Route path="/anime" element={<Suspense fallback={<LoadingFallback />}><LazyAnime /></Suspense>} />
          <Route path="/watch" element={<Suspense fallback={<LoadingFallback />}><LazyWatch /></Suspense>} />
          <Route path="/watch/library" element={<Suspense fallback={<LoadingFallback />}><LazyWatchLibrary /></Suspense>} />
          {/* 碎念/思考 feed — 未公開（不在導覽列） */}
          <Route path="/thinking" element={<Suspense fallback={<LoadingFallback />}><LazyThinking /></Suspense>} />
          <Route path="/thinking/:id" element={<Suspense fallback={<LoadingFallback />}><LazyThinkingDetail /></Suspense>} />
          <Route path="/setup" element={<Suspense fallback={<LoadingFallback />}><LazySetup /></Suspense>} />
          <Route path="/about-site" element={<Suspense fallback={<LoadingFallback />}><LazyAboutSite /></Suspense>} />
          <Route path="/history" element={<Suspense fallback={<LoadingFallback />}><LazyHistory /></Suspense>} />
          <Route path="/auth/callback" element={<Suspense fallback={<LoadingFallback />}><LazyOAuthCallback /></Suspense>} />
          <Route path="/unsubscribe" element={<Suspense fallback={<LoadingFallback />}><LazyUnsubscribe /></Suspense>} />
          {/* 後台路由 - 需要 ADMIN/OWNER 權限 */}
          <Route path="/admin/login" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/*" element={
            <RequireAdmin>
              <Suspense fallback={<LoadingFallback />}>
                <LazyAdminLayout />
              </Suspense>
            </RequireAdmin>
          }>
            <Route index element={<Suspense fallback={<LoadingFallback />}><LazyAdminDashboard /></Suspense>} />
            <Route path="dashboard" element={<Suspense fallback={<LoadingFallback />}><LazyAdminDashboard /></Suspense>} />
            <Route path="posts" element={<Suspense fallback={<LoadingFallback />}><LazyPostsList /></Suspense>} />
            <Route path="posts/create" element={<Suspense fallback={<LoadingFallback />}><LazyPostEditor /></Suspense>} />
            <Route path="posts/edit/:id" element={<Suspense fallback={<LoadingFallback />}><LazyPostEditor /></Suspense>} />
            <Route path="categories" element={<Suspense fallback={<LoadingFallback />}><LazyCategoriesManager /></Suspense>} />
            <Route path="tags" element={<Suspense fallback={<LoadingFallback />}><LazyTagsManager /></Suspense>} />
            <Route path="books" element={<Suspense fallback={<LoadingFallback />}><LazyBooksManager /></Suspense>} />
            <Route path="collection" element={<Suspense fallback={<LoadingFallback />}><LazyCollectionManager /></Suspense>} />
            <Route path="article-generator" element={<Suspense fallback={<LoadingFallback />}><LazyArticleGenerator /></Suspense>} />
            <Route path="comments" element={<Suspense fallback={<LoadingFallback />}><LazyCommentsManager /></Suspense>} />
            <Route path="subscribers" element={<Suspense fallback={<LoadingFallback />}><LazySubscribersManager /></Suspense>} />
            <Route path="users" element={<Suspense fallback={<LoadingFallback />}><LazyUsersManager /></Suspense>} />
            <Route path="notes" element={<AdminPlaceholder title="日記管理" />} />
          </Route>
          {/* 未知路由顯示 404 頁面 */}
          <Route path="*" element={<Suspense fallback={<LoadingFallback />}><LazyNotFound /></Suspense>} />
        </Routes>
      </main>
      {!isAdminPage && !isPhotoPage && (
        <Suspense fallback={<LoadingFallback />}>
          <LazyFooter style={{ zIndex: 20 }} />
        </Suspense>
      )}
      {!isAdminPage && (
        <Suspense fallback={null}>
          <LazyCommandPalette />
        </Suspense>
      )}
    </div>
  );
}

// 只有首頁 "/" 才播放 intro 動畫，其他路由一律跳過
const INTRO_ROUTES = new Set(['/']);

function App() {
  useHtmlLang(); // 把 i18n 當前語系同步到 <html lang>，CSS :lang() 跟著切 CJK 字體
  const isMobile = useMediaQuery('(max-width: 768px)'); // 偵測是否為手機版
  const introCompleted = sessionStorage.getItem('introCompleted') === 'true';
  const isIntroRoute = INTRO_ROUTES.has(window.location.pathname);
  // 手機不跑 WebGL（土星/星空全改 CSS）也不播 intro Canvas —— 直接進內容
  const shouldSkipIntro = introCompleted || !isIntroRoute || isMobile;
  const [animateSaturn, setAnimateSaturn] = useState(shouldSkipIntro);
  const [showMainHtmlContent, setShowMainHtmlContent] = useState(shouldSkipIntro);
  const [saturnZIndex, setSaturnZIndex] = useState(1);
  const [introVisible, setIntroVisible] = useState(!shouldSkipIntro);
  // Three.js 背景掛載時機：
  //  ‧ 有 intro（首訪首頁）→ 延到 preReveal(1800ms) 才掛，讓 intro 加速期(0~1800ms)的 2D 動畫
  //    獨佔主執行緒不被 Saturn 的 WebGL 初始化/shader 編譯卡到；preReveal→explosion 還有 1.1s 讓土星就緒
  //  ‧ 無 intro（重訪/非首頁/手機已排除）→ 直接掛（非首頁只有 worker 星空，主執行緒便宜）
  const [backdropReady, setBackdropReady] = useState(shouldSkipIntro && !isMobile);
  const introCompleteTimeoutRef = useRef(null);
  const sharedRotationRef = useRef();
  const [activeSection, setActiveSection] = useState('home');
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [currentPath, setCurrentPath] = useState('/');
  const isOnHomePage = currentPath === '/';
  const handlePathChange = useCallback((p) => setCurrentPath(p), []);

  const handleSectionChange = useCallback((sectionId) => {
    setActiveSection(sectionId);
  }, []);

  const handleExplosionStart = () => {
    setSaturnZIndex(10000);
    setTimeout(() => {
      setAnimateSaturn(true);
    }, 200);
  };

  // Mount Layout while the white flash is still at peak so the heavy
  // initial React render is hidden under the bloom — avoids a visible
  // jank at the moment the intro fades into the home page.
  const handlePreReveal = useCallback(() => {
    setShowMainHtmlContent(true);
    setBackdropReady(true); // intro 加速期已過，現在才掛 3D 背景（土星在 explosion 前約 1.1s 就緒）
  }, []);

  const handleAnimationComplete = () => {
    setShowMainHtmlContent(true);
    try {
      sessionStorage.setItem('introCompleted', 'true');
    } catch (error) {
      console.error("無法寫入 sessionStorage", error);
    }
    clearTimeout(introCompleteTimeoutRef.current);
    // Keep Saturn at z=10000 throughout the fade so the intro container
    // (which still has a dark background while fading) can't occlude it.
    // Both the unmount and the z-index drop happen in the same tick after
    // the fade completes — Saturn is fully positioned and stable by then.
    introCompleteTimeoutRef.current = setTimeout(() => {
      setIntroVisible(false);
      setSaturnZIndex(1);
    }, 300);
  };

  useEffect(() => {
    return () => {
      clearTimeout(introCompleteTimeoutRef.current);
    };
  }, []);


  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <LocationTracker onPathChange={handlePathChange} />
        <ParallaxProvider>
          <PageVisibilityProvider isVisible={isPageVisible}>
            <ArticlePreviewProvider>
            <div className="App">
              {/* CSS 星空底：手機唯一背景（零 WebGL）；桌面則是 3D 載入前的秒出 placeholder */}
              <CSSStarfield />
              {/* 以下 WebGL（intro + Three.js 場景）只在桌面跑；手機完全不載 vendor-three */}
              {!isMobile && introVisible && (
                <IntroAnimation
                  onAnimationComplete={handleAnimationComplete}
                  onExplosionStart={handleExplosionStart}
                  onPreReveal={handlePreReveal}
                />
              )}
              {!isMobile && backdropReady && (
                <Suspense fallback={null}>
                  <LazySpaceBackdrop
                    isMobile={isMobile}
                    isOnHomePage={isOnHomePage}
                    animateSaturn={animateSaturn}
                    saturnZIndex={saturnZIndex}
                    sharedRotationRef={sharedRotationRef}
                  />
                </Suspense>
              )}
              {showMainHtmlContent && (
                <Layout activeSection={activeSection} onSectionChange={handleSectionChange} />
              )}
              <BackToTopButton isHomePage={isOnHomePage} />
              <ArticlePreviewCard />
            </div>
            </ArticlePreviewProvider>
          </PageVisibilityProvider>
        </ParallaxProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
