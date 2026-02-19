import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  FaHome, FaUser, FaCode, FaBriefcase, FaUsers, FaImages,
  FaEnvelope, FaDownload, FaBookOpen, FaChevronDown, FaRss,
  FaClock, FaRoute, FaBook, FaMusic, FaFilm, FaCamera, FaDesktop,
} from 'react-icons/fa';
import { motion, LayoutGroup, AnimatePresence } from 'framer-motion';
import './Header.css';

function Header({ activeSection }) {
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showBlogMenu, setShowBlogMenu] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastScrollYRef = useRef(0);
  const moreMenuRef = useRef(null);
  const blogMenuRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isHomePage = location.pathname === '/';
  const isPhotoPage = location.pathname === '/photos';

  useEffect(() => {
    const handleScroll = () => {
      const sy = window.scrollY;
      setIsScrolled(sy > 50);
      if (sy <= 100) {
        setNavHidden(false);
        lastScrollYRef.current = sy;
      } else if (sy > lastScrollYRef.current + 10) {
        setNavHidden(true);
        lastScrollYRef.current = sy;
      } else if (sy < lastScrollYRef.current - 10) {
        setNavHidden(false);
        lastScrollYRef.current = sy;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (isHomePage && location.hash) {
      const t = setTimeout(() => {
        const el = document.getElementById(location.hash.replace('#', ''));
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return () => clearTimeout(t);
    }
  }, [location.hash, isHomePage]);

  useEffect(() => {
    const handler = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setShowMoreMenu(false);
      if (blogMenuRef.current && !blogMenuRef.current.contains(e.target)) setShowBlogMenu(false);
    };
    if (showMoreMenu || showBlogMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMoreMenu, showBlogMenu]);

  const handleNavClick = (e, sectionId) => {
    e.preventDefault();
    setMobileOpen(false);
    if (isHomePage) {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate('/#' + sectionId);
    }
  };

  const NavLink = ({ sectionId, icon: Icon, text, to }) => {
    const isActive = to
      ? location.pathname.startsWith(to)
      : activeSection === sectionId && isHomePage;

    const inner = (
      <>
        <Icon className="nav-icon" />
        <span className="nav-label-text">{text}</span>
        {isActive && (
          <motion.span
            layoutId="active-pill"
            className="active-pill"
            initial={false}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
      </>
    );

    if (to) {
      return (
        <li>
          <Link to={to} className={'nav-link ' + (isActive ? 'active' : '')} onClick={() => setMobileOpen(false)}>
            {inner}
          </Link>
        </li>
      );
    }

    return (
      <li>
        <a
          href={'#' + sectionId}
          className={'nav-link ' + (isActive ? 'active' : '')}
          onClick={(e) => handleNavClick(e, sectionId)}
        >
          {inner}
        </a>
      </li>
    );
  };

  const handleMouseMove = (e) => {
    const nav = e.currentTarget;
    const rect = nav.getBoundingClientRect();
    nav.style.setProperty('--mx', ((e.clientX - rect.left) / rect.width * 100) + '%');
    nav.style.setProperty('--my', ((e.clientY - rect.top) / rect.height * 100) + '%');
  };

  return (
    <header className={'site-header ' + (isScrolled ? 'scrolled ' : '') + (navHidden && !mobileOpen ? 'nav-hidden ' : '') + (isPhotoPage ? 'hidden' : '')}>
      <Link to="/" className="site-logo" onClick={() => setMobileOpen(false)}>
        <span className="logo-icon">✦</span>
        <span className="logo-text">Koimsurai</span>
      </Link>

      <button className={'mobile-toggle ' + (mobileOpen ? 'open' : '')} onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation">
        <span /><span /><span />
      </button>

      <nav className={'site-nav ' + (mobileOpen ? 'mobile-open' : '')}>
        <LayoutGroup>
          <ul className="nav-list" onMouseMove={handleMouseMove}>
            <NavLink sectionId="home" icon={FaHome} text="首頁" />
            <NavLink sectionId="about-me" icon={FaUser} text="關於" />
            <NavLink sectionId="expertise" icon={FaCode} text="技能" />
            <NavLink sectionId="portfolio" icon={FaImages} text="作品" />

            <li className="dropdown-wrap" ref={blogMenuRef}>
              <button
                className={'nav-link dropdown-trigger ' + (location.pathname.startsWith('/blog') || location.pathname.startsWith('/bookshelf') || location.pathname.startsWith('/movies') || location.pathname.startsWith('/music') ? 'active' : '')}
                onClick={() => setShowBlogMenu(!showBlogMenu)}
              >
                <FaBookOpen className="nav-icon" />
                <span className="nav-label-text">手記</span>
                <FaChevronDown className={'chevron ' + (showBlogMenu ? 'rotated' : '')} />
              </button>
              <AnimatePresence>
                {showBlogMenu && (
                  <motion.div className="dropdown-menu" initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.96 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
                    <Link to="/blog" className="dropdown-item" onClick={() => { setShowBlogMenu(false); setMobileOpen(false); }}>
                      <FaBookOpen className="dd-icon" /><div><span className="dd-title">筆記</span><span className="dd-desc">技術學習與思考</span></div>
                    </Link>
                    <Link to="/bookshelf" className="dropdown-item" onClick={() => { setShowBlogMenu(false); setMobileOpen(false); }}>
                      <FaBook className="dd-icon" /><div><span className="dd-title">書櫃</span><span className="dd-desc">閱讀紀錄</span></div>
                    </Link>
                    <Link to="/movies" className="dropdown-item" onClick={() => { setShowBlogMenu(false); setMobileOpen(false); }}>
                      <FaFilm className="dd-icon" /><div><span className="dd-title">片單</span><span className="dd-desc">觀影清單</span></div>
                    </Link>
                    <Link to="/music" className="dropdown-item" onClick={() => { setShowBlogMenu(false); setMobileOpen(false); }}>
                      <FaMusic className="dd-icon" /><div><span className="dd-title">音樂</span><span className="dd-desc">喜愛的音樂</span></div>
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>

            <li className="dropdown-wrap" ref={moreMenuRef}>
              <button
                className={'nav-link dropdown-trigger ' + (showMoreMenu || location.pathname.startsWith('/photos') || location.pathname.startsWith('/activity') || location.pathname.startsWith('/now') || location.pathname.startsWith('/journey') || location.pathname.startsWith('/setup') ? 'active' : '')}
                onClick={() => setShowMoreMenu(!showMoreMenu)}
              >
                <FaChevronDown className={'nav-icon chevron ' + (showMoreMenu ? 'rotated' : '')} />
                <span className="nav-label-text">更多</span>
              </button>
              <AnimatePresence>
                {showMoreMenu && (
                  <motion.div className="dropdown-menu" initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.96 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
                    <Link to="/photos" className="dropdown-item" onClick={() => { setShowMoreMenu(false); setMobileOpen(false); }}>
                      <FaCamera className="dd-icon" /><div><span className="dd-title">照片</span><span className="dd-desc">攝影作品集</span></div>
                    </Link>
                    <Link to="/activity" className="dropdown-item" onClick={() => { setShowMoreMenu(false); setMobileOpen(false); }}>
                      <FaRss className="dd-icon" /><div><span className="dd-title">動態</span><span className="dd-desc">最新活動</span></div>
                    </Link>
                    <Link to="/now" className="dropdown-item" onClick={() => { setShowMoreMenu(false); setMobileOpen(false); }}>
                      <FaClock className="dd-icon" /><div><span className="dd-title">現在</span><span className="dd-desc">我目前在做什麼</span></div>
                    </Link>
                    <Link to="/journey" className="dropdown-item" onClick={() => { setShowMoreMenu(false); setMobileOpen(false); }}>
                      <FaRoute className="dd-icon" /><div><span className="dd-title">成長軌跡</span><span className="dd-desc">學習歷程</span></div>
                    </Link>
                    <Link to="/setup" className="dropdown-item" onClick={() => { setShowMoreMenu(false); setMobileOpen(false); }}>
                      <FaDesktop className="dd-icon" /><div><span className="dd-title">配備</span><span className="dd-desc">設備清單</span></div>
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>

            <NavLink sectionId="contact" icon={FaEnvelope} text="聯絡" />
          </ul>
        </LayoutGroup>
      </nav>

      <button className="resume-btn" onClick={() => setShowDownloadModal(!showDownloadModal)}>
        <FaDownload className="resume-icon" />
        <span>履歷</span>
      </button>

      <AnimatePresence>
        {showDownloadModal && (
          <>
            <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDownloadModal(false)} />
            <motion.div className="download-popover" initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }} transition={{ duration: 0.2 }}>
              <h3>選擇要下載的履歷</h3>
              <a href="/Resume/Software Engineer.pdf" download="楊泰和_履歷_軟體工程師.pdf" className="popover-link">
                <span>💼</span> 軟體工程師
              </a>
              <a href="/Resume/School Clubs.pdf" download="楊泰和_履歷_社團經歷.pdf" className="popover-link">
                <span>🎓</span> 社團經歷
              </a>
              <button className="popover-close" onClick={() => setShowDownloadModal(false)}>關閉</button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}

export default Header;
