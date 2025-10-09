import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Music.css';

const Music = () => {
  const [spotifyData, setSpotifyData] = useState(null);
  const [recentlyPlayed, setRecentlyPlayed] = useState(null);
  const [topGenres, setTopGenres] = useState(null);
  const [topTracks, setTopTracks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('recent');
  const [timeRange, setTimeRange] = useState('medium_term');
  const [hoveredCard, setHoveredCard] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

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
    fetchMusicData();
    
    // 每10分鐘自動更新一次 Spotify 資料
    const dataRefreshInterval = setInterval(() => {
      console.log('🎵 自動更新 Spotify 資料...');
      fetchMusicData();
    }, 10 * 60 * 1000); // 10 分鐘
    
    return () => {
      clearInterval(dataRefreshInterval);
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'yearly') {
      fetchTopTracks(timeRange);
    }
  }, [timeRange, activeTab]);

  const fetchMusicData = async () => {
    setLoading(true);
    await Promise.all([
      fetchRecentlyPlayed(),
      fetchTopGenres(),
      fetchTopTracks('medium_term')
    ]);
    setLoading(false);
  };

  const fetchRecentlyPlayed = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${apiUrl}/spotify/recently-played`);
      const data = await response.json();

      if (data.error) {
        setRecentlyPlayed({ error: data.error, configured: false });
        return;
      }

      setRecentlyPlayed({
        tracks: data.items || [],
        configured: true
      });
    } catch (error) {
      console.error('獲取 Spotify 最近播放失敗:', error);
      setRecentlyPlayed({
        error: '無法連接到後端 API',
        configured: false
      });
    }
  };

  const fetchTopGenres = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${apiUrl}/spotify/top-genres`);
      const data = await response.json();

      if (data.error) {
        setTopGenres({ error: data.error, configured: false });
        return;
      }

      setTopGenres({
        genres: data.genres || [],
        configured: true
      });
    } catch (error) {
      console.error('獲取 Spotify 曲風失敗:', error);
      setTopGenres({
        error: '無法連接到後端 API',
        configured: false
      });
    }
  };

  const fetchTopTracks = async (range) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${apiUrl}/spotify/top-tracks?time_range=${range}&limit=20`);
      const data = await response.json();

      if (data.error) {
        setTopTracks({ error: data.error, configured: false });
        return;
      }

      setTopTracks({
        tracks: data.items || [],
        configured: true
      });
    } catch (error) {
      console.error('獲取 Spotify 年度歌單失敗:', error);
      setTopTracks({
        error: '無法連接到後端 API',
        configured: false
      });
    }
  };

  const formatDuration = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 60) return `${diffMins} 分鐘前`;
    if (diffHours < 24) return `${diffHours} 小時前`;
    return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
  };

  const getGenreColor = (index) => {
    const colors = [
      'linear-gradient(135deg, rgba(236, 72, 153, 0.8), rgba(168, 85, 247, 0.8))',
      'linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(6, 182, 212, 0.8))',
      'linear-gradient(135deg, rgba(16, 185, 129, 0.8), rgba(52, 211, 153, 0.8))',
      'linear-gradient(135deg, rgba(245, 158, 11, 0.8), rgba(251, 191, 36, 0.8))',
      'linear-gradient(135deg, rgba(239, 68, 68, 0.8), rgba(220, 38, 38, 0.8))'
    ];
    return colors[index % colors.length];
  };

  if (loading) {
    return (
      <div className="music-container">
        <div className="music-loading">
          <div className="vinyl-loader">
            <div className="vinyl-disc"></div>
            <div className="vinyl-center"></div>
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            正在載入音樂資料...
          </motion.p>
        </div>
      </div>
    );
  }

  return (
    <div className="music-container" ref={containerRef}>
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
        className="music-header"
      >
        <motion.h1
          className="music-title"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <span className="title-gradient">音樂星域</span>
          <motion.span
            className="title-icon"
            animate={{
              rotate: [0, 360],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "linear"
            }}
          >
            🎵
          </motion.span>
        </motion.h1>

        <motion.p
          className="music-subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          探索我的音樂品味與收藏 🎧
        </motion.p>
      </motion.div>

      <motion.div
        className="music-tabs"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        {[
          { id: 'recent', icon: '⏱️', label: '最近播放' },
          { id: 'genres', icon: '🎼', label: '最愛曲風' },
          { id: 'yearly', icon: '🏆', label: '年度歌單' }
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

      <div className="music-content">
        <AnimatePresence mode="wait">
          {activeTab === 'recent' && (
            <motion.div
              key="recent"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="tracks-section"
            >
              <h2 className="section-title">🎵 最近播放的 10 首歌</h2>
              {recentlyPlayed?.error ? (
                <div className="error-message">
                  <p>{recentlyPlayed.error}</p>
                  {!recentlyPlayed.configured && (
                    <div className="config-hint">
                      <p>如何配置 Spotify API:</p>
                      <ol>
                        <li>前往 <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">Spotify Developer Dashboard</a></li>
                        <li>創建應用並獲取 Client ID 和 Client Secret</li>
                        <li>在 server/.env 中設置: <code>SPOTIFY_CLIENT_ID</code>, <code>SPOTIFY_CLIENT_SECRET</code>, <code>SPOTIFY_REFRESH_TOKEN</code></li>
                        <li>重啟後端服務器</li>
                      </ol>
                    </div>
                  )}
                </div>
              ) : recentlyPlayed?.tracks?.length > 0 ? (
                <div className="tracks-grid">
                  {recentlyPlayed.tracks.map((item, index) => (
                    <motion.div
                      key={`${item.track.id}-${index}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ scale: 1.02, y: -5 }}
                      onHoverStart={() => setHoveredCard(`track-${index}`)}
                      onHoverEnd={() => setHoveredCard(null)}
                      className="track-card"
                    >
                      <div className="track-cover-wrapper">
                        <img
                          src={item.track.album.images[0]?.url}
                          alt={item.track.name}
                          className="track-cover"
                        />
                        <div className="track-overlay">
                          <a
                            href={item.track.external_urls.spotify}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="spotify-link"
                          >
                            在 Spotify 上播放 →
                          </a>
                        </div>
                      </div>
                      <div className="track-info">
                        <h3>{item.track.name}</h3>
                        <p className="track-artist">{item.track.artists.map(a => a.name).join(', ')}</p>
                        <div className="track-meta">
                          <span className="track-album">{item.track.album.name}</span>
                          <span className="track-duration">{formatDuration(item.track.duration_ms)}</span>
                        </div>
                        <p className="track-time">{formatDate(item.played_at)}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="no-data">暫無最近播放記錄</p>
              )}
            </motion.div>
          )}

          {activeTab === 'genres' && (
            <motion.div
              key="genres"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="genres-section"
            >
              <h2 className="section-title">🎼 最愛的曲風 Top 5</h2>
              {topGenres?.error ? (
                <div className="error-message">
                  <p>{topGenres.error}</p>
                </div>
              ) : topGenres?.genres?.length > 0 ? (
                <div className="genres-grid">
                  {topGenres.genres.map((genre, index) => (
                    <motion.div
                      key={genre.genre}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.1 }}
                      whileHover={{ scale: 1.05, y: -8 }}
                      className="genre-card"
                      style={{
                        background: getGenreColor(index)
                      }}
                    >
                      <div className="genre-rank">#{index + 1}</div>
                      <h3 className="genre-name">{genre.genre}</h3>
                      <div className="genre-count">{genre.count} 位藝人</div>
                      <div className="genre-bar-wrapper">
                        <motion.div
                          className="genre-bar"
                          initial={{ width: 0 }}
                          animate={{ width: `${(genre.count / topGenres.genres[0].count) * 100}%` }}
                          transition={{ duration: 0.8, delay: 0.2 + index * 0.1 }}
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="no-data">暫無曲風資料</p>
              )}
            </motion.div>
          )}

          {activeTab === 'yearly' && (
            <motion.div
              key="yearly"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="yearly-section"
            >
              <div className="yearly-header">
                <h2 className="section-title">🏆 年度歌單</h2>
                <div className="time-range-selector">
                  <button
                    className={`range-btn ${timeRange === 'short_term' ? 'active' : ''}`}
                    onClick={() => setTimeRange('short_term')}
                  >
                    最近 4 週
                  </button>
                  <button
                    className={`range-btn ${timeRange === 'medium_term' ? 'active' : ''}`}
                    onClick={() => setTimeRange('medium_term')}
                  >
                    最近 6 個月
                  </button>
                  <button
                    className={`range-btn ${timeRange === 'long_term' ? 'active' : ''}`}
                    onClick={() => setTimeRange('long_term')}
                  >
                    全部時間
                  </button>
                </div>
              </div>
              {topTracks?.error ? (
                <div className="error-message">
                  <p>{topTracks.error}</p>
                </div>
              ) : topTracks?.tracks?.length > 0 ? (
                <div className="yearly-tracks-list">
                  {topTracks.tracks.map((track, index) => (
                    <motion.div
                      key={track.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      whileHover={{ scale: 1.02, x: 5 }}
                      className="yearly-track-item"
                    >
                      <div className="track-rank">#{index + 1}</div>
                      <img
                        src={track.album.images[2]?.url || track.album.images[0]?.url}
                        alt={track.name}
                        className="track-thumbnail"
                      />
                      <div className="track-details">
                        <h4>{track.name}</h4>
                        <p>{track.artists.map(a => a.name).join(', ')}</p>
                      </div>
                      <div className="track-stats">
                        <span className="track-album">{track.album.name}</span>
                        <span className="track-duration">{formatDuration(track.duration_ms)}</span>
                      </div>
                      <a
                        href={track.external_urls.spotify}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="play-btn"
                      >
                        ▶
                      </a>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="no-data">暫無年度歌單資料</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Music;
