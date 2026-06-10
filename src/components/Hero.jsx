import React, { useState, useEffect } from 'react'; // Import useState and useEffect
import { useTranslation } from 'react-i18next';
// Remove motion import as it's no longer used for text
import { Parallax } from 'react-scroll-parallax'; // 引入 Parallax
// Remove unused particle imports
// ✅ 優化: 使用解構引入 (Vite 會自動 tree-shake)
import { FaGithub, FaLinkedin, FaInstagram, FaFacebook, FaRss, FaEnvelope, FaSpotify } from 'react-icons/fa';
import SEOHead from './SEOHead';
import './Hero.css';
import meImage from '../assets/me.jpg'; // 導入頭像圖片

// Helper function for typing effect
const useTypingEffect = (text, speed = 100, startDelay = 0) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const hasStartedRef = React.useRef(false); // Use useRef to track if started

  useEffect(() => {
    // Always reset state when dependencies change
    setDisplayedText('');
    setIsTypingComplete(false);
    hasStartedRef.current = false; // Reset started flag

    let index = 0;
    let intervalId = null;
    let startTimeoutId = null;

    // Only proceed if the delay is a finite number
    if (isFinite(startDelay)) {
      const startEffect = () => {
        // Prevent starting if already started (e.g., due to fast re-renders)
        if (hasStartedRef.current) return;
        hasStartedRef.current = true; // Mark as started

        intervalId = setInterval(() => {
          if (index < text.length) {
            setDisplayedText(text.slice(0, index + 1));
            index++;
          } else {
            clearInterval(intervalId);
            setIsTypingComplete(true);
          }
        }, speed);
      };

      // Set the timeout to start the effect after the delay
      startTimeoutId = setTimeout(startEffect, startDelay);
    }

    // Cleanup function: clear timeout and interval
    return () => {
      if (startTimeoutId) clearTimeout(startTimeoutId);
      if (intervalId) clearInterval(intervalId);
    };
    // Dependencies: Effect should re-run if text, speed, or startDelay changes.
    // The logic inside handles the case where startDelay becomes finite.
  }, [text, speed, startDelay]);

  return { displayedText, isTypingComplete };
};


function Hero() {
  const { t } = useTranslation();
  const fullHeading = t('hero.greeting');
  const fullTagline = t('hero.tagline');

  // Apply typing effect hook（fullHeading/Tagline 變動會重觸發打字效果，切語系時自動重打）
  const { displayedText: displayedHeading, isTypingComplete: headingComplete } = useTypingEffect(fullHeading, 100, 1000); // Start heading after 1000ms (Increased delay)
  const { displayedText: displayedTagline, isTypingComplete: taglineComplete } = useTypingEffect(fullTagline, 80, headingComplete ? 200 : Infinity); // Start tagline 200ms after heading finishes

  // 根據 Figma 設計和履歷內容
  return (
    <section // 恢復為普通 section
      id="home"
      className="hero-section"
    >
      <SEOHead
        title={null}
        description={t('hero.description')}
        path="/"
      />
      {/* 移除 Saturn3D 和 Particles 的渲染 */}

      {/* Keep motion.div for overall content animation, but remove whileInView for text */}
      <div className="home-hero-content">
        {/* Apply Parallax, but remove motion from h1 */}
        <Parallax speed={10}> {/* 稍微快一點 */}
          {/* Use pre-wrap to handle newline characters */}
          <h1 className={`typing-text ${headingComplete ? 'typing-complete' : ''}`} style={{ whiteSpace: 'pre-wrap' }}>
            {displayedHeading}
          </h1>
        </Parallax>
        {/* Apply Parallax, but remove motion from p */}
        <Parallax speed={5}> {/* 比標題慢一點，比背景快 */}
          {/* Use pre-wrap to handle newline characters in tagline */}
          <p className={`tagline typing-text ${taglineComplete ? 'typing-complete' : ''}`} style={{ whiteSpace: 'pre-wrap' }}>
            {displayedTagline}
          </p>
        </Parallax>
        {/* Description removed and moved to AboutMe component */}
        {/* 可以考慮加入 Figma 中的 "A brave climber..." 或其他標語 */}

        {/* Animate actions fade-in after tagline finishes */}
        <div className={`hero-actions ${taglineComplete ? 'fade-in' : ''}`}>
          <div className="social-links">
            <a href="https://github.com/timo9378" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
              <FaGithub />
            </a>
            <a href="https://www.linkedin.com/in/%E6%B3%B0%E5%92%8C-%E6%A5%8A-292338352/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
              <FaLinkedin />
            </a>
            <a href="https://www.instagram.com/koimsurai.23/?hl=zh-tw" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
              <FaInstagram />
            </a>
            <a href="https://www.facebook.com/profile.php?id=100003126780663" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
              <FaFacebook />
            </a>
            <a href="https://open.spotify.com/user/x6l1h2n0fxtivlao8prrfq1pj?si=b31c38eb1a734038" target="_blank" rel="noopener noreferrer" aria-label="Spotify">
              <FaSpotify />
            </a>
            <a href="mailto:timo9378@gmail.com" aria-label="Email">
              <FaEnvelope />
            </a>
            <a href="/api/rss" target="_blank" rel="noopener noreferrer" aria-label="RSS">
              <FaRss />
            </a>
          </div>
          <a href="#contact" className="cta-button">{t('hero.contactCta')}</a>
        </div>
      </div> {/* Close home-hero-content div */}

      {/* 新增頭像區塊 */}
      <div className="hero-avatar-wrapper">
        <img
          src={meImage}
          alt="Koimsurai Avatar"
          className="hero-avatar"
          draggable="false"
          fetchpriority="high"
          decoding="async"
          width="280"
          height="280"
        />
      </div>

      {/* Figma 中還有一個巨大的背景文字 "Sergio"，可以考慮加入 */}
      <div className="background-text">Koimsurai</div> {/* 加入背景文字 */}

      {/* scroll 提示線 — 跟 hero-actions 同步淡入 */}
      <div className={`hero-scroll-cue ${taglineComplete ? 'fade-in' : ''}`} aria-hidden="true"><span /></div>
    </section> // 結束 section
  );
}

export default Hero;
