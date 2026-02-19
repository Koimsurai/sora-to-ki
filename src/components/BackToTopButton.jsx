import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRocket } from '@fortawesome/free-solid-svg-icons';
import './BackToTopButton.css';

function BackToTopButton({ isHomePage = false }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.pageYOffset > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  // 只在首頁顯示
  if (!isHomePage) return null;

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  return (
    <button
      className={`back-to-top-button ${isVisible ? 'show' : ''}`}
      onClick={scrollToTop}
      aria-label="回到頂部"
    >
      <FontAwesomeIcon icon={faRocket} />
    </button>
  );
}

export default BackToTopButton;
