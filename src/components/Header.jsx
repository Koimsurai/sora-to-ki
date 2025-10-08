import React, { useState } from 'react'; // 引入 useState
import { Link, useLocation, useNavigate } from 'react-router-dom'; // 導入 Link, useLocation 和 useNavigate
// ✅ 優化: 使用解構引入 (Vite 會自動 tree-shake 未使用的 icons)
import { FaHome, FaUser, FaCode, FaBriefcase, FaUsers, FaImages, FaEnvelope, FaDownload, FaBookOpen, FaChartLine, FaRoad, FaClock } from 'react-icons/fa';
import './Header.css';

// Updated Header to accept activeSection prop and handle navigation
function Header({ activeSection }) {
  const [showDownloadModal, setShowDownloadModal] = useState(false); // State for modal visibility
  const location = useLocation(); // 獲取當前位置
  const navigate = useNavigate(); // 獲取導航函數
  const isHomePage = location.pathname === '/'; // 判斷是否在主頁

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

  // Helper function to create nav links with icons and click handler
  const NavLink = ({ sectionId, icon: Icon, text, to }) => {
    const linkClass = to ? (location.pathname.startsWith(to) ? 'active' : '') : (activeSection === sectionId && isHomePage ? 'active' : '');

    if (to) {
      return (
        <li>
          <Link to={to} className={linkClass}>
            <Icon className="nav-icon" />
            {text}
          </Link>
        </li>
      );
    }

    return (
      <li>
        <a
          href={`#${sectionId}`}
          className={linkClass}
          onClick={(e) => handleNavClick(e, sectionId)}
        >
          <Icon className="nav-icon" />
          {text}
        </a>
      </li>
    );
  };

  return (
    <header className="app-header">
      <div className="logo">Koimsurai</div> {/* 根據履歷圖片 */}
      <nav>
        <ul>
          {/* 移除 href，傳遞 sectionId */}
          <NavLink sectionId="home" icon={FaHome} text="首頁" />
          <NavLink sectionId="about-me" icon={FaUser} text="關於我" />
          <NavLink sectionId="expertise" icon={FaCode} text="專業技能" />
          <NavLink sectionId="work-experience" icon={FaBriefcase} text="工作經驗" />
          <NavLink sectionId="school-clubs" icon={FaUsers} text="社團經驗" />
          <NavLink sectionId="portfolio" icon={FaImages} text="作品集" />
          <NavLink to="/journey" icon={FaRoad} text="成長軌跡" />
          <NavLink to="/now" icon={FaClock} text="現在" />
          <NavLink to="/blog" icon={FaBookOpen} text="學習筆記" />
          <NavLink to="/activity" icon={FaChartLine} text="我的動態" />
          <NavLink sectionId="contact" icon={FaEnvelope} text="聯絡我" />
        </ul>
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
