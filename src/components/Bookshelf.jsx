import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaStar, FaStarHalfAlt, FaBook, FaSearch, FaFilter, FaTimes } from 'react-icons/fa';
import ZeroGravityLibrary from './ZeroGravityLibrary';
import './Bookshelf.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const Bookshelf = () => {
  const [books, setBooks] = useState([]);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date_added_desc');
  const [stats, setStats] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [is3DMode, setIs3DMode] = useState(false);

  useEffect(() => {
    fetchBooks();
    fetchStats();
    
    // 每15分鐘自動更新一次書籍資料
    const dataRefreshInterval = setInterval(() => {
      console.log('📚 自動更新書籍資料...');
      fetchBooks();
      fetchStats();
    }, 15 * 60 * 1000); // 15 分鐘
    
    return () => {
      clearInterval(dataRefreshInterval);
    };
  }, []);

  useEffect(() => {
    filterAndSortBooks();
  }, [books, searchTerm, statusFilter, ratingFilter, sortBy]);

  const fetchBooks = async () => {
    try {
      const response = await fetch(`${API_URL}/books`);
      const data = await response.json();
      if (data.message === 'success') {
        setBooks(data.books);
      }
    } catch (error) {
      console.error('載入書籍失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/books/stats/summary`);
      const data = await response.json();
      if (data.message === 'success') {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('載入統計失敗:', error);
    }
  };

  const filterAndSortBooks = () => {
    let filtered = [...books];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(book =>
        book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (book.authors && book.authors.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(book => book.reading_status === statusFilter);
    }

    // Rating filter
    if (ratingFilter !== 'all') {
      filtered = filtered.filter(book => book.rating === parseInt(ratingFilter));
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date_added_asc':
          return new Date(a.date_added) - new Date(b.date_added);
        case 'date_added_desc':
          return new Date(b.date_added) - new Date(a.date_added);
        case 'title_asc':
          return a.title.localeCompare(b.title);
        case 'title_desc':
          return b.title.localeCompare(a.title);
        case 'rating_desc':
          return (b.rating || 0) - (a.rating || 0);
        case 'published_date_desc':
          return (b.published_date || '').localeCompare(a.published_date || '');
        default:
          return 0;
      }
    });

    setFilteredBooks(filtered);
  };

  const getStatusBadge = (status) => {
    const badges = {
      'read': { text: '已讀', color: '#10b981' },
      'reading': { text: '閱讀中', color: '#3b82f6' },
      'to-read': { text: '想讀', color: '#f59e0b' }
    };
    return badges[status] || badges['to-read'];
  };

  const renderStars = (rating) => {
    if (rating === null || rating === undefined) return <span className="no-rating">未評分</span>;
    const stars = [];
    const numRating = parseFloat(rating);

    for (let i = 1; i <= 5; i++) {
      if (numRating >= i) {
        stars.push(<FaStar key={i} className="star-filled" />);
      } else if (numRating >= i - 0.5) {
        stars.push(<FaStarHalfAlt key={i} className="star-filled" />);
      } else {
        stars.push(<FaStar key={i} className="star-empty" />);
      }
    }
    return <div className="stars">{stars}</div>;
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setRatingFilter('all');
    setSortBy('date_added_desc');
  };

  if (loading) {
    return (
      <div className="bookshelf-container">
        <div className="loading-spinner">
          <FaBook className="spinning-book" />
          <p>載入書櫃中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bookshelf-container">
      {/* Header Section */}
      <motion.div
        className="bookshelf-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="bookshelf-title">
          <FaBook className="title-icon" />
          我的書櫃
        </h1>
        <p className="bookshelf-subtitle">記錄與分享閱讀旅程</p>

        {/* Statistics */}
        {stats && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.total_books}</div>
              <div className="stat-label">總藏書</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.books_read}</div>
              <div className="stat-label">已閱讀</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.books_reading}</div>
              <div className="stat-label">閱讀中</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {stats.average_rating ? `${stats.average_rating} ⭐` : 'N/A'}
              </div>
              <div className="stat-label">平均評分</div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Search and Filter Bar */}
      <motion.div
        className="search-filter-bar"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="search-box">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder="搜尋書名或作者..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {searchTerm && (
            <button className="clear-search" onClick={() => setSearchTerm('')}>
              <FaTimes />
            </button>
          )}
        </div>

        <button
          className="filter-toggle"
          onClick={() => setShowFilters(!showFilters)}
        >
          <FaFilter /> 篩選
        </button>

        <button
          className="view-mode-toggle"
          onClick={() => setIs3DMode(!is3DMode)}
        >
          {is3DMode ? '2D 視圖' : '🌌 零重力模式'}
        </button>
      </motion.div>

      {/* Filter Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            className="filter-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="filter-group">
              <label>閱讀狀態</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">全部</option>
                <option value="read">已讀</option>
                <option value="reading">閱讀中</option>
                <option value="to-read">想讀</option>
              </select>
            </div>

            <div className="filter-group">
              <label>評分</label>
              <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)}>
                <option value="all">全部</option>
                <option value="5">⭐⭐⭐⭐⭐</option>
                <option value="4">⭐⭐⭐⭐</option>
                <option value="3">⭐⭐⭐</option>
                <option value="2">⭐⭐</option>
                <option value="1">⭐</option>
              </select>
            </div>

            <div className="filter-group">
              <label>排序</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="date_added_desc">最新加入</option>
                <option value="date_added_asc">最早加入</option>
                <option value="title_asc">標題 A-Z</option>
                <option value="title_desc">標題 Z-A</option>
                <option value="rating_desc">評分高到低</option>
                <option value="published_date_desc">出版日期</option>
              </select>
            </div>

            <button className="clear-filters" onClick={clearFilters}>
              清除篩選
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Books Grid - Bookshelf Layout */}
      <motion.div
        className="books-grid"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        {filteredBooks.length === 0 ? (
          <div className="no-books">
            <FaBook className="no-books-icon" />
            <p>目前沒有符合條件的書籍</p>
          </div>
        ) : (
          // 將書籍分組到不同的書架層
          (() => {
            const booksPerShelf = 8; // 每層書架放8本書
            const shelves = [];
            for (let i = 0; i < filteredBooks.length; i += booksPerShelf) {
              shelves.push(filteredBooks.slice(i, i + booksPerShelf));
            }
            
            return shelves.map((shelf, shelfIndex) => (
              <motion.div
                key={`shelf-${shelfIndex}`}
                className="bookshelf-row"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: shelfIndex * 0.1 }}
              >
                {shelf.map((book, bookIndex) => (
                  <motion.div
                    key={book.id}
                    className="book-card"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ 
                      delay: shelfIndex * 0.1 + bookIndex * 0.05,
                      type: "spring",
                      stiffness: 200
                    }}
                    onClick={() => setSelectedBook(book)}
                  >
                    <div className="book-cover-wrapper">
                      {book.cover_url ? (
                        <img
                          src={book.cover_url}
                          alt={book.title}
                          className="book-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="book-cover-placeholder">
                          <FaBook />
                        </div>
                      )}
                      <div
                        className="status-badge"
                        style={{ backgroundColor: getStatusBadge(book.reading_status).color }}
                      >
                        {getStatusBadge(book.reading_status).text}
                      </div>
                    </div>
                    
                    <div className="book-info">
                      <h3 className="book-title">{book.title}</h3>
                      {book.authors && (
                        <p className="book-author">{book.authors}</p>
                      )}
                      {renderStars(book.rating)}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ));
          })()
        )}
      </motion.div>

      {/* Book Detail Modal */}
      <AnimatePresence>
        {selectedBook && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedBook(null)}
          >
            <motion.div
              className="modal-content"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="modal-close" onClick={() => setSelectedBook(null)}>
                <FaTimes />
              </button>

              <div className="modal-body">
                <div className="modal-cover">
                  {selectedBook.cover_url ? (
                    <img src={selectedBook.cover_url} alt={selectedBook.title} />
                  ) : (
                    <div className="modal-cover-placeholder">
                      <FaBook />
                    </div>
                  )}
                </div>

                <div className="modal-details">
                  <h2>{selectedBook.title}</h2>
                  
                  {selectedBook.authors && (
                    <p className="modal-author">作者: {selectedBook.authors}</p>
                  )}

                  <div className="modal-meta">
                    {selectedBook.publisher && (
                      <div className="meta-item">
                        <strong>出版社:</strong> {selectedBook.publisher}
                      </div>
                    )}
                    {selectedBook.published_date && (
                      <div className="meta-item">
                        <strong>出版日期:</strong> {selectedBook.published_date}
                      </div>
                    )}
                    {selectedBook.page_count && (
                      <div className="meta-item">
                        <strong>頁數:</strong> {selectedBook.page_count}
                      </div>
                    )}
                    {selectedBook.isbn && (
                      <div className="meta-item">
                        <strong>ISBN:</strong> {selectedBook.isbn}
                      </div>
                    )}
                  </div>

                  <div className="modal-status-rating">
                    <div
                      className="modal-status-badge"
                      style={{ backgroundColor: getStatusBadge(selectedBook.reading_status).color }}
                    >
                      {getStatusBadge(selectedBook.reading_status).text}
                    </div>
                    {renderStars(selectedBook.rating)}
                  </div>

                  {selectedBook.description && (
                    <div className="modal-description">
                      <h3>簡介</h3>
                      <p>{selectedBook.description}</p>
                    </div>
                  )}

                  {selectedBook.personal_notes && (
                    <div className="modal-notes">
                      <h3>個人筆記</h3>
                      <p>{selectedBook.personal_notes}</p>
                    </div>
                  )}

                  {(selectedBook.date_started || selectedBook.date_finished) && (
                    <div className="modal-dates">
                      {selectedBook.date_started && (
                        <p><strong>開始閱讀:</strong> {new Date(selectedBook.date_started).toLocaleDateString('zh-TW')}</p>
                      )}
                      {selectedBook.date_finished && (
                        <p><strong>完成閱讀:</strong> {new Date(selectedBook.date_finished).toLocaleDateString('zh-TW')}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3D 零重力圖書館 */}
      {is3DMode && (
        <ZeroGravityLibrary
          books={filteredBooks.map(book => ({
            id: book.id,
            title: book.title,
            authors: book.authors ? book.authors.split(',') : [],
            coverUrl: book.cover_url,
            description: book.description,
            publishedDate: book.published_date,
            pageCount: book.page_count,
          }))}
          onClose={() => setIs3DMode(false)}
        />
      )}
    </div>
  );
};

export default Bookshelf;
