import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RocketIcon, type RocketIconHandle } from '@animateicons/react/lucide';
import './BackToTopButton.css';

interface BackToTopButtonProps {
  isHomePage?: boolean;
}

function BackToTopButton({ isHomePage = false }: BackToTopButtonProps) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hover, setHover] = useState(false);
  const rocketRef = useRef<RocketIconHandle>(null);

  useEffect(() => {
    const onScroll = () => {
      const y = window.pageYOffset;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setIsVisible(y > 300);
      setProgress(max > 0 ? Math.min(y / max, 1) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener('scroll', onScroll); };
  }, []);

  useEffect(() => {
    if (!rocketRef.current) return;
    if (hover) rocketRef.current.startAnimation();
    else rocketRef.current.stopAnimation();
  }, [hover]);

  if (!isHomePage) return null;

  const scrollToTop = () => {
    // 點下去直接讓 rocket 動一下，給「發射」回饋
    rocketRef.current?.startAnimation();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Circumference of the progress ring (r=22 → 2πr ≈ 138.23)
  const RADIUS = 22;
  const CIRC = 2 * Math.PI * RADIUS;
  const dashOffset = CIRC * (1 - progress);

  return (
    <button
      className={`back-to-top ${isVisible ? 'is-visible' : ''}`}
      onClick={scrollToTop}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={t('backToTop.label')}
    >
      <svg className="back-to-top-ring" viewBox="0 0 48 48" aria-hidden>
        <circle
          className="back-to-top-ring-track"
          cx="24" cy="24" r={RADIUS}
          fill="none" strokeWidth="1.5"
        />
        <circle
          className="back-to-top-ring-progress"
          cx="24" cy="24" r={RADIUS}
          fill="none" strokeWidth="1.5"
          strokeDasharray={CIRC}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 24 24)"
        />
      </svg>
      <span className="back-to-top-icon">
        <RocketIcon ref={rocketRef} size={20} duration={0.8} />
      </span>
    </button>
  );
}

export default BackToTopButton;
