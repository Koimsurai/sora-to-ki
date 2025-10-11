import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Activity.css';

const Activity = () => {
  const [steamData, setSteamData] = useState(null);
  const [githubData, setGithubData] = useState(null);
  const [wakatimeData, setWakatimeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [steamSubTab, setSteamSubTab] = useState('recent'); // 新增: Steam 子標籤 (recent/library)
  const [hoveredCard, setHoveredCard] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [contributionData, setContributionData] = useState([]);
  const [serverStatus, setServerStatus] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
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
    checkServerStatus();
    
    // 每秒更新時間
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    // 每30秒檢查一次伺服器狀態
    const statusInterval = setInterval(() => {
      checkServerStatus();
    }, 30000);
    
    // 每10分鐘自動更新一次外部 API 資料 (Steam, GitHub, WakaTime)
    const dataRefreshInterval = setInterval(() => {
      console.log('🔄 自動更新外部 API 資料...');
      fetchActivityData();
    }, 10 * 60 * 1000); // 10 分鐘 = 600,000 毫秒
    
    return () => {
      clearInterval(timeInterval);
      clearInterval(statusInterval);
      clearInterval(dataRefreshInterval);
    };
  }, []);

  const fetchActivityData = async () => {
    setLoading(true);
    await Promise.all([
      fetchSteamData(),
      fetchGithubData(),
      fetchWakatimeData()
    ]);
    setLoading(false);
  };

  // 檢查伺服器狀態
  const checkServerStatus = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api';
      const startTime = Date.now();
      const response = await fetch(`${apiUrl}/health`);
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        setServerStatus({
          status: 'online',
          responseTime: responseTime,
          lastCheck: new Date()
        });
      } else {
        setServerStatus({
          status: 'error',
          responseTime: responseTime,
          lastCheck: new Date()
        });
      }
    } catch (error) {
      setServerStatus({
        status: 'offline',
        responseTime: 0,
        lastCheck: new Date()
      });
    }
  };

  // 計算網站運行時間（網站於 2025-04-01 上線）
  const getUptime = () => {
    const startDate = new Date('2025-04-01T00:00:00+08:00'); // 台灣時間
    const now = new Date();
    const diffTime = Math.abs(now - startDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return { days: diffDays, hours: diffHours };
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

      // 獲取所有遊戲庫
      const ownedGamesResponse = await fetch(`${apiUrl}/steam/owned-games`);
      const ownedGamesData = await ownedGamesResponse.json();

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
        ownedGames: ownedGamesData.response?.games || [],
        gameCount: ownedGamesData.response?.game_count || 0,
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

  const fetchWakatimeData = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api';

      // 獲取今日統計
      const todayResponse = await fetch(`${apiUrl}/wakatime/today`);
      const todayData = await todayResponse.json();

      // 獲取本週統計
      const weekResponse = await fetch(`${apiUrl}/wakatime/week`);
      const weekData = await weekResponse.json();

      // 檢查是否有錯誤
      if (todayData.error || weekData.error) {
        setWakatimeData({ 
          error: todayData.error || weekData.error,
          configured: false 
        });
        return;
      }

      // 調試: 顯示完整的 WakaTime 資料結構
      console.log('📊 WakaTime Today 原始資料:', todayData);
      console.log('📊 WakaTime Today Data[0]:', todayData.data?.[0]);
      console.log('📊 WakaTime 實際編碼時間:', todayData.actualCodingTime);
      
      setWakatimeData({
        today: todayData.data?.[0] || null,
        week: weekData.data || null,
        actualCodingTime: todayData.actualCodingTime || null,
        configured: true
      });
    } catch (error) {
      console.error('獲取 WakaTime 數據失敗:', error);
      setWakatimeData({ 
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

      // 獲取最近的 events (用於顯示最近提交)
      const eventsResponse = await fetch(`${apiUrl}/github/events/${GITHUB_USERNAME}`);
      const eventsData = await eventsResponse.json();

      // 獲取完整的貢獻數據 (使用 GitHub 貢獻圖 API)
      let contributionsData = null;
      try {
        // 添加時間戳避免快取
        const cacheBuster = new Date().getTime();
        const contributionsResponse = await fetch(`https://github-contributions-api.jogruber.de/v4/${GITHUB_USERNAME}?y=last&_=${cacheBuster}`);
        contributionsData = await contributionsResponse.json();
        console.log('📊 GitHub 貢獻資料 (最後更新):', contributionsData?.contributions?.slice(-7)); // 顯示最近 7 天
      } catch (error) {
        console.warn('無法獲取完整貢獻數據，將使用事件數據:', error);
      }

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
        recentRepos: reposData,
        contributions: contributionsData
      });

      // 生成貢獻熱度圖數據（使用完整數據或回退到事件數據）
      if (contributionsData) {
        generateContributionDataFromAPI(contributionsData);
      } else {
        generateContributionData(pushEvents);
      }
    } catch (error) {
      console.error('獲取 GitHub 數據失敗:', error);
      setGithubData({ error: '無法連接到後端 API，請確保後端服務器正在運行' });
    }
  };

  // 從 GitHub 貢獻 API 生成熱度圖數據 (完整數據)
  const generateContributionDataFromAPI = (apiData) => {
    if (!apiData || !apiData.contributions) {
      console.warn('貢獻數據格式錯誤');
      return;
    }

    const contributions = apiData.contributions;
    const daysInWeek = 7;
    const data = [];
    
    console.log('📊 貢獻總天數:', contributions.length);
    
    // 按週分組 - 確保包含所有資料,即使最後一週不完整
    const totalWeeks = Math.ceil(contributions.length / daysInWeek);
    
    for (let i = 0; i < totalWeeks; i++) {
      const weekData = [];
      for (let j = 0; j < daysInWeek; j++) {
        const index = i * daysInWeek + j;
        if (index < contributions.length) {
          const day = contributions[index];
          const count = day.count || 0;
          weekData.push({
            date: day.date,
            count: count,
            level: count === 0 ? 0 : count <= 3 ? 1 : count <= 6 ? 2 : count <= 9 ? 3 : 4
          });
        } else {
          // 如果是不完整的週,填充空白天數
          weekData.push({
            date: '',
            count: 0,
            level: -1 // 用 -1 表示空白格子
          });
        }
      }
      data.push(weekData);
    }

    console.log('📊 生成的週數:', data.length, '最後一週天數:', data[data.length - 1]?.length);
    setContributionData(data);
  };

  // 生成貢獻熱度圖數據 (備用方案 - 使用事件數據)
  const generateContributionData = (events) => {
    const weeks = 52; // 改為整年 (52週)
    const daysInWeek = 7;
    const data = [];
    const today = new Date();

    // 統計每天的 commit 數量
    const commitsByDate = {};
    events.forEach(event => {
      if (event.type === 'PushEvent') {
        const date = new Date(event.created_at).toDateString();
        commitsByDate[date] = (commitsByDate[date] || 0) + (event.payload.commits?.length || 1);
      }
    });

    // 生成最近 52 週的數據 (整年)
    for (let week = weeks - 1; week >= 0; week--) {
      const weekData = [];
      for (let day = 0; day < daysInWeek; day++) {
        const date = new Date(today);
        date.setDate(date.getDate() - (week * daysInWeek + day));
        const dateStr = date.toDateString();
        const count = commitsByDate[dateStr] || 0;
        
        weekData.push({
          date: dateStr,
          count: count,
          level: count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 8 ? 3 : 4
        });
      }
      data.push(weekData);
    }

    setContributionData(data.reverse());
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
            {/* 伺服器狀態卡片 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="server-status-card glass-card"
            >
              <div className="status-header">
                <h3>🖥️ 伺服器狀態</h3>
                <div className={`status-indicator ${serverStatus?.status || 'checking'}`}>
                  <span className="status-dot"></span>
                  {serverStatus?.status === 'online' && '運行中'}
                  {serverStatus?.status === 'offline' && '離線'}
                  {serverStatus?.status === 'error' && '錯誤'}
                  {!serverStatus && '檢查中...'}
                </div>
              </div>
              <div className="status-details">
                <div className="status-item">
                  <span className="status-label">網站運行時間</span>
                  <span className="status-value">
                    {getUptime().days} 天 {getUptime().hours} 小時
                  </span>
                </div>
                {serverStatus?.responseTime && (
                  <div className="status-item">
                    <span className="status-label">響應時間</span>
                    <span className="status-value">{serverStatus.responseTime}ms</span>
                  </div>
                )}
                <div className="status-item">
                  <span className="status-label">當前時間</span>
                  <span className="status-value">
                    {currentTime.toLocaleTimeString('zh-TW', { 
                      hour: '2-digit', 
                      minute: '2-digit', 
                      second: '2-digit' 
                    })}
                  </span>
                </div>
                {serverStatus?.lastCheck && (
                  <div className="status-item">
                    <span className="status-label">最後檢查</span>
                    <span className="status-value">
                      {serverStatus.lastCheck.toLocaleTimeString('zh-TW', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>

            <div className="stats-grid">
              {[
                {
                  icon: '🎮',
                  value: steamData?.gameCount || 0,
                  label: '遊戲收藏',
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
                          src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`}
                          alt={game.name}
                          className="game-icon"
                          onError={(e) => {
                            e.target.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/capsule_184x69.jpg`;
                          }}
                        />
                        <div className="game-info">
                          <h4>{game.name}</h4>
                          <div className="game-stats-inline">
                            <div className="stat-item">
                              <span className="stat-icon">🎮</span>
                              <span>最近 {formatPlaytime(game.playtime_2weeks || 0)}</span>
                            </div>
                            <div className="stat-item">
                              <span className="stat-icon">⏱️</span>
                              <span>總計 {formatPlaytime(game.playtime_forever || 0)}</span>
                            </div>
                          </div>
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
                    {steamData?.gameCount > 0 && (
                      <p className="game-count">🎮 擁有 {steamData.gameCount} 款遊戲</p>
                    )}
                  </div>
                </div>
              )}

              {/* Steam 子標籤 */}
              <div className="steam-sub-tabs">
                <button
                  className={`steam-sub-tab ${steamSubTab === 'recent' ? 'active' : ''}`}
                  onClick={() => setSteamSubTab('recent')}
                >
                  <span className="sub-tab-icon">⏱️</span>
                  <span>最近遊玩</span>
                  {steamData?.recentGames?.length > 0 && (
                    <span className="sub-tab-count">{steamData.recentGames.length}</span>
                  )}
                </button>
                <button
                  className={`steam-sub-tab ${steamSubTab === 'library' ? 'active' : ''}`}
                  onClick={() => setSteamSubTab('library')}
                >
                  <span className="sub-tab-icon">📚</span>
                  <span>遊戲庫</span>
                  {steamData?.gameCount > 0 && (
                    <span className="sub-tab-count">{steamData.gameCount}</span>
                  )}
                </button>
              </div>

              {steamData?.error ? (
                <div className="error-message">
                  <p>{steamData.error}</p>
                </div>
              ) : steamSubTab === 'recent' && steamData?.recentGames?.length > 0 ? (
                <div className="games-grid">
                  {steamData.recentGames.map(game => (
                    <motion.div
                      key={game.appid}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.02, y: -5 }}
                      className="game-card"
                    >
                      <div className="game-cover-wrapper">
                        <img
                          src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`}
                          alt={game.name}
                          className="game-cover"
                          loading="lazy"
                          onError={(e) => {
                            e.target.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/capsule_616x353.jpg`;
                          }}
                        />
                        <div className="game-overlay">
                          <a 
                            href={`https://store.steampowered.com/app/${game.appid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="store-link"
                          >
                            在 Steam 上查看 →
                          </a>
                        </div>
                      </div>
                      <div className="game-details">
                        <h3>{game.name}</h3>
                        <div className="game-stats">
                          <div className="stat">
                            <span className="stat-icon">🎮</span>
                            <div className="stat-info">
                              <span className="label">最近兩週</span>
                              <span className="value">{formatPlaytime(game.playtime_2weeks || 0)}</span>
                            </div>
                          </div>
                          <div className="stat">
                            <span className="stat-icon">⏱️</span>
                            <div className="stat-info">
                              <span className="label">總遊玩時間</span>
                              <span className="value">{formatPlaytime(game.playtime_forever || 0)}</span>
                            </div>
                          </div>
                          {game.playtime_forever > 0 && (
                            <div className="stat">
                              <span className="stat-icon">📊</span>
                              <div className="stat-info">
                                <span className="label">遊玩進度</span>
                                <span className="value">
                                  {((game.playtime_2weeks || 0) / game.playtime_forever * 100).toFixed(1)}% 最近活躍
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : steamSubTab === 'recent' ? (
                <p className="no-data">暫無最近遊玩記錄</p>
              ) : null}

              {steamSubTab === 'library' && steamData?.ownedGames?.length > 0 ? (
                <div className="games-grid">
                  {steamData.ownedGames
                    .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
                    .map(game => (
                    <motion.div
                      key={game.appid}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.02, y: -5 }}
                      className="game-card"
                    >
                      <div className="game-cover-wrapper">
                        <img
                          src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`}
                          alt={game.name}
                          className="game-cover"
                          loading="lazy"
                          onError={(e) => {
                            e.target.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/capsule_616x353.jpg`;
                          }}
                        />
                        <div className="game-overlay">
                          <a 
                            href={`https://store.steampowered.com/app/${game.appid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="store-link"
                          >
                            在 Steam 上查看 →
                          </a>
                        </div>
                      </div>
                      <div className="game-details">
                        <h3>{game.name}</h3>
                        <div className="game-stats">
                          <div className="stat">
                            <span className="stat-icon">⏱️</span>
                            <div className="stat-info">
                              <span className="label">總遊玩時間</span>
                              <span className="value">{formatPlaytime(game.playtime_forever || 0)}</span>
                            </div>
                          </div>
                          {game.rtime_last_played && game.rtime_last_played > 0 && (
                            <div className="stat">
                              <span className="stat-icon">🕒</span>
                              <div className="stat-info">
                                <span className="label">最後遊玩</span>
                                <span className="value">
                                  {new Date(game.rtime_last_played * 1000).toLocaleDateString('zh-TW', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit'
                                  })}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : steamSubTab === 'library' ? (
                <p className="no-data">遊戲庫為空</p>
              ) : null}
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
              {/* WakaTime 程式碼統計 */}
              {wakatimeData && !wakatimeData.error && (
                <div className="wakatime-section">
                  <h3 className="section-subtitle">💻 程式碼統計 (WakaTime)</h3>
                  
                  <div className="wakatime-stats-grid">
                    {/* 今日寫碼時間 */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      className="wakatime-card today-card"
                      whileHover={{ scale: 1.02, y: -5 }}
                    >
                      <div className="wakatime-card-header">
                        <div className="card-icon">⏱️</div>
                        <h4>今日寫碼時間</h4>
                      </div>
                      <div className="wakatime-main-stat">
                        {wakatimeData.today?.grand_total?.text || '0 hrs 0 mins'}
                      </div>
                      <div className="wakatime-sub-stats">
                        <div className="sub-stat">
                          <span className="label">開始時間</span>
                          <span className="value">
                            {(() => {
                              const startTime = wakatimeData.actualCodingTime?.start;
                              if (!startTime || !wakatimeData.actualCodingTime?.hasData) return '--:--';
                              try {
                                const date = new Date(startTime);
                                return date.toLocaleTimeString('zh-TW', { 
                                  hour: '2-digit', 
                                  minute: '2-digit',
                                  hour12: false,
                                  timeZone: 'Asia/Taipei'
                                });
                              } catch (e) {
                                console.error('解析開始時間失敗:', e);
                                return '--:--';
                              }
                            })()}
                          </span>
                        </div>
                        <div className="sub-stat">
                          <span className="label">結束時間</span>
                          <span className="value">
                            {(() => {
                              const endTime = wakatimeData.actualCodingTime?.end;
                              if (!endTime || !wakatimeData.actualCodingTime?.hasData) return '--:--';
                              try {
                                const date = new Date(endTime);
                                return date.toLocaleTimeString('zh-TW', { 
                                  hour: '2-digit', 
                                  minute: '2-digit',
                                  hour12: false,
                                  timeZone: 'Asia/Taipei'
                                });
                              } catch (e) {
                                console.error('解析結束時間失敗:', e);
                                return '--:--';
                              }
                            })()}
                          </span>
                        </div>
                      </div>
                    </motion.div>

                    {/* 本週最常用的語言 */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.1 }}
                      className="wakatime-card languages-card"
                      whileHover={{ scale: 1.02, y: -5 }}
                    >
                      <div className="wakatime-card-header">
                        <div className="card-icon">🔤</div>
                        <h4>本週最常用語言</h4>
                      </div>
                      {wakatimeData.week?.languages?.length > 0 ? (
                        <div className="language-list">
                          {wakatimeData.week.languages.slice(0, 5).map((lang, index) => (
                            <div key={index} className="language-item">
                              <div className="language-info">
                                <span className="language-name">{lang.name}</span>
                                <span className="language-time">{lang.text}</span>
                              </div>
                              <div className="language-bar-wrapper">
                                <motion.div
                                  className="language-bar"
                                  initial={{ width: 0 }}
                                  whileInView={{ width: `${lang.percent}%` }}
                                  viewport={{ once: true }}
                                  transition={{ duration: 0.8, delay: index * 0.1 }}
                                  style={{
                                    background: `linear-gradient(90deg, ${getLanguageColorGradient(lang.name)})`
                                  }}
                                />
                                <span className="language-percent">{lang.percent.toFixed(1)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="no-data-small">本週無編碼記錄</p>
                      )}
                    </motion.div>

                    {/* 主力專案投入時間分佈 */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.2 }}
                      className="wakatime-card projects-card full-width"
                      whileHover={{ scale: 1.01, y: -5 }}
                    >
                      <div className="wakatime-card-header">
                        <div className="card-icon">📊</div>
                        <h4>主力專案時間分佈 (本週)</h4>
                      </div>
                      {wakatimeData.week?.projects?.length > 0 ? (
                        <div className="projects-chart">
                          {wakatimeData.week.projects.slice(0, 8).map((project, index) => (
                            <motion.div
                              key={index}
                              className="project-bar-item"
                              initial={{ opacity: 0, x: -20 }}
                              whileInView={{ opacity: 1, x: 0 }}
                              viewport={{ once: true }}
                              transition={{ delay: index * 0.05 }}
                            >
                              <div className="project-label">
                                <span className="project-name">{project.name}</span>
                                <span className="project-time">{project.text}</span>
                              </div>
                              <div className="project-bar-bg">
                                <motion.div
                                  className="project-bar-fill"
                                  initial={{ width: 0 }}
                                  whileInView={{ width: `${project.percent}%` }}
                                  viewport={{ once: true }}
                                  transition={{ duration: 0.8, delay: 0.2 + index * 0.05 }}
                                />
                                <span className="project-percent">{project.percent.toFixed(1)}%</span>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <p className="no-data-small">本週無專案記錄</p>
                      )}
                    </motion.div>
                  </div>
                </div>
              )}

              {wakatimeData?.error && (
                <div className="error-message wakatime-error">
                  <p>{wakatimeData.error}</p>
                  {!wakatimeData.configured && (
                    <div className="config-hint">
                      <p>如何配置 WakaTime API:</p>
                      <ol>
                        <li>在 <a href="https://wakatime.com/settings/account" target="_blank" rel="noopener noreferrer">WakaTime 設定頁面</a> 獲取 API 金鑰</li>
                        <li>在 server/.env 文件中添加: <code>WAKATIME_API_KEY=你的API金鑰</code></li>
                        <li>重啟後端服務器</li>
                      </ol>
                    </div>
                  )}
                </div>
              )}

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
                  {/* GitHub 貢獻熱度圖 */}
                  {contributionData.length > 0 && (
                    <>
                      <div className="contribution-header">
                        <div className="header-left">
                          <h3 className="section-subtitle">🔥 過去一年貢獻熱度</h3>
                          <button 
                            className="refresh-button"
                            onClick={() => {
                              console.log('🔄 手動刷新 GitHub 貢獻資料...');
                              fetchGithubData();
                            }}
                            title="刷新貢獻資料"
                          >
                            🔄
                          </button>
                        </div>
                        {githubData?.contributions?.total && (
                          <div className="contribution-total">
                            <span className="total-number">{githubData.contributions.total[Object.keys(githubData.contributions.total)[0]]}</span>
                            <span className="total-label">contributions in {new Date().getFullYear()}</span>
                          </div>
                        )}
                      </div>
                      <motion.div
                        className="contribution-heatmap"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                      >
                        <div className="heatmap-grid">
                          {contributionData.map((week, weekIndex) => (
                            <div key={weekIndex} className="heatmap-week">
                              {week.map((day, dayIndex) => (
                                <motion.div
                                  key={`${weekIndex}-${dayIndex}`}
                                  className={`heatmap-day level-${day.level}`}
                                  initial={{ opacity: 0, scale: 0 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ 
                                    delay: (weekIndex * 7 + dayIndex) * 0.01,
                                    duration: 0.2 
                                  }}
                                  whileHover={{ scale: 1.3 }}
                                  title={`${day.date}: ${day.count} commits`}
                                >
                                  <div className="day-tooltip">
                                    <div>{day.count} commits</div>
                                    <div className="tooltip-date">{day.date}</div>
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          ))}
                        </div>
                        <div className="heatmap-legend">
                          <span>較少</span>
                          <div className="legend-squares">
                            {[0, 1, 2, 3, 4].map(level => (
                              <div key={level} className={`legend-square level-${level}`} />
                            ))}
                          </div>
                          <span>較多</span>
                        </div>
                      </motion.div>
                    </>
                  )}

                  {/* GitHub 統計卡片 */}
                  {githubData?.user && (
                    <div className="github-stats-cards">
                      <motion.div 
                        className="stat-card-small"
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        whileHover={{ scale: 1.05 }}
                      >
                        <div className="stat-icon">⭐</div>
                        <div className="stat-value">
                          {githubData.recentRepos?.reduce((sum, repo) => sum + repo.stargazers_count, 0) || 0}
                        </div>
                        <div className="stat-label">Total Stars</div>
                      </motion.div>

                      <motion.div 
                        className="stat-card-small"
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        whileHover={{ scale: 1.05 }}
                      >
                        <div className="stat-icon">🍴</div>
                        <div className="stat-value">
                          {githubData.recentRepos?.reduce((sum, repo) => sum + repo.forks_count, 0) || 0}
                        </div>
                        <div className="stat-label">Total Forks</div>
                      </motion.div>

                      <motion.div 
                        className="stat-card-small"
                        initial={{ opacity: 0, x: 10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        whileHover={{ scale: 1.05 }}
                      >
                        <div className="stat-icon">📦</div>
                        <div className="stat-value">{githubData.user.public_repos || 0}</div>
                        <div className="stat-label">Repositories</div>
                      </motion.div>

                      <motion.div 
                        className="stat-card-small"
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 }}
                        whileHover={{ scale: 1.05 }}
                      >
                        <div className="stat-icon">📝</div>
                        <div className="stat-value">{githubData.recentCommits?.length || 0}</div>
                        <div className="stat-label">Recent Commits</div>
                      </motion.div>
                    </div>
                  )}

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

// 根據語言返回對應的漸層色
const getLanguageColorGradient = (language) => {
  const gradients = {
    JavaScript: 'rgba(241, 224, 90, 0.8), rgba(241, 224, 90, 0.4)',
    TypeScript: 'rgba(43, 116, 137, 0.8), rgba(43, 116, 137, 0.4)',
    Python: 'rgba(53, 114, 165, 0.8), rgba(53, 114, 165, 0.4)',
    Java: 'rgba(176, 114, 25, 0.8), rgba(176, 114, 25, 0.4)',
    'C++': 'rgba(243, 75, 125, 0.8), rgba(243, 75, 125, 0.4)',
    C: 'rgba(85, 85, 85, 0.8), rgba(85, 85, 85, 0.4)',
    Go: 'rgba(0, 173, 216, 0.8), rgba(0, 173, 216, 0.4)',
    Rust: 'rgba(222, 165, 132, 0.8), rgba(222, 165, 132, 0.4)',
    PHP: 'rgba(79, 93, 149, 0.8), rgba(79, 93, 149, 0.4)',
    Ruby: 'rgba(112, 21, 22, 0.8), rgba(112, 21, 22, 0.4)',
    Swift: 'rgba(255, 172, 69, 0.8), rgba(255, 172, 69, 0.4)',
    Kotlin: 'rgba(241, 142, 51, 0.8), rgba(241, 142, 51, 0.4)',
    Dart: 'rgba(0, 180, 171, 0.8), rgba(0, 180, 171, 0.4)',
    HTML: 'rgba(227, 76, 38, 0.8), rgba(227, 76, 38, 0.4)',
    CSS: 'rgba(86, 61, 124, 0.8), rgba(86, 61, 124, 0.4)',
  };
  return gradients[language] || 'rgba(130, 87, 230, 0.8), rgba(130, 87, 230, 0.4)';
};

export default Activity;
