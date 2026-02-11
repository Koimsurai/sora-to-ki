import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FaHome, FaUser, FaCode, FaBriefcase, FaUsers, FaImages, FaEnvelope, FaDownload, FaBookOpen, FaChevronDown, FaRss, FaClock, FaRoute, FaBook, FaMusic, FaFilm, FaCamera, FaTv, FaDesktop } from 'react-icons/fa';
import { motion, LayoutGroup } from 'framer-motion';
import './Header.css';

// Updated Header to accept activeSection prop and handle navigation
function Header({ activeSection }) {
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showBlogMenu, setShowBlogMenu] = useState(false);
  const [showCollectionMenu, setShowCollectionMenu] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const moreMenuRef = useRef(null);
  const blogMenuRef = useRef(null);
  const collectionMenuRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isHomePage = location.pathname === '/';
  const isPhotoPage = location.pathname === '/photos';

  // 處理滾動效果 (受 Shiro 啟發)
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 處理從其他頁面導航回來時的自動滾動
  useEffect(() => {
    if (isHomePage && location.hash) {
      // 使用 setTimeout 確保 DOM 已經完全載入
      const timeoutId = setTimeout(() => {
        const sectionId = location.hash.replace('#', '');
        const element = document.getElementById(sectionId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100); // 延遲 100ms 確保頁面元素已渲染

      return () => clearTimeout(timeoutId);
    }
  }, [location.hash, isHomePage]);

  // 點擊外部關閉下拉選單
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMoreMenu(false);
      }
      if (blogMenuRef.current && !blogMenuRef.current.contains(event.target)) {
        setShowBlogMenu(false);
      }
      if (collectionMenuRef.current && !collectionMenuRef.current.contains(event.target)) {
        setShowCollectionMenu(false);
      }
    };

    if (showMoreMenu || showBlogMenu || showCollectionMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMoreMenu, showBlogMenu, showCollectionMenu]);

  // 處理導航點擊
  const handleNavClick = (e, sectionId) => {
    e.preventDefault(); // 阻止默認的錨點跳轉行為

    if (isHomePage) {
      // 在主頁，平滑滾動
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      // 不在主頁，跳轉回主頁並帶上 hash
      navigate(`/#${sectionId}`);
    }
  };

  // 處理下載按鈕點擊，切換彈出視窗
  const handleDownloadClick = () => {
    setShowDownloadModal(!showDownloadModal);
  };

  // Helper function to create nav links with Framer Motion
  const NavLink = ({ sectionId, icon: Icon, text, to }) => {
    const isActive = to 
      ? location.pathname.startsWith(to)
      : (activeSection === sectionId && isHomePage);

    if (to) {
      return (
        <li>
          <Link to={to} className={isActive ? 'active' : ''} style={{ position: 'relative', display: 'inline-flex' }}>
            <Icon className="nav-icon" />
            {text}
            {isActive && (
              <motion.span
                layoutId="active-nav-indicator"
                className="active-indicator"
                initial={false}
                transition={{
                  type: 'spring',
                  stiffness: 380,
                  damping: 30
                }}
                style={{
                  position: 'absolute',
                  bottom: '4px',
                  left: '18px',
                  right: '18px',
                  height: '2px',
                  background: 'linear-gradient(90deg, transparent 0%, var(--clr-button) 50%, transparent 100%)',
                  borderRadius: '2px'
                }}
              />
            )}
          </Link>
        </li>
      );
    }

    return (
      <li>
        <a
          href={`#${sectionId}`}
          className={isActive ? 'active' : ''}
          onClick={(e) => handleNavClick(e, sectionId)}
          style={{ position: 'relative', display: 'inline-flex' }}
        >
          <Icon className="nav-icon" />
          {text}
          {isActive && (
            <motion.span
              layoutId="active-nav-indicator"
              className="active-indicator"
              initial={false}
              transition={{
                type: 'spring',
                stiffness: 380,
                damping: 30
              }}
              style={{
                position: 'absolute',
                bottom: '4px',
                left: '18px',
                right: '18px',
                height: '2px',
                background: 'linear-gradient(90deg, transparent 0%, var(--clr-button) 50%, transparent 100%)',
                borderRadius: '2px'
              }}
            />
          )}
        </a>
      </li>
    );
  };

  // 滑鼠追蹤效果 (Spotlight - 受 Shiro 啟發)
  const handleMouseMove = (e) => {
    const nav = e.currentTarget;
    const rect = nav.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    nav.style.setProperty('--mouse-x', `${x}%`);
    nav.style.setProperty('--mouse-y', `${y}%`);
  };

  return (
    <header className={`app-header ${isScrolled ? 'scrolled' : ''} ${isPhotoPage ? 'hidden-on-photos' : ''}`}>
      <div className="logo">Koimsurai</div>
      <nav>
        <LayoutGroup>
          <ul onMouseMove={handleMouseMove}>
          {/* 移除 href，傳遞 sectionId */}
          <NavLink sectionId="home" icon={FaHome} text="首頁" />
          <NavLink sectionId="about-me" icon={FaUser} text="關於我" />
          <NavLink sectionId="expertise" icon={FaCode} text="專業技能" />
          <NavLink sectionId="work-experience" icon={FaBriefcase} text="工作經驗" />
          <NavLink sectionId="school-clubs" icon={FaUsers} text="社團經驗" />
          <NavLink sectionId="portfolio" icon={FaImages} text="作品集" />
          
          {/* 雜談選單 (下拉式) */}
          <li className="more-menu-container" ref={blogMenuRef}>
            <button 
              className={`more-menu-trigger ${location.pathname.startsWith('/blog') || location.pathname.startsWith('/bookshelf') || location.pathname.startsWith('/movies') || location.pathname.startsWith('/music') ? 'active' : ''}`}
              onClick={() => setShowBlogMenu(!showBlogMenu)}
            >
              <FaRss className="nav-icon" />
              雜談
              <FaChevronDown className="nav-icon" style={{ fontSize: '0.8em' }} />
            </button>
            
            {showBlogMenu && (
              <div className="more-dropdown">
                <Link 
                  to="/blog" 
                  className="dropdown-item"
                  onClick={() => setShowBlogMenu(false)}
                >
                  <FaBookOpen className="dropdown-icon" />
                  <div className="dropdown-item-content">
                    <span className="dropdown-title">筆記</span>
                    <span className="dropdown-desc">技術學習與思考</span>
                  </div>
                </Link>
                
                <Link 
                  to="/bookshelf" 
                  className="dropdown-item"
                  onClick={() => setShowBlogMenu(false)}
                >
                  <FaBook className="dropdown-icon" />
                  <div className="dropdown-item-content">
                    <span className="dropdown-title">書櫃</span>
                    <span className="dropdown-desc">閱讀的書籍紀錄</span>
                  </div>
                </Link>
                
                <Link 
                  to="/movies" 
                  className="dropdown-item"
                  onClick={() => setShowBlogMenu(false)}
                >
                  <FaFilm className="dropdown-icon" />
                  <div className="dropdown-item-content">
                    <span className="dropdown-title">片單</span>
                    <span className="dropdown-desc">觀影清單與心得</span>
                  </div>
                </Link>
                
                <Link 
                  to="/music" 
                  className="dropdown-item"
                  onClick={() => setShowBlogMenu(false)}
                >
                  <FaMusic className="dropdown-icon" />
                  <div className="dropdown-item-content">
                    <span className="dropdown-title">音樂</span>
                    <span className="dropdown-desc">喜愛的音樂分享</span>
                  </div>
                </Link>
              </div>
            )}
          </li>
          
          {/* 收藏館選單 (下拉式) - 暫時隱藏，cinema/anime 開發中 */}
          
          {/* 更多選單 (下拉式) */}
          <li className="more-menu-container" ref={moreMenuRef}>
            <button 
              className={`more-menu-trigger ${showMoreMenu || location.pathname.startsWith('/photos') || location.pathname.startsWith('/activity') || location.pathname.startsWith('/now') || location.pathname.startsWith('/journey') || location.pathname.startsWith('/setup') ? 'active' : ''}`}
              onClick={() => setShowMoreMenu(!showMoreMenu)}
            >
              <FaChevronDown className="nav-icon" />
              更多
            </button>
            
            {showMoreMenu && (
              <div className="more-dropdown">
                <Link 
                  to="/photos" 
                  className="dropdown-item"
                  onClick={() => setShowMoreMenu(false)}
                >
                  <FaCamera className="dropdown-icon" />
                  <div className="dropdown-item-content">
                    <span className="dropdown-title">照片</span>
                    <span className="dropdown-desc">攝影作品集</span>
                  </div>
                </Link>
                
                <Link 
                  to="/activity" 
                  className="dropdown-item"
                  onClick={() => setShowMoreMenu(false)}
                >
                  <FaRss className="dropdown-icon" />
                  <div className="dropdown-item-content">
                    <span className="dropdown-title">動態</span>
                    <span className="dropdown-desc">查看我的最新活動</span>
                  </div>
                </Link>
                
                <Link 
                  to="/now" 
                  className="dropdown-item"
                  onClick={() => setShowMoreMenu(false)}
                >
                  <FaClock className="dropdown-icon" />
                  <div className="dropdown-item-content">
                    <span className="dropdown-title">現在</span>
                    <span className="dropdown-desc">我目前在做什麼</span>
                  </div>
                </Link>
                
                <Link 
                  to="/journey" 
                  className="dropdown-item"
                  onClick={() => setShowMoreMenu(false)}
                >
                  <FaRoute className="dropdown-icon" />
                  <div className="dropdown-item-content">
                    <span className="dropdown-title">成長軌跡</span>
                    <span className="dropdown-desc">我的學習與成長歷程</span>
                  </div>
                </Link>
                
                <Link 
                  to="/setup" 
                  className="dropdown-item"
                  onClick={() => setShowMoreMenu(false)}
                >
                  <FaDesktop className="dropdown-icon" />
                  <div className="dropdown-item-content">
                    <span className="dropdown-title">我的配備</span>
                    <span className="dropdown-desc">個人設備清單</span>
                  </div>
                </Link>
              </div>
            )}
          </li>
          
          <NavLink sectionId="contact" icon={FaEnvelope} text="聯絡我" />
          </ul>
        </LayoutGroup>
      </nav>
      {/* Download Button */}
      <button className="download-button" onClick={handleDownloadClick}>
        <FaDownload className="download-icon" /> {/* Add download icon */}
        下載履歷
      </button> {/* Figma 中是 "下载简历与作品集" */}

      {/* Download Modal */}
      {showDownloadModal && (
        <div className="download-modal-overlay" onClick={handleDownloadClick}> {/* Overlay closes modal */}
          <div className="download-modal-content" onClick={(e) => e.stopPropagation()}> {/* Prevent content click from closing modal */}
            <h2>選擇要下載的履歷</h2>
            <a href="/Resume/Software Engineer.pdf" download="楊泰和_履歷_軟體工程師.pdf" className="modal-download-link">
              軟體工程師 (Software Engineer)
            </a>
            <a href="/Resume/School Clubs.pdf" download="楊泰和_履歷_社團經歷.pdf" className="modal-download-link">
              社團經歷 (School Clubs)
            </a>
            <button onClick={handleDownloadClick} className="modal-close-button">關閉</button>
          </div>
        </div>
      )}
    </header>
  );
}

export default Header;
