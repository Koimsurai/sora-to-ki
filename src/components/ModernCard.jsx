import React from 'react';
import { Link } from 'react-router-dom';
import './ModernCard.css';

const ModernCard = ({ post, index }) => {
  return (
    <div
      className="modern-card-wrapper"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <Link to={`/blog/${post.id}`} className="modern-card">
        {/* Background gradient effect */}
        <div className="modern-card-bg"></div>
        
        {/* Shimmer effect */}
        <div className="modern-card-shimmer"></div>
        
        {/* Main content */}
        <div className="modern-card-content">
          {/* Header with author info */}
          <div className="modern-card-header">
            <div className="author-section">
              <div className="author-avatar">
                <div className="avatar-ring"></div>
                <span className="avatar-text">
                  {post.author ? post.author.charAt(0).toUpperCase() : 'A'}
                </span>
              </div>
              <div className="author-details">
                <span className="author-name">{post.author || '匿名作者'}</span>
                <span className="post-timestamp">{post.date}</span>
              </div>
            </div>
            <div className="card-menu">
              <div className="menu-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>

          {/* Post content */}
          <div className="modern-card-body">
            <h3 className="post-title-modern">{post.title}</h3>
            <p className="post-summary-modern">{post.summary}</p>
          </div>

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="modern-tags-container">
              {post.tags.slice(0, 3).map((tag, tagIndex) => (
                <span key={tag} className="modern-tag" style={{ animationDelay: `${tagIndex * 50}ms` }}>
                  #{tag}
                </span>
              ))}
              {post.tags.length > 3 && (
                <span className="more-tags">+{post.tags.length - 3}</span>
              )}
            </div>
          )}

          {/* Interaction bar */}
          <div className="modern-card-footer">
            <div className="interaction-buttons">
              <button className="interaction-btn like-btn">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                <span>讚</span>
              </button>
              <button className="interaction-btn comment-btn">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>留言</span>
              </button>
              <button className="interaction-btn share-btn">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16,6 12,2 8,6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                <span>分享</span>
              </button>
            </div>
            <div className="read-time">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
              <span>5 分鐘閱讀</span>
            </div>
          </div>
        </div>

        {/* Hover glow effect */}
        <div className="modern-card-glow"></div>
      </Link>
    </div>
  );
};

export default ModernCard;