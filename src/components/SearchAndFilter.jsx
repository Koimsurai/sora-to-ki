import React from 'react';
import './SearchAndFilter.css';

const SearchAndFilter = ({ 
  searchTerm, 
  setSearchTerm, 
  selectedTag, 
  setSelectedTag, 
  allTags 
}) => {
  return (
    <div className="search-filter-container">
      {/* Search input with modern design */}
      <div className="modern-search-wrapper">
        <div className="search-input-container">
          <svg className="search-icon-modern" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="探索文章..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="modern-search-input"
          />
          {searchTerm && (
            <button 
              className="clear-search-btn"
              onClick={() => setSearchTerm('')}
            >
              <svg viewBox="0 0 24 24" fill="none">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <div className="search-suggestions">
          {searchTerm && (
            <div className="search-suggestion">
              搜索 "{searchTerm}" 相關文章
            </div>
          )}
        </div>
      </div>

      {/* Modern tag filter */}
      <div className="modern-filter-section">
        <div className="filter-header">
          <svg className="filter-icon-modern" viewBox="0 0 24 24" fill="none">
            <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
          </svg>
          <span>篩選標籤</span>
        </div>
        <div className="modern-tags-filter">
          <button
            className={`filter-tag ${selectedTag === '' ? 'active' : ''}`}
            onClick={() => setSelectedTag('')}
          >
            <span className="tag-icon">🌟</span>
            全部
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              className={`filter-tag ${selectedTag === tag ? 'active' : ''}`}
              onClick={() => setSelectedTag(tag)}
            >
              <span className="tag-icon">#</span>
              {tag}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchAndFilter;