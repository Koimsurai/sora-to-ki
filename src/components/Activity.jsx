import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { usePageVisibility } from '../contexts/PageVisibilityContext';
import SEOHead from './SEOHead';
import './Activity.css';

const Activity = () => {
  const { isVisible } = usePageVisibility();
  const [steamData, setSteamData] = useState(null);
  const [steamProfile, setSteamProfile] = useState(null);
  const [githubData, setGithubData] = useState(null);
  const [wakatimeData, setWakatimeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contributionData, setContributionData] = useState([]);
  const [contributionYear, setContributionYear] = useState('last');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [serverStatus, setServerStatus] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());


  const GITHUB_USERNAME = 'timo9378';

  useEffect(() => {
    fetchActivityData();
    checkServerStatus();

    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    const statusInterval = setInterval(() => {
      if (!document.hidden) checkServerStatus();
    }, 30000);
    const dataRefreshInterval = setInterval(() => {
      if (!document.hidden) fetchActivityData();
    }, 10 * 60 * 1000);

    return () => {
      clearInterval(timeInterval);
      clearInterval(statusInterval);
      clearInterval(dataRefreshInterval);
    };
  }, []);

  const fetchActivityData = async () => {
    setLoading(true);
    await Promise.all([fetchSteamData(), fetchGithubData(), fetchWakatimeData()]);
    setLoading(false);
  };

  const checkServerStatus = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api';
      const startTime = Date.now();
      const response = await fetch(`${apiUrl}/health`);
      const responseTime = Date.now() - startTime;
      setServerStatus(response.ok
        ? { status: 'online', responseTime, lastCheck: new Date() }
        : { status: 'error', responseTime, lastCheck: new Date() }
      );
    } catch {
      setServerStatus({ status: 'offline', responseTime: 0, lastCheck: new Date() });
    }
  };

  const getUptime = () => {
    const startDate = new Date('2025-04-01T00:00:00+08:00');
    const diffTime = Math.abs(new Date() - startDate);
    return {
      days: Math.floor(diffTime / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    };
  };

  const fetchSteamData = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api';
      const [recentRes, playerRes, ownedRes, profileRes] = await Promise.all([
        fetch(`${apiUrl}/steam/recent-games`).then(r => r.json()),
        fetch(`${apiUrl}/steam/player`).then(r => r.json()),
        fetch(`${apiUrl}/steam/owned-games`).then(r => r.json()),
        fetch(`${apiUrl}/steam/profile`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (recentRes.error || playerRes.error) {
        setSteamData({ error: recentRes.error || playerRes.error, configured: false });
        return;
      }
      setSteamData({
        recentGames: recentRes.response?.games || [],
        ownedGames: ownedRes.response?.games || [],
        gameCount: ownedRes.response?.game_count || 0,
        playerInfo: playerRes.response?.players?.[0] || null,
        configured: true,
      });
      if (profileRes && !profileRes.error) setSteamProfile(profileRes);
    } catch (error) {
      console.error('Steam fetch error:', error);
      setSteamData({ error: '無法連接到後端 API', configured: false });
    }
  };

  const fetchWakatimeData = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api';
      const [todayRes, weekRes] = await Promise.all([
        fetch(`${apiUrl}/wakatime/today`).then(r => r.json()),
        fetch(`${apiUrl}/wakatime/week`).then(r => r.json()),
      ]);
      if (todayRes.error || weekRes.error) {
        setWakatimeData({ error: todayRes.error || weekRes.error, configured: false });
        return;
      }
      setWakatimeData({
        today: todayRes.data?.[0] || null,
        week: weekRes.data || null,
        actualCodingTime: todayRes.actualCodingTime || null,
        configured: true,
      });
    } catch (error) {
      console.error('WakaTime fetch error:', error);
      setWakatimeData({ error: '無法連接到後端 API', configured: false });
    }
  };

  const fetchContributions = async (year = contributionYear) => {
    try {
      const data = await fetch(
        `https://github-contributions-api.jogruber.de/v4/${GITHUB_USERNAME}?y=${year}&_=${Date.now()}`
      ).then(r => r.json());
      if (data) {
        generateContributionDataFromAPI(data);
        setGithubData(prev => prev ? { ...prev, contributions: data } : prev);
      }
    } catch {}
  };

  const fetchGithubData = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api';
      const [userData, eventsData] = await Promise.all([
        fetch(`${apiUrl}/github/user/${GITHUB_USERNAME}`).then(r => r.json()),
        fetch(`${apiUrl}/github/events/${GITHUB_USERNAME}`).then(r => r.json()),
      ]);

      if (userData.error || eventsData.error) {
        setGithubData({ error: userData.error || eventsData.error });
        return;
      }

      const pushEvents = eventsData.filter(e => e.type === 'PushEvent').slice(0, 10);
      const reposData = await fetch(
        `https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=5`
      ).then(r => r.json());

      let contributionsData = null;
      try {
        contributionsData = await fetch(
          `https://github-contributions-api.jogruber.de/v4/${GITHUB_USERNAME}?y=${contributionYear}&_=${Date.now()}`
        ).then(r => r.json());
      } catch {}

      setGithubData({ user: userData, recentCommits: pushEvents, recentRepos: reposData, contributions: contributionsData });

      if (contributionsData) generateContributionDataFromAPI(contributionsData);
      else generateContributionData(pushEvents);
    } catch (error) {
      console.error('GitHub fetch error:', error);
      setGithubData({ error: '無法連接到後端 API' });
    }
  };

  const generateContributionDataFromAPI = (apiData) => {
    if (!apiData?.contributions) return;
    const data = [];
    const totalWeeks = Math.ceil(apiData.contributions.length / 7);
    for (let i = 0; i < totalWeeks; i++) {
      const weekData = [];
      for (let j = 0; j < 7; j++) {
        const idx = i * 7 + j;
        if (idx < apiData.contributions.length) {
          const day = apiData.contributions[idx];
          const count = day.count || 0;
          weekData.push({ date: day.date, count, level: count === 0 ? 0 : count <= 3 ? 1 : count <= 6 ? 2 : count <= 9 ? 3 : 4 });
        } else {
          weekData.push({ date: '', count: 0, level: -1 });
        }
      }
      data.push(weekData);
    }
    setContributionData(data);
  };

  const generateContributionData = (events) => {
    const data = [];
    const today = new Date();
    const commitsByDate = {};
    events.forEach(e => {
      if (e.type === 'PushEvent') {
        const d = new Date(e.created_at).toDateString();
        commitsByDate[d] = (commitsByDate[d] || 0) + (e.payload.commits?.length || 1);
      }
    });
    for (let week = 51; week >= 0; week--) {
      const weekData = [];
      for (let day = 0; day < 7; day++) {
        const d = new Date(today);
        d.setDate(d.getDate() - (week * 7 + day));
        const ds = d.toDateString();
        const count = commitsByDate[ds] || 0;
        weekData.push({ date: ds, count, level: count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 8 ? 3 : 4 });
      }
      data.push(weekData);
    }
    setContributionData(data.reverse());
  };

  const formatPlaytime = (m) => {
    const h = Math.floor(m / 60);
    return h < 1 ? `${m} 分鐘` : `${h} 小時`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const diffMs = new Date() - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 60) return `${diffMins} 分鐘前`;
    if (diffHours < 24) return `${diffHours} 小時前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return date.toLocaleDateString('zh-TW');
  };

  const featuredGame = steamData?.recentGames?.[0] || null;
  const uptime = getUptime();

  if (loading) {
    return (
      <div className="activity-page">
        <div className="activity-dim-overlay" />
        <div className="activity-nebula-bg">
          <div className="nebula-layer activity-nebula-1" />
          <div className="nebula-layer activity-nebula-2" />
          <div className="nebula-layer activity-nebula-3" />
          <div className="activity-nebula-dust" />
        </div>
        <div className="activity-loading">
          <div className="koim-loader" aria-hidden>
            <div className="koim-loader-orbit koim-loader-orbit-1" />
            <div className="koim-loader-orbit koim-loader-orbit-2" />
            <div className="koim-loader-core" />
            <div className="koim-loader-glow" />
          </div>
          <motion.p
            className="koim-loader-text"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            載入活動數據
            <span className="koim-loader-dots">
              <i></i><i></i><i></i>
            </span>
          </motion.p>
        </div>
      </div>
    );
  }

  return (
    <div className={`activity-page ${!isVisible ? 'is-hidden' : ''}`}>
      <SEOHead title="動態儀表板 | Koimsurai" description="楊泰和的即時活動儀表板。" />

      <div className="activity-dim-overlay" />
      <div className="activity-nebula-bg">
        <div className="nebula-layer activity-nebula-1" />
        <div className="nebula-layer activity-nebula-2" />
        <div className="nebula-layer activity-nebula-3" />
        <div className="activity-nebula-dust" />
      </div>

      <div className="activity-content-wrapper">

        {/* ─── Section 1: Status Bar ─── */}
        <motion.div
          className="status-bar"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="status-bar-left">
            <div className={`status-dot-inline ${serverStatus?.status || 'checking'}`} />
            <span className="status-bar-text">
              {serverStatus?.status === 'online' ? 'Server Online' : serverStatus?.status === 'offline' ? 'Offline' : 'Checking...'}
            </span>
            {serverStatus?.responseTime > 0 && (
              <span className="status-bar-meta">{serverStatus.responseTime}ms</span>
            )}
          </div>
          <div className="status-bar-right">
            <span className="status-bar-meta">Uptime {uptime.days}d {uptime.hours}h</span>
            <span className="status-bar-time">
              {currentTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </motion.div>

        {/* ─── Section 2: Hero Numbers ─── */}
        <motion.div
          className="hero-numbers"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div className="hero-number-item">
            <span className="hero-num">{steamData?.gameCount || 0}</span>
            <span className="hero-label">遊戲收藏</span>
          </div>
          <span className="hero-divider" />
          <div className="hero-number-item">
            <span className="hero-num">{githubData?.user?.public_repos || 0}</span>
            <span className="hero-label">公開專案</span>
          </div>
          <span className="hero-divider" />
          <div className="hero-number-item">
            <span className="hero-num">{githubData?.recentRepos?.reduce((s, r) => s + r.stargazers_count, 0) || 0}</span>
            <span className="hero-label">Stars</span>
          </div>
          <span className="hero-divider" />
          <div className="hero-number-item">
            <span className="hero-num">{wakatimeData?.today?.grand_total?.text || '0 hrs'}</span>
            <span className="hero-label">今日寫碼</span>
          </div>
        </motion.div>

        {/* ─── Section 3a: Steam Profile — Steam hover-card 風格 ─── */}
        {steamData?.playerInfo && (() => {
          const cust = steamProfile?.customization || {};
          const hasAnimAvatar = cust.animatedAvatar && cust.animatedAvatar !== cust.avatarFrame;
          const isInGame = !!steamData.playerInfo.gameid;
          const stateText = isInGame
            ? '遊戲中'
            : (steamData.playerInfo.personastate === 1 ? '線上' : '離線');
          return (
            <motion.a
              href={steamProfile?.profileUrl || steamData.playerInfo.profileurl}
              target="_blank"
              rel="noopener noreferrer"
              className={`steam-profile-card ${isInGame ? 'is-in-game' : ''} ${steamData.playerInfo.personastate === 1 ? 'is-online' : 'is-offline'}`}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              {cust.nameplateWebm && (
                <video
                  className="steam-profile-bg"
                  autoPlay muted loop playsInline
                  poster={cust.nameplateMp4}
                >
                  <source src={cust.nameplateWebm} type="video/webm" />
                  {cust.nameplateMp4 && <source src={cust.nameplateMp4} type="video/mp4" />}
                </video>
              )}
              <div className="steam-profile-overlay" />
              <div className="steam-profile-content">
                <div className="steam-profile-avatar-wrap">
                  <img
                    src={hasAnimAvatar ? cust.animatedAvatar : steamData.playerInfo.avatarfull}
                    alt="Steam avatar"
                    className="steam-profile-avatar"
                  />
                  {cust.avatarFrame && (
                    <img className="steam-profile-avatar-frame" src={cust.avatarFrame} alt="" aria-hidden />
                  )}
                </div>
                <div className="steam-profile-meta">
                  <div className="steam-profile-name-row">
                    <h3 className="steam-profile-name">{steamData.playerInfo.personaname}</h3>
                    {steamProfile?.level != null && (
                      <span className="steam-profile-level" title={`${steamProfile.xp} XP · 還需 ${steamProfile.xpToNext} XP 升級`}>
                        Lv.{steamProfile.level}
                      </span>
                    )}
                  </div>
                  <div className="steam-profile-status">
                    <span className="steam-profile-dot" />
                    {stateText}
                    <span className="steam-profile-divider">·</span>
                    {steamData.gameCount} 個遊戲
                    {steamProfile?.badgeCount ? (
                      <>
                        <span className="steam-profile-divider">·</span>
                        {steamProfile.badgeCount} 個徽章
                      </>
                    ) : null}
                  </div>
                  {steamProfile?.customization?.featuredBadge && (
                    <div className="steam-profile-featured" title={steamProfile.customization.featuredBadge.xp}>
                      <img src={steamProfile.customization.featuredBadge.icon} alt="" />
                      <span>{steamProfile.customization.featuredBadge.name}</span>
                    </div>
                  )}
                </div>
                <span className="koim-btn steam-profile-cta-btn">
                  Steam<span aria-hidden>→</span>
                </span>
              </div>
            </motion.a>
          );
        })()}

        {/* ─── Section 3b: 最近遊玩 — horizontal snap scroll ─── */}
        {steamData?.recentGames?.length > 0 && (
          <motion.section
            className="steam-recent-section"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.05 }}
          >
            <header className="steam-recent-header">
              <span className="section-label">
                {steamData.playerInfo?.gameid ? '現正遊玩 · 最近兩週' : '最近兩週'}
              </span>
              <span className="steam-recent-count">{steamData.recentGames.length} 款</span>
            </header>
            <div className="steam-recent-scroll" role="list">
              {steamData.recentGames.map((g, idx) => {
                const isCurrent = String(steamData.playerInfo?.gameid || '') === String(g.appid);
                return (
                  <a
                    key={g.appid}
                    href={`https://store.steampowered.com/app/${g.appid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`steam-recent-card${isCurrent ? ' is-current' : ''}${idx === 0 && !isCurrent ? ' is-featured' : ''}`}
                    role="listitem"
                  >
                    <div
                      className="steam-recent-cover"
                      style={{ backgroundImage: `url(https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg)` }}
                    />
                    <div className="steam-recent-overlay" />
                    {isCurrent && <span className="steam-recent-pulse">遊戲中</span>}
                    <div className="steam-recent-info">
                      <h4 className="steam-recent-title">{g.name}</h4>
                      <div className="steam-recent-stats">
                        <span>近兩週 {formatPlaytime(g.playtime_2weeks || 0)}</span>
                        <span className="steam-recent-divider">·</span>
                        <span>總 {formatPlaytime(g.playtime_forever || 0)}</span>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </motion.section>
        )}

        {/* ─── Section 4: Code Pulse — split layout ─── */}
        {wakatimeData && !wakatimeData.error && (
          <motion.div
            className="code-pulse-section"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="code-pulse-left">
              <span className="section-label">CODE PULSE</span>
              <div className="code-pulse-today">
                {wakatimeData.today?.grand_total?.text || '0 hrs 0 mins'}
              </div>
              <span className="code-pulse-sub">今日寫碼時間</span>
            </div>
            <div className="code-pulse-right">
              {wakatimeData.week?.languages?.length > 0 ? (
                <div className="lang-bars">
                  {wakatimeData.week.languages.slice(0, 5).map((lang, i) => (
                    <div key={i} className="lang-bar-row">
                      <div className="lang-bar-meta">
                        <span className="lang-bar-name">{lang.name}</span>
                        <span className="lang-bar-time">{lang.text}</span>
                      </div>
                      <div className="lang-bar-track">
                        <motion.div
                          className="lang-bar-fill"
                          initial={{ width: 0 }}
                          whileInView={{ width: `${lang.percent}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.8, delay: i * 0.1 }}
                          style={{ background: `linear-gradient(90deg, ${getLanguageColorGradient(lang.name)})` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-data-small">本週無編碼記錄</p>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── Section 5: Contribution Heatmap — standalone ─── */}
        {contributionData.length > 0 && (
          <motion.div
            className="heatmap-section"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="heatmap-section-header">
              {githubData?.user && (
                <a href={githubData.user.html_url} target="_blank" rel="noopener noreferrer" className="heatmap-profile">
                  <img src={githubData.user.avatar_url} alt="GitHub" className="heatmap-avatar" />
                  <span>{githubData.user.name || githubData.user.login}</span>
                </a>
              )}
              {githubData?.contributions?.total && (
                <div className="heatmap-total">
                  <span className="heatmap-total-num">
                    {githubData.contributions.total[Object.keys(githubData.contributions.total)[0]]}
                  </span>
                  <span className="heatmap-total-label">
                    contributions in {contributionYear === 'last' ? 'the last year' : contributionYear}
                  </span>
                </div>
              )}
              <button
                className={`refresh-icon-btn${isRefreshing ? ' spinning' : ''}`}
                onClick={async () => {
                  setIsRefreshing(true);
                  await fetchContributions();
                  setIsRefreshing(false);
                }}
                title="刷新"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6" />
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                  <path d="M3 22v-6h6" />
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
              </button>
            </div>
            <div className="heatmap-year-selector">
              {['last', '2025', '2024', '2023'].map(y => (
                <button
                  key={y}
                  className={`year-btn${contributionYear === y ? ' active' : ''}`}
                  onClick={async () => {
                    if (contributionYear === y) return;
                    setContributionYear(y);
                    setIsRefreshing(true);
                    await fetchContributions(y);
                    setIsRefreshing(false);
                  }}
                >
                  {y === 'last' ? 'Last Year' : y}
                </button>
              ))}
            </div>
            <div className="heatmap-grid-wrapper">
              <div className="heatmap-grid">
                {contributionData.map((week, wi) => (
                  <div key={wi} className="heatmap-week">
                    {week.map((day, di) => (
                      <div key={`${wi}-${di}`} className={`heatmap-day level-${day.level}`}>
                        <div className="day-tooltip">
                          <div>{day.count} commits</div>
                          <div className="tooltip-date">{day.date}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="heatmap-legend">
              <span>Less</span>
              <div className="legend-squares">
                {[0, 1, 2, 3, 4].map(l => <div key={l} className={`legend-square level-${l}`} />)}
              </div>
              <span>More</span>
            </div>
          </motion.div>
        )}

        {/* ─── Section 6: Recent Commits — minimal timeline ─── */}
        {githubData?.recentCommits?.length > 0 && (
          <motion.div
            className="commits-section"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="section-label">RECENT COMMITS</span>
            <div className="commits-list">
              {githubData.recentCommits.slice(0, 8).map((event, i) => (
                <div key={`${event.id}-${i}`} className="commit-event">
                  <div className="commit-event-header">
                    <div className="commit-dot" />
                    <span className="commit-repo">{event.repo.name.split('/')[1]}</span>
                    <span className="commit-when">{formatDate(event.created_at)}</span>
                  </div>
                  <div className="commit-messages">
                    {(event.payload.commits || []).length > 0 ? (
                      <>
                        {event.payload.commits.slice(0, 3).map((commit, ci) => (
                          <a
                            key={ci}
                            className="commit-msg-row"
                            href={`https://github.com/${event.repo.name}/commit/${commit.sha}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <code className="commit-sha">{commit.sha.slice(0, 7)}</code>
                            <span className="commit-msg">{commit.message.split('\n')[0]}</span>
                          </a>
                        ))}
                        {event.payload.commits.length > 3 && (
                          <span className="commit-more">+{event.payload.commits.length - 3} more</span>
                        )}
                      </>
                    ) : (
                      <a
                        className="commit-msg-row"
                        href={`https://github.com/${event.repo.name}/compare/${event.payload.before?.slice(0, 7)}...${event.payload.head?.slice(0, 7)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <code className="commit-sha">{event.payload.head?.slice(0, 7) || '—'}</code>
                        <span className="commit-msg">Pushed {event.payload.size || 1} commit{(event.payload.size || 1) > 1 ? 's' : ''}</span>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ─── Section 7: Projects time distribution ─── */}
        {wakatimeData?.week?.projects?.length > 0 && (
          <motion.div
            className="projects-section"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="section-label">WEEKLY PROJECTS</span>
            <div className="projects-bars">
              {wakatimeData.week.projects.slice(0, 6).map((project, i) => (
                <div key={i} className="project-row">
                  <div className="project-row-meta">
                    <span className="project-row-name">{project.name}</span>
                    <span className="project-row-time">{project.text}</span>
                  </div>
                  <div className="project-row-track">
                    <motion.div
                      className="project-row-fill"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${project.percent}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: i * 0.06 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ─── Section 8: Game Gallery — auto-scroll marquee ─── */}
        {steamData?.ownedGames?.length > 0 && (() => {
          const sortedGames = [...steamData.ownedGames]
            .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
            .slice(0, 30);
          return (
            <motion.div
              className="game-gallery-section"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="game-gallery-header">
                <span className="section-label">GAME LIBRARY</span>
                <span className="game-gallery-count">{steamData.gameCount} games</span>
              </div>
              <div className="game-marquee-wrapper">
                <div className="game-marquee-track">
                  {[...sortedGames, ...sortedGames].map((game, i) => (
                    <a
                      key={`${game.appid}-${i}`}
                      href={`https://store.steampowered.com/app/${game.appid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="game-gallery-item"
                    >
                      <img
                        src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`}
                        alt={game.name}
                        loading="lazy"
                        onError={(e) => {
                          e.target.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/capsule_616x353.jpg`;
                        }}
                      />
                      <div className="game-gallery-info">
                        <span>{game.name}</span>
                        <span className="game-gallery-time">{formatPlaytime(game.playtime_forever || 0)}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })()}

        {/* ─── Section 9: Repos — simple list ─── */}
        {githubData?.recentRepos?.length > 0 && (
          <motion.div
            className="repos-section"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="section-label">RECENT REPOS</span>
            <div className="repos-list">
              {githubData.recentRepos.map(repo => (
                <a key={repo.id} href={repo.html_url} target="_blank" rel="noopener noreferrer" className="repo-row">
                  <div className="repo-row-left">
                    <h4>{repo.name}</h4>
                    <p>{repo.description || '沒有描述'}</p>
                  </div>
                  <div className="repo-row-right">
                    {repo.language && (
                      <span className="repo-lang">
                        <span className="lang-dot" style={{ backgroundColor: getLanguageColor(repo.language) }} />
                        {repo.language}
                      </span>
                    )}
                    <span>⭐ {repo.stargazers_count}</span>
                  </div>
                </a>
              ))}
            </div>
          </motion.div>
        )}

      </div>
    </div>
  );
};

const getLanguageColor = (lang) => {
  const c = { JavaScript:'#f1e05a', TypeScript:'#2b7489', Python:'#3572A5', Java:'#b07219', 'C++':'#f34b7d', C:'#555', Go:'#00ADD8', Rust:'#dea584', PHP:'#4F5D95', Ruby:'#701516', Swift:'#ffac45', Kotlin:'#F18E33', Dart:'#00B4AB', HTML:'#e34c26', CSS:'#563d7c' };
  return c[lang] || '#8257e6';
};

const getLanguageColorGradient = (lang) => {
  const g = { JavaScript:'rgba(241,224,90,0.8),rgba(241,224,90,0.4)', TypeScript:'rgba(43,116,137,0.8),rgba(43,116,137,0.4)', Python:'rgba(53,114,165,0.8),rgba(53,114,165,0.4)', Java:'rgba(176,114,25,0.8),rgba(176,114,25,0.4)', 'C++':'rgba(243,75,125,0.8),rgba(243,75,125,0.4)', C:'rgba(85,85,85,0.8),rgba(85,85,85,0.4)', Go:'rgba(0,173,216,0.8),rgba(0,173,216,0.4)', Rust:'rgba(222,165,132,0.8),rgba(222,165,132,0.4)', PHP:'rgba(79,93,149,0.8),rgba(79,93,149,0.4)', Ruby:'rgba(112,21,22,0.8),rgba(112,21,22,0.4)', Swift:'rgba(255,172,69,0.8),rgba(255,172,69,0.4)', Kotlin:'rgba(241,142,51,0.8),rgba(241,142,51,0.4)', Dart:'rgba(0,180,171,0.8),rgba(0,180,171,0.4)', HTML:'rgba(227,76,38,0.8),rgba(227,76,38,0.4)', CSS:'rgba(86,61,124,0.8),rgba(86,61,124,0.4)' };
  return g[lang] || 'rgba(130,87,230,0.8),rgba(130,87,230,0.4)';
};

export default Activity;
