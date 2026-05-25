import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaStar, FaPlay, FaTimes, FaFilter, FaSortAmountDown } from 'react-icons/fa';
import SEOHead from './SEOHead';
import './Cinema.css';

// 模擬電影數據 - 實際使用時可以從 API 或數據庫獲取
const moviesData = [
  {
    id: 1,
    title: '星際效應',
    titleEn: 'Interstellar',
    year: 2014,
    poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    rating: 5,
    genre: ['科幻', '劇情'],
    watchDate: '2024-01-15',
    featured: true,
    myTake: '克里斯托弗·諾蘭創造了一個既科學又感性的傑作。時間膨脹和黑洞的視覺化令人驚嘆,而父女之情的刻畫更是催人淚下。配樂完美地烘托了太空旅行的孤獨感和人類探索的偉大。',
    description: '在不久的將來,隨著地球環境的惡化,人類面臨著滅絕的危機。一組探險家利用新發現的蟲洞,超越人類對於太空旅行的極限,在廣袤的宇宙中開始星際航行。',
    trailerUrl: 'https://www.youtube.com/watch?v=zSWdZVtXT7E'
  },
  {
    id: 2,
    title: '銀翼殺手 2049',
    titleEn: 'Blade Runner 2049',
    year: 2017,
    poster: 'https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg',
    rating: 5,
    genre: ['科幻', '驚悚'],
    watchDate: '2024-02-20',
    featured: true,
    myTake: '視覺美學的巔峰之作。每一幀都像一幅賽博龐克油畫,配色和構圖都達到了電影藝術的極致。故事深沉而哲學,探討了記憶、身份和人性的本質。',
    description: '新一代銀翼殺手K發現了一個可能顛覆社會的秘密,促使他踏上尋找已失蹤三十年的前銀翼殺手Rick Deckard的旅程。',
    trailerUrl: 'https://www.youtube.com/watch?v=gCcx85zbxz4'
  },
  {
    id: 3,
    title: '駭客任務',
    titleEn: 'The Matrix',
    year: 1999,
    poster: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
    rating: 5,
    genre: ['科幻', '動作'],
    watchDate: '2023-11-10',
    featured: true,
    myTake: '革命性的視覺效果和深刻的哲學思考完美結合。子彈時間特效至今仍令人讚嘆,而"紅藍藥丸"的選擇更是成為了流行文化的經典象徵。',
    description: 'Thomas Anderson過著平凡的程式設計師生活,直到神秘駭客Morpheus向他揭示了真相:他所認知的世界其實是一個名為"矩陣"的電腦模擬程式。',
    trailerUrl: 'https://www.youtube.com/watch?v=vKQi3bBA1y8'
  },
  {
    id: 4,
    title: '全面啟動',
    titleEn: 'Inception',
    year: 2010,
    poster: 'https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
    rating: 5,
    genre: ['科幻', '動作'],
    watchDate: '2023-12-05',
    featured: false,
    myTake: '諾蘭對夢境層次的構建令人嘆為觀止,每一層都有獨特的邏輯和視覺風格。結尾的陀螺鏡頭成為影史經典,引發無數討論。',
    description: '專精於潛意識犯罪的竊盜者Dom Cobb接下最後一次任務:不是竊取構想,而是植入構想。',
    trailerUrl: 'https://www.youtube.com/watch?v=YoHD9XEInc0'
  },
  {
    id: 5,
    title: '沙丘',
    titleEn: 'Dune',
    year: 2021,
    poster: 'https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
    rating: 4,
    genre: ['科幻', '冒險'],
    watchDate: '2024-03-12',
    featured: false,
    myTake: '維倫紐瓦成功地將這部被認為"無法改編"的作品搬上銀幕。沙漠星球的視覺呈現壯觀震撼,配樂營造出神秘而宏大的氛圍。',
    description: '講述保羅·亞崔迪前往宇宙中最危險的行星,以確保他家族和人民未來的故事。',
    trailerUrl: 'https://www.youtube.com/watch?v=8g18jFHCLXk'
  },
  {
    id: 6,
    title: '攻殼機動隊',
    titleEn: 'Ghost in the Shell',
    year: 1995,
    poster: 'https://image.tmdb.org/t/p/w500/cP4Me8C4dTMFxLp7s0xgjCXiawL.jpg',
    rating: 5,
    genre: ['動畫', '科幻'],
    watchDate: '2023-10-25',
    featured: false,
    myTake: '賽博龐克美學的奠基之作,影響了無數後來的作品。對於人工智能、意識和身份的探討極具深度,至今仍具現實意義。',
    description: '在科技高度發達的未來,公安九課的少佐草薙素子追捕神秘駭客"傀儡師"的故事。',
    trailerUrl: 'https://www.youtube.com/watch?v=SvBVDibOrgs'
  }
];

// 精選輪播元件
const FeaturedCarousel = ({ movies, onMovieClick }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % movies.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + movies.length) % movies.length);
  };

  if (movies.length === 0) return null;

  const currentMovie = movies[currentIndex];

  return (
    <div className="featured-carousel">
      <motion.div 
        className="featured-card"
        key={currentMovie.id}
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -100 }}
        transition={{ duration: 0.5 }}
      >
        <div className="featured-poster" onClick={() => onMovieClick(currentMovie)}>
          <img src={currentMovie.poster} alt={currentMovie.title} />
          <div className="featured-overlay">
            <FaPlay className="play-icon" />
          </div>
        </div>
        <div className="featured-info">
          <h2>{currentMovie.title}</h2>
          <p className="featured-en-title">{currentMovie.titleEn}</p>
          <div className="featured-rating">
            {[...Array(5)].map((_, i) => (
              <FaStar key={i} className={i < currentMovie.rating ? 'star-filled' : 'star-empty'} />
            ))}
          </div>
          <p className="featured-take">「{currentMovie.myTake.slice(0, 100)}...」</p>
        </div>
      </motion.div>
      
      <button className="carousel-btn prev" onClick={prevSlide}>‹</button>
      <button className="carousel-btn next" onClick={nextSlide}>›</button>
      
      <div className="carousel-indicators">
        {movies.map((_, index) => (
          <button
            key={index}
            className={`indicator ${index === currentIndex ? 'active' : ''}`}
            onClick={() => setCurrentIndex(index)}
          />
        ))}
      </div>
    </div>
  );
};

// 電影卡片元件
const MovieCard = ({ movie, onClick }) => {
  return (
    <motion.div 
      className="movie-card"
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300 }}
      onClick={() => onClick(movie)}
    >
      <div className="movie-poster">
        <img src={movie.poster} alt={movie.title} />
        <div className="movie-overlay">
          <FaPlay className="play-icon" />
        </div>
      </div>
      <motion.div 
        className="movie-info"
        initial={{ opacity: 0, y: 10 }}
        whileHover={{ opacity: 1, y: 0 }}
      >
        <div className="movie-rating">
          {[...Array(5)].map((_, i) => (
            <FaStar key={i} className={i < movie.rating ? 'star-filled' : 'star-empty'} />
          ))}
        </div>
        <p className="watch-date">{movie.watchDate}</p>
      </motion.div>
    </motion.div>
  );
};

// 電影詳情 Modal
const MovieModal = ({ movie, onClose }) => {
  if (!movie) return null;

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
          className="modal-content cinema-modal"
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
              <img src={movie.poster} alt={movie.title} className="modal-poster" />
              {movie.trailerUrl && (
                <a 
                  href={movie.trailerUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="trailer-btn"
                >
                  <FaPlay /> 觀看預告片
                </a>
              )}
            </div>
            
            <div className="modal-right">
              <h2>{movie.title}</h2>
              <p className="modal-en-title">{movie.titleEn} ({movie.year})</p>
              
              <div className="modal-rating">
                {[...Array(5)].map((_, i) => (
                  <FaStar key={i} className={i < movie.rating ? 'star-filled' : 'star-empty'} />
                ))}
              </div>
              
              <div className="modal-genres">
                {movie.genre.map((g, i) => (
                  <span key={i} className="genre-tag">{g}</span>
                ))}
              </div>
              
              <div className="modal-section">
                <h3>劇情簡介</h3>
                <p>{movie.description}</p>
              </div>
              
              <div className="modal-section my-take-section">
                <h3>💭 我的觀點 (My Take)</h3>
                <p className="my-take-text">{movie.myTake}</p>
              </div>
              
              <div className="modal-meta">
                <span>觀看日期: {movie.watchDate}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// 主元件
function Cinema() {
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [filterGenre, setFilterGenre] = useState('全部');
  const [sortBy, setSortBy] = useState('date');
  const [showFilters, setShowFilters] = useState(false);
  const [moviesFromAPI, setMoviesFromAPI] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // 從 API 獲取電影數據
  useEffect(() => {
    fetchMovies();
  }, []);

  const fetchMovies = async () => {
    try {
      const response = await fetch('/api/collection/cinema');
      const data = await response.json();
      
      if (data.items && data.items.length > 0) {
        // 將後端數據轉換為前端格式
        const formattedMovies = data.items.map(item => ({
          id: item.id,
          title: item.title,
          titleEn: item.original_title || item.title,
          year: item.year || new Date().getFullYear(),
          poster: item.poster_url || '',
          rating: item.rating || 0,
          genre: item.overview ? [item.media_format] : ['電影'],
          watchDate: item.watch_date || new Date().toISOString().split('T')[0],
          featured: item.is_favorite === 1,
          myTake: item.review || '暫無評論',
          description: item.overview || '暫無劇情簡介',
          trailerUrl: ''
        }));
        setMoviesFromAPI(formattedMovies);
      }
    } catch (error) {
      console.error('獲取電影數據失敗:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 使用 API 數據或備用數據
  const currentMoviesData = moviesFromAPI.length > 0 ? moviesFromAPI : moviesData;

  // 獲取所有類型
  const allGenres = useMemo(() => {
    const genres = new Set();
    currentMoviesData.forEach(movie => {
      movie.genre.forEach(g => genres.add(g));
    });
    return ['全部', ...Array.from(genres)];
  }, [currentMoviesData]);

  // 篩選和排序電影
  const processedMovies = useMemo(() => {
    let filtered = currentMoviesData;
    
    // 篩選
    if (filterGenre !== '全部') {
      filtered = filtered.filter(movie => movie.genre.includes(filterGenre));
    }
    
    // 排序
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.watchDate) - new Date(a.watchDate);
      } else if (sortBy === 'rating') {
        return b.rating - a.rating;
      }
      return 0;
    });
    
    return sorted;
  }, [currentMoviesData, filterGenre, sortBy]);

  const featuredMovies = currentMoviesData.filter(m => m.featured);

  // 顯示載入狀態
  if (isLoading) {
    return (
      <div className="cinema-container">
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
            <p>載入電影資料中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cinema-page">
      <SEOHead title="電影" description="Koimsurai 的電影推薦與評論回顧。" />
      <div className="cinema-hero">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          🎬 私人影院
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="cinema-subtitle"
        >
          探索我的電影宇宙 · 每一幀都是一場冒險
        </motion.p>
      </div>

      {/* 精選區塊 */}
      <section className="featured-section">
        <h2 className="section-title">
          <span className="title-icon">⭐</span>
          本月精選
        </h2>
        <FeaturedCarousel movies={featuredMovies} onMovieClick={setSelectedMovie} />
      </section>

      {/* 篩選和排序 */}
      <div className="cinema-controls">
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

      {/* 電影網格 */}
      <section className="movies-grid">
        {processedMovies.map((movie, index) => (
          <motion.div
            key={movie.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.05 }}
          >
            <MovieCard movie={movie} onClick={setSelectedMovie} />
          </motion.div>
        ))}
      </section>

      {/* Modal */}
      {selectedMovie && (
        <MovieModal movie={selectedMovie} onClose={() => setSelectedMovie(null)} />
      )}
    </div>
  );
}

export default Cinema;
