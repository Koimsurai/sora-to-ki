import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Comments from './Comments';
import './ModernCard.css';

/* ── Comment floating dialog ── */
const CommentDialog = ({ postId, postTitle, allowComments = true, onClose }) => {
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  return (
    <motion.div
      className="mc-comment-overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="mc-comment-dialog"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 30 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="mc-comment-header">
          <div className="mc-comment-header-left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <div>
              <span className="mc-comment-title">留言</span>
              <span className="mc-comment-post-title">{postTitle}</span>
            </div>
          </div>
          <button className="mc-comment-close" onClick={onClose} title="關閉 (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="mc-comment-body">
          <Comments postId={postId} allowComments={allowComments} />
        </div>
      </motion.div>
    </motion.div>
  );
};

const ModernCard = ({ post, index }) => {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes || 0);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    const likedPosts = JSON.parse(localStorage.getItem('likedPosts') || '[]');
    if (likedPosts.includes(post.id)) {
      setLiked(true);
    }
  }, [post.id]);

  const handleLike = async (e) => {
    e.stopPropagation();
    const newLikedState = !liked;
    try {
      const endpoint = newLikedState ? 'like' : 'unlike';
      const response = await fetch(`/api/posts/${post.id}/${endpoint}`, { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        setLiked(newLikedState);
        setLikeCount(data.likes);
        const likedPosts = JSON.parse(localStorage.getItem('likedPosts') || '[]');
        if (newLikedState) {
          if (!likedPosts.includes(post.id)) localStorage.setItem('likedPosts', JSON.stringify([...likedPosts, post.id]));
        } else {
          localStorage.setItem('likedPosts', JSON.stringify(likedPosts.filter(id => id !== post.id)));
        }
      }
    } catch (error) {
      console.error('Failed to like post:', error);
    }
  };

  const handleComment = (e) => {
    e.stopPropagation();
    setShowComments(true);
  };

  const handleShare = async (e) => {
    e.stopPropagation();
    const url = `${window.location.origin}/blog/${post.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: post.title, text: post.summary || '', url }); } catch { /* cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        const btn = e.currentTarget;
        const orig = btn.querySelector('span').textContent;
        btn.querySelector('span').textContent = '已複製!';
        setTimeout(() => { btn.querySelector('span').textContent = orig; }, 1500);
      } catch { /* fallback */ }
    }
  };

  return (
    <div
      className="modern-card-wrapper"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div className="modern-card">
        {/* Background gradient effect */}
        <div className="modern-card-bg"></div>
        <div className="modern-card-shimmer"></div>

        {/* 可點擊導航區域 — 不含互動按鈕 */}
        <div className="modern-card-link" onClick={() => navigate(`/blog/${post.id}`)}>
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
          </div>

          <div className="modern-card-body">
            <h3 className="post-title-modern">{post.title}</h3>
            <p className="post-summary-modern">{post.summary}</p>
          </div>

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
        </div>

        {/* 互動列 — 獨立於導航區域 */}
        <div className="modern-card-footer">
          <div className="interaction-buttons">
            <button className={`interaction-btn like-btn ${liked ? 'liked' : ''}`} onClick={handleLike}>
              <svg viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <span>{liked ? '已讚' : '讚'} {likeCount > 0 && `(${likeCount})`}</span>
            </button>
            <button className="interaction-btn comment-btn" onClick={handleComment}>
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>留言</span>
            </button>
            <button className="interaction-btn share-btn" onClick={handleShare}>
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

        <div className="modern-card-glow"></div>
      </div>

      {/* Comment dialog — portal 在 AnimatePresence 內部 */}
      <AnimatePresence>
        {showComments && ReactDOM.createPortal(
          <CommentDialog
            postId={post.id}
            postTitle={post.title}
            allowComments={post.allow_comments !== 0 && post.allow_comments !== false}
            onClose={() => setShowComments(false)}
          />,
          document.body
        )}
      </AnimatePresence>
    </div>
  );
};

export default ModernCard;