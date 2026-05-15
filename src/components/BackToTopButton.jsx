import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRocket } from '@fortawesome/free-solid-svg-icons';
import './BackToTopButton.css';

function BackToTopButton({ isHomePage = false }) {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.pageYOffset;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setIsVisible(y > 300);
      setProgress(max > 0 ? Math.min(y / max, 1) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!isHomePage) return null;

  const scrollToTop = () => {
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
      aria-label="回到頂部"
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
      <FontAwesomeIcon icon={faRocket} className="back-to-top-icon" />
    </button>
  );
}

export default BackToTopButton;
