import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react'; // Import useCallback, lazy, Suspense
import { ParallaxProvider } from 'react-scroll-parallax';
import { useInView } from 'react-intersection-observer'; // Import useInView
import LoadingScreen from './components/LoadingScreen'; // Import LoadingScreen
import BookshelfLoading from './components/BookshelfLoading'; // Import BookshelfLoading
import Saturn3D from './components/Saturn3D';
import IntroAnimation from './components/IntroAnimation';
import Header from './components/Header';
import Hero from './components/Hero';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'; // Import useLocation
import CursorTrail from './components/CursorTrail';
import ScrollToTop from './components/ScrollToTop'; // <--- 導入 ScrollToTop 元件
import { PageVisibilityProvider } from './contexts/PageVisibilityContext';
import RandomShootingStars from './components/RandomShootingStars';
import RandomComets from './components/RandomComets'; // 導入彗星元件
import RandomUFOs from './components/RandomUFOs'; // 導入 UFO 元件
import BackToTopButton from './components/BackToTopButton'; // 導入回到頂部按鈕
import TwinklingStars from './components/TwinklingStars'; // <--- 導入閃爍星星元件
import ForegroundStars from './components/ForegroundStars'; // <--- 導入前景星星元件
import { Stars, Points, PointMaterial } from '@react-three/drei'; // Import Stars, Points, and PointMaterial
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react'; // Add useMemo
import * as THREE from 'three'; // Import THREE
import './App.css';
import './components/AdminFixes.css';

// --- Lazy Loaded Components ---
const LazyAboutMe = lazy(() => import('./components/AboutMe'));
const LazyExpertise = lazy(() => import('./components/Expertise'));
const LazyWorkExperience = lazy(() => import('./components/WorkExperience'));
const LazySchoolClubs = lazy(() => import('./components/SchoolClubs'));
const LazyPortfolio = lazy(() => import('./components/Portfolio'));
const LazyContact = lazy(() => import('./components/Contact'));
const LazyFooter = lazy(() => import('./components/Footer'));
const LazyPhotoGallery = lazy(() => import('./components/PhotoGallery'));
const LazyTransitionAnimation = lazy(() => import('./components/TransitionAnimation'));
const LazyBlog = lazy(() => import('./components/Blog'));
const LazyBlogPost = lazy(() => import('./components/BlogPost'));
const LazyAdminLogin = lazy(() => import('./components/AdminLogin'));
const LazyAdminPanel = lazy(() => import('./components/AdminPanel'));
const LazyAdvancedEditor = lazy(() => import('./components/AdvancedEditor'));
const LazyActivity = lazy(() => import('./components/Activity'));
const LazyJourney = lazy(() => import('./components/Journey'));
const LazyNow = lazy(() => import('./components/Now'));
const LazyBookshelf = lazy(() => import('./components/Bookshelf'));
const LazyMusic = lazy(() => import('./components/Music'));

// --- Loading Fallback ---
const LoadingFallback = () => <div style={{ height: '100px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>載入中...</div>;

const AdminPlaceholder = ({ title }) => (
  <div style={{ padding: '2rem', color: 'white', background: '#1a202c', borderRadius: '8px', margin: '2rem' }}>
    <h2 style={{ borderBottom: '1px solid #333', paddingBottom: '1rem' }}>{title}</h2>
    <p style={{ marginTop: '1rem' }}>此頁面功能正在開發中。</p>
  </div>
);


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
      <main>
        <SectionWrapper id="home" onInViewChange={onSectionChange}>
          <Hero />
        </SectionWrapper>
        <Suspense fallback={<LoadingFallback />}><LazyTransitionAnimation /></Suspense>
        <SectionWrapper id="about-me" onInViewChange={onSectionChange}>
          <Suspense fallback={<LoadingFallback />}><LazyAboutMe /></Suspense>
        </SectionWrapper>
        <Suspense fallback={<LoadingFallback />}><LazyTransitionAnimation /></Suspense>
        <SectionWrapper id="expertise" onInViewChange={onSectionChange}>
          <Suspense fallback={<LoadingFallback />}><LazyExpertise /></Suspense>
        </SectionWrapper>
        <Suspense fallback={<LoadingFallback />}><LazyTransitionAnimation /></Suspense>
        <SectionWrapper id="work-experience" onInViewChange={onSectionChange}>
          <Suspense fallback={<LoadingFallback />}><LazyWorkExperience /></Suspense>
        </SectionWrapper>
        <Suspense fallback={<LoadingFallback />}><LazyTransitionAnimation /></Suspense>
        <SectionWrapper id="school-clubs" onInViewChange={onSectionChange}>
          <Suspense fallback={<LoadingFallback />}><LazySchoolClubs /></Suspense>
        </SectionWrapper>
        <Suspense fallback={<LoadingFallback />}><LazyTransitionAnimation /></Suspense>
        <SectionWrapper id="portfolio" onInViewChange={onSectionChange}>
          <Suspense fallback={<LoadingFallback />}><LazyPortfolio /></Suspense>
        </SectionWrapper>
        <Suspense fallback={<LoadingFallback />}><LazyTransitionAnimation /></Suspense>
        <SectionWrapper id="contact" onInViewChange={onSectionChange}>
          <Suspense fallback={<LoadingFallback />}><LazyContact /></Suspense>
        </SectionWrapper>
      </main>
    </>
  );
}

// --- 用於星空背景的內部元件 ---
function StarfieldScene({ mainStarsRef }) {
  const galaxyRef = useRef();
  const scrollSpeedMultiplier = useRef(1);
  const scrollTimeoutRef = useRef(null);
  const baseSpeedMultiplier = 1;
  const boostedSpeedMultiplier = 3;
  const scrollResetDelay = 150;

  useEffect(() => {
    const handleScroll = () => {
      scrollSpeedMultiplier.current = boostedSpeedMultiplier;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        scrollSpeedMultiplier.current = baseSpeedMultiplier;
      }, scrollResetDelay);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  useFrame((state, delta) => {
    const speedMultiplier = scrollSpeedMultiplier.current;
    if (mainStarsRef.current) {
      mainStarsRef.current.rotation.x += delta * 0.01 * speedMultiplier;
      mainStarsRef.current.rotation.y += delta * 0.02 * speedMultiplier;
    }
    if (galaxyRef.current) {
       galaxyRef.current.rotation.x += delta * 0.008 * speedMultiplier;
       galaxyRef.current.rotation.y += delta * 0.015 * speedMultiplier;
    }
  });

  return (
    <>
      <Suspense fallback={null}>
        <Stars
          ref={mainStarsRef}
          radius={100}
          depth={50}
          count={10000}
          factor={3.5}
          saturation={0.1}
          fade
          speed={0.5}
        />
        <Stars
          ref={galaxyRef}
          radius={90}
          depth={20}
          count={8000}
          factor={5}
          saturation={0.2}
          fade
          speed={0.3}
          rotation={[0, Math.PI / 3, Math.PI / 5]}
        />
      </Suspense>
    </>
  );
}

// --- 新增：太空碎片元件 ---
function SpaceDebris({ count = 200 }) {
  const pointsRef = useRef();
  const particlesPosition = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const distance = 100;
    for (let i = 0; i < count; i++) {
      const theta = THREE.MathUtils.randFloatSpread(360);
      const phi = THREE.MathUtils.randFloatSpread(360);
      const r = THREE.MathUtils.randFloat(distance * 0.5, distance);
      const x = r * Math.sin(theta) * Math.cos(phi);
      const y = r * Math.sin(theta) * Math.sin(phi);
      const z = r * Math.cos(theta) + THREE.MathUtils.randFloatSpread(20);
      positions.set([x, y, z], i * 3);
    }
    return positions;
  }, [count]);

  const particleData = useMemo(() =>
    Array.from({ length: count }, () => ({
      velocity: new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(0.02),
        THREE.MathUtils.randFloatSpread(0.02),
        THREE.MathUtils.randFloatSpread(0.02)
      ),
    })),
  [count]);

  useFrame((state, delta) => {
    if (pointsRef.current) {
      const positions = pointsRef.current.geometry.attributes.position.array;
      const distance = 100;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        positions[i3] += particleData[i].velocity.x * delta * 50;
        positions[i3 + 1] += particleData[i].velocity.y * delta * 50;
        positions[i3 + 2] += particleData[i].velocity.z * delta * 50;

        if (Math.abs(positions[i3]) > distance) positions[i3] *= -0.99;
        if (Math.abs(positions[i3+1]) > distance) positions[i3+1] *= -0.99;
        if (positions[i3 + 2] > distance * 1.5) positions[i3 + 2] = -distance * 1.5;
        if (positions[i3 + 2] < -distance * 1.5) positions[i3 + 2] = distance * 1.5;
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <Points ref={pointsRef} positions={particlesPosition} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#555555"
        size={0.08}
        sizeAttenuation={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

// --- Layout Component to handle conditional rendering of Header/Footer ---
function Layout({ activeSection, onSectionChange }) {
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');

  return (
    <div
      className="main-content-container"
      style={{ position: 'relative', zIndex: 10 }}
    >
      {!isAdminPage && <Header activeSection={activeSection} style={{ position: 'sticky', top: 0, zIndex: 20 }} />}
      <main>
        <Routes>
          <Route path="/" element={<MainPage onSectionChange={onSectionChange} />} />
          <Route path="/photos" element={<Suspense fallback={<LoadingFallback />}><LazyPhotoGallery /></Suspense>} />
          <Route path="/blog" element={<Suspense fallback={<LoadingFallback />}><LazyBlog /></Suspense>} />
          <Route path="/blog/:id" element={<Suspense fallback={<LoadingFallback />}><LazyBlogPost /></Suspense>} />
          <Route path="/bookshelf" element={<Suspense fallback={<BookshelfLoading />}><LazyBookshelf /></Suspense>} />
          <Route path="/activity" element={<Suspense fallback={<LoadingFallback />}><LazyActivity /></Suspense>} />
          <Route path="/journey" element={<Suspense fallback={<LoadingFallback />}><LazyJourney /></Suspense>} />
          <Route path="/now" element={<Suspense fallback={<LoadingFallback />}><LazyNow /></Suspense>} />
          <Route path="/music" element={<Suspense fallback={<LoadingFallback />}><LazyMusic /></Suspense>} />
          <Route path="/admin/login" element={<Suspense fallback={<LoadingFallback />}><LazyAdminLogin /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={<LoadingFallback />}><LazyAdminPanel /></Suspense>} />
          <Route path="/admin/create" element={<Suspense fallback={<LoadingFallback />}><LazyAdvancedEditor /></Suspense>} />
          <Route path="/admin/edit/:id" element={<Suspense fallback={<LoadingFallback />}><LazyAdvancedEditor /></Suspense>} />
          <Route path="/admin/posts" element={<AdminPlaceholder title="文章管理" />} />
          <Route path="/admin/comments" element={<AdminPlaceholder title="留言審核" />} />
          <Route path="/admin/stats" element={<AdminPlaceholder title="數據統計" />} />
        </Routes>
      </main>
      {!isAdminPage && (
        <Suspense fallback={<LoadingFallback />}>
          <LazyFooter style={{ zIndex: 20 }}/>
        </Suspense>
      )}
    </div>
  );
}

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const introCompleted = sessionStorage.getItem('introCompleted') === 'true';
  const [animateSaturn, setAnimateSaturn] = useState(introCompleted);
  const [showMainHtmlContent, setShowMainHtmlContent] = useState(introCompleted);
  const [saturnZIndex, setSaturnZIndex] = useState(1);
  const [introVisible, setIntroVisible] = useState(!introCompleted);
  const introCompleteTimeoutRef = useRef(null);
  const sharedRotationRef = useRef();
  const [activeSection, setActiveSection] = useState('home');
  const [isPageVisible, setIsPageVisible] = useState(true);

  const handleSectionChange = useCallback((sectionId) => {
    setActiveSection(sectionId);
  }, []);

  const handleExplosionStart = () => {
    setSaturnZIndex(10000);
    setTimeout(() => {
        setAnimateSaturn(true);
    }, 200);
  };

  const handleAnimationComplete = () => {
    setShowMainHtmlContent(true);
    setSaturnZIndex(1);
    try {
      sessionStorage.setItem('introCompleted', 'true');
    } catch (error) {
      console.error("無法寫入 sessionStorage", error);
    }
    clearTimeout(introCompleteTimeoutRef.current);
    introCompleteTimeoutRef.current = setTimeout(() => {
      setIntroVisible(false);
    }, 300);
  };

  useEffect(() => {
    return () => {
      clearTimeout(introCompleteTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);
    return () => clearTimeout(timer);
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

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <BrowserRouter>
      <ScrollToTop />
      <ParallaxProvider>
        <PageVisibilityProvider isVisible={isPageVisible}>
          <div className="App">
            {introVisible && (
              <IntroAnimation
                onAnimationComplete={handleAnimationComplete}
                onExplosionStart={handleExplosionStart}
              />
            )}
            <Canvas
              camera={{ position: [0, 0, 5] }}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: saturnZIndex,
                pointerEvents: 'none'
              }}
            >
              <Suspense fallback={null}>
                <StarfieldScene mainStarsRef={sharedRotationRef} />
                <SpaceDebris count={300} />
                <Saturn3D animate={animateSaturn} />
                <TwinklingStars rotationRef={sharedRotationRef} count={800} />
              </Suspense>
            </Canvas>
            <ForegroundStars count={15} />
            <RandomShootingStars />
            <RandomComets />
            <RandomUFOs />
            {showMainHtmlContent && (
               <Layout activeSection={activeSection} onSectionChange={handleSectionChange} />
            )}
            <CursorTrail style={{ position: 'fixed', top: 0, left: 0, zIndex: 50, pointerEvents: 'none' }}/>
            <BackToTopButton />
          </div>
        </PageVisibilityProvider>
      </ParallaxProvider>
    </BrowserRouter>
  );
}

export default App;
