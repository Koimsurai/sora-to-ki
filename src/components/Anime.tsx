import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaStar, FaPlay, FaTimes, FaFilter, FaSortAmountDown, FaChartLine } from 'react-icons/fa';
import SEOHead from './SEOHead';
import './Anime.css';

// 模擬動漫數據
interface AnimeItem {
  id: number | string;
  title: string;
  titleEn: string;
  year: number;
  poster: string;
  rating: number;
  genre: string[];
  status: string;
  statusColor: string;
  currentEpisode: string;
  totalEpisodes: number;
  watchDate: string;
  watching: boolean;
  myTake: string;
  description: string;
  communityRating: number;
}

// 後端 /api/collection/anime 回傳的原始格式
interface AnimeApiItem {
  id: number | string;
  title: string;
  original_title?: string;
  year?: number;
  poster_url?: string;
  rating?: number;
  status?: string;
  media_format?: string;
  watch_date?: string;
  review?: string;
  overview?: string;
}

interface AnimeApiResponse {
  items?: AnimeApiItem[];
}

const animeData: AnimeItem[] = [
  {
    id: 1,
    title: '進擊的巨人',
    titleEn: 'Attack on Titan',
    year: 2013,
    poster: 'https://cdn.myanimelist.net/images/anime/10/47347.jpg',
    rating: 5,
    genre: ['動作', '奇幻', '劇情'],
    status: '已追完',
    statusColor: '#22c55e',
    currentEpisode: 'Final Season',
    totalEpisodes: 87,
    watchDate: '2024-01-20',
    watching: false,
    myTake: '史詩級的動畫傑作!每一季都能帶來震撼的劇情反轉。從單純的人類對抗巨人,到揭開整個世界的真相,劇情層層遞進,引人入勝。配樂和作畫都達到了業界頂尖水準。',
    description: '人類居住在巨大的高牆內,以躲避會吃人的巨人。艾連·葉卡在目睹母親被巨人吞噬後,發誓要消滅所有巨人。',
    communityRating: 9.1
  },
  {
    id: 2,
    title: '鬼滅之刃',
    titleEn: 'Demon Slayer',
    year: 2019,
    poster: 'https://cdn.myanimelist.net/images/anime/1286/99889.jpg',
    rating: 5,
    genre: ['動作', '奇幻'],
    status: 'N刷神作',
    statusColor: '#3b82f6',
    currentEpisode: '刀匠村篇',
    totalEpisodes: 44,
    watchDate: '2024-02-15',
    watching: true,
    myTake: 'ufotable的作畫簡直是藝術品!水之呼吸、火之呼吸的戰鬥場景流暢而華麗。故事雖然看似簡單,但兄妹情深的羈絆和炭治郎的善良深深打動人心。配樂也是一絕!',
    description: '竈門炭治郎的家人被鬼殺害,唯一倖存的妹妹禰豆子變成了鬼。炭治郎為了讓妹妹變回人類,踏上了斬鬼之旅。',
    communityRating: 8.7
  },
  {
    id: 3,
    title: '咒術迴戰',
    titleEn: 'Jujutsu Kaisen',
    year: 2020,
    poster: 'https://cdn.myanimelist.net/images/anime/1171/109222.jpg',
    rating: 5,
    genre: ['動作', '奇幻', '黑暗'],
    status: '正在追',
    statusColor: '#f59e0b',
    currentEpisode: 'S2E23',
    totalEpisodes: 47,
    watchDate: '2024-03-10',
    watching: true,
    myTake: '新生代王道動漫的代表作!戰鬥系統設計巧妙,領域展開的概念令人眼前一亮。MAPPA的製作水準極高,打鬥場面行雲流水。角色塑造立體,反派也很有魅力。',
    description: '虎杖悠仁為了拯救學長,吞下了詛咒之王宿儺的手指,從此踏入咒術師的世界。',
    communityRating: 8.8
  },
  {
    id: 4,
    title: 'BLEACH 死神 千年血戰篇',
    titleEn: 'Bleach: Thousand-Year Blood War',
    year: 2022,
    poster: 'https://cdn.myanimelist.net/images/anime/1764/126627.jpg',
    rating: 4,
    genre: ['動作', '奇幻'],
    status: '正在追',
    statusColor: '#f59e0b',
    currentEpisode: 'S2E12',
    totalEpisodes: 26,
    watchDate: '2024-03-25',
    watching: true,
    myTake: '久違的BLEACH回歸!千年血戰篇的節奏和作畫比當年的TV版提升了一個檔次。看到老角色們再次登場還是很激動的。靈王的設定終於要揭曉了!',
    description: '無形帝國突然襲擊屍魂界,死神們面臨前所未有的危機。黑崎一護必須覺醒新的力量來對抗滅卻師之王。',
    communityRating: 8.9
  },
  {
    id: 5,
    title: '葬送的芙莉蓮',
    titleEn: 'Frieren: Beyond Journey\'s End',
    year: 2023,
    poster: 'https://cdn.myanimelist.net/images/anime/1015/138006.jpg',
    rating: 5,
    genre: ['奇幻', '冒險', '劇情'],
    status: 'N刷神作',
    statusColor: '#3b82f6',
    currentEpisode: 'S1E28',
    totalEpisodes: 28,
    watchDate: '2024-04-05',
    watching: false,
    myTake: '2023年度最佳動畫!以"後勇者時代"為背景,細膩地描繪了時間與記憶的意義。芙莉蓮對人類情感的重新認識令人動容。作畫精美,音樂優美,是一部真正的藝術品。',
    description: '勇者一行打倒魔王後,精靈魔法使芙莉蓮在漫長的生命中,逐漸理解人類短暫生命的可貴與情感的意義。',
    communityRating: 9.3
  },
  {
    id: 6,
    title: '間諜家家酒',
    titleEn: 'SPY×FAMILY',
    year: 2022,
    poster: 'https://cdn.myanimelist.net/images/anime/1441/122795.jpg',
    rating: 4,
    genre: ['喜劇', '動作', '日常'],
    status: '已追完',
    statusColor: '#22c55e',
    currentEpisode: 'S2E12',
    totalEpisodes: 25,
    watchDate: '2024-02-28',
    watching: false,
    myTake: '溫馨又搞笑的家庭喜劇!間諜爸爸、殺手媽媽和超能力女兒組成的假扮家庭,意外地充滿了真實的情感。安妮亞的表情包實在太可愛了!',
    description: '頂尖間諜黃昏為了執行任務,必須組建一個家庭。他領養了能讀心的少女安妮亞,並與神秘的約兒結婚,開始了偽裝家庭的生活。',
    communityRating: 8.6
  },
  {
    id: 7,
    title: '鏈鋸人',
    titleEn: 'Chainsaw Man',
    year: 2022,
    poster: 'https://cdn.myanimelist.net/images/anime/1806/126216.jpg',
    rating: 4,
    genre: ['動作', '黑暗', '奇幻'],
    status: '已追完',
    statusColor: '#22c55e',
    currentEpisode: 'S1E12',
    totalEpisodes: 12,
    watchDate: '2023-12-20',
    watching: false,
    myTake: 'MAPPA的電影級製作!每一集的ED都不同,音樂選曲超棒。故事荒誕而血腥,但也充滿了對人性的探討。電次和帕瓦的組合令人難忘。',
    description: '被惡魔殺害的電次與鏈鋸惡魔波奇塔合為一體,獲得了變身成鏈鋸人的能力,並加入了公安對魔特異課。',
    communityRating: 8.5
  },
  {
    id: 8,
    title: '我推的孩子',
    titleEn: 'Oshi no Ko',
    year: 2023,
    poster: 'https://cdn.myanimelist.net/images/anime/1812/134736.jpg',
    rating: 5,
    genre: ['劇情', '懸疑', '偶像'],
    status: '正在追',
    statusColor: '#f59e0b',
    currentEpisode: 'S2E10',
    totalEpisodes: 22,
    watchDate: '2024-03-15',
    watching: true,
    myTake: '第一集90分鐘直接震撼全場!揭露了演藝圈的黑暗面,同時又充滿了對夢想的追求。YOASOBI的《Idol》完美詮釋了故事的主題。劇情反轉一個接一個。',
    description: '產科醫生轉生為偶像星野愛的兒子,與妹妹一起進入演藝圈,尋找殺害母親的真相。',
    communityRating: 8.8
  }
];

// 正在追番區塊元件
const WatchingSection = ({ animes, onAnimeClick }: { animes: AnimeItem[]; onAnimeClick: (anime: AnimeItem) => void }) => {
  const watchingAnimes = animes.filter(a => a.watching);

  if (watchingAnimes.length === 0) return null;

  return (
    <div className="watching-section">
      <h2 className="section-title">
        <span className="title-icon">📺</span>
        正在追番
      </h2>
      <div className="watching-grid">
        {watchingAnimes.map((anime) => (
          <motion.div
            key={anime.id}
            className="watching-card"
            whileHover={{ y: -5, scale: 1.02 }}
            onClick={() => onAnimeClick(anime)}
          >
            <div className="watching-poster">
              <img src={anime.poster} alt={anime.title} />
              <div className="watching-overlay">
                <FaPlay className="play-icon" />
              </div>
            </div>
            <div className="watching-info">
              <h3>{anime.title}</h3>
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ 
                    width: `${(parseInt(/\d+/.exec(anime.currentEpisode)?.[0] ?? '0', 10) / anime.totalEpisodes) * 100}%` 
                  }}
                />
              </div>
              <p className="progress-text">{anime.currentEpisode}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

// 動漫卡片元件 (瀑布流)
const AnimeCard = ({ anime, onClick }: { anime: AnimeItem; onClick: (anime: AnimeItem) => void }) => {
  return (
    <motion.div 
      className="anime-card"
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300 }}
      onClick={() => onClick(anime)}
    >
      <div className="anime-poster">
        <img src={anime.poster} alt={anime.title} />
        <div className="anime-overlay">
          <FaPlay className="play-icon" />
        </div>
        <div 
          className="status-badge"
          style={{ backgroundColor: anime.statusColor }}
        >
          {anime.status}
        </div>
      </div>
      <div className="anime-info">
        <h3>{anime.title}</h3>
        <div className="anime-rating">
          {Array.from({ length: 5 }).map((_, i) => (
            <FaStar key={i} className={i < anime.rating ? 'star-filled' : 'star-empty'} />
          ))}
        </div>
      </div>
    </motion.div>
  );
};

// 動漫詳情 Modal
const AnimeModal = ({ anime, onClose }: { anime: AnimeItem | null; onClose: () => void }) => {
  if (!anime) return null;

  return (
    <AnimatePresence>
      <motion.div 
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div 
          className="modal-content anime-modal"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="modal-close" onClick={onClose}>
            <FaTimes />
          </button>
          
          <div className="modal-body">
            <div className="modal-left">
              <img src={anime.poster} alt={anime.title} className="modal-poster" />
              <div 
                className="status-badge-large"
                style={{ backgroundColor: anime.statusColor }}
              >
                {anime.status}
              </div>
            </div>
            
            <div className="modal-right">
              <h2>{anime.title}</h2>
              <p className="modal-en-title">{anime.titleEn} ({anime.year})</p>
              
              <div className="rating-comparison">
                <div className="rating-item">
                  <span className="rating-label">我的評分</span>
                  <div className="modal-rating">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <FaStar key={i} className={i < anime.rating ? 'star-filled' : 'star-empty'} />
                    ))}
                  </div>
                </div>
                <div className="rating-item">
                  <span className="rating-label">社群評分</span>
                  <div className="community-rating">
                    <FaChartLine />
                    <span>{anime.communityRating}</span>
                  </div>
                </div>
              </div>
              
              <div className="modal-genres">
                {anime.genre.map((g, i) => (
                  <span key={i} className="genre-tag">{g}</span>
                ))}
              </div>
              
              {anime.watching && (
                <div className="progress-info">
                  <p>觀看進度: {anime.currentEpisode} / {anime.totalEpisodes}集</p>
                  <div className="progress-bar-large">
                    <div 
                      className="progress-fill"
                      style={{ 
                        width: `${(parseInt(/\d+/.exec(anime.currentEpisode)?.[0] ?? '0', 10) / anime.totalEpisodes) * 100}%` 
                      }}
                    />
                  </div>
                </div>
              )}
              
              <div className="modal-section">
                <h3>劇情簡介</h3>
                <p>{anime.description}</p>
              </div>
              
              <div className="modal-section my-take-section">
                <h3>💭 我的觀點 (My Take)</h3>
                <p className="my-take-text">{anime.myTake}</p>
              </div>
              
              <div className="modal-meta">
                <span>開始觀看: {anime.watchDate}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// 主元件
function Anime() {
  const [selectedAnime, setSelectedAnime] = useState<AnimeItem | null>(null);
  const [filterGenre, setFilterGenre] = useState('全部');
  const [filterStatus, setFilterStatus] = useState('全部');
  const [sortBy, setSortBy] = useState('date');
  const [showFilters, setShowFilters] = useState(false);
  const [animeFromAPI, setAnimeFromAPI] = useState<AnimeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 從 API 獲取動漫數據
  useEffect(() => {
    void fetchAnime();
  }, []);

  const fetchAnime = async () => {
    try {
      const response = await fetch('/api/collection/anime');
      const data = await response.json() as AnimeApiResponse;

      if (data.items && data.items.length > 0) {
        // 將後端數據轉換為前端格式
        const formattedAnime: AnimeItem[] = data.items.map((item) => ({
          id: item.id,
          title: item.title,
          titleEn: item.original_title ?? item.title,
          year: item.year ?? new Date().getFullYear(),
          poster: item.poster_url ?? '',
          rating: item.rating ?? 0,
          genre: ['動畫'], // 可以之後擴展
          status: item.status === 'watching' ? '追番中' : item.status === 'completed' ? '已追完' : '計劃觀看',
          statusColor: item.status === 'watching' ? '#3b82f6' : '#22c55e',
          currentEpisode: item.media_format ?? 'TV',
          totalEpisodes: 0,
          watchDate: item.watch_date ?? new Date().toISOString().split('T')[0],
          watching: item.status === 'watching',
          myTake: item.review ?? '暫無評論',
          description: item.overview ?? '暫無劇情簡介',
          communityRating: 0
        }));
        setAnimeFromAPI(formattedAnime);
      }
    } catch (error) {
      console.error('獲取動漫數據失敗:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 使用 API 數據或備用數據
  const currentAnimeData = animeFromAPI.length > 0 ? animeFromAPI : animeData;

  // 獲取所有類型和狀態
  const { allGenres, allStatuses } = useMemo(() => {
    const genres = new Set<string>();
    const statuses = new Set<string>();
    currentAnimeData.forEach(anime => {
      anime.genre.forEach(g => genres.add(g));
      statuses.add(anime.status);
    });
    return {
      allGenres: ['全部', ...Array.from(genres)],
      allStatuses: ['全部', ...Array.from(statuses)]
    };
  }, [currentAnimeData]);

  // 篩選和排序動漫
  const processedAnime = useMemo(() => {
    let filtered = currentAnimeData;
    
    // 類型篩選
    if (filterGenre !== '全部') {
      filtered = filtered.filter(anime => anime.genre.includes(filterGenre));
    }
    
    // 狀態篩選
    if (filterStatus !== '全部') {
      filtered = filtered.filter(anime => anime.status === filterStatus);
    }
    
    // 排序
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.watchDate).getTime() - new Date(a.watchDate).getTime();
      } else if (sortBy === 'rating') {
        return b.rating - a.rating;
      }
      return 0;
    });
    
    return sorted;
  }, [currentAnimeData, filterGenre, filterStatus, sortBy]);

  // 顯示載入狀態
  if (isLoading) {
    return (
      <div className="anime-page">
        <div className="loading-container" style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '100vh',
          color: 'white' 
        }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ 
              border: '4px solid rgba(255,255,255,0.1)', 
              borderTop: '4px solid white', 
              borderRadius: '50%', 
              width: '50px', 
              height: '50px', 
              animation: 'spin 1s linear infinite',
              margin: '0 auto 20px'
            }}></div>
            <p>載入動漫資料中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="anime-page">
      <SEOHead title="動漫" description="Koimsurai 的動漫推薦清單與觀後感。" />
      <div className="anime-hero">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          📺 動漫閣
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="anime-subtitle"
        >
          進入二次元世界 · 記錄每一個感動瞬間
        </motion.p>
      </div>

      {/* 正在追番區塊 */}
      <WatchingSection animes={currentAnimeData} onAnimeClick={setSelectedAnime} />

      {/* 篩選和排序 */}
      <div className="anime-controls">
        <button 
          className="filter-toggle"
          onClick={() => setShowFilters(!showFilters)}
        >
          <FaFilter /> 篩選與排序
        </button>
        
        <AnimatePresence>
          {showFilters && (
            <motion.div 
              className="filters-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
            >
              <div className="filter-group">
                <label>類型:</label>
                <div className="filter-buttons">
                  {allGenres.map(genre => (
                    <button
                      key={genre}
                      className={`filter-btn ${filterGenre === genre ? 'active' : ''}`}
                      onClick={() => setFilterGenre(genre)}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="filter-group">
                <label>狀態:</label>
                <div className="filter-buttons">
                  {allStatuses.map(status => (
                    <button
                      key={status}
                      className={`filter-btn ${filterStatus === status ? 'active' : ''}`}
                      onClick={() => setFilterStatus(status)}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="filter-group">
                <label><FaSortAmountDown /> 排序:</label>
                <div className="filter-buttons">
                  <button
                    className={`filter-btn ${sortBy === 'date' ? 'active' : ''}`}
                    onClick={() => setSortBy('date')}
                  >
                    觀看日期
                  </button>
                  <button
                    className={`filter-btn ${sortBy === 'rating' ? 'active' : ''}`}
                    onClick={() => setSortBy('rating')}
                  >
                    評分
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 動漫瀑布流網格 */}
      <section className="anime-masonry">
        {processedAnime.map((anime, index) => (
          <motion.div
            key={anime.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.05 }}
          >
            <AnimeCard anime={anime} onClick={setSelectedAnime} />
          </motion.div>
        ))}
      </section>

      {/* Modal */}
      {selectedAnime && (
        <AnimeModal anime={selectedAnime} onClose={() => setSelectedAnime(null)} />
      )}
    </div>
  );
}

export default Anime;
