import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Activity.css';

const Activity = () => {
  const [steamData, setSteamData] = useState(null);
  const [githubData, setGithubData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [hoveredCard, setHoveredCard] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // 配置你的 Steam ID 和 GitHub 用戶名
  const STEAM_API_KEY = import.meta.env.VITE_STEAM_API_KEY || '';
  const STEAM_ID = import.meta.env.VITE_STEAM_ID || '';
  const GITHUB_USERNAME = 'timo9378'; // 你的 GitHub 用戶名

  // 追蹤鼠標位置用於光暈效果
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    fetchActivityData();
  }, []);

  const fetchActivityData = async () => {
    setLoading(true);
    await Promise.all([
      fetchSteamData(),
      fetchGithubData()
    ]);
    setLoading(false);
  };

  const fetchSteamData = async () => {
    try {
      // 使用後端 API 代理（通過 Vite proxy 或 Nginx）
      const apiUrl = import.meta.env.VITE_API_URL || '/api';

      // 獲取最近遊玩的遊戲
      const recentGamesResponse = await fetch(`${apiUrl}/steam/recent-games`);
      const recentGamesData = await recentGamesResponse.json();

      // 獲取玩家信息
      const playerResponse = await fetch(`${apiUrl}/steam/player`);
      const playerData = await playerResponse.json();

      // 檢查是否有錯誤
      if (recentGamesData.error || playerData.error) {
        setSteamData({ 
          error: recentGamesData.error || playerData.error,
          configured: false 
        });
        return;
      }

      setSteamData({
        recentGames: recentGamesData.response?.games || [],
        playerInfo: playerData.response?.players?.[0] || null,
        configured: true
      });
    } catch (error) {
      console.error('獲取 Steam 數據失敗:', error);
      setSteamData({ 
        error: '無法連接到後端 API，請確保後端服務器正在運行',
        configured: false 
      });
    }
  };

  const fetchGithubData = async () => {
    try {
      // 使用後端 API 代理（通過 Vite proxy 或 Nginx）
      const apiUrl = import.meta.env.VITE_API_URL || '/api';

      // 獲取用戶信息
      const userResponse = await fetch(`${apiUrl}/github/user/${GITHUB_USERNAME}`);
      const userData = await userResponse.json();

      // 獲取最近的 events
      const eventsResponse = await fetch(`${apiUrl}/github/events/${GITHUB_USERNAME}`);
      const eventsData = await eventsResponse.json();

      // 檢查是否有錯誤
      if (userData.error || eventsData.error) {
        setGithubData({ error: userData.error || eventsData.error });
        return;
      }

      // 過濾出 PushEvent
      const pushEvents = eventsData
        .filter(event => event.type === 'PushEvent')
        .slice(0, 10);

      // 獲取 repositories (直接調用 GitHub API，因為不需要認證)
      const reposResponse = await fetch(`https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=5`);
      const reposData = await reposResponse.json();

      setGithubData({
        user: userData,
        recentCommits: pushEvents,
        recentRepos: reposData
      });
    } catch (error) {
      console.error('獲取 GitHub 數據失敗:', error);
      setGithubData({ error: '無法連接到後端 API，請確保後端服務器正在運行' });
    }
  };

  const formatPlaytime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    if (hours < 1) return `${minutes} 分鐘`;
    return `${hours} 小時`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} 分鐘前`;
    if (diffHours < 24) return `${diffHours} 小時前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return date.toLocaleDateString('zh-TW');
  };

  if (loading) {
    return (
      <div className="activity-container">
        <div className="activity-loading">
          <div className="cosmic-loader">
            <div className="orbit orbit-1"></div>
            <div className="orbit orbit-2"></div>
            <div className="orbit orbit-3"></div>
            <div className="planet"></div>
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            正在穿越星際，載入活動數據...
          </motion.p>
        </div>
      </div>
    );
  }

  return (
    <div className="activity-container" ref={containerRef}>
      {/* 星空背景效果 */}
      <div className="cosmic-background">
        <div className="stars-layer stars-small"></div>
        <div className="stars-layer stars-medium"></div>
        <div className="stars-layer stars-large"></div>
      </div>

      {/* 鼠標跟隨光暈 */}
      <motion.div
        className="mouse-glow"
        animate={{
          left: mousePosition.x,
          top: mousePosition.y,
        }}
        transition={{ type: "spring", stiffness: 150, damping: 15 }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="activity-header"
      >
        <div className="header-decoration">
          <motion.div
            className="floating-orb orb-1"
            animate={{
              y: [0, -20, 0],
              rotate: [0, 180, 360],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <motion.div
            className="floating-orb orb-2"
            animate={{
              y: [0, 20, 0],
              rotate: [360, 180, 0],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </div>
        
        <motion.h1
          className="activity-title"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <span className="title-gradient">活動星圖</span>
          <motion.span
            className="title-sparkle"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
            }}
          >
            ✨
          </motion.span>
        </motion.h1>
        
        <motion.p
          className="activity-subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          探索我在數位宇宙中的足跡 🌌
        </motion.p>
      </motion.div>

      <motion.div
        className="activity-tabs"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        {[
          { id: 'overview', icon: '🌟', label: '總覽', gradient: 'from-purple-500 to-pink-500' },
          { id: 'gaming', icon: '🎮', label: '遊戲星域', gradient: 'from-blue-500 to-cyan-500' },
          { id: 'coding', icon: '💻', label: '代碼銀河', gradient: 'from-green-500 to-emerald-500' }
        ].map((tab, index) => (
          <motion.button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + index * 0.1 }}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
            {activeTab === tab.id && (
              <motion.div
                className="tab-indicator"
                layoutId="activeTab"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
          </motion.button>
        ))}
      </motion.div>

      <div className="activity-content">
        {activeTab === 'overview' && (
          <div className="overview-section">
            <div className="stats-grid">
              {[
                {
                  icon: '🎮',
                  value: steamData?.recentGames?.length || 0,
                  label: '最近遊玩遊戲',
                  color: 'blue',
                  gradient: 'from-blue-500/20 to-cyan-500/20'
                },
                {
                  icon: '💻',
                  value: githubData?.user?.public_repos || 0,
                  label: '公開專案',
                  color: 'green',
                  gradient: 'from-green-500/20 to-emerald-500/20'
                },
                {
                  icon: '⭐',
                  value: githubData?.recentRepos?.reduce((sum, repo) => sum + repo.stargazers_count, 0) || 0,
                  label: 'GitHub Stars',
                  color: 'yellow',
                  gradient: 'from-yellow-500/20 to-orange-500/20'
                },
                {
                  icon: '🔄',
                  value: githubData?.recentCommits?.length || 0,
                  label: '最近提交',
                  color: 'purple',
                  gradient: 'from-purple-500/20 to-pink-500/20'
                }
              ].map((stat, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + index * 0.1 }}
                  whileHover={{ y: -8, scale: 1.02 }}
                  onHoverStart={() => setHoveredCard(`stat-${index}`)}
                  onHoverEnd={() => setHoveredCard(null)}
                  className={`stat-card glass-card ${stat.color}`}
                >
                  <div className="card-shine"></div>
                  <motion.div
                    className="stat-icon"
                    animate={hoveredCard === `stat-${index}` ? {
                      scale: [1, 1.2, 1],
                      rotate: [0, 10, -10, 0]
                    } : {}}
                    transition={{ duration: 0.5 }}
                  >
                    {stat.icon}
                  </motion.div>
                  <div className="stat-info">
                    <motion.h3
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, delay: 0.2 + index * 0.1 }}
                    >
                      {stat.value}
                    </motion.h3>
                    <p>{stat.label}</p>
                  </div>
                  <div className={`stat-gradient ${stat.gradient}`}></div>
                </motion.div>
              ))}
            </div>

            <div className="activity-grid">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
                className="activity-panel"
              >
                <h2 className="panel-title">🎮 最近遊玩</h2>
                {steamData?.error ? (
                  <div className="error-message">
                    <p>{steamData.error}</p>
                    {!steamData.configured && (
                      <div className="config-hint">
                        <p>如何配置 Steam API:</p>
                        <ol>
                          <li>在項目根目錄創建 <code>.env</code> 文件</li>
                          <li>添加: <code>VITE_STEAM_API_KEY=你的API密鑰</code></li>
                          <li>添加: <code>VITE_STEAM_ID=你的Steam ID</code></li>
                          <li>重啟開發服務器</li>
                        </ol>
                      </div>
                    )}
                  </div>
                ) : steamData?.recentGames?.length > 0 ? (
                  <div className="game-list">
                    {steamData.recentGames.slice(0, 3).map(game => (
                      <div key={game.appid} className="game-item">
                        <img
                          src={`https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`}
                          alt={game.name}
                          className="game-icon"
                        />
                        <div className="game-info">
                          <h4>{game.name}</h4>
                          <p>最近 {formatPlaytime(game.playtime_2weeks || 0)}</p>
                          <p className="total-playtime">總計 {formatPlaytime(game.playtime_forever || 0)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-data">暫無最近遊玩記錄</p>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 }}
                className="activity-panel"
              >
                <h2 className="panel-title">💻 最新提交</h2>
                {githubData?.error ? (
                  <div className="error-message">
                    <p>{githubData.error}</p>
                  </div>
                ) : githubData?.recentCommits?.length > 0 ? (
                  <div className="commit-list">
                    {githubData.recentCommits.slice(0, 5).map((event, index) => (
                      <div key={`${event.id}-${index}`} className="commit-item">
                        <div className="commit-icon">📝</div>
                        <div className="commit-info">
                          <h4>{event.repo.name.split('/')[1]}</h4>
                          <p className="commit-message">
                            {event.payload.commits?.[0]?.message || 'Pushed commits'}
                          </p>
                          <p className="commit-time">{formatDate(event.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-data">暫無最近提交記錄</p>
                )}
              </motion.div>
            </div>
          </div>
        )}

        {activeTab === 'gaming' && (
          <div className="gaming-section">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="section-content"
            >
              {steamData?.playerInfo && (
                <div className="player-card">
                  <img
                    src={steamData.playerInfo.avatarfull}
                    alt="Steam Avatar"
                    className="player-avatar"
                  />
                  <div className="player-info">
                    <h2>{steamData.playerInfo.personaname}</h2>
                    <p className="player-status">
                      {steamData.playerInfo.personastate === 1 ? '🟢 在線' : '⚫ 離線'}
                    </p>
                  </div>
                </div>
              )}

              {steamData?.error ? (
                <div className="error-message">
                  <p>{steamData.error}</p>
                </div>
              ) : steamData?.recentGames?.length > 0 ? (
                <div className="games-grid">
                  {steamData.recentGames.map(game => (
                    <motion.div
                      key={game.appid}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.05 }}
                      className="game-card"
                    >
                      <img
                        src={`https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`}
                        alt={game.name}
                        className="game-cover"
                        onError={(e) => {
                          e.target.src = `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`;
                        }}
                      />
                      <div className="game-details">
                        <h3>{game.name}</h3>
                        <div className="game-stats">
                          <div className="stat">
                            <span className="label">最近遊玩:</span>
                            <span className="value">{formatPlaytime(game.playtime_2weeks || 0)}</span>
                          </div>
                          <div className="stat">
                            <span className="label">總遊玩時間:</span>
                            <span className="value">{formatPlaytime(game.playtime_forever || 0)}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="no-data">暫無最近遊玩記錄</p>
              )}
            </motion.div>
          </div>
        )}

        {activeTab === 'coding' && (
          <div className="coding-section">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="section-content"
            >
              {githubData?.user && (
                <div className="github-profile">
                  <img
                    src={githubData.user.avatar_url}
                    alt="GitHub Avatar"
                    className="github-avatar"
                  />
                  <div className="github-info">
                    <h2>{githubData.user.name || githubData.user.login}</h2>
                    <p className="github-bio">{githubData.user.bio || '沒有簡介'}</p>
                    <div className="github-stats">
                      <span>👥 {githubData.user.followers} 關注者</span>
                      <span>📦 {githubData.user.public_repos} 專案</span>
                    </div>
                    <a
                      href={githubData.user.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="github-link"
                    >
                      查看 GitHub 個人頁面 →
                    </a>
                  </div>
                </div>
              )}

              {githubData?.error ? (
                <div className="error-message">
                  <p>{githubData.error}</p>
                </div>
              ) : (
                <>
                  <h3 className="section-subtitle">📝 最近提交</h3>
                  {githubData?.recentCommits?.length > 0 ? (
                    <div className="commits-timeline">
                      {githubData.recentCommits.map((event, index) => (
                        <motion.div
                          key={`${event.id}-${index}`}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="timeline-item"
                        >
                          <div className="timeline-marker"></div>
                          <div className="timeline-content">
                            <h4>{event.repo.name}</h4>
                            <p className="commit-msg">{event.payload.commits?.[0]?.message || 'Pushed commits'}</p>
                            <div className="timeline-meta">
                              <span className="commit-count">
                                {event.payload.commits?.length || 0} commit(s)
                              </span>
                              <span className="commit-date">{formatDate(event.created_at)}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <p className="no-data">暫無最近提交記錄</p>
                  )}

                  <h3 className="section-subtitle">📚 最近更新的專案</h3>
                  {githubData?.recentRepos?.length > 0 ? (
                    <div className="repos-grid">
                      {githubData.recentRepos.map((repo, index) => (
                        <motion.a
                          key={repo.id}
                          href={repo.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          whileHover={{ scale: 1.03 }}
                          className="repo-card"
                        >
                          <h4>{repo.name}</h4>
                          <p className="repo-description">{repo.description || '沒有描述'}</p>
                          <div className="repo-meta">
                            {repo.language && (
                              <span className="repo-language">
                                <span className="language-dot" style={{
                                  backgroundColor: getLanguageColor(repo.language)
                                }}></span>
                                {repo.language}
                              </span>
                            )}
                            <span className="repo-stars">⭐ {repo.stargazers_count}</span>
                            <span className="repo-forks">🔀 {repo.forks_count}</span>
                          </div>
                        </motion.a>
                      ))}
                    </div>
                  ) : (
                    <p className="no-data">暫無專案記錄</p>
                  )}
                </>
              )}
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};

// 根據語言返回對應的顏色
const getLanguageColor = (language) => {
  const colors = {
    JavaScript: '#f1e05a',
    TypeScript: '#2b7489',
    Python: '#3572A5',
    Java: '#b07219',
    'C++': '#f34b7d',
    C: '#555555',
    Go: '#00ADD8',
    Rust: '#dea584',
    PHP: '#4F5D95',
    Ruby: '#701516',
    Swift: '#ffac45',
    Kotlin: '#F18E33',
    Dart: '#00B4AB',
    HTML: '#e34c26',
    CSS: '#563d7c',
  };
  return colors[language] || '#8257e6';
};

export default Activity;
