import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  FaHome, FaUser, FaCode, FaBriefcase, FaUsers, FaImages,
  FaEnvelope, FaDownload, FaBookOpen, FaChevronDown, FaRss,
  FaClock, FaRoute, FaBook, FaMusic, FaCamera, FaDesktop,
  FaGithub, FaGoogle, FaSignOutAlt, FaCog,
} from 'react-icons/fa';
import { motion, LayoutGroup, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { MegaMenuRoot, MegaMenu as MegaMenuItem } from './mega-menu/MegaMenu';
import HomeMenuContent from './mega-menu/HomeMenu';
import BlogMenuContent from './mega-menu/BlogMenu';
import MoreMenuContent from './mega-menu/MoreMenu';
import meAvatar from '../assets/me.jpg';
import './Header.css';

function Header({ activeSection }) {
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showHomeMenu, setShowHomeMenu] = useState(false); // 新增這行
  const [showBlogMenu, setShowBlogMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastScrollYRef = useRef(0);
  const homeMenuRef = useRef(null); // 新增這行
  const moreMenuRef = useRef(null);
  const blogMenuRef = useRef(null);
  const userMenuRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoggedIn, logout, providers, getGoogleAuthUrl, getGitHubAuthUrl, isAdmin } = useAuth();
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
      if (homeMenuRef.current && !homeMenuRef.current.contains(e.target)) setShowHomeMenu(false);
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setShowMoreMenu(false);
      if (blogMenuRef.current && !blogMenuRef.current.contains(e.target)) setShowBlogMenu(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
    };
    if (showHomeMenu || showMoreMenu || showBlogMenu || showUserMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showHomeMenu, showMoreMenu, showBlogMenu, showUserMenu]);

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
    <header className={'site-header ' + (isScrolled && !mobileOpen ? 'scrolled ' : '') + (navHidden && !mobileOpen ? 'nav-hidden ' : '')}>
      <Link to="/" className="site-brand" aria-label="返回首頁" onClick={() => setMobileOpen(false)}>
        <img src={meAvatar} alt="" className="site-brand-img" />
      </Link>
      <nav className={'site-nav ' + (mobileOpen ? 'mobile-open' : '')} onMouseMove={handleMouseMove}>
        <MegaMenuRoot className="nav-list nav-list-mega">
          <MegaMenuItem
            id="home"
            label="首頁"
            icon={<FaHome />}
            to="/"
            active={(isHomePage && !location.hash)
                 || location.pathname.startsWith('/about-site')
                 || location.pathname.startsWith('/history')
                 || location.pathname.startsWith('/messages')
                 || location.pathname.startsWith('/friends')}
          >
            <HomeMenuContent
              onSectionClick={(e, sectionId) => { handleNavClick(e, sectionId); }}
            />
          </MegaMenuItem>

          <MegaMenuItem
            id="blog"
            label="手記"
            icon={<FaBookOpen />}
            to="/blog"
            active={location.pathname.startsWith('/blog')
                 || location.pathname.startsWith('/bookshelf')
                 || location.pathname.startsWith('/music')}
          >
            <BlogMenuContent />
          </MegaMenuItem>

          <MegaMenuItem
            id="more"
            label="更多"
            active={location.pathname.startsWith('/photos')
                 || location.pathname.startsWith('/activity')
                 || location.pathname.startsWith('/journey')
                 || location.pathname.startsWith('/setup')}
          >
            <MoreMenuContent />
          </MegaMenuItem>
        </MegaMenuRoot>
      </nav>

      {/* 暫時隱藏履歷按鈕
      <button className="resume-btn" onClick={() => setShowDownloadModal(!showDownloadModal)}>
        <FaDownload className="resume-icon" />
        <span>履歷</span>
      </button>
      */}

      <div className="header-right-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* User Avatar / Login */}
        <div className="user-area" ref={userMenuRef}>
          <button className="user-avatar-btn" onClick={() => setShowUserMenu(!showUserMenu)}>
            {isLoggedIn && user?.avatar ? (
              <img src={user.avatar} alt={user.displayName} className="user-avatar-img" referrerPolicy="no-referrer" />
            ) : (
              <FaUser className="user-avatar-icon" />
            )}
          </button>
          <AnimatePresence>
            {showUserMenu && (
              <motion.div className="user-dropdown" initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.96 }} transition={{ duration: 0.2 }}>
                {isLoggedIn ? (
                  <>
                    <div className="user-dropdown-header">
                      <span className="user-dropdown-name">{user.displayName}</span>
                      <span className="user-dropdown-provider">@{user.displayName}</span>
                    </div>
                    <div className="user-dropdown-divider" />
                    {isAdmin && (
                      <button className="user-dropdown-item" onClick={() => { navigate('/admin'); setShowUserMenu(false); }}>
                        <FaCog /> 進入後台
                      </button>
                    )}
                    <button className="user-dropdown-item" onClick={() => { logout(); setShowUserMenu(false); }}>
                      <FaSignOutAlt /> 登出
                    </button>
                  </>
                ) : (
                  <>
                    <div className="user-dropdown-header">
                      <span className="user-dropdown-name">社交帳號登入</span>
                    </div>
                    <div className="user-dropdown-divider" />
                    {providers.github?.enabled && (
                      <button className="user-dropdown-item" onClick={() => {
                        sessionStorage.setItem('oauth_return_to', location.pathname);
                        const redirectUri = `${window.location.origin}/auth/callback`;
                        window.location.href = getGitHubAuthUrl(redirectUri) + '&state=github';
                      }}>
                        <FaGithub /> GitHub 登入
                      </button>
                    )}
                    {providers.google?.enabled && (
                      <button className="user-dropdown-item" onClick={() => {
                        sessionStorage.setItem('oauth_return_to', location.pathname);
                        const redirectUri = `${window.location.origin}/auth/callback`;
                        window.location.href = getGoogleAuthUrl(redirectUri) + '&state=google';
                      }}>
                        <FaGoogle /> Google 登入
                      </button>
                    )}
                    {!providers.github?.enabled && !providers.google?.enabled && (
                      <div className="user-dropdown-item disabled">第三方登入尚未設定</div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button className={'mobile-toggle ' + (mobileOpen ? 'open' : '')} onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation">
          <span /><span /><span />
        </button>
      </div>

      <AnimatePresence>
        {showDownloadModal && (
          <>
            <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDownloadModal(false)} />
            <motion.div className="download-popover" initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }} transition={{ duration: 0.2 }}>
              <h3>選擇要下載的履歷</h3>
              <a href="/Resume/Software Engineer.pdf" download="Koimsurai_Resume_Software_Engineer.pdf" className="popover-link">
                <span>💼</span> 軟體工程師
              </a>
              <a href="/Resume/School Clubs.pdf" download="Koimsurai_Resume_School_Clubs.pdf" className="popover-link">
                <span>🎓</span> 社團經歷
              </a>
              <button className="popover-close" onClick={() => setShowDownloadModal(false)}>關閉</button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header >
  );
}

export default Header;
